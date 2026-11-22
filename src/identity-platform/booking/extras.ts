import { randomBytes, randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LoyaltyService } from "../loyalty/service"

// Everything around a booking's price and what follows a visit: coupons, gift cards, packages and
// memberships, loyalty points and reviews -- and the one place a booking's price is worked out
// (`quote`), used the same way by the staff's booking window, the public page and the booking
// itself, so what a customer is shown is what they are charged.
//
// How a price is reached, in order: the chosen option's price (or the service's own) for each
// person, plus the add-ons -- the subtotal. A coupon takes its discount off that. Points spent
// take more off. A gift card then pays what it can of the rest. A package or membership instead
// covers the whole visit: nothing else applies and nothing is owed.

type Row = Record<string, unknown>

const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
const money = (value: number) => Math.round(value * 100) / 100
const list = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? safeParse(value) : value
  return Array.isArray(parsed) ? parsed.map(String) : []
}
const dayText = (value: unknown) =>
  value === null || value === undefined
    ? null
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10)
function safeParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
export const parseJsonList = <T>(value: unknown): T[] => {
  const parsed = typeof value === "string" ? safeParse(value) : value
  return Array.isArray(parsed) ? (parsed as T[]) : []
}

const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new IdentityError(code, 422, "business", message, details)
const notFound = (what: string) =>
  new IdentityError("BOOKING_NOT_FOUND", 404, "business", `${what} not found.`)

export interface ServiceOption {
  id: string
  name: string
  durationMinutes: number
  price: number
}
export interface ServiceAddon {
  id: string
  name: string
  price: number
  extraMinutes: number
}

// The part of a service a price depends on.
export interface PricedService {
  id: string
  durationMinutes: number
  price: number
  options: ServiceOption[]
  addons: ServiceAddon[]
}

export interface CouponView {
  id: string
  code: string
  kind: "percent" | "fixed"
  value: number
  maxDiscount: number | null
  minAmount: number
  startsOn: string | null
  endsOn: string | null
  usageLimit: number | null
  perCustomerLimit: number | null
  usedCount: number
  serviceIds: string[]
  isActive: boolean
}
export type CouponInput = Omit<CouponView, "id" | "usedCount">

export interface GiftCardView {
  id: string
  code: string
  initialAmount: number
  balance: number
  purchaserName: string | null
  recipientName: string | null
  recipientPhone: string | null
  message: string | null
  expiresOn: string | null
  isActive: boolean
  createdAt: string
  // Opens the card's own page (the link sent to the person it is for).
  shareToken: string
}

export interface PlanView {
  id: string
  kind: "package" | "membership"
  name: string
  description: string | null
  price: number
  // Visits it gives; null means as many as wanted while it lasts.
  uses: number | null
  validityDays: number
  serviceIds: string[]
  isActive: boolean
}
export type PlanInput = Omit<PlanView, "id">

export interface CustomerPlanView {
  id: string
  planId: string
  planName: string
  kind: "package" | "membership"
  customerId: string | null
  customerName: string
  customerPhone: string | null
  usesTotal: number | null
  usesLeft: number | null
  startsOn: string
  expiresOn: string
  status: "active" | "cancelled"
  pricePaid: number
  serviceIds: string[]
  // Still usable today: active, not expired, with a visit left.
  usable: boolean
  createdAt: string
}

export interface ReviewView {
  id: string
  bookingId: string
  providerId: string | null
  providerName: string | null
  serviceName: string | null
  customerName: string
  rating: number
  comment: string | null
  isPublished: boolean
  createdAt: string
}

export interface QuoteInput {
  service: PricedService
  partySize: number
  optionId?: string | null
  addonIds?: string[]
  couponCode?: string | null
  giftCode?: string | null
  customerPlanId?: string | null
  redeemPoints?: number | null
  customerId?: string | null
  customerPhone?: string | null
  // The day of the visit, on the business's clock.
  day: string
  // A booking being re-priced does not count against its own coupon or credit.
  ignoreBookingId?: string | null
}

