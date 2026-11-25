import { randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"
import { type LeadAlert, registeredLeadAlertsService } from "../whatsapp/lead-alerts"
import { addActivity, setStage } from "./service"

// WhatsApp outreach sent by hand (Madar Admin -> CRM -> "رسائل واتساب"). One message is written
// once; pressing "send" on a lead answers with that message filled in for the lead and a link
// of the lead's own, and the salesperson's own WhatsApp opens with it written. Madar then:
//   - moves a new lead to the "message sent" stage and writes the send on its timeline;
//   - counts the day's sends against the campaign's daily limit (a number that messages many
//     strangers at once is the kind WhatsApp restricts);
//   - counts taps on the lead's link;
//   - stops messaging a lead who taps the message's "stop" link;
//   - moves a lead who taps "stop" to the "not interested" stage;
//   - moves a lead who taps "interested" to the "interested" stage, with a follow-up to call
//     them, and alerts Madar's team on WhatsApp (the numbers that get the new-lead alerts).
//
// What can and cannot be known: WhatsApp tells nothing about a message sent by hand -- not
// delivered, not read. A tap on the link can be counted because the link is Madar's. A reply
// arrives in the salesperson's WhatsApp, so they mark it here with one press.

export const OUTREACH_STAGE = "whatsapp_sent"
// Where a tap on "interested" and a tap on "stop" put a lead. Ordinary custom stages, like the
// one above: made the first time they are needed.
export const INTERESTED_STAGE = "interested"
export const NOT_INTERESTED_STAGE = "not_interested"
const OUTREACH_STAGES: Record<string, { label: string; color: string; position: number }> = {
  [OUTREACH_STAGE]: { label: "أُرسلت رسالة واتساب", color: "teal", position: 150 },
  [INTERESTED_STAGE]: { label: "مهتم", color: "emerald", position: 250 },
  [NOT_INTERESTED_STAGE]: { label: "غير مهتم", color: "slate", position: 900 },
}
// The stages a tap may move a lead out of: one with a meeting booked, on trial, won or lost
// stays where it is.
const EARLY_STAGES = ["new", OUTREACH_STAGE, "contacted"]
export type OutreachStatus =
  | "pending"
  | "sent"
  | "clicked"
  | "replied"
  | "interested"
  | "advanced"
  | "stopped"
  | "all"

// The stages that count as having moved forward after a message: talked to, interested, a
// meeting, a trial, or won.
const ADVANCED_STAGES = new Set(["contacted", INTERESTED_STAGE, "meeting", "trial", "won"])
const SITE_URL = "https://www.madar.my"
const NAME = "{الاسم}"
const BUSINESS = "{النشاط}"
const LINK = "{الرابط}"
// A link that says "I'm interested" with one tap: no form, since the lead is already known.
const INTERESTED = "{مهتم}"
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
    // Leads who tapped "interested" in this message.
    interested: number
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
    interestedAt: string | null
    // They tapped "stop" in this very message.
    stoppedAt: string | null
  } | null
}

const tagsOf = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value
  return Array.isArray(parsed) ? parsed.map(String) : []
}

