import { ERRORS } from "../application/errors/IdentityError"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { effectiveSubscriptionStatus } from "../subscriptions/lifecycle"
import { mapOrganizationSubscription } from "../subscriptions/repository"
import type {
  BillingInterval,
  SubscriptionSource,
  SubscriptionStatus,
} from "../subscriptions/types"

export interface BillingSubscriptionView {
  id: string
  application: string
  status: SubscriptionStatus
  source: SubscriptionSource
  packageName: string | null
  billingInterval: BillingInterval | null
  price: number | null
  currency: string
  startedAt: string
  // When the current paid period, trial or free period ends; null when it doesn't.
  endsAt: string | null
}

export type BillingPaymentMethod = "card" | "bank_transfer" | "cash" | "other"
export type BillingPaymentStatus = "paid" | "failed" | "pending" | "rejected"

export interface BillingPaymentView {
  id: string
  // A paid payment's invoice number; null until it's paid.
  invoiceNumber: string | null
  date: string
  application: string
  packageName: string | null
  billingInterval: BillingInterval | null
  method: BillingPaymentMethod
  status: BillingPaymentStatus
  // The amount charged (null for an old bank transfer recorded without a price), and the price
  // before a coupon (null without one).
  amount: number | null
  originalAmount: number | null
  discount: number | null
  currency: string
  // Moyasar's payment id for a card payment.
  reference: string | null
  rejectionReason: string | null
}

export interface BillingOverview {
  organization: { id: string; name: string; taxNumber: string | null }
  subscriptions: BillingSubscriptionView[]
  payments: BillingPaymentView[]
}

const halalasToSar = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value) / 100