export interface Quote {
  optionId: string | null
  optionName: string | null
  addons: Array<{ id: string; name: string; price: number }>
  durationMinutes: number
  subtotal: number
  discount: number
  coupon: { id: string; code: string } | null
  loyaltyPoints: number
  loyaltyDiscount: number
  gift: { id: string; code: string } | null
  giftAmount: number
  customerPlanId: string | null
  total: number
}

const mapCoupon = (row: Row): CouponView => ({
  id: String(row.id),
  code: String(row.code),
  kind: row.kind === "fixed" ? "fixed" : "percent",
  value: Number(row.value),
  maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
  minAmount: Number(row.min_amount),
  startsOn: dayText(row.starts_on),
  endsOn: dayText(row.ends_on),
  usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
  perCustomerLimit: row.per_customer_limit === null ? null : Number(row.per_customer_limit),
  usedCount: Number(row.used_count),
  serviceIds: list(row.service_ids),
  isActive: row.is_active === true,
})

const mapGift = (row: Row): GiftCardView => ({
  id: String(row.id),
  code: String(row.code),
  initialAmount: Number(row.initial_amount),
  balance: Number(row.balance),
  purchaserName: text(row.purchaser_name),
  recipientName: text(row.recipient_name),
  recipientPhone: text(row.recipient_phone),
  message: text(row.message),
  expiresOn: dayText(row.expires_on),
  isActive: row.is_active === true,
  createdAt: new Date(String(row.created_at)).toISOString(),
  shareToken: text(row.share_token) ?? "",
})

const mapPlan = (row: Row): PlanView => ({
  id: String(row.id),
  kind: row.kind === "membership" ? "membership" : "package",
  name: String(row.name),
  description: text(row.description),
  price: Number(row.price),
  uses: row.uses === null ? null : Number(row.uses),
  validityDays: Number(row.validity_days),
  serviceIds: list(row.service_ids),
  isActive: row.is_active === true,
})

const normalizeCode = (code: string) => code.trim().toUpperCase()
// A code people can read out and type: no 0/O or 1/I.
const newCode = (length: number) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

