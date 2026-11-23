import { randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"
import { addActivity, setStage } from "./service"

// WhatsApp outreach sent by hand (Madar Admin -> CRM -> "رسائل واتساب"). One message is written
// once; pressing "send" on a lead answers with that message filled in for the lead and a link
// of the lead's own, and the salesperson's own WhatsApp opens with it written. Madar then:
//   - moves a new lead to the "message sent" stage and writes the send on its timeline;
//   - counts the day's sends against the campaign's daily limit (a number that messages many
//     strangers at once is the kind WhatsApp restricts);
//   - counts taps on the lead's link;
//   - stops messaging a lead who taps the message's "stop" link.
//
// What can and cannot be known: WhatsApp tells nothing about a message sent by hand -- not
// delivered, not read. A tap on the link can be counted because the link is Madar's. A reply
// arrives in the salesperson's WhatsApp, so they mark it here with one press.

export const OUTREACH_STAGE = "whatsapp_sent"
const SITE_URL = "https://www.madar.my"
const NAME = "{الاسم}"
const BUSINESS = "{النشاط}"
const LINK = "{الرابط}"
// A link that stops further messages with one tap, for the lead who does not want them.
const STOP = "{إيقاف}"
// The tag a lead carries once they asked for no more messages. Every list and every send here
// leaves such a lead out, whichever message they stopped from.
export const STOPPED_TAG = "أوقف الرسائل"

type Row = Record<string, unknown>
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
const iso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null)
const refuse = (code: string, status: number, message: string) =>
  new IdentityError(code, status, "business", message)

// The day an instant falls on in Riyadh, and that day's first instant.
const riyadhDay = (instant: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(instant)
const startOfRiyadhDay = (instant: Date) => new Date(`${riyadhDay(instant)}T00:00:00+03:00`)

// A number in WhatsApp's form: digits, country code first; Saudi mobiles however written.
export function whatsAppNumber(raw: string | null): string | null {
  const digits = (raw ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "")
  if (!digits) return null
  const local = digits.replace(/^(00966|966|0)/, "")
  if (/^5\d{8}$/.test(local)) return `966${local}`
  const international = digits.replace(/^00/, "")
  return /^[1-9]\d{7,14}$/.test(international) && !digits.startsWith("0") ? international : null
}

export interface OutreachCampaignInput {
  name: string
  message: string
  linkUrl: string
  linkTitle?: string | null
  linkDescription?: string | null
  imageUrl?: string | null
  dailyLimit: number
}

export interface OutreachCampaignView extends Required<OutreachCampaignInput> {
  id: string
  createdAt: string
  stats: {
    sent: number
    sentToday: number
    // Leads who tapped their link at least once, and all taps together.
    clicked: number
    clicks: number
    replied: number
    // Leads now past the "message sent" stage: contacted, meeting, trial or won.
    advanced: number
    // Leads who tapped "stop" in this message.
    stopped: number
  }
}

export interface OutreachLeadView {
  leadId: string
  companyName: string
  contactName: string | null
  phone: string | null
  // Whether the phone can be opened in WhatsApp at all.
  reachable: boolean
  stage: string
  source: string
  tags: string[]
  // They asked for no more messages (from this message or another): nothing can be sent.
  stopped: boolean
  send: {
    sentAt: string
    sentBy: string | null
    clicks: number
    lastClickedAt: string | null
    repliedAt: string | null
  } | null
}

const tagsOf = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value
  return Array.isArray(parsed) ? parsed.map(String) : []
}

export class CrmOutreach {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async campaignRow(id: string): Promise<Row> {
    const result = await this.db.query<Row>(
      `SELECT * FROM crm_outreach_campaigns WHERE id = $1 AND archived_at IS NULL`,
      [id]
    )
    if (!result.rows[0]) throw refuse("CRM_OUTREACH_NOT_FOUND", 404, "Campaign not found.")
    return result.rows[0]
  }

  // The "message sent" stage, between "new" (100) and "contacted" (200): an ordinary custom
  // stage the team can rename or recolour. Made the first time it is needed, and again if it
  // was removed since.
  private async ensureStage(): Promise<void> {
    await this.db.query(
      `INSERT INTO crm_stages (key, label, color, position)
       VALUES ($1, 'أُرسلت رسالة واتساب', 'teal', 150)
       ON CONFLICT (key) DO NOTHING`,
      [OUTREACH_STAGE]
    )
  }