// Stable and readable: MDR-<yyyymm>-<first 6 of the payment id>.
function invoiceNumber(id: string, date: string | Date) {
  const at = new Date(date)
  const month = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}`
  return `MDR-${month}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`
}

// What the customer sees under "الفوترة": their subscription to each app, and every payment --
// card payments through Moyasar and bank transfers reviewed in Madar Admin.
export class BillingOverviewService {
  constructor(private readonly db: PostgresDatabase) {}

  async overview(actor: AuthenticatedActor): Promise<BillingOverview> {
    if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
      throw ERRORS.forbidden()
    }
    const organizationId = actor.organizationId
    const now = new Date().toISOString()

    const [organization, subscriptionRows, cardRows, transferRows, salesInvoiceRows] =
      await Promise.all([
        this.db.query<{ id: string; name: string; settings: Record<string, unknown> | null }>(
          "SELECT id, name, settings FROM organizations WHERE id = $1",
          [organizationId]
        ),
        this.db.query<Record<string, unknown>>(
          "SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY created_at ASC",
          [organizationId]
        ),
        this.db.query<{
          id: string
          application: string
          package_name: string | null
          billing_interval: BillingInterval | null
          amount: number
          original_amount: number | null
          discount_halalas: number | null
          currency: string
          moyasar_payment_id: string | null
          status: "paid" | "failed"
          created_at: string | Date
          updated_at: string | Date
        }>(
          `SELECT p.id, p.application, k.name AS package_name, p.billing_interval, p.amount,
                p.original_amount, p.discount_halalas, p.currency, p.moyasar_payment_id,
                p.status, p.created_at, p.updated_at
           FROM billing_moyasar_payments p
           LEFT JOIN platform_packages k ON k.id = p.package_id
          WHERE p.organization_id = $1 AND p.status IN ('paid', 'failed')`,
          [organizationId]
        ),
        this.db.query<{
          id: string
          application: string
          package_name: string | null
          billing_interval: BillingInterval | null
          price_halalas: number | null
          status: "pending" | "approved" | "rejected"
          rejection_reason: string | null
          created_at: string | Date
          reviewed_at: string | Date | null
        }>(
          `SELECT id, application, package_name, billing_interval, price_halalas, status,
                rejection_reason, created_at, reviewed_at
           FROM subscription_activation_requests
          WHERE organization_id = $1 AND deleted_at IS NULL`,
          [organizationId]
        ),
        // Invoices Madar's sales team issued this account (through its CRM lead).
        this.db.query<{
          id: string
          number: string
          status: "unpaid" | "paid"
          items:
            | {
                kind: string
                application?: string
                packageName?: string
                interval?: BillingInterval
              }[]
            | null
          discount_halalas: number
          subtotal_halalas: number
          total_halalas: number
          payment_method: "card" | "bank_transfer" | "cash" | "other" | null
          payment_reference: string | null
          paid_at: string | Date | null
          created_at: string | Date
        }>(
          `SELECT i.id, i.number, i.status, i.items, i.discount_halalas, i.subtotal_halalas,
                i.total_halalas, i.payment_method, i.payment_reference, i.paid_at, i.created_at
           FROM crm_invoices i
           JOIN crm_leads l ON l.id = i.lead_id
          WHERE l.organization_id = $1 AND i.status IN ('unpaid', 'paid')
            AND COALESCE(i.source, 'sales') = 'sales'`,
          [organizationId]
        ),
      ])

    const org = organization.rows[0]
    if (!org) throw ERRORS.notFound("Organization")

    const subscriptions = subscriptionRows.rows.map(mapOrganizationSubscription).map(
      (subscription): BillingSubscriptionView => ({
        id: subscription.id,
        application: subscription.application,
        status: effectiveSubscriptionStatus(subscription, now),
        source: subscription.source,
        packageName: subscription.packageName,
        billingInterval: subscription.billingInterval,
        price: halalasToSar(subscription.priceHalalas),
        currency: subscription.currency,
        startedAt: subscription.startedAt,
        endsAt:
          subscription.status === "trial"
            ? subscription.trialEndsAt
            : subscription.currentPeriodEnd,
      })
    )

    const payments: BillingPaymentView[] = [
      ...cardRows.rows.map((row): BillingPaymentView => {
        const date = new Date(row.status === "paid" ? row.updated_at : row.created_at)
        return {
          id: row.id,
          invoiceNumber: row.status === "paid" ? invoiceNumber(row.id, date) : null,
          date: date.toISOString(),
          application: row.application,
          packageName: row.package_name,
          billingInterval: row.billing_interval,
          method: "card",
          status: row.status,
          amount: halalasToSar(row.amount) ?? 0,
          originalAmount: halalasToSar(row.original_amount),
          discount: halalasToSar(row.discount_halalas),
          currency: row.currency,
          reference: row.moyasar_payment_id,
          rejectionReason: null,
        }
      }),
      ...transferRows.rows.map((row): BillingPaymentView => {
        const approved = row.status === "approved"
        const date = new Date(approved && row.reviewed_at ? row.reviewed_at : row.created_at)
        return {
          id: row.id,
          invoiceNumber: approved ? invoiceNumber(row.id, date) : null,
          date: date.toISOString(),
          application: row.application,
          packageName: row.package_name,
          billingInterval: row.billing_interval,
          method: "bank_transfer",
          status: row.status === "approved" ? "paid" : row.status,
          amount: halalasToSar(row.price_halalas),
          originalAmount: null,
          discount: null,
          currency: "SAR",
          reference: null,
          rejectionReason: row.rejection_reason,
        }
      }),
      ...salesInvoiceRows.rows.map((row): BillingPaymentView => {
        const firstPackage = (row.items ?? []).find((item) => item.kind === "package")
        const date = new Date(row.paid_at ?? row.created_at)
        return {
          id: row.id,
          invoiceNumber: row.number,
          date: date.toISOString(),
          application: firstPackage?.application ?? "salesInvoice",
          packageName: firstPackage?.packageName ?? null,
          billingInterval: firstPackage?.interval ?? null,
          method: row.payment_method ?? "bank_transfer",
          status: row.status === "paid" ? "paid" : "pending",
          amount: halalasToSar(row.total_halalas),
          originalAmount: null,
          discount: row.discount_halalas ? halalasToSar(row.discount_halalas) : null,
          currency: "SAR",
          reference: row.payment_reference,
          rejectionReason: null,
        }
      }),
    ].sort((left, right) => right.date.localeCompare(left.date))

    const settings = org.settings ?? {}
    const taxNumber =
      typeof settings.taxNumber === "string" && settings.taxNumber.trim()
        ? settings.taxNumber.trim()
        : null
    return { organization: { id: org.id, name: org.name, taxNumber }, subscriptions, payments }
  }
}
