import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PaymentKind, PosPaymentMethodsService } from "../pos/payment-methods-service"

import { computeSegment, computeStatus, type CustomerDetail, type CustomerSummary } from "./service"

const CUSTOMER_ERRORS = {
  notFound: () => new IdentityError("CUSTOMER_NOT_FOUND", 404, "business", "Customer not found."),
  invalidReceiptMethod: () =>
    new IdentityError(
      "CUSTOMER_ACCOUNT_INVALID_RECEIPT_METHOD",
      400,
      "validation",
      "This payment method cannot be used to record a receipt."
    ),
  invalidPaymentMethod: () =>
    new IdentityError(
      "CUSTOMER_ACCOUNT_INVALID_PAYMENT_METHOD",
      400,
      "validation",
      "This payment method cannot be used to record a payment voucher."
    ),
  nonZeroBalance: (accountBalance: number) =>
    new IdentityError(
      "CUSTOMER_HAS_NONZERO_BALANCE",
      409,
      "business",
      "This customer's account balance is not zero. Settle it to zero before deleting them.",
      { accountBalance }
    ),
  invalidTransactionDate: () =>
    new IdentityError("CUSTOMER_ACCOUNT_INVALID_DATE", 400, "validation", "Invalid voucher date."),
}

// A receipt covers both a manual "سند قبض" and what used to be a separate "wallet top-up" --
// both are the same real event (real money someone actually handed over or transferred credited
// to the customer's account), so both accept the same set of methods. "credit" (آجل) and
// "prepaid" would be circular (funding the account from itself), and "bnpl" makes no sense
// crediting a customer's own account either.
const ALLOWED_RECEIPT_KINDS: ReadonlySet<PaymentKind> = new Set([
  "cash",
  "card",
  "transfer",
  "wallet",
])

// A payment voucher records the business physically handing money out of the till/bank account --
// "wallet" methods (Apple Pay/STC Pay) are customer-facing collection channels, not something the
// business pays out through, and "credit"/"prepaid"/"bnpl" would be circular here too.
const ALLOWED_PAYMENT_KINDS: ReadonlySet<PaymentKind> = new Set(["cash", "card", "transfer"])

export interface CreateCustomerInput {
  organizationId: string
  workspaceId: string | null
  createdBy: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  region: string | null
  isBusinessCustomer: boolean
  vatNumber: string | null
  commercialRegistration: string | null
  buildingNumber: string | null
  secondaryNumber: string | null
  street: string | null
  city: string | null
  district: string | null
  postalCode: string | null
  countryCode: string | null
}

// Every field optional -- an edit only ever sends what actually changed.
export interface UpdateCustomerInput {
  name?: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  region?: string | null
  isBusinessCustomer?: boolean
  vatNumber?: string | null
  commercialRegistration?: string | null
  buildingNumber?: string | null
  secondaryNumber?: string | null
  street?: string | null
  city?: string | null
  district?: string | null
  postalCode?: string | null
  countryCode?: string | null
}

// One parsed CSV row -- name is not required here (unlike CreateCustomerInput) because an
// invalid row is skipped and reported back, not a request-wide validation failure.
export interface BulkImportRow {
  name: string
  email: string | null
  phone: string | null
  region: string | null
}

export interface BulkImportResult {
  created: number
  // 1-indexed against the `customers` array actually sent (the caller adds the header-row
  // offset back when displaying these against the original CSV file).
  skipped: Array<{ row: number; reason: string }>
}