  private async view(row: Row): Promise<OutreachCampaignView> {
    const sends = await this.db.query<Row>(
      `SELECT s.sent_at, s.clicks, s.replied_at, s.stopped_at, l.stage
         FROM crm_outreach_sends s
         LEFT JOIN crm_leads l ON l.id = s.lead_id
        WHERE s.campaign_id = $1`,
      [row.id]
    )
    const today = startOfRiyadhDay(this.now()).getTime()
    const advancedStages = new Set(["contacted", "meeting", "trial", "won"])
    return {
      id: String(row.id),
      name: String(row.name),
      message: String(row.message),
      linkUrl: String(row.link_url),
      linkTitle: text(row.link_title),
      linkDescription: text(row.link_description),
      imageUrl: text(row.image_url),
      dailyLimit: Number(row.daily_limit),
      createdAt: iso(row.created_at) as string,
      stats: {
        sent: sends.rows.length,
        sentToday: sends.rows.filter((send) => new Date(String(send.sent_at)).getTime() >= today)
          .length,
        clicked: sends.rows.filter((send) => Number(send.clicks) > 0).length,
        clicks: sends.rows.reduce((sum, send) => sum + Number(send.clicks), 0),
        replied: sends.rows.filter((send) => send.replied_at).length,
        advanced: sends.rows.filter((send) => advancedStages.has(String(send.stage))).length,
        stopped: sends.rows.filter((send) => send.stopped_at).length,
      },
    }
  }

  async list(actor: AuthenticatedActor): Promise<OutreachCampaignView[]> {
    requirePlatformPermission(actor, "crm:manage")
    const result = await this.db.query<Row>(
      `SELECT * FROM crm_outreach_campaigns WHERE archived_at IS NULL ORDER BY created_at DESC`
    )
    return Promise.all(result.rows.map((row) => this.view(row)))
  }

