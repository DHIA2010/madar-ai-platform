// Internal campaigns: a message the business sends to a chosen group of its loyalty members,
// now or at a set time, and what came of it.
//
// The group is chosen by one plain rule (everyone, those who stopped coming, new members, ...)
// and worked out at the moment of sending, so a campaign scheduled for Friday reaches whoever
// fits on Friday. The first channel is the loyalty card itself: a notification on the phones
// that asked for them, and a line kept in every recipient's card. WhatsApp and SMS are meant to
// become further channels of the same campaign.
//
// What came of it is read from what is already recorded: who had the notification delivered,
// who opened their card and saw it, and who bought within the days the business chose to count.

import { randomUUID } from "node:crypto"

import type { z } from "zod"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LoyaltyPush } from "./push"
import type { loyaltyCampaignSchema } from "./schemas"
import { LOYALTY_ERRORS } from "./service"

type Row = Record<string, unknown>
type CampaignInput = z.infer<typeof loyaltyCampaignSchema>

export type CampaignAudienceKind =
  // Every member.
  | "all"
  // Bought before, but not in the last `days`.
  | "inactive"
  // Bought in the last `days`.
  | "recent"
  // Joined in the last `days`.
  | "new"
  // Joined and never bought.
  | "never"
  // Holding at least `minPoints`.
  | "points"
  // The members picked by hand (one customer, or a few).
  | "members"

export interface CampaignAudience {
  kind: CampaignAudienceKind
  days?: number | null
  minPoints?: number | null
  memberIds?: string[]
}

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled"

export interface CampaignResults {
  // Members it went to, and how many of them had it delivered to a phone.
  recipients: number
  delivered: number
  // Opened their card and saw the message.
  seen: number
  // Bought within the counted days, how many times, and what they paid.
  buyers: number
  purchases: number
  revenue: number
  // Still inside the counted days.
  tracking: boolean
}

export interface CampaignView {
  id: string
  name: string
  message: string
  channel: "card"
  audience: CampaignAudience
  status: CampaignStatus
  scheduledAt: string | null
  sentAt: string | null
  trackDays: number
  createdAt: string
  results: CampaignResults
}

export interface CampaignRecipientView {
  memberId: string
  name: string
  phone: string | null
  delivered: boolean
  seen: boolean
  purchases: number
  spent: number
}

const DAY_MS = 24 * 60 * 60_000
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
const time = (value: unknown) => new Date(iso(value)).getTime()
const cents = (value: number) => Math.round(value * 100) / 100
const marks = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => "$" + String(from + index)).join(", ")

function parseAudience(value: unknown): CampaignAudience {
  let raw: unknown = value
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value)
    } catch {
      raw = {}
    }
  }
  const bag = (raw && typeof raw === "object" ? raw : {}) as Row
  const kinds: CampaignAudienceKind[] = [
    "all",
    "inactive",
    "recent",
    "new",
    "never",
    "points",
    "members",
  ]
  const kind = kinds.includes(bag.kind as CampaignAudienceKind)
    ? (bag.kind as CampaignAudienceKind)
    : "all"
  return {
    kind,
    days: bag.days === null || bag.days === undefined ? null : Number(bag.days),
    minPoints: bag.minPoints === null || bag.minPoints === undefined ? null : Number(bag.minPoints),
    memberIds: Array.isArray(bag.memberIds) ? bag.memberIds.map(String) : [],
  }
}

const statusOf = (value: unknown): CampaignStatus =>
  value === "scheduled" || value === "sending" || value === "sent" || value === "cancelled"
    ? value
    : "draft"

export class LoyaltyCampaigns {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly push: LoyaltyPush,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ---- Who a campaign goes to ----