export interface NativeCustomerView {
  id: string
  workspaceId: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  region: string | null
  createdAt: string
  updatedAt: string
  // Real unified running balance -- see migration 066_customer_unified_account.sql. Positive
  // means the store owes the customer (prepaid credit); negative means the customer owes the
  // store (deferred debt). Moved by createAccountTransaction() below and by invoices-service.ts
  // at sale/return time.
  accountBalance: number
  // B2B identity + Saudi National Address -- see migration 075_customer_business_info.sql.
  isBusinessCustomer: boolean
  vatNumber: string | null
  commercialRegistration: string | null
  buildingNumber: string | null
  secondaryNumber: string | null
  street: string | null
  city: string | null
  district: string | null
  postalCode: string | null
  countryCode: string | null
  // Real counts from pos_invoices.customer_id (see migration 062_pos_split_payments.sql), not
  // fabricated -- a native customer selected at POS checkout gets a real FK on the invoice even
  // though the invoice's own customer_name/customer_phone stay a separate snapshot (see
  // invoices-service.ts). Computed fresh by every method below that returns this view.
  totalOrders: number
  totalRevenue: number
  lastPurchaseAt: string | null
}

export type AccountTransactionType = "receipt" | "payment" | "sale" | "return"

export interface AccountTransactionView {
  id: string
  reference: string
  type: AccountTransactionType
  // Always a positive magnitude -- direction is derived from type when replaying the ledger.
  amount: number
  // Only ever set for a "receipt" or "payment" -- a "sale"/"return" pulls its payment method(s)
  // from the invoice itself (pos_invoice_payments), which can be a split across several methods.
  paymentMethodCode: string | null
  taxInclusive: boolean
  taxAmount: number
  notes: string | null
  attachmentUrls: string[]
  // Only ever set for a "sale" or "return" -- a manual receipt/payment voucher has no invoice
  // behind it.
  invoiceId: string | null
  invoiceNumber: string | null
  // Computed by replaying this customer's full transaction history chronologically, not stored --
  // real regardless of which date/type filter narrowed the list this row came back in.
  balanceAfter: number
  createdAt: string
}

export interface AccountTransactionFilter {
  from: string | null
  to: string | null
  type: AccountTransactionType | null
}

export interface AccountStatementView {
  transactions: AccountTransactionView[]
  // Over the filtered set actually returned, not the customer's lifetime totals.
  totalCredits: number
  totalDebits: number
  transactionCount: number
}

interface CustomerRow {
  id: string
  workspace_id: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  region: string | null
  created_at: Date | string
  updated_at: Date | string
  account_balance: string | number
  is_business_customer: boolean
  vat_number: string | null
  commercial_registration: string | null
  building_number: string | null
  secondary_number: string | null
  street: string | null
  city: string | null
  district: string | null
  postal_code: string | null
  country_code: string | null
  total_orders: string | number
  total_revenue: string | number | null
  last_purchase_at: Date | string | null
  [key: string]: unknown
}

interface AccountTransactionRow {
  id: string
  reference: string
  type: string
  amount: string | number
  payment_method_code: string | null
  tax_inclusive: boolean
  tax_amount: string | number
  notes: string | null
  attachment_urls: string[] | null
  invoice_id: string | null
  invoice_number: string | null
  created_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapRow(row: CustomerRow): NativeCustomerView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    region: row.region,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    accountBalance: Number(row.account_balance) || 0,
    isBusinessCustomer: row.is_business_customer,
    vatNumber: row.vat_number,
    commercialRegistration: row.commercial_registration,
    buildingNumber: row.building_number,
    secondaryNumber: row.secondary_number,
    street: row.street,
    city: row.city,
    district: row.district,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    totalOrders: Number(row.total_orders) || 0,
    totalRevenue: Number(row.total_revenue) || 0,
    lastPurchaseAt: row.last_purchase_at ? toIso(row.last_purchase_at) : null,
  }
}

