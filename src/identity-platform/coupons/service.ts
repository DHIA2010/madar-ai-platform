import { randomUUID } from "node:crypto"

import { ERRORS, IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { BillingInterval, PurchasableApplication } from "../subscriptions/types"
import type { Coupon, CouponInput, CouponQuote, CouponStatus } from "./types"

// Moyasar's smallest charge is 1 SAR -- a coupon can bring a price down to this, never below.
export const MINIMUM_CHARGE_HALALAS = 100

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

// The last day a coupon works, as the end of that day in Riyadh (UTC+3, no DST).
function endOfDayRiyadh(day: string): string {
  return new Date(`${day}T23:59:59.999+03:00`).toISOString()
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function statusOf(
  coupon: Pick<Coupon, "isActive" | "expiresAt" | "usageLimit" | "usedCount">,
  now: number
): CouponStatus {
  if (!coupon.isActive) return "disabled"
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return "expired"
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return "exhausted"
  return "active"
}

// The reason a code can't be used here -- the code is what the customer sees an explanation for.
const couponRejected = (code: string, message: string) =>
  new IdentityError(code, 422, "business", message)

// Discount coupons managed from Madar Admin and redeemed at card checkout. A coupon's usage count
// comes only from successful payments (platform_coupon_redemptions), so an abandoned checkout
// never uses one up.
export class CouponService {
  constructor(private readonly db: PostgresDatabase) {}

  private map(row: Record<string, unknown>, usedCount: number, now: number): Coupon {
    const coupon = {
      id: String(row.id),
      code: String(row.code),
      discountType: row.discount_type as Coupon["discountType"],
      discountValue: Number(row.discount_value),
      applications: asStringArray(row.applications) as PurchasableApplication[],
      packageIds: asStringArray(row.package_ids),
      billingIntervals: asStringArray(row.billing_intervals) as BillingInterval[],
      usageLimit:
        row.usage_limit === null || row.usage_limit === undefined ? null : Number(row.usage_limit),
      usedCount,
      expiresAt: toIso(row.expires_at),
      isActive: row.is_active === true,
      createdAt: toIso(row.created_at) ?? "",
    }
    return { ...coupon, status: statusOf(coupon, now) }
  }

  private async usageCounts(): Promise<Map<string, number>> {
    const result = await this.db.query<{ coupon_id: string; total: unknown }>(
      "SELECT coupon_id, COUNT(*) AS total FROM platform_coupon_redemptions GROUP BY coupon_id"
    )
    return new Map(result.rows.map((row) => [row.coupon_id, Number(row.total)]))
  }

  async list(): Promise<Coupon[]> {
    const [rows, counts] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        "SELECT * FROM platform_coupons ORDER BY created_at DESC"
      ),
      this.usageCounts(),
    ])
    const now = Date.now()
    return rows.rows.map((row) => this.map(row, counts.get(String(row.id)) ?? 0, now))
  }

  private async get(id: string): Promise<Coupon> {
    const coupon = (await this.list()).find((entry) => entry.id === id)
    if (!coupon) throw ERRORS.notFound("Coupon")
    return coupon
  }

  private validate(input: CouponInput) {
    if (input.discountType === "percentage" && input.discountValue > 100) {
      throw ERRORS.validation({ discountValue: "A percentage discount can't exceed 100%." })
    }
    if (input.billingIntervals.length === 0) {
      throw ERRORS.validation({ billingIntervals: "Choose monthly, yearly, or both." })
    }
  }

  private async ensureCodeFree(code: string, exceptId: string | null) {
    const existing = await this.db.query<{ id: string }>(
      "SELECT id FROM platform_coupons WHERE code = $1",
      [code]
    )
    if (existing.rows.some((row) => row.id !== exceptId)) {
      throw ERRORS.conflict("COUPON_CODE_TAKEN", "A coupon with this code already exists.")
    }
  }

  async create(input: CouponInput, createdByUserId: string): Promise<Coupon> {
    this.validate(input)
    const code = normalizeCouponCode(input.code)
    await this.ensureCodeFree(code, null)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO platform_coupons (
         id, code, discount_type, discount_value, applications, package_ids, billing_intervals,
         usage_limit, expires_at, is_active, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11)`,
      [
        id,
        code,
        input.discountType,
        input.discountValue,
        JSON.stringify(input.applications),
        JSON.stringify(input.packageIds),
        JSON.stringify(input.billingIntervals),
        input.usageLimit,
        input.expiresOn ? endOfDayRiyadh(input.expiresOn) : null,
        input.isActive,
        createdByUserId,
      ]
    )
    return this.get(id)
  }

  async update(id: string, input: CouponInput): Promise<Coupon> {
    await this.get(id)
    this.validate(input)
    const code = normalizeCouponCode(input.code)
    await this.ensureCodeFree(code, id)
    await this.db.query(
      `UPDATE platform_coupons
          SET code = $2, discount_type = $3, discount_value = $4, applications = $5::jsonb,
              package_ids = $6::jsonb, billing_intervals = $7::jsonb, usage_limit = $8,
              expires_at = $9, is_active = $10, updated_at = now()
        WHERE id = $1`,
      [
        id,
        code,
        input.discountType,
        input.discountValue,
        JSON.stringify(input.applications),
        JSON.stringify(input.packageIds),
        JSON.stringify(input.billingIntervals),
        input.usageLimit,
        input.expiresOn ? endOfDayRiyadh(input.expiresOn) : null,
        input.isActive,
      ]
    )
    return this.get(id)
  }

  // A coupon that's been used is part of payment history -- disable it instead.
  async delete(id: string): Promise<void> {
    const coupon = await this.get(id)
    if (coupon.usedCount > 0) {
      throw ERRORS.conflict(
        "COUPON_IN_USE",
        "This coupon has been used -- disable it instead of deleting it."
      )
    }
    await this.db.query("DELETE FROM platform_coupons WHERE id = $1", [id])
  }

  // Checks a code against a purchase and works out the discount. Throws a 422 with a specific
  // code when the coupon can't be used for this purchase.
  async quote(input: {
    code: string
    application: PurchasableApplication
    packageId: string
    interval: BillingInterval
    amountHalalas: number
  }): Promise<CouponQuote> {
    const code = normalizeCouponCode(input.code)
    const coupon = (await this.list()).find((entry) => entry.code === code)
    if (!coupon) throw couponRejected("COUPON_NOT_FOUND", "This coupon code doesn't exist.")
    if (coupon.status === "disabled") {
      throw couponRejected("COUPON_DISABLED", "This coupon is no longer active.")
    }
    if (coupon.status === "expired")
      throw couponRejected("COUPON_EXPIRED", "This coupon has expired.")
    if (coupon.status === "exhausted") {
      throw couponRejected("COUPON_EXHAUSTED", "This coupon has reached its usage limit.")
    }
    const applies =
      (coupon.applications.length === 0 || coupon.applications.includes(input.application)) &&
      (coupon.packageIds.length === 0 || coupon.packageIds.includes(input.packageId)) &&
      coupon.billingIntervals.includes(input.interval)
    if (!applies) {
      throw couponRejected(
        "COUPON_NOT_APPLICABLE",
        "This coupon doesn't apply to this subscription."
      )
    }

    const rawDiscount =
      coupon.discountType === "percentage"
        ? Math.round((input.amountHalalas * coupon.discountValue) / 100)
        : coupon.discountValue
    const finalAmount = Math.max(MINIMUM_CHARGE_HALALAS, input.amountHalalas - rawDiscount)
    const discount = Math.max(0, input.amountHalalas - finalAmount)
    return {
      couponId: coupon.id,
      code: coupon.code,
      originalAmountHalalas: input.amountHalalas,
      discountHalalas: discount,
      finalAmountHalalas: input.amountHalalas - discount,
    }
  }

  // Records a use -- called inside the payment's own transaction once it's confirmed paid.
  // Idempotent per payment (a replayed confirmation never counts twice).
  async redeem(input: {
    couponId: string
    organizationId: string
    paymentId: string
    discountHalalas: number
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_coupon_redemptions (id, coupon_id, organization_id, payment_id, discount_halalas)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (payment_id) DO NOTHING`,
      [randomUUID(), input.couponId, input.organizationId, input.paymentId, input.discountHalalas]
    )
  }
}
