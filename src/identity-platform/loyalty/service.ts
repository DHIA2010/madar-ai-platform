// The Loyalty app: one points programme per business, shared by every app that sells something.
//
// A customer becomes a member the first time they earn, when the staff add them, or when they
// join by themselves from the business's join link. Points come from what the customer pays
// (bookings and cashier sales), plus the bonuses the business has switched on, and are traded
// for the business's rewards or used as money on a booking. Every change to a balance is one
// line in the ledger, tied to the sale or booking behind it so nothing earns twice.

import { randomBytes, randomInt, randomUUID } from "node:crypto"

import type { z } from "zod"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { loyaltyProgramSchema, loyaltyRewardSchema } from "./schemas"

type Row = Record<string, unknown>
type ProgramInput = z.infer<typeof loyaltyProgramSchema>
type RewardInput = z.infer<typeof loyaltyRewardSchema>

export const LOYALTY_ERRORS = {
  notFound: (what: string) =>
    new IdentityError("LOYALTY_NOT_FOUND", 404, "business", `${what} not found.`),
  invalid: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 422, "business", message, details),
  conflict: (code: string, message: string) => new IdentityError(code, 409, "business", message),
}

// The apps a balance can change from.
export type LoyaltySource = "booking" | "pos" | "staff" | "customer"
export type RewardKind = "amount" | "percent" | "free"
export interface RewardItem {
  kind: "service" | "product"
  id: string
  name: string
}
export interface LoyaltyLocation {
  name: string
  latitude: number
  longitude: number
}

export interface ProgramView {
  isActive: boolean
  joinCode: string
  // The name on the card: the one set here, else the business's own name.
  displayName: string | null
  businessName: string
  pointsPerSar: number
  pointValue: number
  reviewBonusEnabled: boolean
  reviewBonusPoints: number
  googleReviewUrl: string | null
  onlineBonusEnabled: boolean
  onlineBonusPoints: number
  cardColor: string
  textColor: string
  cardTitle: string | null
  cardNote: string | null
  terms: string | null
  walletNotifyPoints: boolean
  nearbyEnabled: boolean
  nearbyMessage: string | null
  locations: LoyaltyLocation[]
}

export interface RewardView {
  id: string
  name: string
  pointsCost: number
  kind: RewardKind
  value: number
  items: RewardItem[]
  isActive: boolean
}

export interface MemberView {
  id: string
  customerId: string | null
  name: string
  phone: string | null
  cardCode: string
  token: string
  points: number
  lifetimePoints: number
  source: string
  inWallet: boolean
  createdAt: string
}

export interface LedgerView {
  id: string
  points: number
  kind: string
  source: string
  note: string | null
  createdAt: string
}

export interface RedemptionView {
  id: string
  memberId: string
  rewardName: string
  pointsCost: number
  kind: RewardKind
  value: number
  items: RewardItem[]
  code: string
  status: "active" | "used" | "cancelled"
  createdAt: string
  closedAt: string | null
}

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
function parseList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}
const kindOf = (value: unknown): RewardKind =>
  value === "percent" ? "percent" : value === "free" ? "free" : "amount"

const mapReward = (row: Row): RewardView => ({
  id: String(row.id),
  name: String(row.name),
  pointsCost: Number(row.points_cost),
  kind: kindOf(row.kind),
  value: Number(row.value),
  items: parseList<RewardItem>(row.items),
  isActive: row.is_active === true,
})

const mapLedger = (row: Row): LedgerView => ({
  id: String(row.id),
  points: Number(row.points),
  kind: String(row.kind),
  source: String(row.source),
  note: text(row.note),
  createdAt: iso(row.created_at),
})

const mapRedemption = (row: Row): RedemptionView => ({
  id: String(row.id),
  memberId: String(row.member_id),
  rewardName: String(row.reward_name),
  pointsCost: Number(row.points_cost),
  kind: kindOf(row.kind),
  value: Number(row.value),
  items: parseList<RewardItem>(row.items),
  code: String(row.code),
  status: row.status === "used" ? "used" : row.status === "cancelled" ? "cancelled" : "active",
  createdAt: iso(row.created_at),
  closedAt: row.closed_at ? iso(row.closed_at) : null,
})

// Letters and digits that are not mistaken for one another when read aloud or typed.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
const randomCode = (length: number) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")
const randomDigits = (length: number) =>
  Array.from({ length }, (_, index) => String(randomInt(index === 0 ? 1 : 0, 10))).join("")

const DAY_MS = 24 * 60 * 60_000

