import { randomBytes, randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { graphRequest, WhatsAppApiError } from "./cloud-api"
import type { WhatsAppMerchantConnectionService } from "./merchant-connection"
import { getTemplateStatus, sendTemplateMessage, uploadTemplateSample } from "./messaging"
import { toWhatsAppNumber } from "./phone"
import type { WhatsAppSendingContext } from "./platform-config"

// WhatsApp marketing campaigns. A business writes an offer (its own MARKETING template: text, an
// optional picture and button), Meta reviews it, and the business sends it to a group of its own
// customers -- now or at a set time -- from its own connected number, so Meta bills the business.
// Every message carries an "إيقاف العروض" button: a customer who taps it (or writes stop) is never
// sent a promotion again. The button's link goes through Madar first, so clicks are counted, and
// what the recipients bought afterwards is put against the campaign.

type Row = Record<string, unknown>

export const OPT_OUT_TEXT = "إيقاف العروض"
const NAME_TOKEN = "{الاسم}"
// Each pass sends at most this many messages per campaign (Meta's own pace is ~80 a second; this
// keeps one task's pass short and lets several campaigns share it).
const BATCH = 60
const LINK_BASE = (
  process.env.WHATSAPP_CAMPAIGN_LINK_BASE ?? "https://api.madar.my/v1/public/w"
).replace(/\/$/, "")
const STATUS_CHECK_MS = 2 * 60_000

export type AudienceKind = "all" | "recent" | "inactive" | "never" | "spent" | "loyalty"
export interface CampaignAudience {
  kind: AudienceKind
  days?: number
  minAmount?: number
  minPoints?: number
}

export interface OfferInput {
  title: string
  body: string
  imageUrl?: string | null
  buttonText?: string | null
  buttonUrl?: string | null
}

export interface OfferView {
  id: string
  title: string
  templateName: string
  body: string
  imageUrl: string | null
  buttonText: string | null
  buttonUrl: string | null
  status: string
  rejectedReason: string | null
  createdAt: string
}

export interface CampaignStats {
  recipients: number
  queued: number
  sent: number
  delivered: number
  read: number
  failed: number
  clicked: number
  replied: number
  optedOut: number
  orders: number
  sales: number
}

export interface CampaignView {
  id: string
  name: string
  offerId: string
  offerTitle: string
  audience: CampaignAudience
  status: string
  scheduledAt: string
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  trackDays: number
  createdAt: string
  stats: CampaignStats
}

const refuse = (code: string, message: string, status = 409) =>
  new IdentityError(code, status, "business", message)
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)
const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100
const token = () =>
  randomBytes(12)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)

function parseAudience(raw: unknown): CampaignAudience {
  const value = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as CampaignAudience
  return { ...value, kind: value.kind ?? "all" }
}

// The body as Meta takes it: {الاسم} becomes {{1}} (the customer's name at sending time).
function templateBody(body: string) {
  const parts = body.split(NAME_TOKEN)
  return { text: parts.join("{{1}}"), usesName: parts.length > 1 }
}

