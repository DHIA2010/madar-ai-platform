import { randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS, IdentityError } from "../application/errors/IdentityError"
import { MoyasarApiClient } from "../billing/moyasar/client"
import { resolveMoyasarCredentials } from "../billing/moyasar/credentials"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"
import type { PlatformSettingsRepository } from "../platform-settings/types"
import type { PricingService } from "../pricing/service"
import { ReceiptService } from "../billing/receipts"
import { CouponService, MINIMUM_CHARGE_HALALAS, normalizeCouponCode } from "../coupons/service"
import { activationSettingsPatch } from "../subscriptions/activation"
import { activatePaid, addBillingInterval } from "../subscriptions/lifecycle"
import { PostgresOrganizationSubscriptionRepository } from "../subscriptions/repository"
import type {
  BillingInterval,
  PurchasableApplication,
  SubscriptionPlanTier,
} from "../subscriptions/types"

import { withinDays } from "./filters"
import { addActivity, crmPaymentReceived } from "./service"

// Quotes and invoices Madar's sales team sends a lead -- see migration 135.

export const VAT_RATE = 0.15

// How a package line reads on the document.
const APPLICATION_NAME: Record<string, string> = {
  pos: "نقطة البيع",
  ecommerce: "المتاجر الإلكترونية",
  advertising: "الحملات الإعلانية",
  procurement: "الموردون والمشتريات",
  expenses: "المصروفات",
  ai: "الذكاء الاصطناعي",
  customReports: "التقارير المخصصة",
  promotions: "العروض الترويجية",
  invoicing: "الفواتير وعروض الأسعار",
  madarApps: "تطبيقات مدار",
  madarComplete: "مدار الكامل",
}

export interface SalesDocumentItem {
  kind: "package" | "custom"
  description: string
  quantity: number
  unitPriceHalalas: number
  // Package lines only: what paying the invoice switches on.
  application?: PurchasableApplication
  packageId?: string
  packageName?: string
  interval?: BillingInterval
  legacyPlanTier?: SubscriptionPlanTier | null
}

// How an invoice was paid: online by card from its link, or recorded by staff (any of these).
export type InvoicePaymentMethod = "card" | "bank_transfer" | "cash" | "other"

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "converted"
export type InvoiceStatus = "unpaid" | "paid" | "void"

export interface SalesDocumentTotals {
  subtotal: number
  discount: number
  vat: number
  total: number
}

export interface SalesParty {
  companyName: string
  contactName: string | null
  phone: string | null
  email: string | null
}

export interface SellerInfo {
  name: string
  legalName: string
  vatNumber: string
  commercialRegistration: string
  address: string
  email: string
  // The default terms and conditions (platform settings).
  quoteTerms: string
  invoiceTerms: string
}

export interface QuoteView {
  id: string
  number: string
  leadId: string
  status: QuoteStatus
  items: SalesDocumentItem[]
  totals: SalesDocumentTotals
  validUntil: string | null
  notes: string | null
  customer: SalesParty
  invoiceId: string | null
  // Its own terms and conditions, when changed for this quote (else the seller's quoteTerms).
  terms: string | null
  createdAt: string
  updatedAt: string
}

export interface InvoiceView {
  id: string
  number: string
  leadId: string
  quoteId: string | null
  quoteNumber: string | null
  status: InvoiceStatus
  items: SalesDocumentItem[]
  totals: SalesDocumentTotals
  dueDate: string | null
  notes: string | null
  customer: SalesParty
  payUrlToken: string
  paidAt: string | null
  paymentMethod: InvoicePaymentMethod | null
  paymentReference: string | null
  activatedAt: string | null
  // Its own terms and conditions, when changed for this invoice (else the seller's invoiceTerms).
  terms: string | null
  // sales: written by the sales team. auto: issued for a payment made in the app (by card, or an
  // approved bank transfer) -- its payment receipt is receiptNumber, under المدفوعات.
  source: "sales" | "auto"
  receiptNumber: string | null
  // A coupon the customer applied on the pay page (its discount is part of totals.discount).
  coupon: { code: string; discount: number } | null
  // The subscription period it covers (yyyy-mm-dd), worked out from its packages unless set by hand.
  subscriptionStart: string | null
  subscriptionEnd: string | null
  subscriptionDatesManual: boolean
  // Whether paying switches apps on, and whether there's a Madar account to switch them on for.
  hasPackages: boolean
  organizationId: string | null
  createdAt: string
}

// What the customer sees on the pay page -- no internal ids or notes.
export interface PublicInvoiceView {
  number: string
  status: InvoiceStatus
  items: { description: string; quantity: number; unitPrice: number; total: number }[]
  totals: SalesDocumentTotals
  dueDate: string | null
  issuedAt: string
  paidAt: string | null
  subscriptionStart: string | null
  subscriptionEnd: string | null
  // Its terms and conditions (its own, or the default).
  terms: string
  // A coupon applied on this page (its discount is part of totals.discount).
  coupon: { code: string; discount: number } | null
  customer: SalesParty
  seller: SellerInfo
}

export interface SalesItemInput {
  kind: "package" | "custom"
  packageId?: string
  interval?: BillingInterval
  description?: string
  quantity?: number
  unitPrice?: number
}

type QuoteRow = {
  terms?: string | null
  id: string
  number: string
  lead_id: string
  status: QuoteStatus
  items: SalesDocumentItem[] | null
  discount_halalas: number
  subtotal_halalas: number
  vat_halalas: number
  total_halalas: number
  valid_until: string | Date | null
  notes: string | null
  created_at: string | Date
  updated_at: string | Date
}

type InvoiceRow = {
  terms?: string | null
  id: string
  number: string
  quote_id: string | null
  lead_id: string
  status: InvoiceStatus
  items: SalesDocumentItem[] | null
  discount_halalas: number
  subtotal_halalas: number
  vat_halalas: number
  total_halalas: number
  due_date: string | Date | null
  notes: string | null
  pay_token: string
  paid_at: string | Date | null
  payment_method: InvoicePaymentMethod | null
  payment_reference: string | null
  activated_at: string | Date | null
  activated_organization_id?: string | null
  subscription_start?: string | Date | null
  source?: "sales" | "auto" | null
  coupon_id?: string | null
  coupon_code?: string | null
  coupon_discount_halalas?: number | null
  receipt_id?: string | null
  subscription_end?: string | Date | null
  subscription_dates_manual?: boolean | null
  created_at: string | Date
}

type LeadRow = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  organization_id: string | null
}

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString())
const day = (value: string | Date | null) =>
  value === null ? null : new Date(value).toISOString().slice(0, 10)
const sar = (halalas: number) => Number(halalas) / 100