  // The members that fit the rule right now.
  private async membersFor(organizationId: string, audience: CampaignAudience): Promise<Row[]> {
    const members = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1 ORDER BY created_at`,
      [organizationId]
    )
    if (audience.kind === "all") return members.rows
    if (audience.kind === "members") {
      const wanted = new Set(audience.memberIds ?? [])
      return members.rows.filter((row) => wanted.has(String(row.id)))
    }
    const now = this.now().getTime()
    const days = Math.max(1, Number(audience.days ?? 30))
    if (audience.kind === "new") {
      return members.rows.filter((row) => now - time(row.created_at) <= days * DAY_MS)
    }
    if (audience.kind === "points") {
      const least = Math.max(1, Number(audience.minPoints ?? 1))
      return members.rows.filter((row) => Number(row.points) >= least)
    }
    // The rest depend on when each member last bought.
    const bought = await this.db.query<Row>(
      `SELECT member_id, created_at FROM loyalty_ledger
        WHERE organization_id = $1 AND kind = 'purchase' AND points > 0`,
      [organizationId]
    )
    const last = new Map<string, number>()
    for (const line of bought.rows) {
      const memberId = String(line.member_id)
      last.set(memberId, Math.max(last.get(memberId) ?? 0, time(line.created_at)))
    }
    return members.rows.filter((row) => {
      const at = last.get(String(row.id))
      if (audience.kind === "never") return at === undefined
      if (at === undefined) return false
      const quiet = now - at > days * DAY_MS
      return audience.kind === "inactive" ? quiet : !quiet
    })
  }

  // How many members a rule reaches, and how many of them take notifications on their phone.
  async preview(
    organizationId: string,
    audience: CampaignAudience
  ): Promise<{ members: number; withNotifications: number }> {
    const members = await this.membersFor(organizationId, audience)
    const reachable = await this.push.subscribedMemberIds(organizationId)
    return {
      members: members.length,
      withNotifications: members.filter((row) => reachable.has(String(row.id))).length,
    }
  }

  // ---- Reading ----

  private async row(organizationId: string, id: string): Promise<Row> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_campaigns WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!found.rows[0]) throw LOYALTY_ERRORS.notFound("Campaign")
    return found.rows[0]
  }

  // What each recipient of a sent campaign did: saw it, and bought within the counted days.
  private async followUp(campaign: Row): Promise<Map<string, CampaignRecipientView>> {
    const id = String(campaign.id)
    const recipients = await this.db.query<Row>(
      `SELECT r.member_id, r.delivered, m.name, m.phone
         FROM loyalty_campaign_recipients r JOIN loyalty_members m ON m.id = r.member_id
        WHERE r.campaign_id = $1`,
      [id]
    )
    const byMember = new Map<string, CampaignRecipientView>()
    for (const row of recipients.rows) {
      byMember.set(String(row.member_id), {
        memberId: String(row.member_id),
        name: String(row.name),
        phone: row.phone === null || row.phone === undefined ? null : String(row.phone),
        delivered: row.delivered === true,
        seen: false,
        purchases: 0,
        spent: 0,
      })
    }
    if (byMember.size === 0 || !campaign.sent_at) return byMember
    const seen = await this.db.query<Row>(
      `SELECT member_id FROM loyalty_notices WHERE campaign_id = $1 AND read_at IS NOT NULL`,
      [id]
    )
    for (const row of seen.rows) {
      const entry = byMember.get(String(row.member_id))
      if (entry) entry.seen = true
    }
    const from = time(campaign.sent_at)
    const until = from + Number(campaign.track_days) * DAY_MS
    const bought = await this.db.query<Row>(
      `SELECT member_id, amount, created_at FROM loyalty_ledger
        WHERE organization_id = $1 AND kind = 'purchase' AND points > 0 AND created_at >= $2`,
      [campaign.organization_id, new Date(from)]
    )
    for (const line of bought.rows) {
      const entry = byMember.get(String(line.member_id))
      if (!entry || time(line.created_at) > until) continue
      entry.purchases += 1
      entry.spent = cents(entry.spent + Number(line.amount ?? 0))
    }
    return byMember
  }

  private async view(campaign: Row): Promise<CampaignView> {
    const status = statusOf(campaign.status)
    const followed = status === "sent" ? [...(await this.followUp(campaign)).values()] : []
    const buyers = followed.filter((entry) => entry.purchases > 0)
    const sentAt = campaign.sent_at ? iso(campaign.sent_at) : null
    return {
      id: String(campaign.id),
      name: String(campaign.name),
      message: String(campaign.message),
      channel: "card",
      audience: parseAudience(campaign.audience),
      status,
      scheduledAt: campaign.scheduled_at ? iso(campaign.scheduled_at) : null,
      sentAt,
      trackDays: Number(campaign.track_days),
      createdAt: iso(campaign.created_at),
      results: {
        recipients: Number(campaign.recipients),
        delivered: Number(campaign.delivered),
        seen: followed.filter((entry) => entry.seen).length,
        buyers: buyers.length,
        purchases: followed.reduce((total, entry) => total + entry.purchases, 0),
        revenue: cents(followed.reduce((total, entry) => total + entry.spent, 0)),
        tracking:
          sentAt !== null &&
          this.now().getTime() <= time(sentAt) + Number(campaign.track_days) * DAY_MS,
      },
    }
  }

  async list(organizationId: string): Promise<CampaignView[]> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_campaigns WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [organizationId]
    )
    return Promise.all(found.rows.map((row) => this.view(row)))
  }

  // One campaign with everyone it went to: who bought first, then who saw it.
  async get(
    organizationId: string,
    id: string
  ): Promise<CampaignView & { recipientList: CampaignRecipientView[] }> {
    const campaign = await this.row(organizationId, id)
    const followed = [...(await this.followUp(campaign)).values()].sort(
      (a, b) =>
        b.spent - a.spent ||
        b.purchases - a.purchases ||
        Number(b.seen) - Number(a.seen) ||
        Number(b.delivered) - Number(a.delivered)
    )
    return { ...(await this.view(campaign)), recipientList: followed.slice(0, 500) }
  }

  // ---- Writing ----

  // Saved as a draft, set for a time, or sent at once.
  async create(
    organizationId: string,
    input: CampaignInput,
    by: string | null
  ): Promise<CampaignView> {
    const id = randomUUID()
    const later = input.when === "later"
    if (later && (!input.scheduledAt || new Date(input.scheduledAt) <= this.now())) {
      throw LOYALTY_ERRORS.invalid("LOYALTY_CAMPAIGN_TIME", "Choose a time that is still ahead.")
    }
    await this.db.query(
      `INSERT INTO loyalty_campaigns
         (id, organization_id, name, message, channel, audience, status, scheduled_at,
          track_days, created_by)
       VALUES ($1, $2, $3, $4, 'card', $5::jsonb, $6, $7, $8, $9)`,
      [
        id,
        organizationId,
        input.name,
        input.message,
        JSON.stringify(input.audience),
        later ? "scheduled" : "draft",
        later ? new Date(input.scheduledAt as string) : null,
        input.trackDays,
        by,
      ]
    )
    if (input.when === "now") return this.send(organizationId, id)
    return this.view(await this.row(organizationId, id))
  }

  // Sends a draft or a scheduled campaign now. It is claimed first, so it is never sent twice
  // even when two servers reach for it together.
  async send(organizationId: string, id: string): Promise<CampaignView> {
    const campaign = await this.row(organizationId, id)
    const claimed = await this.db.query(
      `UPDATE loyalty_campaigns SET status = 'sending', updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND status IN ('draft', 'scheduled')`,
      [organizationId, id]
    )
    if ((claimed.rowCount ?? 0) === 0) {
      throw LOYALTY_ERRORS.conflict("LOYALTY_CAMPAIGN_CLOSED", "That campaign was already sent.")
    }
    try {
      const members = await this.membersFor(organizationId, parseAudience(campaign.audience))
      const delivered = await this.push.sendMessage(
        organizationId,
        members,
        String(campaign.message),
        id
      )
      for (let start = 0; start < members.length; start += 200) {
        const batch = members.slice(start, start + 200)
        const values: unknown[] = []
        const rows = batch.map((member, index) => {
          values.push(randomUUID(), id, member.id, delivered.has(String(member.id)))
          return "(" + marks(4, index * 4 + 1) + ")"
        })
        await this.db.query(
          `INSERT INTO loyalty_campaign_recipients (id, campaign_id, member_id, delivered)
           VALUES ` + rows.join(", "),
          values
        )
      }
      await this.db.query(
        `UPDATE loyalty_campaigns
            SET status = 'sent', sent_at = $3, recipients = $4, delivered = $5, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, this.now(), members.length, delivered.size]
      )
    } catch (error) {
      // Nothing is left half-sent in name: it goes back to a draft the business can send again.
      await this.db.query(
        `UPDATE loyalty_campaigns SET status = 'draft', updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND status = 'sending'`,
        [organizationId, id]
      )
      throw error
    }
    return this.view(await this.row(organizationId, id))
  }

  // Called off before its time: it stays in the list, marked so.
  async cancel(organizationId: string, id: string): Promise<CampaignView> {
    await this.row(organizationId, id)
    const closed = await this.db.query(
      `UPDATE loyalty_campaigns SET status = 'cancelled', updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND status IN ('draft', 'scheduled')`,
      [organizationId, id]
    )
    if ((closed.rowCount ?? 0) === 0) {
      throw LOYALTY_ERRORS.conflict("LOYALTY_CAMPAIGN_CLOSED", "That campaign was already sent.")
    }
    return this.view(await this.row(organizationId, id))
  }

  // Only what was never sent can be removed; a sent campaign is part of the record.
  async remove(organizationId: string, id: string): Promise<void> {
    const campaign = await this.row(organizationId, id)
    if (!["draft", "cancelled", "scheduled"].includes(String(campaign.status))) {
      throw LOYALTY_ERRORS.conflict("LOYALTY_CAMPAIGN_CLOSED", "A sent campaign is kept.")
    }
    await this.db.query(`DELETE FROM loyalty_campaigns WHERE organization_id = $1 AND id = $2`, [
      organizationId,
      id,
    ])
  }

  // The timer's pass: every scheduled campaign whose time has come is sent.
  async runDue(now: Date = this.now()): Promise<{ sent: number; failed: number }> {
    const due = await this.db.query<Row>(
      `SELECT id, organization_id FROM loyalty_campaigns
        WHERE status = 'scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at LIMIT 50`,
      [now]
    )
    let sent = 0
    let failed = 0
    for (const row of due.rows) {
      try {
        await this.send(String(row.organization_id), String(row.id))
        sent += 1
      } catch (error) {
        failed += 1
        console.error("loyalty.campaign_send_failed", { campaignId: String(row.id), error })
      }
    }
    return { sent, failed }
  }
}

// The one instance the server runs with, for the timer and for tests.
let registered: LoyaltyCampaigns | null = null
export const registerLoyaltyCampaigns = (campaigns: LoyaltyCampaigns | null) => {
  registered = campaigns
}
export const registeredLoyaltyCampaigns = () => registered