  async create(
    actor: AuthenticatedActor,
    input: OutreachCampaignInput
  ): Promise<OutreachCampaignView> {
    requirePlatformPermission(actor, "crm:manage")
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO crm_outreach_campaigns
         (id, name, message, link_url, link_title, link_description, image_url, daily_limit,
          created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.name,
        input.message,
        input.linkUrl,
        text(input.linkTitle),
        text(input.linkDescription),
        text(input.imageUrl),
        input.dailyLimit,
        actor.userId,
      ]
    )
    return this.view(await this.campaignRow(id))
  }

  async update(
    actor: AuthenticatedActor,
    id: string,
    input: OutreachCampaignInput
  ): Promise<OutreachCampaignView> {
    requirePlatformPermission(actor, "crm:manage")
    await this.campaignRow(id)
    await this.db.query(
      `UPDATE crm_outreach_campaigns
          SET name = $2, message = $3, link_url = $4, link_title = $5, link_description = $6,
              image_url = $7, daily_limit = $8
        WHERE id = $1`,
      [
        id,
        input.name,
        input.message,
        input.linkUrl,
        text(input.linkTitle),
        text(input.linkDescription),
        text(input.imageUrl),
        input.dailyLimit,
      ]
    )
    return this.view(await this.campaignRow(id))
  }

  async archive(actor: AuthenticatedActor, id: string): Promise<void> {
    requirePlatformPermission(actor, "crm:manage")
    await this.campaignRow(id)
    await this.db.query(`UPDATE crm_outreach_campaigns SET archived_at = now() WHERE id = $1`, [id])
  }

  // The leads a campaign can go to, with what has already happened for each. Narrowed by tag
  // and source; "pending" leaves out the ones already sent, "sent" keeps only those.
  async leads(
    actor: AuthenticatedActor,
    id: string,
    filter: { tag?: string | null; source?: string | null; status?: "pending" | "sent" | "all" }
  ): Promise<{ items: OutreachLeadView[]; tags: string[]; pending: number }> {
    requirePlatformPermission(actor, "crm:manage")
    await this.campaignRow(id)
    const [leads, sends] = await Promise.all([
      this.db.query<Row>(
        `SELECT id, company_name, contact_name, phone, stage, source, tags, created_at
           FROM crm_leads ORDER BY created_at DESC`
      ),
      this.db.query<Row>(
        `SELECT s.lead_id, s.sent_at, s.clicks, s.last_clicked_at, s.replied_at, u.full_name
           FROM crm_outreach_sends s
           LEFT JOIN users u ON u.id = s.sent_by
          WHERE s.campaign_id = $1`,
        [id]
      ),
    ])
    const sentTo = new Map(sends.rows.map((send) => [String(send.lead_id), send]))
    const allTags = new Set<string>()
    const items: OutreachLeadView[] = []
    let pending = 0
    for (const lead of leads.rows) {
      const tags = tagsOf(lead.tags)
      for (const tag of tags) allTags.add(tag)
      if (filter.tag && !tags.includes(filter.tag)) continue
      if (filter.source && lead.source !== filter.source) continue
      const send = sentTo.get(String(lead.id)) ?? null
      // A lead already won or lost is nobody to open a conversation with, and one who asked
      // for no more messages is never offered again.
      const stopped = tags.includes(STOPPED_TAG)
      if (!send && (stopped || lead.stage === "won" || lead.stage === "lost")) continue
      if (!send) pending += 1
      const status = filter.status ?? "all"
      if ((status === "pending" && send) || (status === "sent" && !send)) continue
      items.push({
        leadId: String(lead.id),
        companyName: String(lead.company_name),
        contactName: text(lead.contact_name),
        phone: text(lead.phone),
        reachable: whatsAppNumber(text(lead.phone)) !== null,
        stage: String(lead.stage),
        source: String(lead.source),
        tags,
        stopped,
        send: send
          ? {
              sentAt: iso(send.sent_at) as string,
              sentBy: text(send.full_name),
              clicks: Number(send.clicks),
              lastClickedAt: iso(send.last_clicked_at),
              repliedAt: iso(send.replied_at),
            }
          : null,
      })
    }
    return { items: items.slice(0, 300), tags: [...allTags].sort(), pending }
  }

  // The press on "send": the message for this lead, and the WhatsApp address that opens with it
  // written. Recorded as sent at once (pressing again answers the same thing and records
  // nothing new); "undo" below takes it back if the message was not sent after all.
  async send(
    actor: AuthenticatedActor,
    id: string,
    leadId: string
  ): Promise<{ message: string; phone: string; whatsappUrl: string; trackedUrl: string }> {
    requirePlatformPermission(actor, "crm:manage")
    const campaign = await this.campaignRow(id)
    const lead = (await this.db.query<Row>(`SELECT * FROM crm_leads WHERE id = $1`, [leadId]))
      .rows[0]
    if (!lead) throw refuse("CRM_OUTREACH_LEAD_NOT_FOUND", 404, "Lead not found.")
    if (tagsOf(lead.tags).includes(STOPPED_TAG)) {
      throw refuse("CRM_OUTREACH_STOPPED", 409, "This lead asked for no more messages.")
    }
    const phone = whatsAppNumber(text(lead.phone))
    if (!phone) {
      throw refuse("CRM_OUTREACH_NO_PHONE", 422, "This lead has no number WhatsApp can open.")
    }
    const existing = await this.db.query<Row>(
      `SELECT code FROM crm_outreach_sends WHERE campaign_id = $1 AND lead_id = $2`,
      [id, leadId]
    )
    let code = text(existing.rows[0]?.code)
    if (!code) {
      const today = startOfRiyadhDay(this.now()).toISOString()
      const sentToday = await this.db.query<Row>(
        `SELECT id FROM crm_outreach_sends WHERE campaign_id = $1 AND sent_at >= $2`,
        [id, today]
      )
      if (sentToday.rows.length >= Number(campaign.daily_limit)) {
        throw new IdentityError(
          "CRM_OUTREACH_DAILY_LIMIT",
          409,
          "business",
          "Today's limit for this campaign has been reached.",
          { limit: Number(campaign.daily_limit) }
        )
      }
      code = randomBytes(6).toString("base64url")
      await this.db.query(
        `INSERT INTO crm_outreach_sends (id, campaign_id, lead_id, code, sent_by, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), id, leadId, code, actor.userId, this.now().toISOString()]
      )
      await addActivity(this.db, {
        leadId,
        kind: "whatsapp",
        body: `رسالة واتساب: ${String(campaign.name)}`,
        meta: { outreachCampaignId: id },
        actorUserId: actor.userId,
      })
      // Only a brand-new lead moves: one already further along stays where it is.
      if (lead.stage === "new") {
        await this.ensureStage()
        await setStage(this.db, { id: leadId, stage: "new" }, OUTREACH_STAGE, {
          actorUserId: actor.userId,
        })
      }
    }
    const trackedUrl = `${SITE_URL}/o/${code}`
    const name = text(lead.contact_name) ?? String(lead.company_name)
    let message = String(campaign.message)
      .split(NAME)
      .join(name)
      .split(BUSINESS)
      .join(String(lead.company_name))
    // The stop link goes in first: where the message has no {الرابط}, the lead's link is added
    // at the very end, after it.
    const hadLink = message.includes(LINK)
    message = message.split(STOP).join(`${trackedUrl}/stop`)
    message = hadLink ? message.split(LINK).join(trackedUrl) : `${message.trim()}\n${trackedUrl}`
    return {
      message,
      phone,
      whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      trackedUrl,
    }
  }

  // The message was not sent after all: the record goes, and a lead this send had moved out of
  // "new" goes back to it.
  async undo(actor: AuthenticatedActor, id: string, leadId: string): Promise<void> {
    requirePlatformPermission(actor, "crm:manage")
    const removed = await this.db.query(
      `DELETE FROM crm_outreach_sends WHERE campaign_id = $1 AND lead_id = $2 RETURNING id`,
      [id, leadId]
    )
    if (removed.rows.length === 0) return
    const lead = (await this.db.query<Row>(`SELECT stage FROM crm_leads WHERE id = $1`, [leadId]))
      .rows[0]
    if (lead?.stage === OUTREACH_STAGE) {
      await setStage(this.db, { id: leadId, stage: OUTREACH_STAGE }, "new", {
        actorUserId: actor.userId,
      })
    }
  }

  // They answered (seen in the salesperson's own WhatsApp): marked here, and a lead still at
  // "message sent" becomes "contacted". Unmarking only clears the mark.
  async setReplied(
    actor: AuthenticatedActor,
    id: string,
    leadId: string,
    replied: boolean
  ): Promise<void> {
    requirePlatformPermission(actor, "crm:manage")
    const changed = await this.db.query(
      `UPDATE crm_outreach_sends SET replied_at = $3
        WHERE campaign_id = $1 AND lead_id = $2 RETURNING id`,
      [id, leadId, replied ? this.now().toISOString() : null]
    )
    if (changed.rows.length === 0 || !replied) return
    const lead = (await this.db.query<Row>(`SELECT stage FROM crm_leads WHERE id = $1`, [leadId]))
      .rows[0]
    if (lead?.stage === OUTREACH_STAGE) {
      await setStage(this.db, { id: leadId, stage: OUTREACH_STAGE }, "contacted", {
        actorUserId: actor.userId,
      })
    }
  }

  // ---- The link itself (no login) ----

  // What the link's card in the chat shows, and where the link leads. Nothing about the lead.
  async publicLink(code: string): Promise<{
    title: string | null
    description: string | null
    imageUrl: string | null
    target: string
  } | null> {
    const result = await this.db.query<Row>(
      `SELECT c.link_url, c.link_title, c.link_description, c.image_url, c.name
         FROM crm_outreach_sends s
         JOIN crm_outreach_campaigns c ON c.id = s.campaign_id
        WHERE s.code = $1`,
      [code]
    )
    const row = result.rows[0]
    if (!row) return null
    // The page the lead lands on knows the visit came from this message, so a form filled in
    // there is filed under WhatsApp outreach like any other campaign.
    let target = String(row.link_url)
    try {
      const url = new URL(target)
      if (!url.searchParams.has("utm_source")) {
        url.searchParams.set("utm_source", "whatsapp")
        url.searchParams.set("utm_medium", "outreach")
        url.searchParams.set("utm_campaign", String(row.name).slice(0, 60))
        url.searchParams.set("utm_content", code)
      }
      target = url.toString()
    } catch {
      // Kept as written.
    }
    return {
      title: text(row.link_title),
      description: text(row.link_description),
      imageUrl: text(row.image_url),
      target,
    }
  }

  // A tap on the message's "stop" link, reported by its page once open in a person's browser.
  // The lead is tagged so nothing more is sent to them, and it is written on their timeline.
  // Tapped twice, it is done once.
  async recordStop(code: string): Promise<boolean> {
    const found = await this.db.query<Row>(
      `SELECT s.id, s.lead_id, s.stopped_at, l.tags
         FROM crm_outreach_sends s
         JOIN crm_leads l ON l.id = s.lead_id
        WHERE s.code = $1`,
      [code]
    )
    const row = found.rows[0]
    if (!row) return false
    if (!row.stopped_at) {
      await this.db.query(`UPDATE crm_outreach_sends SET stopped_at = $2 WHERE id = $1`, [
        row.id,
        this.now().toISOString(),
      ])
    }
    const tags = tagsOf(row.tags)
    if (!tags.includes(STOPPED_TAG)) {
      await this.db.query(
        `UPDATE crm_leads SET tags = $2::jsonb, updated_at = now() WHERE id = $1`,
        [row.lead_id, JSON.stringify([...tags, STOPPED_TAG])]
      )
      await addActivity(this.db, {
        leadId: String(row.lead_id),
        kind: "note",
        body: "طلب إيقاف رسائل واتساب (ضغط رابط الإيقاف في الرسالة).",
      })
    }
    return true
  }

  // A tap on the link, reported by the page once it is open in a person's browser (the chat
  // app's own fetch for the card never runs the page, so it is not counted).
  async recordClick(code: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE crm_outreach_sends
          SET clicks = clicks + 1, last_clicked_at = $2,
              first_clicked_at = COALESCE(first_clicked_at, $2)
        WHERE code = $1 RETURNING id`,
      [code, this.now().toISOString()]
    )
    return result.rows.length > 0
  }
}