export class CrmOutreach {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date(),
    // Tells Madar's team on WhatsApp that a lead tapped "interested". Never awaited and never
    // throws: the lead's tap is recorded whether or not the alert goes out.
    private readonly alertTeam: (lead: LeadAlert) => void = (lead) => {
      void registeredLeadAlertsService()?.notify(lead)
    }
  ) {}

  private async campaignRow(id: string): Promise<Row> {
    const result = await this.db.query<Row>(
      `SELECT * FROM crm_outreach_campaigns WHERE id = $1 AND archived_at IS NULL`,
      [id]
    )
    if (!result.rows[0]) throw refuse("CRM_OUTREACH_NOT_FOUND", 404, "Campaign not found.")
    return result.rows[0]
  }

  // One of this feature's stages ("message sent" between "new" and "contacted", "interested"
  // after "contacted", "not interested" near the end): an ordinary custom stage the team can
  // rename, recolour or move. Made the first time it is needed, and again if it was removed
  // since.
  private async ensureStage(key: string): Promise<void> {
    const stage = OUTREACH_STAGES[key]
    await this.db.query(
      `INSERT INTO crm_stages (key, label, color, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [key, stage.label, stage.color, stage.position]
    )
  }

  private async view(row: Row): Promise<OutreachCampaignView> {
    const sends = await this.db.query<Row>(
      `SELECT s.sent_at, s.clicks, s.replied_at, s.stopped_at, s.interested_at, l.stage
         FROM crm_outreach_sends s
         LEFT JOIN crm_leads l ON l.id = s.lead_id
        WHERE s.campaign_id = $1`,
      [row.id]
    )
    const today = startOfRiyadhDay(this.now()).getTime()
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
        advanced: sends.rows.filter((send) => ADVANCED_STAGES.has(String(send.stage))).length,
        stopped: sends.rows.filter((send) => send.stopped_at).length,
        interested: sends.rows.filter((send) => send.interested_at).length,
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
  // and source; "pending" leaves out the ones already sent, "sent" keeps only those, "clicked"
  // only those who opened their link, "replied" those marked as having answered, "interested"
  // those who tapped "interested", "advanced" those now further along the pipeline and
  // "stopped" those who asked for no more messages.
  async leads(
    actor: AuthenticatedActor,
    id: string,
    filter: { tag?: string | null; source?: string | null; status?: OutreachStatus }
  ): Promise<{ items: OutreachLeadView[]; tags: string[]; pending: number }> {
    requirePlatformPermission(actor, "crm:manage")
    await this.campaignRow(id)
    const [leads, sends] = await Promise.all([
      this.db.query<Row>(
        `SELECT id, company_name, contact_name, phone, stage, source, tags, created_at
           FROM crm_leads ORDER BY created_at DESC`
      ),
      this.db.query<Row>(
        `SELECT s.lead_id, s.sent_at, s.clicks, s.last_clicked_at, s.replied_at, s.interested_at,
                s.stopped_at, u.full_name
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
      if (status === "clicked" && !(Number(send?.clicks ?? 0) > 0)) continue
      if (status === "replied" && !send?.replied_at) continue
      if (status === "interested" && !send?.interested_at) continue
      if (status === "advanced" && !(send && ADVANCED_STAGES.has(String(lead.stage)))) continue
      if (status === "stopped" && !(send && (send.stopped_at || stopped))) continue
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
              interestedAt: iso(send.interested_at),
              stoppedAt: iso(send.stopped_at),
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
        await this.ensureStage(OUTREACH_STAGE)
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
    // A message with neither {الرابط} nor {مهتم} gets the lead's link added at the very end,
    // so there is always something to count; one that has either is left as written.
    const hadLink = message.includes(LINK) || message.includes(INTERESTED)
    message = message
      .split(STOP)
      .join(`${trackedUrl}/stop`)
      .split(INTERESTED)
      .join(`${trackedUrl}/yes`)
    message = hadLink ? message.split(LINK).join(trackedUrl) : `${message.trim()}\n${trackedUrl}`
    // With a picture, its own link goes first: WhatsApp makes the card from the first link, so
    // tapping the picture opens the picture, not the "interested" link.
    if (text(campaign.image_url)) message = `${trackedUrl}/pic\n\n${message.trim()}`
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

  // A tap on the message's "interested" link, reported by its page once open in a person's
  // browser. The lead moves to "interested" (if it was still new, only messaged or contacted).
  // The first time, it is also counted as a tap on the link, written on their timeline, and
  // whoever owns the lead gets a follow-up to call them now.
  async recordInterest(code: string): Promise<boolean> {
    const found = await this.db.query<Row>(
      `SELECT s.id, s.lead_id, s.interested_at, s.sent_by, l.stage, l.owner_user_id,
              l.company_name, l.contact_name, l.phone, l.email, c.name AS campaign_name
         FROM crm_outreach_sends s
         JOIN crm_leads l ON l.id = s.lead_id
         JOIN crm_outreach_campaigns c ON c.id = s.campaign_id
        WHERE s.code = $1`,
      [code]
    )
    const row = found.rows[0]
    if (!row) return false
    const at = this.now().toISOString()
    const leadId = String(row.lead_id)
    if (EARLY_STAGES.includes(String(row.stage))) {
      await this.ensureStage(INTERESTED_STAGE)
      await setStage(this.db, { id: leadId, stage: String(row.stage) }, INTERESTED_STAGE)
    }
    if (row.interested_at) return true
    await this.db.query(`UPDATE crm_outreach_sends SET interested_at = $2 WHERE id = $1`, [
      row.id,
      at,
    ])
    await this.recordClick(code)
    await addActivity(this.db, {
      leadId,
      kind: "note",
      body: "مهتم: ضغط رابط «مهتم» في رسالة واتساب.",
    })
    await this.db.query(
      `INSERT INTO crm_tasks (id, lead_id, title, due_at, assignee_user_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        leadId,
        "اتصل به: ضغط «مهتم» في رسالة واتساب",
        at,
        row.owner_user_id ?? row.sent_by ?? null,
        row.sent_by ?? null,
      ]
    )
    const contact = text(row.contact_name)
    this.alertTeam({
      kind: "website",
      name: contact ? `${String(row.company_name)} (${contact})` : String(row.company_name),
      phone: text(row.phone),
      email: text(row.email),
      interestedIn: String(row.campaign_name),
    })
    return true
  }

  // A tap on the message's "stop" link, reported by its page once open in a person's browser.
  // The lead is tagged so nothing more is sent to them, moves to "not interested" (unless a
  // meeting, a trial or a closed deal already put it further along), and it is written on
  // their timeline. Tapped twice, it is counted and written once.
  async recordStop(code: string): Promise<boolean> {
    const found = await this.db.query<Row>(
      `SELECT s.id, s.lead_id, s.stopped_at, l.tags, l.stage
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
      await this.recordClick(code)
    }
    if ([...EARLY_STAGES, INTERESTED_STAGE].includes(String(row.stage))) {
      await this.ensureStage(NOT_INTERESTED_STAGE)
      await setStage(
        this.db,
        { id: String(row.lead_id), stage: String(row.stage) },
        NOT_INTERESTED_STAGE
      )
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