// Subtotal of the lines, less the discount, plus 15% VAT on what's left.
export function computeTotals(items: SalesDocumentItem[], discountHalalas: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceHalalas, 0)
  const discount = Math.min(Math.max(0, discountHalalas), subtotal)
  const vat = Math.round((subtotal - discount) * VAT_RATE)
  return { subtotal, discount, vat, total: subtotal - discount + vat }
}

function totalsView(row: {
  subtotal_halalas: number
  discount_halalas: number
  vat_halalas: number
  total_halalas: number
}): SalesDocumentTotals {
  return {
    subtotal: sar(row.subtotal_halalas),
    discount: sar(row.discount_halalas),
    vat: sar(row.vat_halalas),
    total: sar(row.total_halalas),
  }
}

function party(lead: LeadRow): SalesParty {
  return {
    companyName: lead.company_name,
    contactName: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
  }
}

// A list search: the document number, or the customer's name, phone or email.
function matchesSearch(number: string, lead: LeadRow, search?: string) {
  const query = search?.trim().toLowerCase()
  if (!query) return true
  return [number, lead.company_name, lead.contact_name, lead.phone, lead.email].some((value) =>
    value?.toLowerCase().includes(query)
  )
}

// "Q-2026-0007" / "INV-2026-0012": per year, in order.
async function nextNumber(
  db: PostgresDatabase,
  table: "crm_quotes" | "crm_invoices",
  prefix: string
) {
  const year = new Date().getUTCFullYear()
  const stem = `${prefix}-${year}-`
  const rows = await db.query<{ number: string }>(`SELECT number FROM ${table}`)
  const highest = rows.rows
    .map((row) => row.number)
    .filter((number) => number.startsWith(stem))
    .map((number) => Number(number.slice(stem.length)) || 0)
    .reduce((max, value) => Math.max(max, value), 0)
  return `${stem}${String(highest + 1).padStart(4, "0")}`
}

// The subscription period an invoice covers: set by hand or recorded at activation, else worked out
// as its paid (or issue) date to that date plus its longest package period.
function invoicePeriod(row: InvoiceRow): { start: string; end: string } | null {
  if (row.subscription_start && row.subscription_end) {
    return { start: day(row.subscription_start)!, end: day(row.subscription_end)! }
  }
  const intervals = (row.items ?? [])
    .filter((item) => item.kind === "package" && item.interval)
    .map((item) => item.interval as BillingInterval)
  if (!intervals.length) return null
  const start = day(row.paid_at ?? row.created_at)!
  const end = intervals
    .map((interval) => addBillingInterval(`${start}T12:00:00.000Z`, interval).slice(0, 10))
    .sort()
    .at(-1)!
  return { start, end }
}

function invoicePeriodView(row: InvoiceRow) {
  const period = invoicePeriod(row)
  return {
    subscriptionStart: period?.start ?? null,
    subscriptionEnd: period?.end ?? null,
    subscriptionDatesManual: Boolean(row.subscription_dates_manual),
  }
}

// The last moment of a yyyy-mm-dd day in Saudi time (UTC+3).
const endOfSaudiDay = (date: string) => `${date}T20:59:59.000Z`

// Switches the invoice's packages on for a Madar account: the same two steps a card checkout takes
// (the organization's access flags, then the subscription itself), one period each -- or exactly
// `period` when the dates were set by hand. Returns the furthest period end it set.
async function activateItems(
  db: PostgresDatabase,
  organizationId: string,
  items: SalesDocumentItem[],
  source: "payment" | "bank_transfer" | "admin",
  period: { start: string; end: string } | null = null
) {
  const subscriptions = new PostgresOrganizationSubscriptionRepository(db)
  let furthestEnd: string | null = null
  for (const item of items) {
    if (item.kind !== "package" || !item.application || !item.interval) continue
    const settings = await db.query<{ settings: Record<string, unknown> | null }>(
      "SELECT settings FROM organizations WHERE id = $1",
      [organizationId]
    )
    const merged = {
      ...(settings.rows[0]?.settings ?? {}),
      ...activationSettingsPatch(item.application, item.legacyPlanTier ?? null),
    }
    await db.query(
      "UPDATE organizations SET settings = $2::jsonb, updated_at = now() WHERE id = $1",
      [organizationId, JSON.stringify(merged)]
    )
    const activated = activatePaid(
      await subscriptions.findByOrganizationAndApplication(organizationId, item.application),
      {
        id: randomUUID(),
        organizationId,
        application: item.application,
        planTier: item.legacyPlanTier ?? null,
        package: item.packageId ? { id: item.packageId, name: item.packageName ?? "" } : null,
        interval: item.interval,
        priceHalalas: item.quantity * item.unitPriceHalalas,
        source,
        now: new Date().toISOString(),
      }
    )
    const state = period
      ? {
          ...activated,
          startedAt: `${period.start}T00:00:00.000Z`,
          currentPeriodEnd: endOfSaudiDay(period.end),
        }
      : activated
    await subscriptions.save(state)
    if (state.currentPeriodEnd && (!furthestEnd || state.currentPeriodEnd > furthestEnd)) {
      furthestEnd = state.currentPeriodEnd
    }
  }
  return furthestEnd
}

// The subscription's recorded source for how its invoice was paid.
function subscriptionSource(method: InvoicePaymentMethod | null) {
  if (method === "card") return "payment" as const
  if (method === "bank_transfer") return "bank_transfer" as const
  return "admin" as const
}