export class LoyaltyService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date()
  ) {}

  // Told after a member's card changes (balance or message), so a card kept in a phone's
  // wallet can be refreshed. Set where the server is put together. Must not fail the change.
  onCardChanged: ((memberId: string) => void) | null = null

  private changed(memberId: string) {
    try {
      this.onCardChanged?.(memberId)
    } catch (error) {
      console.error("loyalty.card_changed_failed", { memberId, error })
    }
  }

  // ---- The programme ----

  private async programRow(organizationId: string): Promise<Row> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_programs WHERE organization_id = $1`,
      [organizationId]
    )
    if (found.rows[0]) return found.rows[0]
    await this.db.query(
      `INSERT INTO loyalty_programs (organization_id, join_code) VALUES ($1, $2)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId, randomCode(8)]
    )
    const created = await this.db.query<Row>(
      `SELECT * FROM loyalty_programs WHERE organization_id = $1`,
      [organizationId]
    )
    return created.rows[0]
  }

  private async businessName(organizationId: string): Promise<string> {
    const found = await this.db.query<Row>(`SELECT name FROM organizations WHERE id = $1`, [
      organizationId,
    ])
    return String(found.rows[0]?.name ?? "")
  }

  private mapProgram(row: Row, businessName: string): ProgramView {
    return {
      isActive: row.is_active === true,
      joinCode: String(row.join_code),
      displayName: text(row.display_name),
      businessName: text(row.display_name) ?? businessName,
      pointsPerSar: Number(row.points_per_sar),
      pointValue: Number(row.point_value),
      reviewBonusEnabled: row.review_bonus_enabled === true,
      reviewBonusPoints: Number(row.review_bonus_points),
      googleReviewUrl: text(row.google_review_url),
      onlineBonusEnabled: row.online_bonus_enabled === true,
      onlineBonusPoints: Number(row.online_bonus_points),
      cardColor: String(row.card_color),
      textColor: String(row.text_color),
      cardTitle: text(row.card_title),
      cardNote: text(row.card_note),
      terms: text(row.terms),
      walletNotifyPoints: row.wallet_notify_points === true,
      nearbyEnabled: row.nearby_enabled === true,
      nearbyMessage: text(row.nearby_message),
      locations: parseList<LoyaltyLocation>(row.locations),
    }
  }

  async getProgram(organizationId: string): Promise<ProgramView> {
    const [row, name] = await Promise.all([
      this.programRow(organizationId),
      this.businessName(organizationId),
    ])
    return this.mapProgram(row, name)
  }

  async updateProgram(organizationId: string, input: ProgramInput): Promise<ProgramView> {
    const current = await this.getProgram(organizationId)
    const next = { ...current, ...input }
    await this.db.query(
      `UPDATE loyalty_programs SET
         is_active = $2, display_name = $3, points_per_sar = $4, point_value = $5,
         review_bonus_enabled = $6, review_bonus_points = $7, google_review_url = $8,
         online_bonus_enabled = $9, online_bonus_points = $10, card_color = $11,
         text_color = $12, card_title = $13, card_note = $14, terms = $15,
         wallet_notify_points = $16, nearby_enabled = $17, nearby_message = $18,
         locations = $19::jsonb, updated_at = now()
       WHERE organization_id = $1`,
      [
        organizationId,
        next.isActive,
        clean(next.displayName),
        next.pointsPerSar,
        next.pointValue,
        next.reviewBonusEnabled,
        next.reviewBonusPoints,
        clean(next.googleReviewUrl),
        next.onlineBonusEnabled,
        next.onlineBonusPoints,
        next.cardColor,
        next.textColor,
        clean(next.cardTitle),
        clean(next.cardNote),
        clean(next.terms),
        next.walletNotifyPoints,
        next.nearbyEnabled,
        clean(next.nearbyMessage),
        JSON.stringify(next.locations),
      ]
    )
    // A new look or new places reach the cards already in wallets.
    const look = ["cardColor", "textColor", "cardTitle", "cardNote", "displayName", "terms"]
    const places = ["nearbyEnabled", "nearbyMessage", "locations"]
    const changedCard = [...look, ...places].some(
      (key) =>
        JSON.stringify(current[key as keyof ProgramView]) !==
        JSON.stringify(next[key as keyof ProgramView])
    )
    if (changedCard) await this.refreshWalletCards(organizationId)
    return this.getProgram(organizationId)
  }

  // What the apps that sell need to know: is there a programme, and what is a point worth.
  async rules(
    organizationId: string
  ): Promise<{ enabled: boolean; pointsPerSar: number; pointValue: number }> {
    const found = await this.db.query<Row>(
      `SELECT is_active, points_per_sar, point_value FROM loyalty_programs
        WHERE organization_id = $1`,
      [organizationId]
    )
    const row = found.rows[0]
    return {
      enabled: row?.is_active === true,
      pointsPerSar: Number(row?.points_per_sar ?? 1),
      pointValue: Number(row?.point_value ?? 0.05),
    }
  }

  // ---- Rewards ----

  async listRewards(organizationId: string): Promise<RewardView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM loyalty_rewards WHERE organization_id = $1 ORDER BY points_cost, created_at`,
      [organizationId]
    )
    return result.rows.map(mapReward)
  }

  async createReward(organizationId: string, input: RewardInput): Promise<RewardView> {
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO loyalty_rewards
         (id, organization_id, name, points_cost, kind, value, items, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        id,
        organizationId,
        input.name,
        input.pointsCost,
        input.kind,
        input.kind === "free" ? 0 : input.value,
        JSON.stringify(input.items),
        input.isActive,
      ]
    )
    return this.reward(organizationId, id)
  }

  async updateReward(organizationId: string, id: string, input: RewardInput): Promise<RewardView> {
    await this.reward(organizationId, id)
    await this.db.query(
      `UPDATE loyalty_rewards SET name = $3, points_cost = $4, kind = $5, value = $6,
              items = $7::jsonb, is_active = $8
        WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        input.name,
        input.pointsCost,
        input.kind,
        input.kind === "free" ? 0 : input.value,
        JSON.stringify(input.items),
        input.isActive,
      ]
    )
    return this.reward(organizationId, id)
  }

  async removeReward(organizationId: string, id: string): Promise<void> {
    await this.reward(organizationId, id)
    await this.db.query(`DELETE FROM loyalty_rewards WHERE organization_id = $1 AND id = $2`, [
      organizationId,
      id,
    ])
  }

  private async reward(organizationId: string, id: string): Promise<RewardView> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_rewards WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!found.rows[0]) throw LOYALTY_ERRORS.notFound("Reward")
    return mapReward(found.rows[0])
  }

  // The business's own services and products, to choose what a reward covers. Either list is
  // simply empty for a business without that app.
  async catalog(organizationId: string): Promise<RewardItem[]> {
    const read = async (kind: RewardItem["kind"], sql: string) => {
      try {
        const result = await this.db.query<Row>(sql, [organizationId])
        return result.rows.map((row) => ({ kind, id: String(row.id), name: String(row.name) }))
      } catch (error) {
        console.error("loyalty.catalog_failed", { organizationId, kind, error })
        return []
      }
    }
    const [services, products] = await Promise.all([
      read(
        "service",
        `SELECT id, name FROM booking_services
          WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`
      ),
      read(
        "product",
        `SELECT id, name FROM products
          WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'active'
            AND product_type <> 'raw'
          ORDER BY name LIMIT 2000`
      ),
    ])
    return [...services, ...products]
  }

  // ---- Members ----

  private async walletMemberIds(memberIds: string[]): Promise<Set<string>> {
    const held = new Set<string>()
    for (let start = 0; start < memberIds.length; start += 500) {
      const batch = memberIds.slice(start, start + 500)
      const marks = batch.map((_, index) => `$${index + 1}`).join(", ")
      const result = await this.db.query<Row>(
        `SELECT member_id FROM loyalty_wallet_devices WHERE member_id IN (${marks})`,
        batch
      )
      for (const row of result.rows) held.add(String(row.member_id))
    }
    return held
  }

  private mapMember(row: Row, inWallet: boolean): MemberView {
    return {
      id: String(row.id),
      customerId: text(row.customer_id),
      name: String(row.name),
      phone: text(row.phone),
      cardCode: String(row.card_code),
      token: String(row.token),
      points: Number(row.points),
      lifetimePoints: Number(row.lifetime_points),
      source: String(row.source),
      inWallet,
      createdAt: iso(row.created_at),
    }
  }

  async listMembers(organizationId: string, search?: string): Promise<MemberView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    )
    const needle = search?.trim().toLowerCase()
    const rows = needle
      ? result.rows.filter(
          (row) =>
            String(row.name).toLowerCase().includes(needle) ||
            String(row.phone ?? "").includes(needle) ||
            String(row.card_code) === needle
        )
      : result.rows
    const held = await this.walletMemberIds(rows.map((row) => String(row.id)))
    return rows.map((row) => this.mapMember(row, held.has(String(row.id))))
  }

  private async memberRow(organizationId: string, id: string): Promise<Row> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!found.rows[0]) throw LOYALTY_ERRORS.notFound("Member")
    return found.rows[0]
  }

  async getMember(organizationId: string, id: string) {
    const row = await this.memberRow(organizationId, id)
    const [ledger, redemptions, held] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM loyalty_ledger WHERE member_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [id]
      ),
      this.db.query<Row>(
        `SELECT * FROM loyalty_redemptions WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id]
      ),
      this.walletMemberIds([id]),
    ])
    return {
      member: this.mapMember(row, held.has(id)),
      ledger: ledger.rows.map(mapLedger),
      redemptions: redemptions.rows.map(mapRedemption),
    }
  }

  // The customers list entry for a phone: the one already there, or a new one. A failure here
  // must not lose the member, so it falls back to no link.
  private async customerFor(
    organizationId: string,
    name: string,
    phone: string
  ): Promise<string | null> {
    try {
      const same = await this.db.query<Row>(
        `SELECT id FROM customers
          WHERE organization_id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
        [organizationId, phone]
      )
      if (same.rows[0]) return String(same.rows[0].id)
      const id = randomUUID()
      await this.db.query(
        `INSERT INTO customers (id, organization_id, name, phone) VALUES ($1, $2, $3, $4)`,
        [id, organizationId, name, phone]
      )
      return id
    } catch (error) {
      console.error("loyalty.customer_link_failed", { organizationId, error })
      return null
    }
  }

  private async insertMember(
    organizationId: string,
    input: { customerId: string | null; name: string; phone: string | null; source: string }
  ): Promise<Row> {
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO loyalty_members
         (id, organization_id, customer_id, name, phone, card_code, token, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        organizationId,
        input.customerId,
        input.name,
        input.phone,
        randomDigits(10),
        randomBytes(24).toString("hex"),
        input.source,
      ]
    )
    return this.memberRow(organizationId, id)
  }

  private async memberByPhone(organizationId: string, phone: string): Promise<Row | null> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [organizationId, phone]
    )
    return found.rows[0] ?? null
  }

  // Added by the staff. The same phone is the same member.
  async addMember(
    organizationId: string,
    input: { name: string; phone: string }
  ): Promise<MemberView> {
    if (await this.memberByPhone(organizationId, input.phone)) {
      throw LOYALTY_ERRORS.conflict("LOYALTY_MEMBER_EXISTS", "That phone already has a card.")
    }
    const customerId = await this.customerFor(organizationId, input.name, input.phone)
    const linked = customerId ? await this.memberOfCustomer(organizationId, customerId) : null
    if (linked) {
      throw LOYALTY_ERRORS.conflict("LOYALTY_MEMBER_EXISTS", "That customer already has a card.")
    }
    const row = await this.insertMember(organizationId, { ...input, customerId, source: "staff" })
    return this.mapMember(row, false)
  }

  private async memberOfCustomer(organizationId: string, customerId: string): Promise<Row | null> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1 AND customer_id = $2 LIMIT 1`,
      [organizationId, customerId]
    )
    return found.rows[0] ?? null
  }

  // The member behind a customer of the business, made on their first points.
  private async ensureMember(
    organizationId: string,
    customerId: string,
    source: string
  ): Promise<Row | null> {
    const existing = await this.memberOfCustomer(organizationId, customerId)
    if (existing) return existing
    const customer = await this.db.query<Row>(
      `SELECT name, phone FROM customers WHERE organization_id = $1 AND id = $2`,
      [organizationId, customerId]
    )
    if (!customer.rows[0]) return null
    const phone = clean(text(customer.rows[0].phone))
    // Someone who joined by phone before the business had them as a customer.
    const byPhone = phone ? await this.memberByPhone(organizationId, phone) : null
    if (byPhone) {
      await this.db.query(
        `UPDATE loyalty_members SET customer_id = $2 WHERE id = $1 AND customer_id IS NULL`,
        [byPhone.id, customerId]
      )
      return byPhone
    }
    return this.insertMember(organizationId, {
      customerId,
      name: String(customer.rows[0].name ?? ""),
      phone,
      source,
    })
  }

  // ---- The ledger ----

  // One line in the ledger and the balance moved with it. earned says whether the points count
  // toward the member's lifetime total.
  private async post(
    organizationId: string,
    memberId: string,
    line: {
      points: number
      kind: string
      source: LoyaltySource
      ref?: string | null
      note?: string | null
      by?: string | null
      earned?: boolean
    }
  ): Promise<void> {
    if (line.points === 0) return
    await this.db.query(
      `INSERT INTO loyalty_ledger
         (id, organization_id, member_id, points, kind, source, ref, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        organizationId,
        memberId,
        line.points,
        line.kind,
        line.source,
        line.ref ?? null,
        clean(line.note),
        line.by ?? null,
      ]
    )
    await this.db.query(
      `UPDATE loyalty_members
          SET points = points + $2, lifetime_points = lifetime_points + $3, updated_at = now()
        WHERE id = $1`,
      [memberId, line.points, line.earned ? line.points : 0]
    )
    this.changed(memberId)
  }

  // Takes points off a balance only if they are all there.
  private async take(
    organizationId: string,
    memberId: string,
    line: {
      points: number
      kind: string
      source: LoyaltySource
      ref?: string | null
      note?: string | null
      by?: string | null
    }
  ): Promise<void> {
    const taken = await this.db.query(
      // Added as a negative: the in-memory database the tests run on gets "points - $2" wrong.
      `UPDATE loyalty_members SET points = points + $2, updated_at = now()
        WHERE id = $1 AND points >= $3`,
      [memberId, -line.points, line.points]
    )
    if ((taken.rowCount ?? 0) === 0) {
      throw LOYALTY_ERRORS.invalid("LOYALTY_POINTS_SHORT", "The member does not have the points.")
    }
    await this.db.query(
      `INSERT INTO loyalty_ledger
         (id, organization_id, member_id, points, kind, source, ref, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        organizationId,
        memberId,
        -line.points,
        line.kind,
        line.source,
        line.ref ?? null,
        clean(line.note),
        line.by ?? null,
      ]
    )
    this.changed(memberId)
  }

  private async linesOf(
    organizationId: string,
    source: LoyaltySource,
    ref: string
  ): Promise<Row[]> {
    const result = await this.db.query<Row>(
      `SELECT member_id, points, kind FROM loyalty_ledger
        WHERE organization_id = $1 AND source = $2 AND ref = $3`,
      [organizationId, source, ref]
    )
    return result.rows
  }

  // ---- What the selling apps call ----

  // A customer's balance, for a screen that lets points be used.
  async balanceOf(organizationId: string, customerId: string): Promise<number> {
    const member = await this.memberOfCustomer(organizationId, customerId)
    return member ? Number(member.points) : 0
  }

  // Points for a paid sale or a finished visit. ref is the sale's own id: the same sale earns
  // once, and earns again only after its points were fully taken back. online adds the bonus
  // for ordering over the internet when the business has it switched on.
  async earn(
    organizationId: string,
    input: {
      customerId: string
      amount: number
      source: "booking" | "pos"
      ref: string
      online?: boolean
    }
  ): Promise<number> {
    const program = await this.programRow(organizationId)
    if (program.is_active !== true) return 0
    const earning = ["purchase", "online_bonus", "reversal"]
    const before = (await this.linesOf(organizationId, input.source, input.ref))
      .filter((line) => earning.includes(String(line.kind)))
      .reduce((total, line) => total + Number(line.points), 0)
    if (before > 0) return before
    const member = await this.ensureMember(organizationId, input.customerId, input.source)
    if (!member) return 0
    const memberId = String(member.id)
    const points = Math.floor(Math.max(0, input.amount) * Number(program.points_per_sar))
    const bonus =
      input.online && program.online_bonus_enabled === true
        ? Number(program.online_bonus_points)
        : 0
    await this.post(organizationId, memberId, {
      points,
      kind: "purchase",
      source: input.source,
      ref: input.ref,
      earned: true,
    })
    await this.post(organizationId, memberId, {
      points: bonus,
      kind: "online_bonus",
      source: input.source,
      ref: input.ref,
      earned: true,
    })
    return points + bonus
  }

  // Takes back what a sale earned: all of it, or the share that was returned (fraction of the
  // sale's amount). Never takes a balance below zero.
  async unearn(
    organizationId: string,
    input: { source: "booking" | "pos"; ref: string; fraction?: number }
  ): Promise<number> {
    const lines = await this.linesOf(organizationId, input.source, input.ref)
    const earnedLines = lines.filter((line) =>
      ["purchase", "online_bonus"].includes(String(line.kind))
    )
    if (earnedLines.length === 0) return 0
    const memberId = String(earnedLines[0].member_id)
    const earned = earnedLines.reduce((total, line) => total + Number(line.points), 0)
    const takenBack = -lines
      .filter((line) => line.kind === "reversal")
      .reduce((total, line) => total + Number(line.points), 0)
    const left = Math.max(0, earned - takenBack)
    const fraction = Math.min(1, Math.max(0, input.fraction ?? 1))
    const wanted = fraction >= 1 ? left : Math.min(left, Math.round(earned * fraction))
    const member = await this.memberRow(organizationId, memberId)
    const points = Math.min(wanted, Math.max(0, Number(member.points)))
    if (points <= 0) return 0
    await this.db.query(
      `INSERT INTO loyalty_ledger (id, organization_id, member_id, points, kind, source, ref)
       VALUES ($1, $2, $3, $4, 'reversal', $5, $6)`,
      [randomUUID(), organizationId, memberId, -points, input.source, input.ref]
    )
    await this.db.query(
      `UPDATE loyalty_members
          SET points = points + $2, lifetime_points = lifetime_points + $2, updated_at = now()
        WHERE id = $1`,
      [memberId, -points]
    )
    this.changed(memberId)
    return points
  }

  // Points used as money on a sale, and given back when that sale is undone.
  async spend(
    organizationId: string,
    input: { customerId: string; points: number; source: "booking" | "pos"; ref: string }
  ): Promise<void> {
    if (input.points <= 0) return
    const member = await this.memberOfCustomer(organizationId, input.customerId)
    if (!member) {
      throw LOYALTY_ERRORS.invalid("LOYALTY_POINTS_SHORT", "The customer has no points.")
    }
    await this.take(organizationId, String(member.id), {
      points: input.points,
      kind: "payment",
      source: input.source,
      ref: input.ref,
    })
  }

  async giveBack(
    organizationId: string,
    input: { source: "booking" | "pos"; ref: string }
  ): Promise<void> {
    const lines = (await this.linesOf(organizationId, input.source, input.ref)).filter((line) =>
      ["payment", "payment_return"].includes(String(line.kind))
    )
    if (lines.length === 0) return
    const owed = -lines.reduce((total, line) => total + Number(line.points), 0)
    if (owed <= 0) return
    await this.post(organizationId, String(lines[0].member_id), {
      points: owed,
      kind: "payment_return",
      source: input.source,
      ref: input.ref,
    })
  }

  // ---- What the staff do by hand ----

  async adjust(
    organizationId: string,
    memberId: string,
    input: { points: number; note?: string | null },
    by: string | null
  ) {
    await this.memberRow(organizationId, memberId)
    if (input.points > 0) {
      await this.post(organizationId, memberId, {
        points: input.points,
        kind: "adjust",
        source: "staff",
        note: input.note,
        by,
        earned: true,
      })
    } else {
      await this.take(organizationId, memberId, {
        points: -input.points,
        kind: "adjust",
        source: "staff",
        note: input.note,
        by,
      })
    }
    return this.getMember(organizationId, memberId)
  }

  // ---- Trading points for a reward ----

  // Takes the points and gives the member the reward: handed over at once by the staff, or
  // kept as a code the customer shows later. One reward waits at a time.
  async redeem(
    organizationId: string,
    memberId: string,
    rewardId: string,
    options: { by: string | null; source: "staff" | "customer"; handOver: boolean }
  ): Promise<RedemptionView> {
    const [program, reward] = await Promise.all([
      this.programRow(organizationId),
      this.reward(organizationId, rewardId),
      this.memberRow(organizationId, memberId),
    ])
    if (program.is_active !== true || !reward.isActive) {
      throw LOYALTY_ERRORS.invalid("LOYALTY_REWARD_UNAVAILABLE", "That reward is not offered.")
    }
    const waiting = await this.db.query<Row>(
      `SELECT id FROM loyalty_redemptions WHERE member_id = $1 AND status = 'active' LIMIT 1`,
      [memberId]
    )
    if (waiting.rows[0]) {
      throw LOYALTY_ERRORS.conflict(
        "LOYALTY_REWARD_WAITING",
        "The member already has a reward waiting to be used."
      )
    }
    const id = randomUUID()
    await this.take(organizationId, memberId, {
      points: reward.pointsCost,
      kind: "redeem",
      source: options.source,
      ref: id,
      note: reward.name,
      by: options.by,
    })
    await this.db.query(
      `INSERT INTO loyalty_redemptions
         (id, organization_id, member_id, reward_id, reward_name, points_cost, kind, value,
          items, code, status, created_by, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
      [
        id,
        organizationId,
        memberId,
        reward.id,
        reward.name,
        reward.pointsCost,
        reward.kind,
        reward.value,
        JSON.stringify(reward.items),
        randomDigits(6),
        options.handOver ? "used" : "active",
        options.by,
        options.handOver ? this.now() : null,
      ]
    )
    return this.redemption(organizationId, id)
  }

  private async redemption(organizationId: string, id: string): Promise<RedemptionView> {
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_redemptions WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!found.rows[0]) throw LOYALTY_ERRORS.notFound("Reward")
    return mapRedemption(found.rows[0])
  }

  // A waiting reward is handed over (used) or called off (cancelled, and the points go back).
  async closeRedemption(
    organizationId: string,
    id: string,
    outcome: "used" | "cancelled"
  ): Promise<RedemptionView> {
    const current = await this.redemption(organizationId, id)
    if (current.status !== "active") {
      throw LOYALTY_ERRORS.conflict("LOYALTY_REWARD_CLOSED", "That reward is already closed.")
    }
    const closed = await this.db.query(
      `UPDATE loyalty_redemptions SET status = $3, closed_at = $4
        WHERE organization_id = $1 AND id = $2 AND status = 'active'`,
      [organizationId, id, outcome, this.now()]
    )
    if ((closed.rowCount ?? 0) > 0 && outcome === "cancelled") {
      await this.post(organizationId, current.memberId, {
        points: current.pointsCost,
        kind: "redeem_return",
        source: "staff",
        ref: id,
        note: current.rewardName,
      })
    }
    return this.redemption(organizationId, id)
  }

  // The rewards waiting to be handed over, for the staff.
  async waitingRedemptions(organizationId: string) {
    const result = await this.db.query<Row>(
      `SELECT * FROM loyalty_redemptions
        WHERE organization_id = $1 AND status = 'active' ORDER BY created_at DESC`,
      [organizationId]
    )
    const members = await this.db.query<Row>(
      `SELECT id, name, phone FROM loyalty_members WHERE organization_id = $1`,
      [organizationId]
    )
    const byId = new Map(members.rows.map((row) => [String(row.id), row]))
    return result.rows.map((row) => ({
      ...mapRedemption(row),
      memberName: String(byId.get(String(row.member_id))?.name ?? ""),
      memberPhone: text(byId.get(String(row.member_id))?.phone),
    }))
  }

  // ---- The numbers ----

  async overview(organizationId: string) {
    const since = new Date(this.now().getTime() - 30 * DAY_MS)
    const [program, members, ledger, waiting] = await Promise.all([
      this.getProgram(organizationId),
      this.db.query<Row>(`SELECT * FROM loyalty_members WHERE organization_id = $1`, [
        organizationId,
      ]),
      this.db.query<Row>(
        `SELECT * FROM loyalty_ledger WHERE organization_id = $1 AND created_at >= $2
          ORDER BY created_at DESC`,
        [organizationId, since]
      ),
      this.db.query<Row>(
        `SELECT id FROM loyalty_redemptions WHERE organization_id = $1 AND status = 'active'`,
        [organizationId]
      ),
    ])
    const held = await this.walletMemberIds(members.rows.map((row) => String(row.id)))
    const names = new Map(members.rows.map((row) => [String(row.id), String(row.name)]))
    const outstanding = members.rows.reduce((total, row) => total + Number(row.points), 0)
    const sum = (kinds: string[]) =>
      ledger.rows
        .filter((line) => kinds.includes(String(line.kind)))
        .reduce((total, line) => total + Number(line.points), 0)
    const earnedBy = (source: string) =>
      ledger.rows
        .filter((line) => line.source === source && Number(line.points) > 0)
        .filter((line) => ["purchase", "online_bonus"].includes(String(line.kind)))
        .reduce((total, line) => total + Number(line.points), 0)
    return {
      isActive: program.isActive,
      members: members.rows.length,
      newMembers: members.rows.filter((row) => new Date(iso(row.created_at)) >= since).length,
      inWallet: held.size,
      outstandingPoints: outstanding,
      outstandingValue: Math.round(outstanding * program.pointValue * 100) / 100,
      // The last thirty days.
      earned:
        sum(["purchase", "online_bonus", "review_bonus", "reversal"]) +
        ledger.rows
          .filter((line) => line.kind === "adjust" && Number(line.points) > 0)
          .reduce((total, line) => total + Number(line.points), 0),
      redeemed: -sum(["redeem", "redeem_return", "payment", "payment_return"]),
      earnedFromBooking: earnedBy("booking"),
      earnedFromCashier: earnedBy("pos"),
      bonusPoints: sum(["online_bonus", "review_bonus"]),
      waitingRewards: waiting.rows.length,
      top: [...members.rows]
        .sort((a, b) => Number(b.points) - Number(a.points))
        .slice(0, 5)
        .filter((row) => Number(row.points) > 0)
        .map((row) => ({ id: String(row.id), name: String(row.name), points: Number(row.points) })),
      recent: ledger.rows.slice(0, 12).map((line) => ({
        ...mapLedger(line),
        memberId: String(line.member_id),
        memberName: names.get(String(line.member_id)) ?? "",
      })),
    }
  }

  // ---- Wallet cards ----

  // A message shown on every card kept in a wallet; the phone announces it when the card
  // refreshes. Returns how many cards it went to.
  async broadcast(organizationId: string, message: string): Promise<number> {
    const members = await this.db.query<Row>(
      `SELECT id FROM loyalty_members WHERE organization_id = $1`,
      [organizationId]
    )
    const held = await this.walletMemberIds(members.rows.map((row) => String(row.id)))
    for (const memberId of held) {
      await this.db.query(
        `UPDATE loyalty_members SET wallet_message = $2, updated_at = now() WHERE id = $1`,
        [memberId, message]
      )
      this.changed(memberId)
    }
    return held.size
  }

  private async refreshWalletCards(organizationId: string): Promise<void> {
    const members = await this.db.query<Row>(
      `SELECT id FROM loyalty_members WHERE organization_id = $1`,
      [organizationId]
    )
    const held = await this.walletMemberIds(members.rows.map((row) => String(row.id)))
    for (const memberId of held) {
      await this.db.query(`UPDATE loyalty_members SET updated_at = now() WHERE id = $1`, [memberId])
      this.changed(memberId)
    }
  }

  // ---- The public side: joining, and a member's own card ----

  private async programByJoinCode(joinCode: string): Promise<Row> {
    const found = await this.db.query<Row>(`SELECT * FROM loyalty_programs WHERE join_code = $1`, [
      joinCode.trim().toLowerCase(),
    ])
    if (!found.rows[0] || found.rows[0].is_active !== true) {
      throw LOYALTY_ERRORS.notFound("Programme")
    }
    return found.rows[0]
  }

  private publicProgram(program: ProgramView, rewards: RewardView[]) {
    return {
      businessName: program.businessName,
      cardColor: program.cardColor,
      textColor: program.textColor,
      cardTitle: program.cardTitle,
      cardNote: program.cardNote,
      terms: program.terms,
      pointsPerSar: program.pointsPerSar,
      rewards: rewards
        .filter((reward) => reward.isActive)
        .map(({ id, name, pointsCost, kind, value, items }) => ({
          id,
          name,
          pointsCost,
          kind,
          value,
          items: items.map((item) => item.name),
        })),
    }
  }

  // What the join page shows before someone joins.
  async publicJoinPage(joinCode: string) {
    const row = await this.programByJoinCode(joinCode)
    const organizationId = String(row.organization_id)
    const [name, rewards] = await Promise.all([
      this.businessName(organizationId),
      this.listRewards(organizationId),
    ])
    return this.publicProgram(this.mapProgram(row, name), rewards)
  }

  // Joining from the link or QR. A phone that already has a card is not shown that card here
  // (anyone can type a phone number): its owner opens it from the link they were given.
  async publicJoin(
    joinCode: string,
    input: { name: string; phone: string }
  ): Promise<{ token: string | null; alreadyMember: boolean }> {
    const row = await this.programByJoinCode(joinCode)
    const organizationId = String(row.organization_id)
    if (await this.memberByPhone(organizationId, input.phone)) {
      return { token: null, alreadyMember: true }
    }
    const customerId = await this.customerFor(organizationId, input.name, input.phone)
    if (customerId && (await this.memberOfCustomer(organizationId, customerId))) {
      return { token: null, alreadyMember: true }
    }
    const member = await this.insertMember(organizationId, {
      customerId,
      name: input.name,
      phone: input.phone,
      source: "join",
    })
    return { token: String(member.token), alreadyMember: false }
  }

  async memberByToken(token: string): Promise<Row> {
    const found = await this.db.query<Row>(`SELECT * FROM loyalty_members WHERE token = $1`, [
      token,
    ])
    if (!found.rows[0]) throw LOYALTY_ERRORS.notFound("Card")
    return found.rows[0]
  }

  // A member's own card, opened from their link.
  async publicCard(token: string) {
    const member = await this.memberByToken(token)
    const organizationId = String(member.organization_id)
    const memberId = String(member.id)
    const [program, rewards, ledger, waiting] = await Promise.all([
      this.getProgram(organizationId),
      this.listRewards(organizationId),
      this.db.query<Row>(
        `SELECT * FROM loyalty_ledger WHERE member_id = $1 ORDER BY created_at DESC LIMIT 15`,
        [memberId]
      ),
      this.db.query<Row>(
        `SELECT * FROM loyalty_redemptions WHERE member_id = $1 AND status = 'active' LIMIT 1`,
        [memberId]
      ),
    ])
    const points = Number(member.points)
    const waitingReward = waiting.rows[0] ? mapRedemption(waiting.rows[0]) : null
    return {
      ...this.publicProgram(program, rewards),
      isActive: program.isActive,
      name: String(member.name),
      cardCode: String(member.card_code),
      points,
      pointsValue: Math.round(points * program.pointValue * 100) / 100,
      waitingReward: waitingReward
        ? { name: waitingReward.rewardName, code: waitingReward.code }
        : null,
      review:
        program.reviewBonusEnabled && program.googleReviewUrl && program.reviewBonusPoints > 0
          ? {
              url: program.googleReviewUrl,
              points: program.reviewBonusPoints,
              done: member.review_bonus_at !== null && member.review_bonus_at !== undefined,
            }
          : null,
      onlineBonus:
        program.onlineBonusEnabled && program.onlineBonusPoints > 0
          ? program.onlineBonusPoints
          : null,
      activity: ledger.rows.map(mapLedger).map(({ points: moved, kind, createdAt }) => ({
        points: moved,
        kind,
        createdAt,
      })),
    }
  }

  async publicRedeem(token: string, rewardId: string) {
    const member = await this.memberByToken(token)
    await this.redeem(String(member.organization_id), String(member.id), rewardId, {
      by: null,
      source: "customer",
      handOver: false,
    })
    return this.publicCard(token)
  }

  // The customer went on to write a review on Google Maps. Google does not tell a business who
  // wrote what, so this is taken on trust -- once per member.
  async publicReviewDone(token: string) {
    const member = await this.memberByToken(token)
    const organizationId = String(member.organization_id)
    const program = await this.getProgram(organizationId)
    const offered =
      program.isActive &&
      program.reviewBonusEnabled &&
      program.googleReviewUrl &&
      program.reviewBonusPoints > 0
    if (offered) {
      const marked = await this.db.query(
        `UPDATE loyalty_members SET review_bonus_at = $2
          WHERE id = $1 AND review_bonus_at IS NULL`,
        [member.id, this.now()]
      )
      if ((marked.rowCount ?? 0) > 0) {
        await this.post(organizationId, String(member.id), {
          points: program.reviewBonusPoints,
          kind: "review_bonus",
          source: "customer",
          earned: true,
        })
      }
    }
    return this.publicCard(token)
  }
}