export class BookingExtras {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly today: () => string,
    private readonly loyalty: LoyaltyService
  ) {}

  // ---- Coupons ----

  async listCoupons(organizationId: string): Promise<CouponView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_coupons WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    )
    return result.rows.map(mapCoupon)
  }

  private async coupon(organizationId: string, id: string): Promise<CouponView> {
    const found = (await this.listCoupons(organizationId)).find((entry) => entry.id === id)
    if (!found) throw notFound("Coupon")
    return found
  }

  private couponValues(input: CouponInput) {
    if (input.kind === "percent" && input.value > 100) {
      throw invalid("BOOKING_COUPON_PERCENT", "A percentage discount cannot be above 100.")
    }
    return [
      normalizeCode(input.code),
      input.kind,
      input.value,
      input.maxDiscount ?? null,
      input.minAmount ?? 0,
      input.startsOn ?? null,
      input.endsOn ?? null,
      input.usageLimit ?? null,
      input.perCustomerLimit ?? null,
      JSON.stringify(input.serviceIds ?? []),
      input.isActive,
    ]
  }

  private async codeFree(table: string, organizationId: string, code: string, exceptId?: string) {
    const same = await this.db.query<Row>(
      `SELECT id FROM ${table} WHERE organization_id = $1 AND code = $2`,
      [organizationId, normalizeCode(code)]
    )
    if (same.rows.some((row) => row.id !== exceptId)) {
      throw new IdentityError("BOOKING_CODE_TAKEN", 409, "business", "That code is already used.")
    }
  }

  async createCoupon(organizationId: string, input: CouponInput): Promise<CouponView> {
    await this.codeFree("booking_coupons", organizationId, input.code)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_coupons
         (id, organization_id, code, kind, value, max_discount, min_amount, starts_on, ends_on,
          usage_limit, per_customer_limit, service_ids, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [id, organizationId, ...this.couponValues(input)]
    )
    return this.coupon(organizationId, id)
  }

  async updateCoupon(organizationId: string, id: string, input: CouponInput): Promise<CouponView> {
    await this.coupon(organizationId, id)
    await this.codeFree("booking_coupons", organizationId, input.code, id)
    await this.db.query(
      `UPDATE booking_coupons SET
         code = $3, kind = $4, value = $5, max_discount = $6, min_amount = $7, starts_on = $8,
         ends_on = $9, usage_limit = $10, per_customer_limit = $11, service_ids = $12::jsonb,
         is_active = $13
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, ...this.couponValues(input)]
    )
    return this.coupon(organizationId, id)
  }

  async removeCoupon(organizationId: string, id: string): Promise<void> {
    await this.coupon(organizationId, id)
    await this.db.query(`DELETE FROM booking_coupons WHERE organization_id = $1 AND id = $2`, [
      organizationId,
      id,
    ])
  }

  // ---- Gift cards ----

  async listGiftCards(organizationId: string): Promise<GiftCardView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_gift_cards WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    )
    // Cards made before links existed get theirs the first time they are listed.
    for (const row of result.rows) {
      if (text(row.share_token)) continue
      row.share_token = randomUUID().replaceAll("-", "")
      await this.db.query(
        `UPDATE booking_gift_cards SET share_token = $3
          WHERE organization_id = $1 AND id = $2 AND share_token IS NULL`,
        [organizationId, row.id, row.share_token]
      )
    }
    return result.rows.map(mapGift)
  }

  // The card behind a link, with the organization it belongs to.
  async giftCardByShareToken(
    token: string
  ): Promise<{ organizationId: string; card: GiftCardView } | null> {
    const wanted = token.trim()
    if (!wanted) return null
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_gift_cards WHERE share_token = $1`,
      [wanted]
    )
    const row = result.rows[0]
    return row ? { organizationId: String(row.organization_id), card: mapGift(row) } : null
  }

  async createGiftCard(
    organizationId: string,
    input: {
      amount: number
      code?: string | null
      purchaserName?: string | null
      recipientName?: string | null
      recipientPhone?: string | null
      message?: string | null
      expiresOn?: string | null
    }
  ): Promise<GiftCardView> {
    const code = normalizeCode(clean(input.code) ?? `GIFT-${newCode(8)}`)
    await this.codeFree("booking_gift_cards", organizationId, code)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_gift_cards
         (id, organization_id, code, initial_amount, balance, purchaser_name, recipient_name,
          recipient_phone, message, expires_on, share_token)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        organizationId,
        code,
        input.amount,
        clean(input.purchaserName),
        clean(input.recipientName),
        clean(input.recipientPhone),
        clean(input.message),
        input.expiresOn ?? null,
        randomUUID().replaceAll("-", ""),
      ]
    )
    const created = (await this.listGiftCards(organizationId)).find((entry) => entry.id === id)
    if (!created) throw notFound("Gift card")
    return created
  }

  async setGiftCardActive(
    organizationId: string,
    id: string,
    isActive: boolean
  ): Promise<GiftCardView> {
    const result = await this.db.query(
      `UPDATE booking_gift_cards SET is_active = $3 WHERE organization_id = $1 AND id = $2
       RETURNING id`,
      [organizationId, id, isActive]
    )
    if (result.rows.length === 0) throw notFound("Gift card")
    const found = (await this.listGiftCards(organizationId)).find((entry) => entry.id === id)
    if (!found) throw notFound("Gift card")
    return found
  }

  // ---- Packages and memberships ----

  async listPlans(organizationId: string): Promise<PlanView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_plans WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [organizationId]
    )
    return result.rows.map(mapPlan)
  }

  private async plan(organizationId: string, id: string): Promise<PlanView> {
    const found = (await this.listPlans(organizationId)).find((entry) => entry.id === id)
    if (!found) throw notFound("Plan")
    return found
  }

  private planValues(input: PlanInput) {
    return [
      input.kind,
      input.name,
      clean(input.description),
      input.price,
      // A membership is for a length of time, not a count.
      input.kind === "membership" ? (input.uses ?? null) : (input.uses ?? 1),
      input.validityDays,
      JSON.stringify(input.serviceIds ?? []),
      input.isActive,
    ]
  }

  async createPlan(organizationId: string, input: PlanInput): Promise<PlanView> {
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_plans
         (id, organization_id, kind, name, description, price, uses, validity_days, service_ids,
          is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [id, organizationId, ...this.planValues(input)]
    )
    return this.plan(organizationId, id)
  }

  async updatePlan(organizationId: string, id: string, input: PlanInput): Promise<PlanView> {
    await this.plan(organizationId, id)
    await this.db.query(
      `UPDATE booking_plans SET
         kind = $3, name = $4, description = $5, price = $6, uses = $7, validity_days = $8,
         service_ids = $9::jsonb, is_active = $10
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, ...this.planValues(input)]
    )
    return this.plan(organizationId, id)
  }

  // Taken off sale; what customers already hold stays theirs.
  async removePlan(organizationId: string, id: string): Promise<void> {
    await this.plan(organizationId, id)
    await this.db.query(
      `UPDATE booking_plans SET deleted_at = now(), is_active = false
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
  }

  async listCustomerPlans(
    organizationId: string,
    filter: { phone?: string | null; customerId?: string | null } = {}
  ): Promise<CustomerPlanView[]> {
    const [held, plans] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM booking_customer_plans WHERE organization_id = $1
          ORDER BY created_at DESC LIMIT 1000`,
        [organizationId]
      ),
      this.db.query<Row>(`SELECT * FROM booking_plans WHERE organization_id = $1`, [
        organizationId,
      ]),
    ])
    const byId = new Map(plans.rows.map((row) => [String(row.id), mapPlan(row)]))
    const today = this.today()
    const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "")
    const phone = filter.phone ? digits(filter.phone).slice(-9) : null
    return held.rows
      .filter((row) => {
        if (!phone && !filter.customerId) return true
        if (filter.customerId && row.customer_id === filter.customerId) return true
        return Boolean(phone && phone.length >= 8 && digits(row.customer_phone).endsWith(phone))
      })
      .map((row) => {
        const plan = byId.get(String(row.plan_id))
        const usesLeft = row.uses_left === null ? null : Number(row.uses_left)
        const expiresOn = dayText(row.expires_on) ?? today
        const startsOn = dayText(row.starts_on) ?? today
        const status = row.status === "cancelled" ? "cancelled" : "active"
        return {
          id: String(row.id),
          planId: String(row.plan_id),
          planName: plan?.name ?? "",
          kind: plan?.kind ?? "package",
          customerId: text(row.customer_id),
          customerName: String(row.customer_name),
          customerPhone: text(row.customer_phone),
          usesTotal: row.uses_total === null ? null : Number(row.uses_total),
          usesLeft,
          startsOn,
          expiresOn,
          status,
          pricePaid: Number(row.price_paid),
          serviceIds: plan?.serviceIds ?? [],
          usable:
            status === "active" &&
            expiresOn >= today &&
            startsOn <= today &&
            (usesLeft === null || usesLeft > 0),
          createdAt: new Date(String(row.created_at)).toISOString(),
        } satisfies CustomerPlanView
      })
  }

  // Selling a plan to a customer: it starts on the day given (today by default) and lasts the
  // plan's length.
  async sellPlan(
    organizationId: string,
    input: {
      planId: string
      customerId?: string | null
      customerName: string
      customerPhone?: string | null
      startsOn?: string | null
      pricePaid?: number | null
    }
  ): Promise<CustomerPlanView> {
    const plan = await this.plan(organizationId, input.planId)
    const startsOn = input.startsOn ?? this.today()
    const expires = new Date(`${startsOn}T00:00:00.000Z`)
    expires.setUTCDate(expires.getUTCDate() + plan.validityDays)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_customer_plans
         (id, organization_id, plan_id, customer_id, customer_name, customer_phone, uses_total,
          uses_left, starts_on, expires_on, price_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)`,
      [
        id,
        organizationId,
        plan.id,
        input.customerId ?? null,
        input.customerName,
        clean(input.customerPhone),
        plan.uses,
        startsOn,
        expires.toISOString().slice(0, 10),
        input.pricePaid ?? plan.price,
      ]
    )
    const sold = (await this.listCustomerPlans(organizationId)).find((entry) => entry.id === id)
    if (!sold) throw notFound("Plan")
    return sold
  }

  async cancelCustomerPlan(organizationId: string, id: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE booking_customer_plans SET status = 'cancelled'
        WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [organizationId, id]
    )
    if (result.rows.length === 0) throw notFound("Plan")
  }

  // ---- Loyalty ----

  // Points live in the Loyalty app (loyalty/service.ts), shared with the cashier: this app only
  // asks for a balance, spends points on a booking and earns them on a finished visit.
  async pointsOf(organizationId: string, customerId: string): Promise<number> {
    return this.loyalty.balanceOf(organizationId, customerId)
  }

  // ---- The price of a booking ----

  async quote(organizationId: string, input: QuoteInput): Promise<Quote> {
    const { service } = input
    const option = input.optionId
      ? service.options.find((entry) => entry.id === input.optionId)
      : null
    if (input.optionId && !option) {
      throw invalid("BOOKING_OPTION_INVALID", "That option is not offered for this service.")
    }
    // A service with options is always booked as one of them.
    if (!option && service.options.length > 0) {
      throw invalid("BOOKING_OPTION_REQUIRED", "Choose one of the service's options.")
    }
    const addons = (input.addonIds ?? []).map((id) => {
      const addon = service.addons.find((entry) => entry.id === id)
      if (!addon) throw invalid("BOOKING_ADDON_INVALID", "That add-on is not offered.")
      return addon
    })
    const unit = option ? option.price : service.price
    const subtotal = money(
      (unit + addons.reduce((total, addon) => total + addon.price, 0)) * input.partySize
    )
    const quote: Quote = {
      optionId: option?.id ?? null,
      optionName: option?.name ?? null,
      addons: addons.map(({ id, name, price }) => ({ id, name, price })),
      durationMinutes:
        (option ? option.durationMinutes : service.durationMinutes) +
        addons.reduce((total, addon) => total + addon.extraMinutes, 0),
      subtotal,
      discount: 0,
      coupon: null,
      loyaltyPoints: 0,
      loyaltyDiscount: 0,
      gift: null,
      giftAmount: 0,
      customerPlanId: null,
      total: subtotal,
    }

    // A package or membership covers the visit whole.
    if (input.customerPlanId) {
      const held = (await this.listCustomerPlans(organizationId)).find(
        (entry) => entry.id === input.customerPlanId
      )
      const covers = held && (held.serviceIds.length === 0 || held.serviceIds.includes(service.id))
      const usesLeft = held?.usesLeft ?? null
      if (
        !held ||
        held.status !== "active" ||
        !covers ||
        held.expiresOn < input.day ||
        held.startsOn > input.day ||
        (usesLeft !== null && usesLeft < input.partySize)
      ) {
        throw invalid("BOOKING_PLAN_INVALID", "That package cannot be used for this booking.")
      }
      return { ...quote, customerPlanId: held.id, discount: subtotal, total: 0 }
    }

    if (input.couponCode?.trim()) {
      const code = normalizeCode(input.couponCode)
      const found = (await this.listCoupons(organizationId)).find((entry) => entry.code === code)
      const refuse = (reason: string) =>
        invalid("BOOKING_COUPON_INVALID", "That coupon cannot be used.", { reason })
      if (!found || !found.isActive) throw refuse("unknown")
      const today = this.today()
      if ((found.startsOn && found.startsOn > today) || (found.endsOn && found.endsOn < today)) {
        throw refuse("dates")
      }
      if (found.serviceIds.length > 0 && !found.serviceIds.includes(service.id)) {
        throw refuse("service")
      }
      if (subtotal < found.minAmount) throw refuse("minimum")
      const uses = await this.db.query<Row>(
        `SELECT id, customer_phone, status FROM bookings
          WHERE organization_id = $1 AND coupon_id = $2`,
        [organizationId, found.id]
      )
      const counted = uses.rows.filter(
        (row) => row.status !== "cancelled" && row.id !== input.ignoreBookingId
      )
      if (found.usageLimit !== null && counted.length >= found.usageLimit) throw refuse("used")
      if (found.perCustomerLimit !== null && input.customerPhone) {
        const mine = counted.filter((row) => row.customer_phone === input.customerPhone).length
        if (mine >= found.perCustomerLimit) throw refuse("customer")
      }
      let discount = found.kind === "percent" ? (subtotal * found.value) / 100 : found.value
      if (found.maxDiscount !== null) discount = Math.min(discount, found.maxDiscount)
      quote.discount = money(Math.min(discount, subtotal))
      quote.coupon = { id: found.id, code: found.code }
    }
    let due = money(subtotal - quote.discount)

    const points = Math.floor(input.redeemPoints ?? 0)
    if (points > 0) {
      const loyalty = await this.loyalty.rules(organizationId)
      if (!loyalty.enabled || !input.customerId) {
        throw invalid("BOOKING_POINTS_INVALID", "Points cannot be used on this booking.")
      }
      const balance = await this.pointsOf(organizationId, input.customerId)
      if (points > balance) {
        throw invalid("BOOKING_POINTS_INVALID", "The customer does not have that many points.", {
          balance,
        })
      }
      // Never more points than the price needs.
      const needed = Math.ceil(due / loyalty.pointValue)
      quote.loyaltyPoints = Math.min(points, needed)
      quote.loyaltyDiscount = money(Math.min(due, quote.loyaltyPoints * loyalty.pointValue))
      due = money(due - quote.loyaltyDiscount)
    }

    if (input.giftCode?.trim()) {
      const code = normalizeCode(input.giftCode)
      const card = (await this.listGiftCards(organizationId)).find((entry) => entry.code === code)
      if (
        !card ||
        !card.isActive ||
        card.balance <= 0 ||
        (card.expiresOn !== null && card.expiresOn < this.today())
      ) {
        throw invalid("BOOKING_GIFT_INVALID", "That gift card cannot be used.")
      }
      quote.gift = { id: card.id, code: card.code }
      quote.giftAmount = money(Math.min(card.balance, due))
      due = money(due - quote.giftAmount)
    }
    quote.total = due
    return quote
  }

  // Takes what a booking uses: a visit from the package, the gift card's amount, the points
  // spent and one use of the coupon. `release` gives all of it back (a cancelled booking).
  async take(organizationId: string, booking: Row): Promise<void> {
    const id = String(booking.id)
    if (booking.customer_plan_id) {
      const held = await this.db.query<Row>(
        `SELECT uses_left FROM booking_customer_plans WHERE organization_id = $1 AND id = $2`,
        [organizationId, booking.customer_plan_id]
      )
      const left = held.rows[0]?.uses_left
      if (left !== null && left !== undefined) {
        if (Number(left) < Number(booking.party_size)) {
          throw invalid("BOOKING_PLAN_INVALID", "That package has no visits left.")
        }
        await this.db.query(
          `UPDATE booking_customer_plans SET uses_left = $3
            WHERE organization_id = $1 AND id = $2`,
          [organizationId, booking.customer_plan_id, Number(left) - Number(booking.party_size)]
        )
      }
    }
    const giftAmount = Number(booking.gift_amount ?? 0)
    if (booking.gift_card_id && giftAmount > 0) {
      const card = await this.db.query<Row>(
        `SELECT balance FROM booking_gift_cards WHERE organization_id = $1 AND id = $2`,
        [organizationId, booking.gift_card_id]
      )
      const balance = Number(card.rows[0]?.balance ?? 0)
      if (balance < giftAmount) {
        throw invalid("BOOKING_GIFT_INVALID", "That gift card no longer has enough on it.")
      }
      await this.db.query(
        `UPDATE booking_gift_cards SET balance = $3 WHERE organization_id = $1 AND id = $2`,
        [organizationId, booking.gift_card_id, money(balance - giftAmount)]
      )
    }
    const points = Number(booking.loyalty_points ?? 0)
    if (points > 0 && booking.customer_id) {
      await this.loyalty.spend(organizationId, {
        customerId: String(booking.customer_id),
        points,
        source: "booking",
        ref: id,
      })
    }
    if (booking.coupon_id) {
      await this.bumpCoupon(organizationId, String(booking.coupon_id), 1)
    }
  }

  async release(organizationId: string, booking: Row): Promise<void> {
    const id = String(booking.id)
    if (booking.customer_plan_id) {
      const held = await this.db.query<Row>(
        `SELECT uses_left FROM booking_customer_plans WHERE organization_id = $1 AND id = $2`,
        [organizationId, booking.customer_plan_id]
      )
      const left = held.rows[0]?.uses_left
      if (left !== null && left !== undefined) {
        await this.db.query(
          `UPDATE booking_customer_plans SET uses_left = $3
            WHERE organization_id = $1 AND id = $2`,
          [organizationId, booking.customer_plan_id, Number(left) + Number(booking.party_size)]
        )
      }
    }
    const giftAmount = Number(booking.gift_amount ?? 0)
    if (booking.gift_card_id && giftAmount > 0) {
      const card = await this.db.query<Row>(
        `SELECT balance FROM booking_gift_cards WHERE organization_id = $1 AND id = $2`,
        [organizationId, booking.gift_card_id]
      )
      await this.db.query(
        `UPDATE booking_gift_cards SET balance = $3 WHERE organization_id = $1 AND id = $2`,
        [
          organizationId,
          booking.gift_card_id,
          money(Number(card.rows[0]?.balance ?? 0) + giftAmount),
        ]
      )
    }
    const points = Number(booking.loyalty_points ?? 0)
    if (points > 0 && booking.customer_id) {
      await this.loyalty.giveBack(organizationId, { source: "booking", ref: id })
    }
    if (booking.coupon_id) {
      await this.bumpCoupon(organizationId, String(booking.coupon_id), -1)
    }
  }

  private async bumpCoupon(organizationId: string, couponId: string, by: number) {
    const current = await this.db.query<Row>(
      `SELECT used_count FROM booking_coupons WHERE organization_id = $1 AND id = $2`,
      [organizationId, couponId]
    )
    if (!current.rows[0]) return
    await this.db.query(
      `UPDATE booking_coupons SET used_count = $3 WHERE organization_id = $1 AND id = $2`,
      [organizationId, couponId, Math.max(0, Number(current.rows[0].used_count) + by)]
    )
  }

  // Points for a finished visit, on what the customer paid (and the bonus for booking online,
  // where the business gives one); taken back if it stops being finished.
  async earn(organizationId: string, booking: Row): Promise<number> {
    if (!booking.customer_id) return 0
    return this.loyalty.earn(organizationId, {
      customerId: String(booking.customer_id),
      amount: Number(booking.price ?? 0),
      source: "booking",
      ref: String(booking.id),
      online: booking.source === "online",
    })
  }

  async unearn(organizationId: string, booking: Row): Promise<void> {
    if (Number(booking.loyalty_earned ?? 0) > 0) {
      await this.loyalty.unearn(organizationId, { source: "booking", ref: String(booking.id) })
    }
  }

  // ---- Reviews ----

  async listReviews(organizationId: string): Promise<ReviewView[]> {
    const [reviews, providers, services] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM booking_reviews WHERE organization_id = $1 ORDER BY created_at DESC
          LIMIT 500`,
        [organizationId]
      ),
      this.db.query<Row>(`SELECT id, name FROM booking_providers WHERE organization_id = $1`, [
        organizationId,
      ]),
      this.db.query<Row>(`SELECT id, name FROM booking_services WHERE organization_id = $1`, [
        organizationId,
      ]),
    ])
    const provider = new Map(providers.rows.map((row) => [String(row.id), String(row.name)]))
    const service = new Map(services.rows.map((row) => [String(row.id), String(row.name)]))
    return reviews.rows.map((row) => ({
      id: String(row.id),
      bookingId: String(row.booking_id),
      providerId: text(row.provider_id),
      providerName: row.provider_id ? (provider.get(String(row.provider_id)) ?? null) : null,
      serviceName: row.service_id ? (service.get(String(row.service_id)) ?? null) : null,
      customerName: String(row.customer_name),
      rating: Number(row.rating),
      comment: text(row.comment),
      isPublished: row.is_published === true,
      createdAt: new Date(String(row.created_at)).toISOString(),
    }))
  }

  async setReviewPublished(organizationId: string, id: string, isPublished: boolean) {
    const result = await this.db.query(
      `UPDATE booking_reviews SET is_published = $3 WHERE organization_id = $1 AND id = $2
       RETURNING id`,
      [organizationId, id, isPublished]
    )
    if (result.rows.length === 0) throw notFound("Review")
  }

  // The customer's own review of a finished visit: written once, changed by writing again.
  async saveReview(booking: Row, input: { rating: number; comment?: string | null }) {
    if (booking.status !== "completed") {
      throw new IdentityError(
        "BOOKING_REVIEW_CLOSED",
        409,
        "business",
        "Only a finished visit can be reviewed."
      )
    }
    const existing = await this.db.query<Row>(
      `SELECT id FROM booking_reviews WHERE booking_id = $1`,
      [booking.id]
    )
    if (existing.rows[0]) {
      await this.db.query(`UPDATE booking_reviews SET rating = $2, comment = $3 WHERE id = $1`, [
        existing.rows[0].id,
        input.rating,
        clean(input.comment),
      ])
      return
    }
    await this.db.query(
      `INSERT INTO booking_reviews
         (id, organization_id, booking_id, provider_id, service_id, customer_name, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        booking.organization_id,
        booking.id,
        booking.provider_id,
        booking.service_id,
        booking.customer_name,
        input.rating,
        clean(input.comment),
      ]
    )
  }

  async reviewOf(bookingId: string): Promise<{ rating: number; comment: string | null } | null> {
    const result = await this.db.query<Row>(
      `SELECT rating, comment FROM booking_reviews WHERE booking_id = $1`,
      [bookingId]
    )
    const row = result.rows[0]
    return row ? { rating: Number(row.rating), comment: text(row.comment) } : null
  }

  // What the public page shows: the average, the count and the latest published words.
  async publicReviews(organizationId: string) {
    const published = (await this.listReviews(organizationId)).filter(
      (review) => review.isPublished
    )
    const average =
      published.length === 0
        ? null
        : Math.round(
            (published.reduce((total, review) => total + review.rating, 0) / published.length) * 10
          ) / 10
    return {
      average,
      count: published.length,
      latest: published
        .filter((review) => review.comment)
        .slice(0, 6)
        .map((review) => ({
          // First name only on a public page.
          customerName: review.customerName.trim().split(/\s+/)[0] ?? "",
          rating: review.rating,
          comment: review.comment,
          serviceName: review.serviceName,
          createdAt: review.createdAt,
        })),
    }
  }
}
