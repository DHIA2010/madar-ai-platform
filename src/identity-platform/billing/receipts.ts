import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { MOYASAR_PLAN_TIER_AMOUNT_HALALAS } from "./moyasar/plan-pricing"

export interface ReceiptCustomer {
  name: string
  email: string | null
  taxNumber: string | null
  commercialRegistration: string | null
  phone: string | null
  address: string | null
}

export interface PlatformReceipt {
  id: string
  number: string
  organizationId: string
  sourceType: "card" | "bank_transfer"
  sourceId: string
  application: string
  packageName: string | null
  billingInterval: "monthly" | "yearly" | null
  amountHalalas: number
  originalAmountHalalas: number | null
  discountHalalas: number | null
  couponCode: string | null
  currency: string
  paymentMethod: string | null
  paymentReference: string | null
  customer: ReceiptCustomer
  paidAt: string
}

interface PendingReceipt {
  organizationId: string
  sourceType: PlatformReceipt["sourceType"]
  sourceId: string
  application: string
  packageName: string | null
  billingInterval: PlatformReceipt["billingInterval"]
  amountHalalas: number
  originalAmountHalalas: number | null
  discountHalalas: number | null
  couponCode: string | null
  paymentMethod: string | null
  paymentReference: string | null
  paidAt: string
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function formatNumber(sequence: number): string {
  return `MDR-${String(sequence).padStart(6, "0")}`
}

function customerFrom(row: Record<string, unknown>): ReceiptCustomer {
  const settings = (row.settings as Record<string, unknown> | null) ?? {}
  const text = (key: string) =>
    typeof settings[key] === "string" && (settings[key] as string).trim()
      ? (settings[key] as string).trim()
      : null
  const address = [
    text("buildingNumber"),
    text("street"),
    text("district"),
    text("city"),
    text("postalCode"),
  ]
    .filter(Boolean)
    .join("، ")
  return {
    name: String(row.name),
    email: text("email") ?? (row.owner_email as string | null) ?? null,
    taxNumber: text("taxNumber"),
    commercialRegistration: text("commercialRegistration"),
    phone: text("phone"),
    address: address || text("addressShort"),
  }
}

function mapReceipt(row: Record<string, unknown>): PlatformReceipt {
  return {
    id: String(row.id),
    number: String(row.number),
    organizationId: String(row.organization_id),
    sourceType: row.source_type as PlatformReceipt["sourceType"],
    sourceId: String(row.source_id),
    application: String(row.application),
    packageName: (row.package_name as string | null) ?? null,
    billingInterval: (row.billing_interval as PlatformReceipt["billingInterval"]) ?? null,
    amountHalalas: Number(row.amount_halalas),
    originalAmountHalalas: toNumberOrNull(row.original_amount_halalas),
    discountHalalas: toNumberOrNull(row.discount_halalas),
    couponCode: (row.coupon_code as string | null) ?? null,
    currency: String(row.currency ?? "SAR"),
    paymentMethod: (row.payment_method as string | null) ?? null,
    paymentReference: (row.payment_reference as string | null) ?? null,
    customer: row.customer_snapshot as ReceiptCustomer,
    paidAt: toIso(row.paid_at),
  }
}

// Receipts for every successful payment -- confirmed card payments and approved bank transfers.
// Issued lazily (the first time receipts or payments are read after a payment lands) rather than
// from each payment path, so every path -- including ones added later -- gets one, numbered in
// the order the payments happened.
export class ReceiptService {
  constructor(private readonly db: PostgresDatabase) {}

  private async pendingCardReceipts(): Promise<PendingReceipt[]> {
    const result = await this.db.query<Record<string, unknown>>(`
      SELECT p.id, p.organization_id, p.application, p.amount, p.original_amount,
             p.discount_halalas, p.billing_interval, p.moyasar_payment_id, p.raw_payload,
             p.updated_at, pp.name AS package_name, c.code AS coupon_code
        FROM billing_moyasar_payments p
        LEFT JOIN platform_receipts r ON r.source_type = 'card' AND r.source_id = p.id
        LEFT JOIN platform_packages pp ON pp.id = p.package_id
        LEFT JOIN platform_coupons c ON c.id = p.coupon_id
       WHERE p.status = 'paid' AND r.id IS NULL
    `)
    return result.rows.map((row) => ({
      organizationId: String(row.organization_id),
      sourceType: "card",
      sourceId: String(row.id),
      application: String(row.application),
      packageName: (row.package_name as string | null) ?? null,
      billingInterval: (row.billing_interval as PlatformReceipt["billingInterval"]) ?? "monthly",
      amountHalalas: Number(row.amount),
      originalAmountHalalas: toNumberOrNull(row.original_amount),
      discountHalalas: toNumberOrNull(row.discount_halalas),
      couponCode: (row.coupon_code as string | null) ?? null,
      paymentMethod:
        (row.raw_payload as { source?: { company?: string } } | null)?.source?.company ?? "card",
      paymentReference: (row.moyasar_payment_id as string | null) ?? null,
      paidAt: toIso(row.updated_at),
    }))
  }