// LEFT JOIN + GROUP BY (not a correlated subquery) for the same portability reason
// customers/service.ts's own fetchProviderCustomers uses: pg-mem, the in-memory Postgres this
// repo's tests run against, doesn't support a LATERAL subquery correlated to an outer column.
// pos_invoices.customer_id is a real FK to this table (see migration 062_pos_split_payments.sql)
// even though the invoice's own customer_name/customer_phone stay a separate snapshot (see
// invoices-service.ts) -- that snapshot is for what the invoice document itself displays, this
// join is for what this customer's own profile reports about their real order history. Only
// status='completed' counts -- a cancelled invoice never really happened as a sale, and a
// returned one no longer represents money the business actually kept, so neither belongs in a
// "total invoices" figure. Every caller below appends its own WHERE conditions (qualified with the
// c. alias, since pos_invoices has its own id column too) and must finish with CUSTOMER_GROUP_BY.
//
// GROUP BY lists every non-aggregate selected column explicitly, rather than just c.id, since
// pg-mem (unlike real Postgres) doesn't support eliding functionally-dependent columns from a
// GROUP BY just because c.id is customers' primary key -- same reasoning as
// fetchProviderCustomers's own GROUP BY in service.ts.
const CUSTOMER_SELECT = `
  SELECT c.id, c.workspace_id, c.name, c.email, c.phone, c.notes, c.region, c.created_at,
         c.updated_at, c.account_balance, c.is_business_customer, c.vat_number,
         c.commercial_registration, c.building_number, c.secondary_number, c.street, c.city,
         c.district, c.postal_code, c.country_code,
         count(i.id) AS total_orders,
         coalesce(sum(i.total_amount), 0) AS total_revenue,
         max(i.created_at) AS last_purchase_at
    FROM customers c
    LEFT JOIN pos_invoices i ON i.customer_id = c.id AND i.status = 'completed'
   WHERE c.deleted_at IS NULL
`
const CUSTOMER_GROUP_BY = `
  GROUP BY c.id, c.workspace_id, c.name, c.email, c.phone, c.notes, c.region, c.created_at,
           c.updated_at, c.account_balance, c.is_business_customer, c.vat_number,
           c.commercial_registration, c.building_number, c.secondary_number, c.street, c.city,
           c.district, c.postal_code, c.country_code
`

// Real totalOrders/totalRevenue/lastPurchaseAt (see NativeCustomerView's own comment on where
// these come from), fed through the exact same classification rules customers/service.ts uses
// for a synced-storefront customer, so a native customer's status/segment badge means the same
// thing regardless of which side of the aggregation it came from.
export function toNormalizedCustomer(customer: NativeCustomerView): CustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone,
    platform: "Madar",
    createdAt: customer.createdAt,
    totalOrders: customer.totalOrders,
    totalRevenue: customer.totalRevenue,
    lifetimeValue: customer.totalRevenue,
    lastPurchaseAt: customer.lastPurchaseAt,
    status: computeStatus({
      createdAt: customer.createdAt,
      totalOrders: customer.totalOrders,
      lastPurchaseAt: customer.lastPurchaseAt,
    }),
    segment: computeSegment({
      totalOrders: customer.totalOrders,
      lifetimeValue: customer.totalRevenue,
    }),
    accountBalance: customer.accountBalance,
    region: customer.region,
    isBusinessCustomer: customer.isBusinessCustomer,
    vatNumber: customer.vatNumber,
    commercialRegistration: customer.commercialRegistration,
    buildingNumber: customer.buildingNumber,
    secondaryNumber: customer.secondaryNumber,
    street: customer.street,
    city: customer.city,
    district: customer.district,
    postalCode: customer.postalCode,
    countryCode: customer.countryCode,
  }
}

// toNormalizedCustomer above now carries this customer's real aggregate totals, but the
// per-order breakdown a synced-storefront customer's own detail view shows (orders,
// productsPurchased) has no native equivalent built yet -- would mean reading pos_invoices'
// actual line items here, not just count/sum. Left empty rather than guessed at.
export function toNormalizedCustomerDetail(customer: NativeCustomerView): CustomerDetail {
  return {
    ...toNormalizedCustomer(customer),
    orders: [],
    productsPurchased: [],
    averageOrderValue: customer.totalOrders > 0 ? customer.totalRevenue / customer.totalOrders : 0,
  }
}