export class WhatsAppCampaignsService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly connections: WhatsAppMerchantConnectionService
  ) {}

  private async context(organizationId: string): Promise<WhatsAppSendingContext> {
    const context = await this.connections.sendingContext(organizationId)
    if (!context) {
      throw refuse(
        "WHATSAPP_NOT_CONNECTED",
        "Connect your business number first (Settings → WhatsApp) to send campaigns."
      )
    }
    return context
  }

  // ---- Offers (the business's own marketing templates) ----

  private offerView(row: Row): OfferView {
    return {
      id: String(row.id),
      title: String(row.title),
      templateName: String(row.template_name),
      body: String(row.body),
      imageUrl: text(row.image_url),
      buttonText: text(row.button_text),
      buttonUrl: text(row.button_url),
      status: String(row.status),
      rejectedReason: text(row.rejected_reason),
      createdAt: iso(row.created_at) as string,
    }
  }

  // The offers, with the ones still waiting on Meta asked about again (every couple of minutes).
  async listOffers(organizationId: string): Promise<OfferView[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM whatsapp_offers WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [organizationId]
    )
    const stale = rows.rows.filter(
      (row) =>
        ["PENDING", "PAUSED", "IN_APPEAL"].includes(String(row.status)) &&
        (!row.checked_at ||
          Date.now() - new Date(row.checked_at as string).getTime() > STATUS_CHECK_MS)
    )
    if (stale.length > 0) {
      const context = await this.connections.sendingContext(organizationId)
      if (context) {
        for (const row of stale) {
          try {
            const status = await getTemplateStatus(
              context.auth,
              context.wabaId,
              String(row.template_name),
              "ar"
            )
            row.status = status.status === "MISSING" ? "FAILED" : status.status
            row.rejected_reason = status.rejectedReason
            await this.db.query(
              `UPDATE whatsapp_offers SET status = $2, rejected_reason = $3, checked_at = now()
                WHERE id = $1`,
              [row.id, row.status, row.rejected_reason]
            )
          } catch {
            // Asked again next time.
          }
        }
      }
    }
    return rows.rows.map((row) => this.offerView(row))
  }

  async createOffer(
    organizationId: string,
    input: OfferInput,
    actorUserId: string | null
  ): Promise<OfferView> {
    const body = input.body.trim()
    if (body.startsWith(NAME_TOKEN) || body.endsWith(NAME_TOKEN)) {
      throw refuse(
        "WHATSAPP_OFFER_NAME_EDGE",
        "The customer's name can't be the very first or last word of the message.",
        400
      )
    }
    const buttonText = input.buttonText?.trim() || null
    const buttonUrl = input.buttonUrl?.trim() || null
    if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
      throw refuse("WHATSAPP_OFFER_BUTTON", "A button needs both its text and its link.", 400)
    }
    if (buttonUrl && !/^https?:\/\//i.test(buttonUrl)) {
      throw refuse("WHATSAPP_OFFER_BUTTON", "The button's link must start with https://", 400)
    }
    const context = await this.context(organizationId)
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const templateName = `promo_${stamp}_${token()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8)}`
    const { text: bodyText, usesName } = templateBody(body)

    const components: unknown[] = []
    if (input.imageUrl) {
      const image = await fetch(input.imageUrl, { signal: AbortSignal.timeout(10_000) })
        .then(async (response) => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
        .catch(() => null)
      if (!image) throw refuse("WHATSAPP_OFFER_IMAGE", "The picture couldn't be read.", 400)
      const mimeType = image[0] === 0x89 ? "image/png" : "image/jpeg"
      const handle = await uploadTemplateSample(context.auth, context.appId, {
        bytes: image,
        mimeType,
        filename: mimeType === "image/png" ? "offer.png" : "offer.jpg",
      })
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } })
    }
    components.push({
      type: "BODY",
      text: bodyText,
      ...(usesName ? { example: { body_text: [["محمد"]] } } : {}),
    })
    components.push({ type: "FOOTER", text: "لإيقاف العروض اضغط الزر أدناه" })
    const buttons: unknown[] = []
    if (buttonText && buttonUrl) {
      buttons.push({
        type: "URL",
        text: buttonText,
        url: `${LINK_BASE}/{{1}}`,
        example: [`${LINK_BASE}/a1b2c3d4e5f6`],
      })
    }
    buttons.push({ type: "QUICK_REPLY", text: OPT_OUT_TEXT })
    components.push({ type: "BUTTONS", buttons })

    let status = "PENDING"
    let rejected: string | null = null
    try {
      const created = await graphRequest<{ id: string; status: string }>(
        "POST",
        `/${encodeURIComponent(context.wabaId)}/message_templates`,
        context.auth,
        { name: templateName, language: "ar", category: "MARKETING", components }
      )
      status = created.status || "PENDING"
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw refuse("WHATSAPP_OFFER_REFUSED", `Meta refused the offer: ${message}`, 422)
    }
    if (status === "REJECTED") rejected = "Rejected by Meta."
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO whatsapp_offers
         (id, organization_id, title, template_name, body, image_url, button_text, button_url,
          status, rejected_reason, checked_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11)`,
      [
        id,
        organizationId,
        input.title.trim(),
        templateName,
        body,
        input.imageUrl ?? null,
        buttonText,
        buttonUrl,
        status,
        rejected,
        actorUserId,
      ]
    )
    const row = await this.db.query<Row>(`SELECT * FROM whatsapp_offers WHERE id = $1`, [id])
    return this.offerView(row.rows[0])
  }

  // Removes an offer (and its template at Meta). Its sent campaigns keep their numbers.
  async deleteOffer(organizationId: string, id: string) {
    const row = (
      await this.db.query<Row>(
        `SELECT * FROM whatsapp_offers WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [organizationId, id]
      )
    ).rows[0]
    if (!row) throw refuse("WHATSAPP_OFFER_NOT_FOUND", "Offer not found.", 404)
    const busy = await this.db.query<Row>(
      `SELECT id FROM whatsapp_campaigns WHERE offer_id = $1 AND status IN ('scheduled', 'sending')`,
      [id]
    )
    if (busy.rows.length > 0) {
      throw refuse("WHATSAPP_OFFER_IN_USE", "A campaign waiting to send uses this offer.")
    }
    const context = await this.connections.sendingContext(organizationId)
    if (context) {
      await graphRequest(
        "DELETE",
        `/${encodeURIComponent(context.wabaId)}/message_templates`,
        context.auth,
        { name: String(row.template_name) }
      ).catch(() => null)
    }
    await this.db.query(`UPDATE whatsapp_offers SET deleted_at = now() WHERE id = $1`, [id])
    return { ok: true }
  }

  // ---- Audience ----

  // The customers a campaign would go to: with a WhatsApp-able mobile, not opted out, one message
  // per number.
  async audience(
    organizationId: string,
    audience: CampaignAudience
  ): Promise<Array<{ customerId: string; name: string; phone: string }>> {
    const rows = await this.db.query<Row>(
      `SELECT c.id, c.name, c.phone, s.last_at, s.total
         FROM customers c
         LEFT JOIN (
           SELECT customer_id, MAX(created_at) AS last_at, SUM(total_amount) AS total
             FROM pos_invoices
            WHERE organization_id = $1 AND customer_id IS NOT NULL AND status <> 'cancelled'
            GROUP BY customer_id
         ) s ON s.customer_id = c.id
        WHERE c.organization_id = $1 AND c.deleted_at IS NULL AND c.phone IS NOT NULL
          AND c.marketing_opt_out_at IS NULL
        ORDER BY c.created_at ASC`,
      [organizationId]
    )
    let points = new Map<string, number>()
    if (audience.kind === "loyalty") {
      const members = await this.db.query<Row>(
        `SELECT customer_id, points FROM loyalty_members
          WHERE organization_id = $1 AND customer_id IS NOT NULL`,
        [organizationId]
      )
      points = new Map(members.rows.map((row) => [String(row.customer_id), Number(row.points)]))
    }
    const days = Math.max(1, Number(audience.days ?? 30))
    const since = Date.now() - days * 86_400_000
    const keep = (row: Row) => {
      const last = row.last_at ? new Date(row.last_at as string).getTime() : null
      switch (audience.kind) {
        case "recent":
          return last !== null && last >= since
        case "inactive":
          return last !== null && last < since
        case "never":
          return last === null
        case "spent":
          return money(row.total) >= Math.max(0, Number(audience.minAmount ?? 0))
        case "loyalty": {
          const has = points.get(String(row.id))
          return has !== undefined && has >= Math.max(0, Number(audience.minPoints ?? 0))
        }
        default:
          return true
      }
    }
    const seen = new Set<string>()
    const result: Array<{ customerId: string; name: string; phone: string }> = []
    for (const row of rows.rows) {
      if (!keep(row)) continue
      const phone = toWhatsAppNumber(String(row.phone))
      if (!phone || seen.has(phone)) continue
      seen.add(phone)
      result.push({ customerId: String(row.id), name: String(row.name), phone })
    }
    return result
  }

  async preview(organizationId: string, audience: CampaignAudience) {
    const people = await this.audience(organizationId, audience)
    const optedOut = await this.db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM customers
        WHERE organization_id = $1 AND deleted_at IS NULL AND marketing_opt_out_at IS NOT NULL`,
      [organizationId]
    )
    return {
      count: people.length,
      sample: people.slice(0, 5).map((person) => person.name),
      optedOut: Number(optedOut.rows[0]?.count ?? 0),
    }
  }

  // ---- Campaigns ----

  private async stats(campaign: Row): Promise<CampaignStats> {
    const counts = await this.db.query<Row>(
      `SELECT status, COUNT(*) AS count,
              SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
              SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replied,
              SUM(CASE WHEN opted_out_at IS NOT NULL THEN 1 ELSE 0 END) AS opted
         FROM whatsapp_campaign_recipients WHERE campaign_id = $1 GROUP BY status`,
      [campaign.id]
    )
    const by = (status: string) =>
      Number(counts.rows.find((row) => row.status === status)?.count ?? 0)
    const sum = (key: string) =>
      counts.rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
    const read = by("read")
    const delivered = by("delivered") + read
    const sent = by("sent") + delivered
    // What the customers who got it bought in the days after it was sent.
    let orders = 0
    let sales = 0
    if (campaign.started_at) {
      const from = new Date(campaign.started_at as string)
      const to = new Date(from.getTime() + Number(campaign.track_days ?? 7) * 86_400_000)
      const bought = await this.db.query<Row>(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(i.total_amount), 0) AS sales
           FROM pos_invoices i
          WHERE i.organization_id = $1 AND i.status <> 'cancelled'
            AND i.created_at >= $2 AND i.created_at <= $3
            AND i.customer_id IN (
              SELECT customer_id FROM whatsapp_campaign_recipients
               WHERE campaign_id = $4 AND customer_id IS NOT NULL
                 AND status IN ('sent', 'delivered', 'read'))`,
        [campaign.organization_id, from.toISOString(), to.toISOString(), campaign.id]
      )
      orders = Number(bought.rows[0]?.orders ?? 0)
      sales = money(bought.rows[0]?.sales)
    }
    return {
      recipients: Number(campaign.recipients ?? 0),
      queued: by("queued") + by("claimed"),
      sent,
      delivered,
      read,
      failed: by("failed"),
      clicked: sum("clicked"),
      replied: sum("replied"),
      optedOut: sum("opted"),
      orders,
      sales,
    }
  }

  private async view(row: Row): Promise<CampaignView> {
    return {
      id: String(row.id),
      name: String(row.name),
      offerId: String(row.offer_id),
      offerTitle: String(row.offer_title ?? ""),
      audience: parseAudience(row.audience),
      status: String(row.status),
      scheduledAt: iso(row.scheduled_at) as string,
      startedAt: iso(row.started_at),
      finishedAt: iso(row.finished_at),
      lastError: text(row.last_error),
      trackDays: Number(row.track_days ?? 7),
      createdAt: iso(row.created_at) as string,
      stats: await this.stats(row),
    }
  }

  async listCampaigns(organizationId: string): Promise<CampaignView[]> {
    const rows = await this.db.query<Row>(
      `SELECT c.*, o.title AS offer_title FROM whatsapp_campaigns c
         JOIN whatsapp_offers o ON o.id = c.offer_id
        WHERE c.organization_id = $1 ORDER BY c.created_at DESC LIMIT 200`,
      [organizationId]
    )
    return Promise.all(rows.rows.map((row) => this.view(row)))
  }

  private async campaignRow(organizationId: string, id: string): Promise<Row> {
    const row = (
      await this.db.query<Row>(
        `SELECT c.*, o.title AS offer_title FROM whatsapp_campaigns c
           JOIN whatsapp_offers o ON o.id = c.offer_id
          WHERE c.organization_id = $1 AND c.id = $2`,
        [organizationId, id]
      )
    ).rows[0]
    if (!row) throw refuse("WHATSAPP_CAMPAIGN_NOT_FOUND", "Campaign not found.", 404)
    return row
  }

  async getCampaign(organizationId: string, id: string) {
    const row = await this.campaignRow(organizationId, id)
    const recipients = await this.db.query<Row>(
      `SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id = $1
        ORDER BY name ASC LIMIT 1000`,
      [id]
    )
    return {
      ...(await this.view(row)),
      recipientsList: recipients.rows.map((recipient) => ({
        id: String(recipient.id),
        name: text(recipient.name),
        phone: String(recipient.phone),
        status: String(recipient.status),
        error: text(recipient.error),
        sentAt: iso(recipient.sent_at),
        clickedAt: iso(recipient.clicked_at),
        repliedAt: iso(recipient.replied_at),
        optedOutAt: iso(recipient.opted_out_at),
      })),
    }
  }

  async createCampaign(
    organizationId: string,
    input: {
      name: string
      offerId: string
      audience: CampaignAudience
      scheduledAt?: string | null
      consentConfirmed: boolean
    },
    actorUserId: string | null
  ): Promise<CampaignView> {
    if (!input.consentConfirmed) {
      throw refuse(
        "WHATSAPP_CAMPAIGN_CONSENT",
        "Confirm that these customers agreed to receive offers from you.",
        400
      )
    }
    await this.context(organizationId)
    const offer = (
      await this.db.query<Row>(
        `SELECT * FROM whatsapp_offers WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [organizationId, input.offerId]
      )
    ).rows[0]
    if (!offer) throw refuse("WHATSAPP_OFFER_NOT_FOUND", "Offer not found.", 404)
    if (offer.status !== "APPROVED") {
      throw refuse("WHATSAPP_OFFER_NOT_APPROVED", "Meta hasn't approved this offer yet.")
    }
    const people = await this.audience(organizationId, input.audience)
    if (people.length === 0) {
      throw refuse("WHATSAPP_CAMPAIGN_EMPTY", "No customers match this group.", 400)
    }
    const at = input.scheduledAt ? new Date(input.scheduledAt) : new Date()
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      await this.db.query(
        `INSERT INTO whatsapp_campaigns
           (id, organization_id, name, offer_id, audience, status, scheduled_at, recipients,
            created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'scheduled', $6, $7, $8)`,
        [
          id,
          organizationId,
          input.name.trim(),
          input.offerId,
          JSON.stringify(input.audience),
          at.toISOString(),
          people.length,
          actorUserId,
        ]
      )
      for (const person of people) {
        await this.db.query(
          `INSERT INTO whatsapp_campaign_recipients
             (id, campaign_id, organization_id, customer_id, name, phone, token)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), id, organizationId, person.customerId, person.name, person.phone, token()]
        )
      }
    })
    // Sent now: started straight away instead of on the next pass.
    if (at.getTime() <= Date.now()) {
      void this.runCampaign(id).catch((error: unknown) =>
        console.error("whatsapp.campaign_start_failed", { id, error })
      )
    }
    return this.view(await this.campaignRow(organizationId, id))
  }

  async cancelCampaign(organizationId: string, id: string) {
    const row = await this.campaignRow(organizationId, id)
    if (!["scheduled", "sending"].includes(String(row.status))) {
      throw refuse("WHATSAPP_CAMPAIGN_CLOSED", "This campaign has already finished.")
    }
    await this.db.query(
      `UPDATE whatsapp_campaigns SET status = 'cancelled', finished_at = now() WHERE id = $1`,
      [id]
    )
    return this.view(await this.campaignRow(organizationId, id))
  }

  // ---- Sending ----

  // Every pass: due campaigns start, and each sending one sends its next batch.
  async runDue(): Promise<{ campaigns: number; sent: number; failed: number }> {
    const due = await this.db.query<Row>(
      `SELECT id FROM whatsapp_campaigns
        WHERE (status = 'scheduled' AND scheduled_at <= now()) OR status = 'sending'
        ORDER BY scheduled_at ASC LIMIT 20`
    )
    let sent = 0
    let failed = 0
    for (const row of due.rows) {
      const result = await this.runCampaign(String(row.id))
      sent += result.sent
      failed += result.failed
    }
    return { campaigns: due.rows.length, sent, failed }
  }

  async runCampaign(id: string): Promise<{ sent: number; failed: number }> {
    const started = await this.db.query<Row>(
      `UPDATE whatsapp_campaigns
          SET status = 'sending', started_at = COALESCE(started_at, now())
        WHERE id = $1 AND (status = 'sending' OR (status = 'scheduled' AND scheduled_at <= now()))
        RETURNING *`,
      [id]
    )
    const campaign = started.rows[0]
    if (!campaign) return { sent: 0, failed: 0 }
    const organizationId = String(campaign.organization_id)
    const finish = async (status: "sent" | "failed", error: string | null = null) => {
      await this.db.query(
        `UPDATE whatsapp_campaigns SET status = $2, finished_at = now(), last_error = $3
          WHERE id = $1 AND status = 'sending'`,
        [id, status, error]
      )
    }

    const context = await this.connections.sendingContext(organizationId).catch(() => null)
    const offer = (
      await this.db.query<Row>(`SELECT * FROM whatsapp_offers WHERE id = $1`, [campaign.offer_id])
    ).rows[0]
    if (!context || !offer) {
      await finish("failed", !context ? "The business number is no longer connected." : "No offer.")
      return { sent: 0, failed: 0 }
    }
    // Claims left by a task that stopped mid-batch go back in the queue after 10 minutes.
    await this.db.query(
      `UPDATE whatsapp_campaign_recipients SET status = 'queued', claimed_at = NULL
        WHERE campaign_id = $1 AND status = 'claimed' AND claimed_at < $2`,
      [id, new Date(Date.now() - 10 * 60_000).toISOString()]
    )
    const claimed = await this.db.query<Row>(
      `UPDATE whatsapp_campaign_recipients SET status = 'claimed', claimed_at = now()
        WHERE status = 'queued' AND id IN (
          SELECT id FROM whatsapp_campaign_recipients
           WHERE campaign_id = $1 AND status = 'queued' ORDER BY id LIMIT $2)
        RETURNING *`,
      [id, BATCH]
    )
    const usesName = String(offer.body).includes(NAME_TOKEN)
    let sent = 0
    let failed = 0
    for (const recipient of claimed.rows) {
      // Opted out since the campaign was made: skipped.
      const out = recipient.customer_id
        ? await this.db.query<Row>(`SELECT marketing_opt_out_at FROM customers WHERE id = $1`, [
            recipient.customer_id,
          ])
        : null
      if (out?.rows[0]?.marketing_opt_out_at) {
        await this.db.query(
          `UPDATE whatsapp_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
          [recipient.id, "Opted out of offers."]
        )
        failed += 1
        continue
      }
      try {
        const waId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
          to: String(recipient.phone),
          templateName: String(offer.template_name),
          language: "ar",
          imageLink: offer.image_url ? String(offer.image_url) : undefined,
          bodyParameters: usesName
            ? [
                String(recipient.name ?? "")
                  .trim()
                  .split(/\s+/)[0] || "عميلنا",
              ]
            : [],
          urlButton: offer.button_url ? { index: 0, suffix: String(recipient.token) } : undefined,
        })
        await this.db.query(
          `UPDATE whatsapp_campaign_recipients
              SET status = 'sent', wa_message_id = $2, sent_at = now() WHERE id = $1`,
          [recipient.id, waId]
        )
        sent += 1
      } catch (error) {
        const code = Number(
          (error instanceof WhatsAppApiError
            ? (error.body as { error?: { code?: number } } | null)?.error?.code
            : null) ?? 0
        )
        // Meta's pace or daily limit: this one and the rest wait for the next pass.
        if ([4, 80007, 130429, 131048, 131056].includes(code)) {
          await this.db.query(
            `UPDATE whatsapp_campaign_recipients SET status = 'queued', claimed_at = NULL
              WHERE campaign_id = $1 AND status = 'claimed'`,
            [id]
          )
          break
        }
        await this.db.query(
          `UPDATE whatsapp_campaign_recipients SET status = 'failed', error = $2 WHERE id = $1`,
          [recipient.id, error instanceof Error ? error.message.slice(0, 500) : String(error)]
        )
        failed += 1
        // The template itself is gone or paused: nothing else will go either.
        if ([132001, 132015, 132016].includes(code)) {
          await this.db.query(
            `UPDATE whatsapp_campaign_recipients SET status = 'failed', error = $2
              WHERE campaign_id = $1 AND status IN ('queued', 'claimed')`,
            [id, error instanceof Error ? error.message.slice(0, 500) : String(error)]
          )
          await finish("failed", error instanceof Error ? error.message : String(error))
          return { sent, failed }
        }
      }
    }
    const left = await this.db.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1 AND status IN ('queued', 'claimed')`,
      [id]
    )
    if (Number(left.rows[0]?.count ?? 0) === 0) await finish("sent")
    return { sent, failed }
  }

  // ---- What comes back ----

  // A tap on the offer's button: counted, then on to the business's own link.
  async click(linkToken: string): Promise<string | null> {
    const row = (
      await this.db.query<Row>(
        `SELECT r.id, o.button_url FROM whatsapp_campaign_recipients r
           JOIN whatsapp_campaigns c ON c.id = r.campaign_id
           JOIN whatsapp_offers o ON o.id = c.offer_id
          WHERE r.token = $1`,
        [linkToken]
      )
    ).rows[0]
    if (!row || !row.button_url) return null
    await this.db.query(
      `UPDATE whatsapp_campaign_recipients
          SET clicks = clicks + 1, clicked_at = COALESCE(clicked_at, now()) WHERE id = $1`,
      [row.id]
    )
    return String(row.button_url)
  }

  // Meta's webhook: delivery statuses for campaign messages, and what customers wrote back -- a
  // reply is counted on their latest campaign, and "إيقاف العروض" (or stop) opts them out.
  async handleWebhook(payload: unknown): Promise<void> {
    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> })?.entry
    for (const entry of entries ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value as {
          metadata?: { phone_number_id?: string }
          statuses?: Array<{
            id?: string
            status?: string
            errors?: Array<{ message?: string; title?: string; error_data?: { details?: string } }>
          }>
          messages?: Array<{
            from?: string
            type?: string
            text?: { body?: string }
            button?: { text?: string; payload?: string }
            interactive?: { button_reply?: { title?: string } }
          }>
        }
        for (const status of value?.statuses ?? []) {
          if (!status.id || !status.status) continue
          const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 }
          if (!(status.status in rank)) continue
          const current = await this.db.query<Row>(
            `SELECT id, status FROM whatsapp_campaign_recipients WHERE wa_message_id = $1`,
            [status.id]
          )
          const row = current.rows[0]
          if (!row || (rank[String(row.status)] ?? 0) >= rank[status.status]) continue
          const reason =
            status.status === "failed"
              ? (status.errors?.[0]?.error_data?.details ??
                status.errors?.[0]?.message ??
                status.errors?.[0]?.title ??
                "Not delivered.")
              : null
          await this.db.query(
            `UPDATE whatsapp_campaign_recipients SET status = $2, error = COALESCE($3, error)
              WHERE id = $1`,
            [row.id, status.status, reason]
          )
        }
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId || !value?.messages?.length) continue
        const owner = await this.db.query<Row>(
          `SELECT organization_id FROM whatsapp_merchant_connections
            WHERE phone_number_id = $1 AND status = 'connected'`,
          [phoneNumberId]
        )
        const organizationId = owner.rows[0]?.organization_id
        if (!organizationId) continue
        for (const message of value.messages) {
          const from = message.from ? toWhatsAppNumber(message.from) : null
          if (!from) continue
          const said = (
            message.button?.text ??
            message.button?.payload ??
            message.interactive?.button_reply?.title ??
            message.text?.body ??
            ""
          ).trim()
          const latest = (
            await this.db.query<Row>(
              `SELECT id FROM whatsapp_campaign_recipients
                WHERE organization_id = $1 AND phone = $2 AND sent_at IS NOT NULL
                ORDER BY sent_at DESC LIMIT 1`,
              [organizationId, from]
            )
          ).rows[0]
          const optOut =
            said === OPT_OUT_TEXT ||
            /^(stop|إيقاف|ايقاف|الغاء الاشتراك|إلغاء الاشتراك)$/i.test(said)
          if (latest) {
            await this.db.query(
              `UPDATE whatsapp_campaign_recipients
                  SET replied_at = COALESCE(replied_at, now()),
                      opted_out_at = CASE WHEN $2 THEN COALESCE(opted_out_at, now())
                                          ELSE opted_out_at END
                WHERE id = $1`,
              [latest.id, optOut]
            )
          }
          if (optOut) {
            const customers = await this.db.query<Row>(
              `SELECT id, phone FROM customers
                WHERE organization_id = $1 AND deleted_at IS NULL AND phone IS NOT NULL
                  AND marketing_opt_out_at IS NULL`,
              [organizationId]
            )
            for (const customer of customers.rows) {
              if (toWhatsAppNumber(String(customer.phone)) === from) {
                await this.db.query(
                  `UPDATE customers SET marketing_opt_out_at = now() WHERE id = $1`,
                  [customer.id]
                )
              }
            }
          }
        }
      }
    }
  }
}

let registered: WhatsAppCampaignsService | null = null
export const registerWhatsAppCampaigns = (service: WhatsAppCampaignsService | null) => {
  registered = service
}
export const registeredWhatsAppCampaigns = () => registered