  private async pendingBankTransferReceipts(): Promise<PendingReceipt[]> {
    const result = await this.db.query<Record<string, unknown>>(`
      SELECT s.id, s.organization_id, s.application, s.plan_tier, s.package_name,
             s.billing_interval, s.price_halalas, s.reviewed_at
        FROM subscription_activation_requests s
        LEFT JOIN platform_receipts r ON r.source_type = 'bank_transfer' AND r.source_id = s.id
       WHERE s.status = 'approved' AND s.deleted_at IS NULL AND r.id IS NULL
    `)
    return result.rows.flatMap((row): PendingReceipt[] => {
      const tier = row.plan_tier as keyof typeof MOYASAR_PLAN_TIER_AMOUNT_HALALAS | null
      // A request from before per-app packages carries only a tier -- its old listed price.
      const amount =
        toNumberOrNull(row.price_halalas) ??
        (tier ? (MOYASAR_PLAN_TIER_AMOUNT_HALALAS[tier] ?? null) : null)
      if (amount === null) return []
      return [
        {
          organizationId: String(row.organization_id),
          sourceType: "bank_transfer",
          sourceId: String(row.id),
          application: String(row.application),
          packageName:
            (row.package_name as string | null) ??
            (tier ? tier[0].toUpperCase() + tier.slice(1) : null),
          billingInterval:
            (row.billing_interval as PlatformReceipt["billingInterval"]) ?? "monthly",
          amountHalalas: amount,
          originalAmountHalalas: null,
          discountHalalas: null,
          couponCode: null,
          paymentMethod: "bank_transfer",
          paymentReference: String(row.id).slice(0, 8).toUpperCase(),
          paidAt: toIso(row.reviewed_at),
        },
      ]
    })
  }

  async ensureReceipts(): Promise<number> {
    const pending = [
      ...(await this.pendingCardReceipts()),
      ...(await this.pendingBankTransferReceipts()),
    ].sort((left, right) => left.paidAt.localeCompare(right.paidAt))
    if (pending.length === 0) return 0

    const customers = new Map<string, ReceiptCustomer>()
    const last = await this.db.query<{ last: number | null }>(
      "SELECT MAX(sequence) AS last FROM platform_receipts"
    )
    let sequence = Number(last.rows[0]?.last ?? 0)
    let issued = 0
    for (const receipt of pending) {
      if (!customers.has(receipt.organizationId)) {
        const org = await this.db.query<Record<string, unknown>>(
          `SELECT o.name, o.settings, u.email AS owner_email
             FROM organizations o LEFT JOIN users u ON u.id = o.owner_user_id
            WHERE o.id = $1`,
          [receipt.organizationId]
        )
        if (!org.rows[0]) continue
        customers.set(receipt.organizationId, customerFrom(org.rows[0]))
      }
      sequence += 1
      try {
        await this.db.query(
          `INSERT INTO platform_receipts (
             id, sequence, number, organization_id, source_type, source_id, application,
             package_name, billing_interval, amount_halalas, original_amount_halalas,
             discount_halalas, coupon_code, payment_method, payment_reference,
             customer_snapshot, paid_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
          [
            randomUUID(),
            sequence,
            formatNumber(sequence),
            receipt.organizationId,
            receipt.sourceType,
            receipt.sourceId,
            receipt.application,
            receipt.packageName,
            receipt.billingInterval,
            receipt.amountHalalas,
            receipt.originalAmountHalalas,
            receipt.discountHalalas,
            receipt.couponCode,
            receipt.paymentMethod,
            receipt.paymentReference,
            JSON.stringify(customers.get(receipt.organizationId)),
            receipt.paidAt,
          ]
        )
        issued += 1
      } catch (error) {
        // Another backend task issued receipts at the same moment and took this number (or this
        // payment) -- stop here; the next read picks up whatever is still missing.
        console.warn("billing.receipt_issue_conflict", { error })
        break
      }
    }
    return issued
  }

  async list(filters: { organizationId?: string } = {}): Promise<PlatformReceipt[]> {
    await this.ensureReceipts()
    const result = filters.organizationId
      ? await this.db.query<Record<string, unknown>>(
          "SELECT * FROM platform_receipts WHERE organization_id = $1 ORDER BY sequence DESC",
          [filters.organizationId]
        )
      : await this.db.query<Record<string, unknown>>(
          "SELECT * FROM platform_receipts ORDER BY sequence DESC"
        )
    return result.rows.map(mapReceipt)
  }

  async get(receiptId: string): Promise<PlatformReceipt | null> {
    await this.ensureReceipts()
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM platform_receipts WHERE id = $1",
      [receiptId]
    )
    return result.rows[0] ? mapReceipt(result.rows[0]) : null
  }
}