// Native (Madar-authored) customers -- sits alongside the synced-storefront aggregation in
// service.ts the same way native products sit alongside synced products in catalog-service.ts.
// See migration 060_native_customers.sql for why this exists and what it deliberately omits.
export class NativeCustomersService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly paymentMethodsService: PosPaymentMethodsService
  ) {}

  async list(organizationId: string, workspaceId: string | null): Promise<NativeCustomerView[]> {
    const conditions = ["c.organization_id = $1"]
    const params: unknown[] = [organizationId]
    if (workspaceId) {
      params.push(workspaceId)
      conditions.push(`c.workspace_id = $${params.length}`)
    }

    const result = await this.database.query<CustomerRow>(
      `${CUSTOMER_SELECT} AND ${conditions.join(" AND ")} ${CUSTOMER_GROUP_BY} ORDER BY c.created_at DESC`,
      params
    )
    return result.rows.map(mapRow)
  }

  async create(input: CreateCustomerInput): Promise<NativeCustomerView> {
    const id = randomUUID()
    await this.database.query(
      `INSERT INTO customers
         (id, organization_id, workspace_id, name, email, phone, notes, region, created_by,
          account_balance, is_business_customer, vat_number, commercial_registration,
          building_number, secondary_number, street, city, district, postal_code, country_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.name,
        input.email,
        input.phone,
        input.notes,
        input.region,
        input.createdBy,
        input.isBusinessCustomer,
        input.vatNumber,
        input.commercialRegistration,
        input.buildingNumber,
        input.secondaryNumber,
        input.street,
        input.city,
        input.district,
        input.postalCode,
        input.countryCode ?? "SA",
      ]
    )

    const created = await this.getById(input.organizationId, id)
    if (!created) throw CUSTOMER_ERRORS.notFound()
    return created
  }

  // Creates as many rows as are actually valid rather than rejecting the whole file over one
  // bad row -- a name-less row is the only thing checked here (create() itself has no other way
  // to fail for a well-formed row), so a name-less row is skipped and every other real error
  // (a database hiccup on one specific row) is caught per-row too, so 999 good rows still land
  // even if row 37 somehow fails.
  async bulkImport(
    organizationId: string,
    workspaceId: string | null,
    createdBy: string | null,
    rows: BulkImportRow[]
  ): Promise<BulkImportResult> {
    let created = 0
    const skipped: BulkImportResult["skipped"] = []

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const name = row.name.trim()
      if (!name) {
        skipped.push({ row: index + 1, reason: "الاسم مطلوب" })
        continue
      }

      try {
        await this.create({
          organizationId,
          workspaceId,
          createdBy,
          name,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          notes: null,
          region: row.region?.trim() || null,
          isBusinessCustomer: false,
          vatNumber: null,
          commercialRegistration: null,
          buildingNumber: null,
          secondaryNumber: null,
          street: null,
          city: null,
          district: null,
          postalCode: null,
          countryCode: "SA",
        })
        created += 1
      } catch {
        skipped.push({ row: index + 1, reason: "تعذر إنشاء هذا العميل" })
      }
    }

    return { created, skipped }
  }

  async getById(organizationId: string, id: string): Promise<NativeCustomerView | null> {
    const result = await this.database.query<CustomerRow>(
      `${CUSTOMER_SELECT} AND c.organization_id = $1 AND c.id = $2 ${CUSTOMER_GROUP_BY}`,
      [organizationId, id]
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateCustomerInput
  ): Promise<NativeCustomerView> {
    const existing = await this.getById(organizationId, id)
    if (!existing) throw CUSTOMER_ERRORS.notFound()

    const assignments: string[] = []
    const params: unknown[] = [id, organizationId]
    const set = (column: string, value: unknown) => {
      params.push(value)
      assignments.push(`${column} = $${params.length}`)
    }
    if (input.name !== undefined) set("name", input.name)
    if (input.email !== undefined) set("email", input.email)
    if (input.phone !== undefined) set("phone", input.phone)
    if (input.notes !== undefined) set("notes", input.notes)
    if (input.region !== undefined) set("region", input.region)
    if (input.isBusinessCustomer !== undefined)
      set("is_business_customer", input.isBusinessCustomer)
    if (input.vatNumber !== undefined) set("vat_number", input.vatNumber)
    if (input.commercialRegistration !== undefined)
      set("commercial_registration", input.commercialRegistration)
    if (input.buildingNumber !== undefined) set("building_number", input.buildingNumber)
    if (input.secondaryNumber !== undefined) set("secondary_number", input.secondaryNumber)
    if (input.street !== undefined) set("street", input.street)
    if (input.city !== undefined) set("city", input.city)
    if (input.district !== undefined) set("district", input.district)
    if (input.postalCode !== undefined) set("postal_code", input.postalCode)
    if (input.countryCode !== undefined) set("country_code", input.countryCode)

    if (assignments.length > 0) {
      await this.database.query(
        `UPDATE customers SET ${assignments.join(", ")}, updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        params
      )
    }

    const updated = await this.getById(organizationId, id)
    if (!updated) throw CUSTOMER_ERRORS.notFound()
    return updated
  }

  // Soft-deletes a native customer -- refused while their real unified account_balance isn't
  // zero (positive or negative both count), so a customer with real, unsettled money on either
  // side of the ledger can never quietly disappear along with it.
  async delete(organizationId: string, id: string): Promise<void> {
    const existing = await this.getById(organizationId, id)
    if (!existing) throw CUSTOMER_ERRORS.notFound()
    if (Math.abs(existing.accountBalance) > 0.009) {
      throw CUSTOMER_ERRORS.nonZeroBalance(existing.accountBalance)
    }

    await this.database.query(
      `UPDATE customers SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    )
  }

  // A "سند قبض" (receipt -- real money collected, credits the account, also how a wallet used to
  // be topped up) or a "سند صرف" (payment voucher -- the business handing money/credit to the
  // customer, debits the account). Neither has an invoice behind it -- see invoices-service.ts's
  // create()/setStatus() for the sale/return sides of this same ledger.
  async createAccountTransaction(
    organizationId: string,
    workspaceId: string | null,
    customerId: string,
    type: "receipt" | "payment",
    amount: number,
    taxInclusive: boolean,
    taxAmount: number,
    paymentMethodCode: string,
    notes: string | null,
    attachmentUrls: string[],
    createdBy: string | null,
    // The voucher's own recorded date, editable in the UI (defaults to today there) -- e.g. to
    // backdate a receipt collected earlier and only entered now. Null/omitted falls back to the
    // column's own now() default, same as before this parameter existed.
    transactionDate?: string | null
  ): Promise<NativeCustomerView> {
    const existing = await this.getById(organizationId, customerId)
    if (!existing) throw CUSTOMER_ERRORS.notFound()

    const methods = await this.paymentMethodsService.list(organizationId, workspaceId)
    const method = methods.find((candidate) => candidate.code === paymentMethodCode)
    const allowedKinds = type === "receipt" ? ALLOWED_RECEIPT_KINDS : ALLOWED_PAYMENT_KINDS
    if (!method || !method.enabled || !allowedKinds.has(method.kind)) {
      throw type === "receipt"
        ? CUSTOMER_ERRORS.invalidReceiptMethod()
        : CUSTOMER_ERRORS.invalidPaymentMethod()
    }

    const sequenceName =
      type === "receipt"
        ? "customer_receipt_voucher_number_seq"
        : "customer_payment_voucher_number_seq"
    const prefix = type === "receipt" ? "RCV" : "PV"
    const numberResult = await this.database.query<{ nextval: string }>(
      `SELECT nextval('${sequenceName}')`
    )
    const reference = `${prefix}-${String(numberResult.rows[0].nextval).padStart(5, "0")}`

    let recordedAt = new Date()
    if (transactionDate) {
      recordedAt = new Date(transactionDate)
      if (Number.isNaN(recordedAt.getTime())) throw CUSTOMER_ERRORS.invalidTransactionDate()
    }

    const balanceDelta = type === "receipt" ? amount : -amount
    await this.database.query(
      `UPDATE customers SET account_balance = account_balance + $2, updated_at = now() WHERE id = $1`,
      [customerId, balanceDelta]
    )
    await this.database.query(
      `INSERT INTO customer_account_transactions
         (id, organization_id, workspace_id, customer_id, type, reference, amount, tax_inclusive,
          tax_amount, payment_method_code, notes, attachment_urls, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        randomUUID(),
        organizationId,
        workspaceId,
        customerId,
        type,
        reference,
        amount,
        taxInclusive,
        taxAmount,
        paymentMethodCode,
        notes,
        attachmentUrls,
        createdBy,
        recordedAt,
      ]
    )

    const updated = await this.getById(organizationId, customerId)
    if (!updated) throw CUSTOMER_ERRORS.notFound()
    return updated
  }

  // The customer's full real account history -- receipts, payment vouchers, credit/wallet-funded
  // sales, and returns -- newest first, with a running balance computed by replaying it
  // chronologically. See AccountTransactionView.balanceAfter.
  async listAccountTransactions(
    organizationId: string,
    customerId: string,
    filter: AccountTransactionFilter
  ): Promise<AccountStatementView> {
    const existing = await this.getById(organizationId, customerId)
    if (!existing) throw CUSTOMER_ERRORS.notFound()

    const result = await this.database.query<AccountTransactionRow>(
      `SELECT t.id, t.reference, t.type, t.amount, t.payment_method_code, t.tax_inclusive,
              t.tax_amount, t.notes, t.attachment_urls, t.invoice_id, inv.invoice_number,
              t.created_at
         FROM customer_account_transactions t
         LEFT JOIN pos_invoices inv ON inv.id = t.invoice_id
        WHERE t.organization_id = $1 AND t.customer_id = $2
        ORDER BY t.created_at ASC, t.id ASC`,
      [organizationId, customerId]
    )

    let runningBalance = 0
    const chronological: AccountTransactionView[] = result.rows.map((row) => {
      const amount = Number(row.amount) || 0
      const type = row.type as AccountTransactionType
      const direction = type === "receipt" || type === "return" ? 1 : -1
      runningBalance = Math.round((runningBalance + direction * amount) * 100) / 100
      return {
        id: row.id,
        reference: row.reference,
        type,
        amount,
        paymentMethodCode: row.payment_method_code,
        taxInclusive: row.tax_inclusive,
        taxAmount: Number(row.tax_amount) || 0,
        notes: row.notes,
        attachmentUrls: row.attachment_urls ?? [],
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        balanceAfter: runningBalance,
        createdAt: toIso(row.created_at),
      }
    })

    const filtered = chronological.filter((txn) => {
      if (filter.type && txn.type !== filter.type) return false
      if (filter.from && txn.createdAt < filter.from) return false
      if (filter.to && txn.createdAt > filter.to) return false
      return true
    })

    const totalCredits =
      Math.round(
        filtered
          .filter((txn) => txn.type === "receipt" || txn.type === "return")
          .reduce((sum, txn) => sum + txn.amount, 0) * 100
      ) / 100
    const totalDebits =
      Math.round(
        filtered
          .filter((txn) => txn.type === "payment" || txn.type === "sale")
          .reduce((sum, txn) => sum + txn.amount, 0) * 100
      ) / 100

    return {
      transactions: [...filtered].reverse(),
      totalCredits,
      totalDebits,
      transactionCount: filtered.length,
    }
  }
}