// Paid invoices whose lead had no Madar account yet: once it signs up, switch their apps on.
export async function activatePendingInvoices(db: PostgresDatabase, leadId: string) {
  try {
    const lead = await db.query<{ organization_id: string | null }>(
      "SELECT organization_id FROM crm_leads WHERE id = $1",
      [leadId]
    )
    const organizationId = lead.rows[0]?.organization_id
    if (!organizationId) return
    const pending = await db.query<InvoiceRow>(
      "SELECT * FROM crm_invoices WHERE lead_id = $1 AND status = 'paid' AND activated_at IS NULL",
      [leadId]
    )
    for (const invoice of pending.rows) {
      const items = invoice.items ?? []
      if (!items.some((item) => item.kind === "package")) continue
      await redeemInvoiceCoupon(db, invoice, String(organizationId))
      const manual = invoice.subscription_dates_manual ? invoicePeriod(invoice) : null
      const furthestEnd = await activateItems(
        db,
        String(organizationId),
        items,
        subscriptionSource(invoice.payment_method),
        manual
      )
      // The invoice now shows the period actually switched on.
      const start = manual?.start ?? new Date().toISOString().slice(0, 10)
      const end = manual?.end ?? (furthestEnd ? day(furthestEnd) : null)
      await db.query(
        `UPDATE crm_invoices SET activated_at = now(), activated_organization_id = $2,
           subscription_start = $3, subscription_end = $4
         WHERE id = $1`,
        [invoice.id, organizationId, start, end]
      )
      await addActivity(db, {
        leadId,
        kind: "invoice",
        meta: { action: "activated", number: invoice.number },
      })
    }
  } catch (error) {
    console.error("crm.pending_invoices_failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

// Gives a customer who paid an invoice a Madar account, and welcomes them -- wired in server.ts
// from the account repositories and the email gateway.
export interface CustomerAccountActivator {
  // The account already registered with this email, or a new one (owner of a new organization).
  findOrCreate(input: {
    email: string
    fullName: string
    companyName: string
  }): Promise<{ userId: string; organizationId: string; newAccount: boolean }>
  // The welcome email: a set-password link for a new account, a sign-in link otherwise.
  welcome(input: {
    userId: string
    newAccount: boolean
    email: string
    fullName: string
    companyName: string
    applications: string[]
  }): Promise<void>
}

// Where an invoice stands on switching the customer on: done, waiting on staff, or nothing to do
// (unpaid, void, or services only for a customer who already has an account).
export function activationState(invoice: InvoiceView): "activated" | "pending" | null {
  if (invoice.activatedAt) return "activated"
  if (invoice.status !== "paid") return null
  return invoice.hasPackages || !invoice.organizationId ? "pending" : null
}

// A tax invoice for every payment made in the app (card, or approved bank transfer) -- the same
// document the sales team issues, paid and already switched on. Issued lazily, like the receipts
// themselves (see ReceiptService), whenever sales invoices are read. The amount paid is taken as
// VAT-inclusive (in-app prices are charged as listed), so 15% VAT is broken out of it.
export async function issueAutoInvoices(db: PostgresDatabase) {
  await new ReceiptService(db).ensureReceipts()
  const receipts = await db.query<{
    id: string
    organization_id: string
    source_type: "card" | "bank_transfer"
    application: string
    package_name: string | null
    billing_interval: BillingInterval | null
    amount_halalas: number
    original_amount_halalas: number | null
    payment_reference: string | null
    customer_snapshot: { name?: string; email?: string | null; phone?: string | null } | null
    paid_at: string | Date
  }>(
    `SELECT r.* FROM platform_receipts r
       LEFT JOIN crm_invoices i ON i.receipt_id = r.id
      WHERE i.id IS NULL
      ORDER BY r.sequence`
  )
  for (const receipt of receipts.rows) {
    try {
      const organizationId = String(receipt.organization_id)
      const leads = await db.query<{ id: string }>(
        "SELECT id FROM crm_leads WHERE organization_id = $1 ORDER BY created_at",
        [organizationId]
      )
      let leadId = leads.rows[0]?.id ? String(leads.rows[0].id) : null
      if (!leadId) {
        // A customer who never went through the CRM: a lead for it, already won.
        leadId = randomUUID()
        const customer = receipt.customer_snapshot ?? {}
        await db.query(
          `INSERT INTO crm_leads (id, company_name, email, phone, source, stage, organization_id,
             won_at, stage_changed_at)
           VALUES ($1, $2, $3, $4, 'signup', 'won', $5, $6, $6)`,
          [
            leadId,
            customer.name || "عميل مدار",
            customer.email ?? null,
            customer.phone ?? null,
            organizationId,
            receipt.paid_at,
          ]
        )
      }
      const total = Number(receipt.amount_halalas)
      const net = Math.round(total / (1 + VAT_RATE))
      const listed = Math.max(
        net,
        Math.round(Number(receipt.original_amount_halalas ?? total) / (1 + VAT_RATE))
      )
      const interval = receipt.billing_interval ?? "monthly"
      const item: SalesDocumentItem = {
        kind: "package",
        description: `${APPLICATION_NAME[receipt.application] ?? receipt.application}${
          receipt.package_name ? ` — باقة ${receipt.package_name}` : ""
        } (${interval === "yearly" ? "اشتراك سنوي" : "اشتراك شهري"})`,
        quantity: 1,
        unitPriceHalalas: listed,
        application: receipt.application as PurchasableApplication,
        packageName: receipt.package_name ?? undefined,
        interval,
      }
      const paidAt = new Date(receipt.paid_at).toISOString()
      // The payment's day in Saudi time (UTC+3), not UTC.
      const start = new Date(new Date(paidAt).getTime() + 3 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const end = addBillingInterval(`${start}T12:00:00.000Z`, interval).slice(0, 10)
      const invoiceId = randomUUID()
      const number = await nextNumber(db, "crm_invoices", "INV")
      await db.query(
        `INSERT INTO crm_invoices (id, number, lead_id, status, items, discount_halalas,
           subtotal_halalas, vat_halalas, total_halalas, pay_token, paid_at, payment_method,
           payment_reference, activated_at, activated_organization_id, subscription_start,
           subscription_end, source, receipt_id, created_at)
         VALUES ($1, $2, $3, 'paid', $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $10, $13, $14,
           $15, 'auto', $16, $10)`,
        [
          invoiceId,
          number,
          leadId,
          JSON.stringify([item]),
          listed - net,
          listed,
          total - net,
          total,
          randomBytes(24).toString("base64url"),
          paidAt,
          receipt.source_type,
          receipt.payment_reference,
          organizationId,
          start,
          end,
          receipt.id,
        ]
      )
      await addActivity(db, {
        leadId,
        kind: "invoice",
        meta: { action: "auto", number, method: receipt.source_type, total: total / 100 },
      })
    } catch (error) {
      // Another backend task issued it at the same moment: the next read picks up the rest.
      console.warn("crm.auto_invoice_conflict", {
        message: error instanceof Error ? error.message : String(error),
      })
      break
    }
  }
}

function couponView(row: InvoiceRow) {
  return row.coupon_code
    ? { code: row.coupon_code, discount: sar(Number(row.coupon_discount_halalas ?? 0)) }
    : null
}

const couponRejected = (code: string, message: string) =>
  new IdentityError(code, 422, "business", message)

// A paid invoice's coupon counts as used (once -- keyed by the invoice), for the account it paid for.
async function redeemInvoiceCoupon(
  db: PostgresDatabase,
  invoice: InvoiceRow,
  organizationId: string
) {
  if (!invoice.coupon_id) return
  await new CouponService(db).redeem({
    couponId: String(invoice.coupon_id),
    organizationId,
    paymentId: String(invoice.id),
    discountHalalas: Number(invoice.coupon_discount_halalas ?? 0),
  })
}

export class SalesDocumentsService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly pricing: PricingService,
    private readonly settings: PlatformSettingsRepository,
    private readonly activator: CustomerAccountActivator | null = null
  ) {}

  private async lead(id: string): Promise<LeadRow> {
    const rows = await this.db.query<LeadRow>(
      "SELECT id, company_name, contact_name, phone, email, organization_id FROM crm_leads WHERE id = $1",
      [id]
    )
    const lead = rows.rows[0]
    if (!lead) throw ERRORS.notFound("Lead")
    return lead
  }

  // Lines as they'll be stored: package prices always come from the pricing settings.
  private async resolveItems(inputs: SalesItemInput[]): Promise<SalesDocumentItem[]> {
    const items: SalesDocumentItem[] = []
    for (const input of inputs) {
      if (input.kind === "package") {
        if (!input.packageId || !input.interval) {
          throw ERRORS.validation({ items: "A package line needs a package and a period." })
        }
        const pkg = await this.pricing.getPackage(input.packageId).catch(() => null)
        const price =
          pkg && (input.interval === "yearly" ? pkg.yearlyPriceHalalas : pkg.monthlyPriceHalalas)
        if (!pkg || price === null || price === undefined) {
          throw ERRORS.validation({ items: "This package has no price for that period." })
        }
        items.push({
          kind: "package",
          description:
            input.description?.trim() ||
            `${APPLICATION_NAME[pkg.application] ?? pkg.application} — باقة ${pkg.name} (${
              input.interval === "yearly" ? "اشتراك سنوي" : "اشتراك شهري"
            })`,
          quantity: 1,
          unitPriceHalalas: price,
          application: pkg.application,
          packageId: pkg.id,
          packageName: pkg.name,
          interval: input.interval,
          legacyPlanTier: pkg.legacyPlanTier,
        })
      } else {
        const description = input.description?.trim()
        if (!description) throw ERRORS.validation({ items: "A line needs a description." })
        items.push({
          kind: "custom",
          description,
          quantity: Math.max(1, Math.round(input.quantity ?? 1)),
          unitPriceHalalas: Math.round((input.unitPrice ?? 0) * 100),
        })
      }
    }
    if (items.length === 0) throw ERRORS.validation({ items: "Add at least one line." })
    return items
  }

  private quoteView(row: QuoteRow, lead: LeadRow, invoiceId: string | null): QuoteView {
    return {
      id: String(row.id),
      number: row.number,
      leadId: String(row.lead_id),
      status: row.status,
      items: row.items ?? [],
      totals: totalsView(row),
      validUntil: day(row.valid_until),
      notes: row.notes,
      customer: party(lead),
      invoiceId,
      terms: row.terms ?? null,
      createdAt: iso(row.created_at) as string,
      updatedAt: iso(row.updated_at) as string,
    }
  }

  private async invoiceView(row: InvoiceRow, lead: LeadRow): Promise<InvoiceView> {
    const quote = row.quote_id
      ? await this.db.query<{ number: string }>("SELECT number FROM crm_quotes WHERE id = $1", [
          row.quote_id,
        ])
      : null
    const items = row.items ?? []
    return {
      id: String(row.id),
      number: row.number,
      leadId: String(row.lead_id),
      quoteId: row.quote_id ? String(row.quote_id) : null,
      quoteNumber: quote?.rows[0]?.number ?? null,
      status: row.status,
      items,
      totals: totalsView(row),
      dueDate: day(row.due_date),
      notes: row.notes,
      customer: party(lead),
      payUrlToken: row.pay_token,
      paidAt: iso(row.paid_at),
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      activatedAt: iso(row.activated_at),
      terms: row.terms ?? null,
      source: row.source === "auto" ? "auto" : "sales",
      coupon: couponView(row),
      receiptNumber: row.receipt_id ? await this.receiptNumber(String(row.receipt_id)) : null,
      ...invoicePeriodView(row),
      hasPackages: items.some((item) => item.kind === "package"),
      organizationId: lead.organization_id ? String(lead.organization_id) : null,
      createdAt: iso(row.created_at) as string,
    }
  }

  private async receiptNumber(receiptId: string) {
    const rows = await this.db.query<{ number: string }>(
      "SELECT number FROM platform_receipts WHERE id = $1",
      [receiptId]
    )
    return rows.rows[0]?.number ?? null
  }

  async seller(): Promise<SellerInfo> {
    const settings = await this.settings.get()
    return {
      name: settings.platformName,
      legalName: settings.legalName,
      vatNumber: settings.vatNumber,
      commercialRegistration: settings.commercialRegistration,
      address: settings.address,
      email: settings.supportEmail,
      quoteTerms: settings.quoteTerms,
      invoiceTerms: settings.invoiceTerms,
    }
  }

  // What the quote editor can offer: every application sold in packages or at a fixed price.
  async catalog(actor: AuthenticatedActor) {
    requirePlatformPermission(actor, "crm:manage")
    const catalog = await this.pricing.getCatalog({ includeInactive: false })
    return catalog
      .filter((entry) => entry.visible && (entry.mode === "packages" || entry.mode === "fixed"))
      .map((entry) => ({
        application: entry.application,
        packages: (entry.mode === "fixed" ? entry.packages.slice(0, 1) : entry.packages).map(
          (pkg) => ({
            id: pkg.id,
            name: pkg.name,
            monthlyPrice: pkg.monthlyPriceHalalas === null ? null : sar(pkg.monthlyPriceHalalas),
            yearlyPrice: pkg.yearlyPriceHalalas === null ? null : sar(pkg.yearlyPriceHalalas),
          })
        ),
      }))
      .filter((entry) => entry.packages.length > 0)
  }

  // ---- Quotes ----

  async listQuotes(
    actor: AuthenticatedActor,
    filters: { status?: QuoteStatus; leadId?: string; search?: string; from?: string; to?: string }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<QuoteRow>(
      "SELECT * FROM crm_quotes ORDER BY created_at DESC LIMIT 2000"
    )
    const invoices = await this.db.query<{ id: string; quote_id: string | null }>(
      "SELECT id, quote_id FROM crm_invoices"
    )
    const invoiceByQuote = new Map(
      invoices.rows
        .filter((row) => row.quote_id)
        .map((row) => [String(row.quote_id), String(row.id)])
    )
    const leads = new Map<string, LeadRow>()
    const views: QuoteView[] = []
    for (const row of rows.rows) {
      if (filters.status && row.status !== filters.status) continue
      if (filters.leadId && String(row.lead_id) !== filters.leadId) continue
      if (!withinDays(row.created_at, filters.from, filters.to)) continue
      const leadId = String(row.lead_id)
      if (!leads.has(leadId)) leads.set(leadId, await this.lead(leadId))
      if (!matchesSearch(row.number, leads.get(leadId)!, filters.search)) continue
      views.push(
        this.quoteView(row, leads.get(leadId)!, invoiceByQuote.get(String(row.id)) ?? null)
      )
    }
    return views
  }

  async getQuote(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<QuoteRow>("SELECT * FROM crm_quotes WHERE id = $1", [id])
    const row = rows.rows[0]
    if (!row) throw ERRORS.notFound("Quote")
    const invoice = await this.db.query<{ id: string }>(
      "SELECT id FROM crm_invoices WHERE quote_id = $1",
      [id]
    )
    return {
      quote: this.quoteView(row, await this.lead(String(row.lead_id)), invoice.rows[0]?.id ?? null),
      seller: await this.seller(),
    }
  }

  async createQuote(
    actor: AuthenticatedActor,
    leadId: string,
    input: {
      items: SalesItemInput[]
      discount?: number
      validUntil?: string | null
      notes?: string | null
    }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    await this.lead(leadId)
    const items = await this.resolveItems(input.items)
    const totals = computeTotals(items, Math.round((input.discount ?? 0) * 100))
    const id = randomUUID()
    const number = await nextNumber(this.db, "crm_quotes", "Q")
    await this.db.query(
      `INSERT INTO crm_quotes (id, number, lead_id, status, items, discount_halalas, subtotal_halalas,
         vat_halalas, total_halalas, valid_until, notes, created_by_user_id)
       VALUES ($1, $2, $3, 'draft', $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        number,
        leadId,
        JSON.stringify(items),
        totals.discount,
        totals.subtotal,
        totals.vat,
        totals.total,
        input.validUntil ?? null,
        input.notes ?? null,
        actor.userId,
      ]
    )
    await addActivity(this.db, {
      leadId,
      kind: "quote",
      meta: { action: "created", number, total: sar(totals.total) },
      actorUserId: actor.userId,
    })
    return this.getQuote(actor, id)
  }

  async updateQuote(
    actor: AuthenticatedActor,
    id: string,
    input: {
      items: SalesItemInput[]
      discount?: number
      validUntil?: string | null
      notes?: string | null
    }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const { quote } = await this.getQuote(actor, id)
    if (quote.status === "converted") {
      throw ERRORS.validation({ status: "A quote already converted to an invoice can't change." })
    }
    const items = await this.resolveItems(input.items)
    const totals = computeTotals(items, Math.round((input.discount ?? 0) * 100))
    await this.db.query(
      `UPDATE crm_quotes SET items = $2::jsonb, discount_halalas = $3, subtotal_halalas = $4,
         vat_halalas = $5, total_halalas = $6, valid_until = $7, notes = $8, updated_at = now()
       WHERE id = $1`,
      [
        id,
        JSON.stringify(items),
        totals.discount,
        totals.subtotal,
        totals.vat,
        totals.total,
        input.validUntil ?? null,
        input.notes ?? null,
      ]
    )
    return this.getQuote(actor, id)
  }

  async setQuoteStatus(
    actor: AuthenticatedActor,
    id: string,
    status: "draft" | "sent" | "accepted" | "rejected"
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const { quote } = await this.getQuote(actor, id)
    if (quote.status === "converted") {
      throw ERRORS.validation({ status: "A quote already converted to an invoice can't change." })
    }
    if (quote.status === status) return this.getQuote(actor, id)
    await this.db.query("UPDATE crm_quotes SET status = $2, updated_at = now() WHERE id = $1", [
      id,
      status,
    ])
    await addActivity(this.db, {
      leadId: quote.leadId,
      kind: "quote",
      meta: { action: status, number: quote.number },
      actorUserId: actor.userId,
    })
    return this.getQuote(actor, id)
  }

  async deleteQuote(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    const { quote } = await this.getQuote(actor, id)
    if (quote.status === "converted") {
      throw ERRORS.validation({
        status: "A quote already converted to an invoice can't be deleted.",
      })
    }
    await this.db.query("DELETE FROM crm_quotes WHERE id = $1", [id])
  }

  // The accepted quote becomes an invoice the customer can pay.
  async convertToInvoice(
    actor: AuthenticatedActor,
    id: string,
    input: { dueDate?: string | null }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<QuoteRow>("SELECT * FROM crm_quotes WHERE id = $1", [id])
    const quote = rows.rows[0]
    if (!quote) throw ERRORS.notFound("Quote")
    if (quote.status === "converted") {
      throw ERRORS.validation({ status: "This quote is already an invoice." })
    }
    const invoiceId = randomUUID()
    const number = await nextNumber(this.db, "crm_invoices", "INV")
    await this.db.query(
      `INSERT INTO crm_invoices (id, number, quote_id, lead_id, status, items, discount_halalas,
         subtotal_halalas, vat_halalas, total_halalas, due_date, notes, pay_token, created_by_user_id)
       VALUES ($1, $2, $3, $4, 'unpaid', $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        invoiceId,
        number,
        quote.id,
        quote.lead_id,
        JSON.stringify(quote.items ?? []),
        quote.discount_halalas,
        quote.subtotal_halalas,
        quote.vat_halalas,
        quote.total_halalas,
        input.dueDate ?? null,
        quote.notes,
        randomBytes(24).toString("base64url"),
        actor.userId,
      ]
    )
    await this.db.query(
      "UPDATE crm_quotes SET status = 'converted', updated_at = now() WHERE id = $1",
      [quote.id]
    )
    await addActivity(this.db, {
      leadId: String(quote.lead_id),
      kind: "invoice",
      meta: {
        action: "created",
        number,
        quoteNumber: quote.number,
        total: sar(quote.total_halalas),
      },
      actorUserId: actor.userId,
    })
    return this.getInvoice(actor, invoiceId)
  }

  // An invoice written directly, without a quote first.
  async createInvoice(
    actor: AuthenticatedActor,
    leadId: string,
    input: {
      items: SalesItemInput[]
      discount?: number
      dueDate?: string | null
      notes?: string | null
    }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    await this.lead(leadId)
    const items = await this.resolveItems(input.items)
    const totals = computeTotals(items, Math.round((input.discount ?? 0) * 100))
    const invoiceId = randomUUID()
    const number = await nextNumber(this.db, "crm_invoices", "INV")
    await this.db.query(
      `INSERT INTO crm_invoices (id, number, quote_id, lead_id, status, items, discount_halalas,
         subtotal_halalas, vat_halalas, total_halalas, due_date, notes, pay_token, created_by_user_id)
       VALUES ($1, $2, NULL, $3, 'unpaid', $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        invoiceId,
        number,
        leadId,
        JSON.stringify(items),
        totals.discount,
        totals.subtotal,
        totals.vat,
        totals.total,
        input.dueDate ?? null,
        input.notes ?? null,
        randomBytes(24).toString("base64url"),
        actor.userId,
      ]
    )
    await addActivity(this.db, {
      leadId,
      kind: "invoice",
      meta: { action: "created", number, total: sar(totals.total) },
      actorUserId: actor.userId,
    })
    return this.getInvoice(actor, invoiceId)
  }

  // ---- Invoices ----

  async listInvoices(
    actor: AuthenticatedActor,
    filters: {
      status?: InvoiceStatus
      leadId?: string
      method?: InvoicePaymentMethod
      search?: string
      from?: string
      to?: string
      // Which date the range is on: issued (default) or paid.
      dateField?: "created" | "paid"
      // activated: its account is switched on; pending: paid, still waiting (بانتظار التفعيل).
      activation?: "activated" | "pending"
    }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    await issueAutoInvoices(this.db)
    const rows = await this.db.query<InvoiceRow>(
      "SELECT * FROM crm_invoices ORDER BY created_at DESC LIMIT 2000"
    )
    const leads = new Map<string, LeadRow>()
    const views: InvoiceView[] = []
    for (const row of rows.rows) {
      if (filters.status && row.status !== filters.status) continue
      if (filters.leadId && String(row.lead_id) !== filters.leadId) continue
      if (filters.method && row.payment_method !== filters.method) continue
      const date = filters.dateField === "paid" ? row.paid_at : row.created_at
      if (!withinDays(date, filters.from, filters.to)) continue
      const leadId = String(row.lead_id)
      if (!leads.has(leadId)) leads.set(leadId, await this.lead(leadId))
      if (!matchesSearch(row.number, leads.get(leadId)!, filters.search)) continue
      const view = await this.invoiceView(row, leads.get(leadId)!)
      if (filters.activation && activationState(view) !== filters.activation) continue
      views.push(view)
    }
    return views
  }

  private async invoiceRow(id: string) {
    const rows = await this.db.query<InvoiceRow>("SELECT * FROM crm_invoices WHERE id = $1", [id])
    const row = rows.rows[0]
    if (!row) throw ERRORS.notFound("Invoice")
    return row
  }

  async getInvoice(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.invoiceRow(id)
    return {
      invoice: await this.invoiceView(row, await this.lead(String(row.lead_id))),
      seller: await this.seller(),
    }
  }

  // Staff record a payment made outside the pay link: a bank transfer, cash, a card terminal...
  async markPaid(
    actor: AuthenticatedActor,
    id: string,
    input: { method?: InvoicePaymentMethod; reference?: string | null; paidAt?: string | null }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    await this.settlePaid(await this.invoiceRow(id), {
      method: input.method ?? "bank_transfer",
      reference: input.reference ?? null,
      paidAt: input.paidAt ?? null,
      actorUserId: actor.userId,
    })
    return this.getInvoice(actor, id)
  }

  // بانتظار التفعيل: paid invoices whose apps aren't switched on yet -- usually because the customer
  // has no Madar account yet.
  async listAwaitingActivation(actor: AuthenticatedActor, filters: { search?: string } = {}) {
    requirePlatformPermission(actor, "crm:manage")
    await issueAutoInvoices(this.db)
    const rows = await this.db.query<InvoiceRow>(
      "SELECT * FROM crm_invoices WHERE status = 'paid' AND activated_at IS NULL ORDER BY paid_at DESC"
    )
    const views: InvoiceView[] = []
    for (const row of rows.rows) {
      const lead = await this.lead(String(row.lead_id))
      const hasPackages = (row.items ?? []).some((item) => item.kind === "package")
      // Paid for services only, by a customer who already has an account: nothing to activate.
      if (!hasPackages && lead.organization_id) continue
      if (!matchesSearch(row.number, lead, filters.search)) continue
      views.push(await this.invoiceView(row, lead))
    }
    return views
  }

  // "تفعيل الحساب": gives the customer a Madar account (or links the one registered with their
  // email), switches the invoice's apps on, and emails them how to sign in.
  async activateAccount(
    actor: AuthenticatedActor,
    id: string,
    input: { email?: string | null; contactName?: string | null } = {}
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const invoice = await this.invoiceRow(id)
    if (invoice.status !== "paid") {
      throw ERRORS.validation({ status: "Only a paid invoice can be activated." })
    }
    if (invoice.activated_at) throw ERRORS.validation({ status: "Already activated." })
    let lead = await this.lead(String(invoice.lead_id))
    const email = (input.email?.trim() || lead.email || "").toLowerCase()
    if (!email) throw ERRORS.validation({ email: "The customer needs an email to sign in." })
    const fullName = input.contactName?.trim() || lead.contact_name || lead.company_name
    if (email !== lead.email || fullName !== lead.contact_name) {
      await this.db.query(
        "UPDATE crm_leads SET email = $2, contact_name = $3, updated_at = now() WHERE id = $1",
        [lead.id, email, fullName]
      )
    }

    let userId: string | null = null
    let newAccount = false
    if (!lead.organization_id) {
      if (!this.activator) throw ERRORS.validation({ status: "Account activation is unavailable." })
      const account = await this.activator.findOrCreate({
        email,
        fullName,
        companyName: lead.company_name,
      })
      userId = account.userId
      newAccount = account.newAccount
      await this.db.query(
        "UPDATE crm_leads SET organization_id = $2, updated_at = now() WHERE id = $1",
        [lead.id, account.organizationId]
      )
      await addActivity(this.db, {
        leadId: String(lead.id),
        kind: "invoice",
        meta: { action: newAccount ? "account_created" : "account_linked", email },
        actorUserId: actor.userId,
      })
    }
    lead = await this.lead(String(lead.id))
    await activatePendingInvoices(this.db, String(lead.id))
    // Services-only invoices aren't switched on by activatePendingInvoices: mark them done here.
    await this.db.query(
      `UPDATE crm_invoices SET activated_at = now(), activated_organization_id = $2
       WHERE id = $1 AND activated_at IS NULL`,
      [invoice.id, lead.organization_id]
    )

    if (this.activator) {
      if (!userId) {
        const owner = await this.db.query<{ owner_user_id: string }>(
          "SELECT owner_user_id FROM organizations WHERE id = $1",
          [lead.organization_id]
        )
        userId = owner.rows[0]?.owner_user_id ? String(owner.rows[0].owner_user_id) : null
      }
      const applications = [
        ...new Set(
          (invoice.items ?? [])
            .filter((item) => item.kind === "package" && item.application)
            .map((item) => APPLICATION_NAME[item.application!] ?? item.application!)
        ),
      ]
      if (userId) {
        await this.activator
          .welcome({
            userId,
            newAccount,
            email,
            fullName,
            companyName: lead.company_name,
            applications,
          })
          .catch((error) =>
            console.error("crm.welcome_email_failed", {
              message: error instanceof Error ? error.message : String(error),
            })
          )
      }
    }
    return { ...(await this.getInvoice(actor, id)), newAccount }
  }

  // Sets the subscription period by hand (null: back to working it out from the packages). On an
  // invoice already switched on, its subscriptions move to the new dates too.
  async setSubscriptionPeriod(
    actor: AuthenticatedActor,
    id: string,
    period: { start: string; end: string } | null
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const invoice = await this.invoiceRow(id)
    if (period && period.end <= period.start) {
      throw ERRORS.validation({ end: "The end must be after the start." })
    }
    if (!period && invoice.activated_at) {
      throw ERRORS.validation({ period: "An activated invoice keeps its recorded dates." })
    }
    await this.db.query(
      `UPDATE crm_invoices SET subscription_start = $2, subscription_end = $3,
         subscription_dates_manual = $4, updated_at = now()
       WHERE id = $1`,
      [id, period?.start ?? null, period?.end ?? null, Boolean(period)]
    )
    if (period && invoice.activated_at && invoice.activated_organization_id) {
      const subscriptions = new PostgresOrganizationSubscriptionRepository(this.db)
      for (const item of invoice.items ?? []) {
        if (item.kind !== "package" || !item.application) continue
        const existing = await subscriptions.findByOrganizationAndApplication(
          String(invoice.activated_organization_id),
          item.application
        )
        if (!existing) continue
        await subscriptions.save({
          ...existing,
          startedAt: `${period.start}T00:00:00.000Z`,
          currentPeriodEnd: endOfSaudiDay(period.end),
          updatedAt: new Date().toISOString(),
        })
      }
    }
    await addActivity(this.db, {
      leadId: String(invoice.lead_id),
      kind: "invoice",
      meta: { action: "period", number: invoice.number, start: period?.start, end: period?.end },
      actorUserId: actor.userId,
    })
    return this.getInvoice(actor, id)
  }

  async voidInvoice(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.invoiceRow(id)
    if (row.status === "paid")
      throw ERRORS.validation({ status: "A paid invoice can't be voided." })
    await this.db.query(
      "UPDATE crm_invoices SET status = 'void', updated_at = now() WHERE id = $1",
      [id]
    )
    await addActivity(this.db, {
      leadId: String(row.lead_id),
      kind: "invoice",
      meta: { action: "void", number: row.number },
      actorUserId: actor.userId,
    })
    return this.getInvoice(actor, id)
  }

  // Marks an invoice paid (once), wins the lead, and switches the quoted apps on -- now if the lead
  // has a Madar account, otherwise as soon as it signs up (activatePendingInvoices).
  private async settlePaid(
    invoice: InvoiceRow,
    payment: {
      method: InvoicePaymentMethod
      reference: string | null
      // When it was actually paid, if not now.
      paidAt?: string | null
      actorUserId: string | null
    }
  ) {
    if (invoice.status === "paid") return
    if (invoice.status === "void") throw ERRORS.validation({ status: "This invoice was voided." })
    await this.db.withTransaction(async () => {
      const updated = await this.db.query(
        `UPDATE crm_invoices SET status = 'paid', paid_at = $4, payment_method = $2,
           payment_reference = $3, updated_at = now()
         WHERE id = $1 AND status = 'unpaid'`,
        [
          invoice.id,
          payment.method,
          payment.reference,
          payment.paidAt ? new Date(payment.paidAt).toISOString() : new Date().toISOString(),
        ]
      )
      if (!updated.rowCount) return
      await addActivity(this.db, {
        leadId: String(invoice.lead_id),
        kind: "invoice",
        meta: {
          action: "paid",
          number: invoice.number,
          method: payment.method,
          total: sar(invoice.total_halalas),
        },
        actorUserId: payment.actorUserId,
      })
      const lead = await this.lead(String(invoice.lead_id))
      if (lead.organization_id) {
        // Wins the lead and counts the payment toward its value.
        await crmPaymentReceived(this.db, {
          organizationId: String(lead.organization_id),
          amountHalalas: invoice.total_halalas,
          application: "invoice",
        })
      } else {
        await this.db.query(
          `UPDATE crm_leads SET stage = 'won', won_at = now(), stage_changed_at = now(),
             won_value_halalas = COALESCE(won_value_halalas, 0) + $2, updated_at = now()
           WHERE id = $1`,
          [invoice.lead_id, invoice.total_halalas]
        )
      }
      if (lead.organization_id) {
        await redeemInvoiceCoupon(this.db, invoice, String(lead.organization_id))
      }
      await activatePendingInvoices(this.db, String(invoice.lead_id))
    })
  }

  // ---- A coupon on the pay page ----

  // Checks a coupon against this invoice and applies its discount (replacing any coupon already
  // on it). Same rules as in-app checkout: active, not expired, not used up, and for the
  // application / package / period of at least one package line -- or for anything when the
  // coupon isn't limited. The discount comes off before VAT. Its use is counted once paid.
  async applyCoupon(token: string, code: string) {
    const row = await this.invoiceByToken(token)
    if (row.status !== "unpaid") {
      throw ERRORS.validation({ status: "This invoice is already paid." })
    }
    const normalized = normalizeCouponCode(code)
    const coupon = (await new CouponService(this.db).list()).find(
      (entry) => entry.code === normalized
    )
    if (!coupon) throw couponRejected("COUPON_NOT_FOUND", "This coupon code doesn't exist.")
    if (coupon.status === "disabled") {
      throw couponRejected("COUPON_DISABLED", "This coupon is no longer active.")
    }
    if (coupon.status === "expired") {
      throw couponRejected("COUPON_EXPIRED", "This coupon has expired.")
    }
    if (coupon.status === "exhausted") {
      throw couponRejected("COUPON_EXHAUSTED", "This coupon has reached its usage limit.")
    }
    const items = row.items ?? []
    const salesDiscount = Number(row.discount_halalas) - Number(row.coupon_discount_halalas ?? 0)
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceHalalas, 0)
    const unrestricted = coupon.applications.length === 0 && coupon.packageIds.length === 0
    const eligible = items.filter(
      (item) =>
        item.kind === "package" &&
        item.application &&
        item.interval &&
        (coupon.applications.length === 0 || coupon.applications.includes(item.application)) &&
        (coupon.packageIds.length === 0 ||
          (item.packageId !== undefined && coupon.packageIds.includes(item.packageId))) &&
        coupon.billingIntervals.includes(item.interval)
    )
    const base = unrestricted
      ? subtotal - salesDiscount
      : eligible.reduce((sum, item) => sum + item.quantity * item.unitPriceHalalas, 0)
    // An unlimited coupon still has its periods: the invoice's packages must include one of them.
    const packageLines = items.filter((item) => item.kind === "package")
    const periodFits =
      packageLines.length === 0 ||
      packageLines.some((item) => item.interval && coupon.billingIntervals.includes(item.interval))
    if (base <= 0 || (unrestricted ? !periodFits : eligible.length === 0)) {
      throw couponRejected("COUPON_NOT_APPLICABLE", "This coupon doesn't apply to this invoice.")
    }
    const raw =
      coupon.discountType === "percentage"
        ? Math.round((base * coupon.discountValue) / 100)
        : Math.min(coupon.discountValue, base)
    // Never below the smallest card charge.
    const discount = Math.max(0, Math.min(raw, subtotal - salesDiscount - MINIMUM_CHARGE_HALALAS))
    const totals = computeTotals(items, salesDiscount + discount)
    await this.db.query(
      `UPDATE crm_invoices SET coupon_id = $2, coupon_code = $3, coupon_discount_halalas = $4,
         discount_halalas = $5, subtotal_halalas = $6, vat_halalas = $7, total_halalas = $8,
         updated_at = now()
       WHERE id = $1 AND status = 'unpaid'`,
      [
        row.id,
        coupon.id,
        coupon.code,
        discount,
        totals.discount,
        totals.subtotal,
        totals.vat,
        totals.total,
      ]
    )
    return this.publicInvoice(token)
  }

  async removeCoupon(token: string) {
    const row = await this.invoiceByToken(token)
    if (row.status !== "unpaid" || !row.coupon_id) return this.publicInvoice(token)
    const salesDiscount = Number(row.discount_halalas) - Number(row.coupon_discount_halalas ?? 0)
    const totals = computeTotals(row.items ?? [], salesDiscount)
    await this.db.query(
      `UPDATE crm_invoices SET coupon_id = NULL, coupon_code = NULL, coupon_discount_halalas = 0,
         discount_halalas = $2, subtotal_halalas = $3, vat_halalas = $4, total_halalas = $5,
         updated_at = now()
       WHERE id = $1 AND status = 'unpaid'`,
      [row.id, totals.discount, totals.subtotal, totals.vat, totals.total]
    )
    return this.publicInvoice(token)
  }

  // ---- The customer's pay page (by the secret token in its link) ----

  private async invoiceByToken(token: string) {
    const rows = await this.db.query<InvoiceRow>(
      "SELECT * FROM crm_invoices WHERE pay_token = $1",
      [token]
    )
    const row = rows.rows[0]
    if (!row || row.status === "void") throw ERRORS.notFound("Invoice")
    return row
  }

  async publicInvoice(token: string): Promise<PublicInvoiceView> {
    const row = await this.invoiceByToken(token)
    const lead = await this.lead(String(row.lead_id))
    return {
      number: row.number,
      status: row.status,
      items: (row.items ?? []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: sar(item.unitPriceHalalas),
        total: sar(item.quantity * item.unitPriceHalalas),
      })),
      totals: totalsView(row),
      dueDate: day(row.due_date),
      issuedAt: iso(row.created_at) as string,
      paidAt: iso(row.paid_at),
      subscriptionStart: invoicePeriod(row)?.start ?? null,
      subscriptionEnd: invoicePeriod(row)?.end ?? null,
      terms: row.terms ?? (await this.settings.get()).invoiceTerms,
      coupon: couponView(row),
      customer: party(lead),
      seller: await this.seller(),
    }
  }

  // A quote's or an invoice's own terms and conditions (null: back to the default ones).
  async setTerms(
    actor: AuthenticatedActor,
    kind: "quote" | "invoice",
    id: string,
    terms: string | null
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const table = kind === "quote" ? "crm_quotes" : "crm_invoices"
    const updated = await this.db.query(
      `UPDATE ${table} SET terms = $2, updated_at = now() WHERE id = $1`,
      [id, terms?.trim() ? terms.trim() : null]
    )
    if (!updated.rowCount) throw ERRORS.notFound(kind === "quote" ? "Quote" : "Invoice")
    return kind === "quote" ? this.getQuote(actor, id) : this.getInvoice(actor, id)
  }

  async publicCheckout(token: string) {
    const row = await this.invoiceByToken(token)
    if (row.status === "paid") throw ERRORS.validation({ status: "This invoice is already paid." })
    const credentials = await resolveMoyasarCredentials()
    if (!credentials) throw ERRORS.serviceUnavailable("Online payment is not configured.")
    return {
      invoiceId: String(row.id),
      number: row.number,
      amount: row.total_halalas,
      currency: "SAR",
      publishableKey: credentials.publishableKey,
    }
  }

  // The pay page's callback: re-reads the payment from Moyasar with the secret key, and settles
  // only a payment for this invoice, of its full amount, that Moyasar says is paid.
  async publicConfirm(token: string, moyasarPaymentId: string) {
    const row = await this.invoiceByToken(token)
    if (row.status !== "paid") {
      const credentials = await resolveMoyasarCredentials()
      if (!credentials) throw ERRORS.serviceUnavailable("Online payment is not configured.")
      const payment = await new MoyasarApiClient(credentials.secretKey).fetchPayment(
        moyasarPaymentId
      )
      await this.settleMoyasarPayment(row, payment)
    }
    return this.publicInvoice(token)
  }

  // Moyasar's webhook for an invoice payment (metadata.crm_invoice_id).
  async handleMoyasarWebhook(payment: {
    id: string
    status: string
    amount: number
    currency: string
    metadata: Record<string, unknown> | null
  }) {
    const invoiceId = payment.metadata?.crm_invoice_id
    if (typeof invoiceId !== "string") return false
    const rows = await this.db.query<InvoiceRow>("SELECT * FROM crm_invoices WHERE id = $1", [
      invoiceId,
    ])
    if (rows.rows[0]) await this.settleMoyasarPayment(rows.rows[0], payment)
    return true
  }

  private async settleMoyasarPayment(
    invoice: InvoiceRow,
    payment: {
      id: string
      status: string
      amount: number
      currency: string
      metadata: Record<string, unknown> | null
    }
  ) {
    const genuine =
      payment.status === "paid" &&
      payment.amount === invoice.total_halalas &&
      payment.currency === "SAR" &&
      payment.metadata?.crm_invoice_id === String(invoice.id)
    if (!genuine) return
    await this.settlePaid(invoice, { method: "card", reference: payment.id, actorUserId: null })
  }

  // The customer's own invoices, for their billing page.
  async invoicesForOrganization(organizationId: string) {
    const leads = await this.db.query<{ id: string }>(
      "SELECT id FROM crm_leads WHERE organization_id = $1",
      [organizationId]
    )
    const leadIds = new Set(leads.rows.map((lead) => String(lead.id)))
    if (leadIds.size === 0) return []
    const rows = await this.db.query<InvoiceRow>(
      "SELECT * FROM crm_invoices WHERE status <> 'void' ORDER BY created_at DESC LIMIT 500"
    )
    return rows.rows.filter((row) => leadIds.has(String(row.lead_id)))
  }
}
