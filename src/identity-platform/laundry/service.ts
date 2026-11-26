import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { NativeCustomersService } from "../customers/native-customers-service"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosInvoicesService } from "../pos/invoices-service"
import type { TaxRatesService } from "../tax/tax-rates-service"
import { toWhatsAppNumber } from "../whatsapp/phone"

// The Laundry app (المغاسل). An order is received now and collected later: it moves through
// received -> processing -> ready -> delivered. Money stays right for ZATCA and the books:
//   - paid in full at drop-off: the tax invoice is issued then;
//   - a deposit: it goes onto the customer's account (a receipt, not a sale) and pays part of
//     the invoice, which is issued at pickup;
//   - paid at pickup: the invoice is issued at pickup.
// Pieces covered by a laundry subscription were paid for when the plan was sold.

type Row = Record<string, unknown>

export const LAUNDRY_STATUSES = [
  "received",
  "processing",
  "ready",
  "delivered",
  "cancelled",
] as const
export type LaundryStatus = (typeof LAUNDRY_STATUSES)[number]

const refuse = (code: string, message: string, status = 409) =>
  new IdentityError(code, status, "business", message)
const notFound = () => new IdentityError("LAUNDRY_NOT_FOUND", 404, "business", "Not found.")

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)
const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const digits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-9)

// What a laundry starts with: the common pieces and services (prices are the business's own).
const DEFAULT_ITEMS: Array<[string, string]> = [
  ["ثوب", "رجالي"],
  ["شماغ / غترة", "رجالي"],
  ["قميص", "عام"],
  ["بنطال", "عام"],
  ["جاكيت / معطف", "عام"],
  ["بدلة", "عام"],
  ["فستان", "نسائي"],
  ["عباية", "نسائي"],
  ["بطانية", "مفروشات"],
  ["لحاف", "مفروشات"],
  ["شرشف", "مفروشات"],
  ["ستارة", "مفروشات"],
]
const DEFAULT_SERVICES = ["غسيل وكوي", "كوي فقط", "تنظيف جاف", "غسيل فقط"]

export interface LaundrySettings {
  pricesIncludeTax: boolean
  turnaroundHours: number
  urgentTurnaroundHours: number
  urgentSurchargePercent: number
  deliveryFee: number
  unclaimedDays: number
  autoReadyMessage: boolean
}

export interface LaundryCatalog {
  items: Array<{ id: string; name: string; category: string | null; active: boolean }>
  services: Array<{ id: string; name: string; active: boolean }>
  // Price by `${itemId}:${serviceId}`.
  prices: Record<string, number>
}

export interface LaundryOrderLineInput {
  itemId: string
  serviceId: string
  quantity: number
  note?: string | null
}

export interface CreateLaundryOrderInput {
  workspaceId: string | null
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  lines: LaundryOrderLineInput[]
  urgent: boolean
  promisedAt?: string | null
  fulfilment: "pickup" | "delivery"
  pickupAddress?: string | null
  deliveryAddress?: string | null
  pickupAt?: string | null
  deliveryAt?: string | null
  driverUserId?: string | null
  notes?: string | null
  // Pieces come off the customer's laundry subscription first, when they have one.
  useSubscription: boolean
  // later: at pickup. deposit: part now, onto the customer's account. full: all now.
  payment: {
    mode: "later" | "deposit" | "full"
    paymentMethodCode?: string | null
    amount?: number
    // Paid in full with more than one method (the cashier's split payment), in place of
    // paymentMethodCode.
    payments?: LaundryPaymentSplit[]
  }
}

export interface LaundryPaymentSplit {
  paymentMethodCode: string
  amount: number
}

// What an order would cost before it is saved (the cashier's laundry cart): the customer found by
// mobile, the pieces their subscription covers, the charges and the total.
export interface LaundryQuoteInput {
  customerId?: string | null
  customerPhone?: string | null
  lines: Array<{ itemId: string; serviceId: string; quantity: number }>
  urgent: boolean
  fulfilment: "pickup" | "delivery"
  useSubscription: boolean
}

export interface LaundryQuote {
  customer: { id: string; name: string; phone: string | null } | null
  subscription: { planName: string; piecesLeft: number; endsAt: string } | null
  pieces: number
  covered: number
  itemsTotal: number
  urgentFee: number
  deliveryFee: number
  total: number
}

export interface LaundryOrderSummary {
  id: string
  orderNumber: string
  status: LaundryStatus
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  urgent: boolean
  pieces: number
  total: number
  depositAmount: number
  // What is still to be paid: nothing once invoiced.
  due: number
  paid: boolean
  invoiceNumber: string | null
  fulfilment: "pickup" | "delivery"
  pickupAt: string | null
  deliveryAt: string | null
  driverUserId: string | null
  promisedAt: string | null
  readyAt: string | null
  deliveredAt: string | null
  readyNotifiedAt: string | null
  remindedAt: string | null
  late: boolean
  createdAt: string
}

export interface LaundryOrderDetail extends LaundryOrderSummary {
  workspaceId: string | null
  itemsTotal: number
  urgentFee: number
  deliveryFee: number
  invoiceId: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  notes: string | null
  subscriptionId: string | null
  lines: Array<{
    id: string
    itemName: string
    serviceName: string
    quantity: number
    coveredQuantity: number
    unitPrice: number
    lineTotal: number
    note: string | null
  }>
  photos: Array<{ id: string; url: string; note: string | null; createdAt: string }>
  events: Array<{ kind: string; detail: Record<string, unknown>; createdAt: string }>
  // The WhatsApp message for the customer, ready to open: "your order is ready" or a reminder.
  whatsapp: { readyUrl: string | null; reminderUrl: string | null }
}

export interface LaundryPlan {
  id: string
  name: string
  pieces: number
  price: number
  validDays: number
  active: boolean
}

export interface LaundrySubscription {
  id: string
  customerId: string
  customerName: string | null
  planName: string
  piecesTotal: number
  piecesUsed: number
  piecesLeft: number
  startsAt: string
  endsAt: string
  active: boolean
  invoiceNumber: string | null
}

// Sends the "ready" and "still waiting" WhatsApp messages on its own, when the business can
// (laundry/messenger.ts). Absent where WhatsApp is not set up.
export interface LaundryMessengerPort {
  send(
    organizationId: string,
    kind: "ready" | "reminder",
    order: LaundryOrderDetail
  ): Promise<"sent" | "no_phone" | "limit" | "failed">
}

export class LaundryService {
  messenger: LaundryMessengerPort | null = null

  constructor(
    private readonly db: PostgresDatabase,
    private readonly invoices: PosInvoicesService,
    private readonly customers: NativeCustomersService,
    private readonly taxRates: TaxRatesService
  ) {}

  // ---- Settings and the price list ----

  async getSettings(organizationId: string): Promise<LaundrySettings> {
    const row = (
      await this.db.query<Row>(`SELECT * FROM laundry_settings WHERE organization_id = $1`, [
        organizationId,
      ])
    ).rows[0]
    return {
      pricesIncludeTax: row ? row.prices_include_tax !== false : true,
      turnaroundHours: Number(row?.turnaround_hours ?? 48),
      urgentTurnaroundHours: Number(row?.urgent_turnaround_hours ?? 24),
      urgentSurchargePercent: Number(row?.urgent_surcharge_percent ?? 50),
      deliveryFee: money(row?.delivery_fee ?? 0),
      unclaimedDays: Number(row?.unclaimed_days ?? 7),
      autoReadyMessage: row ? row.auto_ready_message !== false : true,
    }
  }

  async updateSettings(organizationId: string, patch: Partial<LaundrySettings>) {
    const next = { ...(await this.getSettings(organizationId)), ...patch }
    await this.db.query(
      `INSERT INTO laundry_settings
         (organization_id, prices_include_tax, turnaround_hours, urgent_turnaround_hours,
          urgent_surcharge_percent, delivery_fee, unclaimed_days, auto_ready_message, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (organization_id) DO UPDATE SET
         prices_include_tax = $2, turnaround_hours = $3, urgent_turnaround_hours = $4,
         urgent_surcharge_percent = $5, delivery_fee = $6, unclaimed_days = $7,
         auto_ready_message = $8, updated_at = now()`,
      [
        organizationId,
        next.pricesIncludeTax,
        next.turnaroundHours,
        next.urgentTurnaroundHours,
        next.urgentSurchargePercent,
        next.deliveryFee,
        next.unclaimedDays,
        next.autoReadyMessage,
      ]
    )
    return this.getSettings(organizationId)
  }

  // The items, services and prices. A business opening the app for the first time gets the
  // common items and services to price (no prices are made up for it).
  async getCatalog(organizationId: string): Promise<LaundryCatalog> {
    const readItems = () =>
      this.db.query<Row>(
        `SELECT * FROM laundry_items WHERE organization_id = $1 ORDER BY position, created_at`,
        [organizationId]
      )
    const readServices = () =>
      this.db.query<Row>(
        `SELECT * FROM laundry_services WHERE organization_id = $1 ORDER BY position, created_at`,
        [organizationId]
      )
    let items = await readItems()
    let services = await readServices()
    if (items.rows.length === 0 && services.rows.length === 0) {
      // Only the request that claims the flag adds them (the row lock makes a second wait and
      // then find it already set).
      const seeded = await this.db.withTransaction(async () => {
        await this.db.query(
          `INSERT INTO laundry_settings (organization_id) VALUES ($1)
           ON CONFLICT (organization_id) DO NOTHING`,
          [organizationId]
        )
        const claimed = await this.db.query(
          `UPDATE laundry_settings SET catalog_seeded = true
            WHERE organization_id = $1 AND catalog_seeded = false
            RETURNING organization_id`,
          [organizationId]
        )
        if (!claimed.rowCount) return false
        for (const [index, [name, category]] of DEFAULT_ITEMS.entries()) {
          await this.db.query(
            `INSERT INTO laundry_items (id, organization_id, name, category, position)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), organizationId, name, category, index]
          )
        }
        for (const [index, name] of DEFAULT_SERVICES.entries()) {
          await this.db.query(
            `INSERT INTO laundry_services (id, organization_id, name, position)
             VALUES ($1, $2, $3, $4)`,
            [randomUUID(), organizationId, name, index]
          )
        }
        return true
      })
      // Added here or by the request that won: either way they are there now.
      void seeded
      items = await readItems()
      services = await readServices()
    }
    const prices = await this.db.query<Row>(
      `SELECT item_id, service_id, price FROM laundry_prices WHERE organization_id = $1`,
      [organizationId]
    )
    return {
      items: items.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        category: text(row.category),
        active: row.active !== false,
      })),
      services: services.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        active: row.active !== false,
      })),
      prices: Object.fromEntries(
        prices.rows.map((row) => [`${row.item_id}:${row.service_id}`, money(row.price)])
      ),
    }
  }

  async saveItem(
    organizationId: string,
    id: string | null,
    input: { name: string; category?: string | null; active?: boolean }
  ) {
    if (id) {
      const updated = await this.db.query(
        `UPDATE laundry_items SET name = $3, category = $4, active = $5
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, input.name, input.category ?? null, input.active !== false]
      )
      if (!updated.rowCount) throw notFound()
    } else {
      await this.db.query(
        `INSERT INTO laundry_items (id, organization_id, name, category, position)
         VALUES ($1, $2, $3, $4,
                 (SELECT COALESCE(MAX(position), 0) + 1 FROM laundry_items WHERE organization_id = $2))`,
        [randomUUID(), organizationId, input.name, input.category ?? null]
      )
    }
    return this.getCatalog(organizationId)
  }

  async saveService(
    organizationId: string,
    id: string | null,
    input: { name: string; active?: boolean }
  ) {
    if (id) {
      const updated = await this.db.query(
        `UPDATE laundry_services SET name = $3, active = $4 WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, input.name, input.active !== false]
      )
      if (!updated.rowCount) throw notFound()
    } else {
      await this.db.query(
        `INSERT INTO laundry_services (id, organization_id, name, position)
         VALUES ($1, $2, $3,
                 (SELECT COALESCE(MAX(position), 0) + 1 FROM laundry_services WHERE organization_id = $2))`,
        [randomUUID(), organizationId, input.name]
      )
    }
    return this.getCatalog(organizationId)
  }

  // Deletes a piece or a service and its prices. Past orders keep their own copy of the names, so
  // nothing already taken in changes.
  async deleteItem(organizationId: string, id: string) {
    await this.db.withTransaction(async () => {
      const removed = await this.db.query(
        `DELETE FROM laundry_items WHERE organization_id = $1 AND id = $2`,
        [organizationId, id]
      )
      if (!removed.rowCount) throw notFound()
      await this.db.query(
        `DELETE FROM laundry_prices WHERE organization_id = $1 AND item_id = $2`,
        [organizationId, id]
      )
    })
    return this.getCatalog(organizationId)
  }

  async deleteService(organizationId: string, id: string) {
    await this.db.withTransaction(async () => {
      const removed = await this.db.query(
        `DELETE FROM laundry_services WHERE organization_id = $1 AND id = $2`,
        [organizationId, id]
      )
      if (!removed.rowCount) throw notFound()
      await this.db.query(
        `DELETE FROM laundry_prices WHERE organization_id = $1 AND service_id = $2`,
        [organizationId, id]
      )
    })
    return this.getCatalog(organizationId)
  }

  // Sets prices in the grid; a null price takes the item off that service.
  async setPrices(
    organizationId: string,
    entries: Array<{ itemId: string; serviceId: string; price: number | null }>
  ) {
    await this.db.withTransaction(async () => {
      for (const entry of entries) {
        if (entry.price === null) {
          await this.db.query(
            `DELETE FROM laundry_prices WHERE organization_id = $1 AND item_id = $2 AND service_id = $3`,
            [organizationId, entry.itemId, entry.serviceId]
          )
        } else {
          await this.db.query(
            `INSERT INTO laundry_prices (organization_id, item_id, service_id, price)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (organization_id, item_id, service_id) DO UPDATE SET price = $4`,
            [organizationId, entry.itemId, entry.serviceId, entry.price]
          )
        }
      }
    })
    return this.getCatalog(organizationId)
  }

  // ---- Customers ----

  // The customer an order is for: the one chosen, else the one with this phone, else a new one.
  private async resolveCustomer(
    organizationId: string,
    workspaceId: string | null,
    input: {
      customerId?: string | null
      customerName?: string | null
      customerPhone?: string | null
    },
    actorUserId: string | null
  ): Promise<{ id: string | null; name: string | null; phone: string | null }> {
    if (input.customerId) {
      const found = await this.customers.getById(organizationId, input.customerId)
      if (!found) throw refuse("LAUNDRY_CUSTOMER_NOT_FOUND", "Customer not found.", 404)
      return { id: found.id, name: found.name, phone: found.phone ?? null }
    }
    const phone = input.customerPhone?.trim() || null
    const name = input.customerName?.trim() || null
    if (phone && digits(phone).length >= 9) {
      const rows = await this.db.query<Row>(
        `SELECT id, name, phone FROM customers
          WHERE organization_id = $1 AND deleted_at IS NULL AND phone IS NOT NULL`,
        [organizationId]
      )
      const match = rows.rows.find((row) => digits(String(row.phone)) === digits(phone))
      if (match)
        return { id: String(match.id), name: String(match.name), phone: String(match.phone) }
    }
    if (!phone && !name) return { id: null, name: null, phone: null }
    const created = await this.customers.create({
      organizationId,
      workspaceId,
      createdBy: actorUserId,
      name: name ?? phone ?? "عميل",
      email: null,
      phone,
      notes: null,
      region: null,
      isBusinessCustomer: false,
      vatNumber: null,
      commercialRegistration: null,
      buildingNumber: null,
      secondaryNumber: null,
      street: null,
      city: null,
      district: null,
      postalCode: null,
      countryCode: null,
    })
    return { id: created.id, name: created.name, phone: created.phone ?? null }
  }

  // The customer's subscription that still has pieces and has not ended.
  private async activeSubscription(organizationId: string, customerId: string) {
    const rows = await this.db.query<Row>(
      `SELECT * FROM laundry_subscriptions
        WHERE organization_id = $1 AND customer_id = $2 AND ends_at > now()
          AND pieces_used < pieces_total
        ORDER BY ends_at ASC LIMIT 1`,
      [organizationId, customerId]
    )
    return rows.rows[0] ?? null
  }

  // ---- Orders ----

  // Each line with its item, service and price from the list (refused when one has no price).
  private async priceLines<T extends { itemId: string; serviceId: string; quantity: number }>(
    organizationId: string,
    lines: T[]
  ) {
    if (lines.length === 0) {
      throw refuse("LAUNDRY_ORDER_EMPTY", "Add at least one piece.", 400)
    }
    const catalog = await this.getCatalog(organizationId)
    const itemById = new Map(catalog.items.map((item) => [item.id, item]))
    const serviceById = new Map(catalog.services.map((service) => [service.id, service]))
    return lines.map((line, position) => {
      const item = itemById.get(line.itemId)
      const service = serviceById.get(line.serviceId)
      const price = catalog.prices[`${line.itemId}:${line.serviceId}`]
      if (!item || !service || price === undefined) {
        throw refuse("LAUNDRY_PRICE_MISSING", "This item has no price for that service.", 400)
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw refuse("LAUNDRY_QUANTITY_INVALID", "Quantity must be a whole number.", 400)
      }
      return { line, item, service, price, position }
    })
  }

  // The order's money: subscription pieces off first (line by line), then the urgent charge and
  // delivery on what is left. The same sums for a quote and for the saved order.
  private totals<L extends { line: { quantity: number }; price: number }>(
    priced: L[],
    piecesAvailable: number,
    settings: LaundrySettings,
    urgent: boolean,
    fulfilment: "pickup" | "delivery"
  ) {
    let piecesLeft = piecesAvailable
    const lines = priced.map((entry) => {
      const covered = Math.min(piecesLeft, entry.line.quantity)
      piecesLeft -= covered
      return { ...entry, covered, lineTotal: money(entry.price * (entry.line.quantity - covered)) }
    })
    const covered = lines.reduce((sum, line) => sum + line.covered, 0)
    const pieces = lines.reduce((sum, line) => sum + line.line.quantity, 0)
    const itemsTotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0))
    const urgentFee = urgent ? money((itemsTotal * settings.urgentSurchargePercent) / 100) : 0
    const deliveryFee = fulfilment === "delivery" ? settings.deliveryFee : 0
    const total = money(itemsTotal + urgentFee + deliveryFee)
    return { lines, covered, pieces, itemsTotal, urgentFee, deliveryFee, total }
  }

  // The customer by id or by mobile, without making one (a quote saves nothing).
  private async findCustomer(
    organizationId: string,
    input: { customerId?: string | null; customerPhone?: string | null }
  ): Promise<{ id: string; name: string; phone: string | null } | null> {
    if (input.customerId) {
      const found = await this.customers.getById(organizationId, input.customerId)
      return found ? { id: found.id, name: found.name, phone: found.phone ?? null } : null
    }
    const phone = input.customerPhone?.trim()
    if (!phone || digits(phone).length < 9) return null
    const rows = await this.db.query<Row>(
      `SELECT id, name, phone FROM customers
        WHERE organization_id = $1 AND deleted_at IS NULL AND phone IS NOT NULL`,
      [organizationId]
    )
    const match = rows.rows.find((row) => digits(String(row.phone)) === digits(phone))
    return match
      ? { id: String(match.id), name: String(match.name), phone: String(match.phone) }
      : null
  }

  async quote(organizationId: string, input: LaundryQuoteInput): Promise<LaundryQuote> {
    const settings = await this.getSettings(organizationId)
    const priced = await this.priceLines(organizationId, input.lines)
    const customer = await this.findCustomer(organizationId, input)
    const subscription =
      input.useSubscription && customer
        ? await this.activeSubscription(organizationId, customer.id)
        : null
    const piecesLeft = subscription
      ? Number(subscription.pieces_total) - Number(subscription.pieces_used)
      : 0
    const sums = this.totals(priced, piecesLeft, settings, input.urgent, input.fulfilment)
    return {
      customer,
      subscription: subscription
        ? {
            planName: String(subscription.plan_name),
            piecesLeft,
            endsAt: iso(subscription.ends_at) as string,
          }
        : null,
      pieces: sums.pieces,
      covered: sums.covered,
      itemsTotal: sums.itemsTotal,
      urgentFee: sums.urgentFee,
      deliveryFee: sums.deliveryFee,
      total: sums.total,
    }
  }

  async createOrder(
    organizationId: string,
    input: CreateLaundryOrderInput,
    actorUserId: string | null
  ): Promise<LaundryOrderDetail> {
    const settings = await this.getSettings(organizationId)
    const priced = await this.priceLines(organizationId, input.lines)
    // A deposit lands on the customer's account, so it needs one (found or made by mobile).
    if (input.payment.mode === "deposit" && !input.customerPhone && !input.customerId) {
      throw refuse("LAUNDRY_CUSTOMER_REQUIRED", "A deposit needs the customer's mobile.", 400)
    }

    return this.db.withTransaction(async () => {
      const customer = await this.resolveCustomer(
        organizationId,
        input.workspaceId,
        input,
        actorUserId
      )
      // Pieces off the customer's subscription first, line by line.
      const subscription =
        input.useSubscription && customer.id
          ? await this.activeSubscription(organizationId, customer.id)
          : null
      const piecesLeft = subscription
        ? Number(subscription.pieces_total) - Number(subscription.pieces_used)
        : 0
      const { lines, covered, pieces, itemsTotal, urgentFee, deliveryFee, total } = this.totals(
        priced,
        piecesLeft,
        settings,
        input.urgent,
        input.fulfilment
      )

      const counter = await this.db.query<{ next_number: number }>(
        `INSERT INTO laundry_order_counters (organization_id, next_number) VALUES ($1, 1)
         ON CONFLICT (organization_id)
         DO UPDATE SET next_number = laundry_order_counters.next_number + 1
         RETURNING next_number`,
        [organizationId]
      )
      const orderNumber = `LND-${String(counter.rows[0].next_number).padStart(6, "0")}`
      const hours = input.urgent ? settings.urgentTurnaroundHours : settings.turnaroundHours
      const promisedAt = input.promisedAt
        ? new Date(input.promisedAt).toISOString()
        : new Date(Date.now() + hours * 3_600_000).toISOString()
      const id = randomUUID()
      await this.db.query(
        `INSERT INTO laundry_orders
           (id, organization_id, workspace_id, order_number, customer_id, customer_name,
            customer_phone, status, urgent, pieces, items_total, urgent_fee, delivery_fee, total,
            fulfilment, pickup_address, delivery_address, pickup_at, delivery_at, driver_user_id,
            subscription_id, notes, promised_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          id,
          organizationId,
          input.workspaceId,
          orderNumber,
          customer.id,
          customer.name,
          customer.phone,
          input.urgent,
          pieces,
          itemsTotal,
          urgentFee,
          deliveryFee,
          total,
          input.fulfilment,
          input.pickupAddress ?? null,
          input.deliveryAddress ?? null,
          input.pickupAt ?? null,
          input.deliveryAt ?? null,
          input.driverUserId ?? null,
          subscription && covered > 0 ? subscription.id : null,
          input.notes ?? null,
          promisedAt,
          actorUserId,
        ]
      )
      for (const line of lines) {
        await this.db.query(
          `INSERT INTO laundry_order_lines
             (id, order_id, item_id, service_id, item_name, service_name, quantity, unit_price,
              covered_quantity, line_total, note, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            randomUUID(),
            id,
            line.item.id,
            line.service.id,
            line.item.name,
            line.service.name,
            line.line.quantity,
            line.price,
            line.covered,
            line.lineTotal,
            line.line.note ?? null,
            line.position,
          ]
        )
      }
      if (subscription && covered > 0) {
        await this.db.query(
          `UPDATE laundry_subscriptions SET pieces_used = pieces_used + $2 WHERE id = $1`,
          [subscription.id, covered]
        )
      }
      await this.event(id, "created", { pieces, total, covered }, actorUserId)

      // The money at drop-off.
      const payment = input.payment
      if (payment.mode === "full" && total > 0) {
        await this.issueInvoice(
          organizationId,
          id,
          payment.paymentMethodCode ?? null,
          actorUserId,
          payment.payments
        )
      } else if (payment.mode === "deposit" && total > 0) {
        const amount = money(Math.min(payment.amount ?? 0, total))
        if (amount <= 0 || !payment.paymentMethodCode || !customer.id) {
          throw refuse("LAUNDRY_DEPOSIT_INVALID", "Enter the deposit and how it was paid.", 400)
        }
        await this.customers.createAccountTransaction(
          organizationId,
          input.workspaceId,
          customer.id,
          "receipt",
          amount,
          false,
          0,
          payment.paymentMethodCode,
          `عربون طلب مغسلة ${orderNumber}`,
          [],
          actorUserId
        )
        await this.db.query(`UPDATE laundry_orders SET deposit_amount = $2 WHERE id = $1`, [
          id,
          amount,
        ])
        await this.event(id, "deposit", { amount, method: payment.paymentMethodCode }, actorUserId)
      }
      return this.getOrder(organizationId, id)
    })
  }

  // The order's tax invoice, once: its lines at their price before tax (when the list includes
  // tax), the urgent charge and delivery as lines of their own. A deposit on the customer's
  // account pays first, the rest by the method given -- or by the split the cashier entered, its
  // last method taking whatever halala the tax rounding leaves.
  private async issueInvoice(
    organizationId: string,
    orderId: string,
    methodCode: string | null,
    actorUserId: string | null,
    splits?: LaundryPaymentSplit[]
  ) {
    const split = (splits ?? []).filter((entry) => entry.amount > 0)
    const paymentMethodCode =
      split.length > 0 ? split[split.length - 1].paymentMethodCode : methodCode
    const order = await this.orderRow(organizationId, orderId)
    if (order.invoice_id) return
    const total = money(order.total)
    if (total <= 0) return
    const lines = await this.db.query<Row>(
      `SELECT * FROM laundry_order_lines WHERE order_id = $1 ORDER BY position`,
      [orderId]
    )
    const settings = await this.getSettings(organizationId)
    const organization = await this.db.query<Row>(
      `SELECT settings FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const raw = organization.rows[0]?.settings
    const orgSettings = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as Row
    const rate =
      orgSettings.taxAutoApplyToProducts === false
        ? 0
        : await this.taxRates.getDefaultRatePercent(organizationId)
    const net = (price: number) => (settings.pricesIncludeTax ? price / (1 + rate) : price)
    const items = [
      ...lines.rows
        .filter((line) => Number(line.quantity) - Number(line.covered_quantity) > 0)
        .map((line) => ({
          productId: null,
          variantId: null,
          productName: `${line.item_name} - ${line.service_name}`.slice(0, 200),
          unitPrice: net(Number(line.unit_price)),
          quantity: Number(line.quantity) - Number(line.covered_quantity),
          discountAmount: 0,
        })),
      ...(money(order.urgent_fee) > 0
        ? [
            {
              productId: null,
              variantId: null,
              productName: "رسوم الاستعجال",
              unitPrice: net(money(order.urgent_fee)),
              quantity: 1,
              discountAmount: 0,
            },
          ]
        : []),
      ...(money(order.delivery_fee) > 0
        ? [
            {
              productId: null,
              variantId: null,
              productName: "رسوم التوصيل",
              unitPrice: net(money(order.delivery_fee)),
              quantity: 1,
              discountAmount: 0,
            },
          ]
        : []),
    ]
    const deposit = money(order.deposit_amount)
    const workspaceId = order.workspace_id
      ? String(order.workspace_id)
      : await this.firstBranch(organizationId)
    const invoice = await this.invoices.createForApp(
      {
        organizationId,
        workspaceId,
        cashierUserId: actorUserId,
        customerName: text(order.customer_name),
        customerPhone: text(order.customer_phone),
        customerId: text(order.customer_id),
        payments: [
          ...(deposit > 0 && order.customer_id
            ? [{ paymentMethodCode: "customer_wallet", amount: deposit }]
            : []),
          ...split.slice(0, -1).map((entry) => ({
            paymentMethodCode: entry.paymentMethodCode,
            amount: money(entry.amount),
          })),
        ],
        discountAmount: 0,
        notes: `طلب مغسلة ${order.order_number}`,
        notesLines: null,
        items,
        idempotencyKey: null,
      },
      { restMethodCode: paymentMethodCode, allowMethods: ["customer_wallet"] }
    )
    await this.db.query(
      `UPDATE laundry_orders SET invoice_id = $2, invoice_number = $3, updated_at = now()
        WHERE id = $1`,
      [orderId, invoice.id, invoice.invoiceNumber]
    )
    await this.event(
      orderId,
      "invoiced",
      {
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.totalAmount,
        method: split.length > 1 ? "split" : paymentMethodCode,
      },
      actorUserId
    )
  }

  private async firstBranch(organizationId: string): Promise<string | null> {
    const first = await this.db.query<Row>(
      `SELECT id FROM workspaces WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    )
    return first.rows[0] ? String(first.rows[0].id) : null
  }

  private async event(
    orderId: string,
    kind: string,
    detail: Record<string, unknown>,
    actorUserId: string | null
  ) {
    await this.db.query(
      `INSERT INTO laundry_order_events (id, order_id, kind, detail, actor_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [randomUUID(), orderId, kind, JSON.stringify(detail), actorUserId]
    )
  }

  private async orderRow(organizationId: string, id: string): Promise<Row> {
    const row = (
      await this.db.query<Row>(
        `SELECT * FROM laundry_orders WHERE organization_id = $1 AND id = $2`,
        [organizationId, id]
      )
    ).rows[0]
    if (!row) throw notFound()
    return row
  }

  private summary(row: Row, settings: LaundrySettings): LaundryOrderSummary {
    const total = money(row.total)
    const paid = Boolean(row.invoice_id) || total <= 0
    const status = String(row.status) as LaundryStatus
    const promisedAt = iso(row.promised_at)
    const readyAt = iso(row.ready_at)
    const late =
      !!promisedAt &&
      (readyAt
        ? new Date(readyAt).getTime() > new Date(promisedAt).getTime()
        : (status === "received" || status === "processing") &&
          Date.now() > new Date(promisedAt).getTime())
    void settings
    return {
      id: String(row.id),
      orderNumber: String(row.order_number),
      status,
      customerId: text(row.customer_id),
      customerName: text(row.customer_name),
      customerPhone: text(row.customer_phone),
      urgent: row.urgent === true,
      pieces: Number(row.pieces),
      total,
      depositAmount: money(row.deposit_amount),
      due: paid ? 0 : money(total - money(row.deposit_amount)),
      paid,
      invoiceNumber: text(row.invoice_number),
      fulfilment: row.fulfilment === "delivery" ? "delivery" : "pickup",
      pickupAt: iso(row.pickup_at),
      deliveryAt: iso(row.delivery_at),
      driverUserId: text(row.driver_user_id),
      promisedAt,
      readyAt,
      deliveredAt: iso(row.delivered_at),
      readyNotifiedAt: iso(row.ready_notified_at),
      remindedAt: iso(row.reminded_at),
      late,
      createdAt: iso(row.created_at) as string,
    }
  }

  async listOrders(
    organizationId: string,
    filter: {
      status?: LaundryStatus | "open" | "unclaimed" | null
      search?: string | null
      workspaceId?: string | null
      from?: string | null
      to?: string | null
    }
  ): Promise<LaundryOrderSummary[]> {
    const settings = await this.getSettings(organizationId)
    const conditions = ["organization_id = $1"]
    const params: unknown[] = [organizationId]
    const add = (sql: string, value: unknown) => {
      params.push(value)
      conditions.push(sql.replace("?", `$${params.length}`))
    }
    if (filter.status === "open") {
      conditions.push(`status IN ('received', 'processing', 'ready')`)
    } else if (filter.status === "unclaimed") {
      conditions.push(`status = 'ready'`)
      add("ready_at <= ?", new Date(Date.now() - settings.unclaimedDays * 86_400_000).toISOString())
    } else if (filter.status) {
      add("status = ?", filter.status)
    }
    if (filter.workspaceId) add("workspace_id = ?", filter.workspaceId)
    if (filter.from) add("created_at >= ?", filter.from)
    if (filter.to) add("created_at <= ?", filter.to)
    const rows = await this.db.query<Row>(
      `SELECT * FROM laundry_orders WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC LIMIT 1000`,
      params
    )
    const search = filter.search?.trim().toLowerCase()
    return rows.rows
      .filter(
        (row) =>
          !search ||
          String(row.order_number).toLowerCase().includes(search) ||
          String(row.customer_name ?? "")
            .toLowerCase()
            .includes(search) ||
          (digits(search).length >= 3 &&
            digits(String(row.customer_phone ?? "")).includes(digits(search)))
      )
      .map((row) => this.summary(row, settings))
  }

  async getOrder(organizationId: string, id: string): Promise<LaundryOrderDetail> {
    const row = await this.orderRow(organizationId, id)
    const settings = await this.getSettings(organizationId)
    const [lines, photos, events, business] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM laundry_order_lines WHERE order_id = $1 ORDER BY position`,
        [id]
      ),
      this.db.query<Row>(
        `SELECT * FROM laundry_order_photos WHERE order_id = $1 ORDER BY created_at`,
        [id]
      ),
      this.db.query<Row>(
        `SELECT * FROM laundry_order_events WHERE order_id = $1 ORDER BY created_at`,
        [id]
      ),
      this.db.query<Row>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]),
    ])
    const summary = this.summary(row, settings)
    const businessName = String(business.rows[0]?.name ?? "")
    const to = summary.customerPhone ? toWhatsAppNumber(summary.customerPhone) : null
    const name = summary.customerName ?? ""
    const dueLine = summary.due > 0 ? `\nالمبلغ المتبقي: ${summary.due.toFixed(2)} ر.س` : ""
    const readyText = `مرحباً ${name}،\nطلبك رقم ${summary.orderNumber} لدى ${businessName} جاهز للاستلام (${summary.pieces} قطعة).${dueLine}\nبانتظارك.`
    const daysReady = summary.readyAt
      ? Math.max(1, Math.floor((Date.now() - new Date(summary.readyAt).getTime()) / 86_400_000))
      : 0
    const reminderText = `مرحباً ${name}،\nنذكّرك بأن طلبك رقم ${summary.orderNumber} لدى ${businessName} جاهز منذ ${daysReady} يوم وبانتظار استلامه.${dueLine}`
    return {
      ...summary,
      workspaceId: text(row.workspace_id),
      itemsTotal: money(row.items_total),
      urgentFee: money(row.urgent_fee),
      deliveryFee: money(row.delivery_fee),
      invoiceId: text(row.invoice_id),
      pickupAddress: text(row.pickup_address),
      deliveryAddress: text(row.delivery_address),
      notes: text(row.notes),
      subscriptionId: text(row.subscription_id),
      lines: lines.rows.map((line) => ({
        id: String(line.id),
        itemName: String(line.item_name),
        serviceName: String(line.service_name),
        quantity: Number(line.quantity),
        coveredQuantity: Number(line.covered_quantity),
        unitPrice: money(line.unit_price),
        lineTotal: money(line.line_total),
        note: text(line.note),
      })),
      photos: photos.rows.map((photo) => ({
        id: String(photo.id),
        url: String(photo.url),
        note: text(photo.note),
        createdAt: iso(photo.created_at) as string,
      })),
      events: events.rows.map((event) => ({
        kind: String(event.kind),
        detail: (typeof event.detail === "string"
          ? JSON.parse(event.detail)
          : (event.detail ?? {})) as Record<string, unknown>,
        createdAt: iso(event.created_at) as string,
      })),
      whatsapp: {
        readyUrl: to ? `https://wa.me/${to}?text=${encodeURIComponent(readyText)}` : null,
        reminderUrl: to ? `https://wa.me/${to}?text=${encodeURIComponent(reminderText)}` : null,
      },
    }
  }

  // Moves an order on. "ready" stamps when it was ready and, when the business wants it, sends
  // the customer the WhatsApp message on its own. Collecting (delivered) goes through collect()
  // so the money is settled first.
  async setStatus(
    organizationId: string,
    id: string,
    status: "received" | "processing" | "ready",
    actorUserId: string | null
  ): Promise<LaundryOrderDetail & { messageSent?: string }> {
    const row = await this.orderRow(organizationId, id)
    if (row.status === "delivered" || row.status === "cancelled") {
      throw refuse("LAUNDRY_ORDER_CLOSED", "This order is already closed.")
    }
    await this.db.query(
      `UPDATE laundry_orders SET status = $3, updated_at = now(),
              ready_at = CASE WHEN $4 THEN COALESCE(ready_at, now()) ELSE NULL END
        WHERE organization_id = $1 AND id = $2`,
      // A separate flag: Postgres refuses one parameter used as both varchar and text.
      [organizationId, id, status, status === "ready"]
    )
    await this.event(id, "status", { from: row.status, to: status }, actorUserId)
    const order = await this.getOrder(organizationId, id)
    if (status === "ready" && row.status !== "ready") {
      const settings = await this.getSettings(organizationId)
      if (settings.autoReadyMessage && this.messenger && order.customerPhone) {
        const result = await this.messenger
          .send(organizationId, "ready", order)
          .catch(() => "failed" as const)
        if (result === "sent") {
          await this.markNotified(organizationId, id, "ready", actorUserId, "auto")
          return { ...(await this.getOrder(organizationId, id)), messageSent: result }
        }
        return { ...order, messageSent: result }
      }
    }
    return order
  }

  // The customer collects (or the driver delivers): whatever is owed is invoiced and paid now.
  async collect(
    organizationId: string,
    id: string,
    paymentMethodCode: string | null,
    actorUserId: string | null,
    splits?: LaundryPaymentSplit[]
  ): Promise<LaundryOrderDetail> {
    const row = await this.orderRow(organizationId, id)
    if (row.status === "delivered") return this.getOrder(organizationId, id)
    if (row.status === "cancelled")
      throw refuse("LAUNDRY_ORDER_CLOSED", "This order was cancelled.")
    return this.db.withTransaction(async () => {
      if (!row.invoice_id && money(row.total) > 0) {
        await this.issueInvoice(organizationId, id, paymentMethodCode, actorUserId, splits)
      }
      await this.db.query(
        `UPDATE laundry_orders SET status = 'delivered', delivered_at = now(),
                ready_at = COALESCE(ready_at, now()), updated_at = now()
          WHERE id = $1`,
        [id]
      )
      await this.event(id, "delivered", { method: paymentMethodCode }, actorUserId)
      return this.getOrder(organizationId, id)
    })
  }

  // Cancels an order not yet invoiced: its subscription pieces go back; a deposit stays on the
  // customer's account (to refund or use later).
  async cancel(organizationId: string, id: string, actorUserId: string | null) {
    const row = await this.orderRow(organizationId, id)
    if (row.status === "delivered" || row.status === "cancelled") {
      throw refuse("LAUNDRY_ORDER_CLOSED", "This order is already closed.")
    }
    if (row.invoice_id) {
      throw refuse(
        "LAUNDRY_ORDER_INVOICED",
        "This order is already invoiced: return its invoice from the invoices page."
      )
    }
    await this.db.withTransaction(async () => {
      if (row.subscription_id) {
        const covered = await this.db.query<{ covered: string | number }>(
          `SELECT COALESCE(SUM(covered_quantity), 0) AS covered FROM laundry_order_lines WHERE order_id = $1`,
          [id]
        )
        await this.db.query(
          `UPDATE laundry_subscriptions SET pieces_used = GREATEST(0, pieces_used - $2) WHERE id = $1`,
          [row.subscription_id, Number(covered.rows[0]?.covered ?? 0)]
        )
      }
      await this.db.query(
        `UPDATE laundry_orders SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [id]
      )
      await this.event(id, "cancelled", {}, actorUserId)
    })
    return this.getOrder(organizationId, id)
  }

  async updateDelivery(
    organizationId: string,
    id: string,
    patch: {
      fulfilment?: "pickup" | "delivery"
      pickupAddress?: string | null
      deliveryAddress?: string | null
      pickupAt?: string | null
      deliveryAt?: string | null
      driverUserId?: string | null
      promisedAt?: string | null
      notes?: string | null
    },
    actorUserId: string | null
  ) {
    const row = await this.orderRow(organizationId, id)
    const value = <K extends keyof typeof patch>(key: K, column: string) =>
      patch[key] !== undefined ? patch[key] : row[column]
    await this.db.query(
      `UPDATE laundry_orders SET fulfilment = $3, pickup_address = $4, delivery_address = $5,
              pickup_at = $6, delivery_at = $7, driver_user_id = $8, promised_at = $9, notes = $10,
              updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        value("fulfilment", "fulfilment"),
        value("pickupAddress", "pickup_address"),
        value("deliveryAddress", "delivery_address"),
        value("pickupAt", "pickup_at"),
        value("deliveryAt", "delivery_at"),
        value("driverUserId", "driver_user_id"),
        value("promisedAt", "promised_at"),
        value("notes", "notes"),
      ]
    )
    await this.event(id, "updated", { fields: Object.keys(patch) }, actorUserId)
    return this.getOrder(organizationId, id)
  }

  async addPhoto(organizationId: string, id: string, url: string, note: string | null) {
    await this.orderRow(organizationId, id)
    await this.db.query(
      `INSERT INTO laundry_order_photos (id, order_id, url, note) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), id, url, note]
    )
    return this.getOrder(organizationId, id)
  }

  async removePhoto(organizationId: string, id: string, photoId: string) {
    await this.orderRow(organizationId, id)
    await this.db.query(`DELETE FROM laundry_order_photos WHERE order_id = $1 AND id = $2`, [
      id,
      photoId,
    ])
    return this.getOrder(organizationId, id)
  }

  // Records that the customer was told (the "ready" message or a reminder), sent on its own or
  // opened by the staff in their WhatsApp.
  async markNotified(
    organizationId: string,
    id: string,
    kind: "ready" | "reminder",
    actorUserId: string | null,
    via: "auto" | "manual" = "manual"
  ) {
    await this.orderRow(organizationId, id)
    await this.db.query(
      kind === "ready"
        ? `UPDATE laundry_orders SET ready_notified_at = now() WHERE id = $1`
        : `UPDATE laundry_orders SET reminded_at = now() WHERE id = $1`,
      [id]
    )
    await this.event(id, kind === "ready" ? "ready_message" : "reminder", { via }, actorUserId)
    return this.getOrder(organizationId, id)
  }

  // Sends a reminder for an unclaimed order on WhatsApp on its own, when the business can.
  async sendReminder(organizationId: string, id: string, actorUserId: string | null) {
    const order = await this.getOrder(organizationId, id)
    if (!this.messenger) return { result: "unavailable" as const, order }
    const result = await this.messenger
      .send(organizationId, "reminder", order)
      .catch(() => "failed" as const)
    if (result === "sent") {
      return {
        result,
        order: await this.markNotified(organizationId, id, "reminder", actorUserId, "auto"),
      }
    }
    return { result, order }
  }

  // ---- Subscriptions ----

  async listPlans(organizationId: string): Promise<LaundryPlan[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM laundry_plans WHERE organization_id = $1 ORDER BY created_at`,
      [organizationId]
    )
    return rows.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      pieces: Number(row.pieces),
      price: money(row.price),
      validDays: Number(row.valid_days),
      active: row.active !== false,
    }))
  }

  async savePlan(
    organizationId: string,
    id: string | null,
    input: { name: string; pieces: number; price: number; validDays: number; active?: boolean }
  ) {
    if (id) {
      const updated = await this.db.query(
        `UPDATE laundry_plans SET name = $3, pieces = $4, price = $5, valid_days = $6, active = $7
          WHERE organization_id = $1 AND id = $2`,
        [
          organizationId,
          id,
          input.name,
          input.pieces,
          input.price,
          input.validDays,
          input.active !== false,
        ]
      )
      if (!updated.rowCount) throw notFound()
    } else {
      await this.db.query(
        `INSERT INTO laundry_plans (id, organization_id, name, pieces, price, valid_days)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), organizationId, input.name, input.pieces, input.price, input.validDays]
      )
    }
    return this.listPlans(organizationId)
  }

  // Sells a plan to a customer: it is a sale (tax invoice now), and its pieces come off the
  // customer's next orders.
  async sellSubscription(
    organizationId: string,
    input: {
      workspaceId: string | null
      planId: string
      customerId?: string | null
      customerName?: string | null
      customerPhone?: string | null
      paymentMethodCode: string
    },
    actorUserId: string | null
  ): Promise<LaundrySubscription> {
    const plan = (await this.listPlans(organizationId)).find((entry) => entry.id === input.planId)
    if (!plan || !plan.active) throw notFound()
    return this.db.withTransaction(async () => {
      const customer = await this.resolveCustomer(
        organizationId,
        input.workspaceId,
        input,
        actorUserId
      )
      if (!customer.id) {
        throw refuse(
          "LAUNDRY_CUSTOMER_REQUIRED",
          "A subscription needs the customer's mobile.",
          400
        )
      }
      const settings = await this.getSettings(organizationId)
      const organization = await this.db.query<Row>(
        `SELECT settings FROM organizations WHERE id = $1`,
        [organizationId]
      )
      const raw = organization.rows[0]?.settings
      const orgSettings = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as Row
      const rate =
        orgSettings.taxAutoApplyToProducts === false
          ? 0
          : await this.taxRates.getDefaultRatePercent(organizationId)
      let invoice: { id: string; invoiceNumber: string } | null = null
      if (plan.price > 0) {
        invoice = await this.invoices.createForApp(
          {
            organizationId,
            workspaceId: input.workspaceId ?? (await this.firstBranch(organizationId)),
            cashierUserId: actorUserId,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerId: customer.id,
            payments: [],
            discountAmount: 0,
            notes: `اشتراك مغسلة: ${plan.name}`,
            notesLines: null,
            items: [
              {
                productId: null,
                variantId: null,
                productName: `اشتراك مغسلة - ${plan.name} (${plan.pieces} قطعة)`.slice(0, 200),
                unitPrice: settings.pricesIncludeTax ? plan.price / (1 + rate) : plan.price,
                quantity: 1,
                discountAmount: 0,
              },
            ],
            idempotencyKey: null,
          },
          { restMethodCode: input.paymentMethodCode }
        )
      }
      const id = randomUUID()
      await this.db.query(
        `INSERT INTO laundry_subscriptions
           (id, organization_id, customer_id, plan_id, plan_name, pieces_total, ends_at,
            invoice_id, invoice_number, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          organizationId,
          customer.id,
          plan.id,
          plan.name,
          plan.pieces,
          new Date(Date.now() + plan.validDays * 86_400_000).toISOString(),
          invoice?.id ?? null,
          invoice?.invoiceNumber ?? null,
          actorUserId,
        ]
      )
      const [created] = await this.listSubscriptions(organizationId, { subscriptionId: id })
      return created
    })
  }

  async listSubscriptions(
    organizationId: string,
    filter: { customerId?: string | null; subscriptionId?: string } = {}
  ): Promise<LaundrySubscription[]> {
    const conditions = ["s.organization_id = $1"]
    const params: unknown[] = [organizationId]
    if (filter.customerId) {
      params.push(filter.customerId)
      conditions.push(`s.customer_id = $${params.length}`)
    }
    if (filter.subscriptionId) {
      params.push(filter.subscriptionId)
      conditions.push(`s.id = $${params.length}`)
    }
    const rows = await this.db.query<Row>(
      `SELECT s.*, c.name AS customer_name FROM laundry_subscriptions s
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY s.created_at DESC LIMIT 500`,
      params
    )
    return rows.rows.map((row) => {
      const total = Number(row.pieces_total)
      const used = Number(row.pieces_used)
      const endsAt = iso(row.ends_at) as string
      return {
        id: String(row.id),
        customerId: String(row.customer_id),
        customerName: text(row.customer_name),
        planName: String(row.plan_name),
        piecesTotal: total,
        piecesUsed: used,
        piecesLeft: Math.max(0, total - used),
        startsAt: iso(row.starts_at) as string,
        endsAt,
        active: new Date(endsAt).getTime() > Date.now() && used < total,
        invoiceNumber: text(row.invoice_number),
      }
    })
  }

  // ---- Reports ----

  async report(
    organizationId: string,
    range: { from: string; to: string; workspaceId?: string | null }
  ) {
    const params: unknown[] = [organizationId, range.from, range.to]
    let branch = ""
    if (range.workspaceId) {
      params.push(range.workspaceId)
      branch = ` AND workspace_id = $4`
    }
    const orders = (
      await this.db.query<Row>(
        `SELECT * FROM laundry_orders
          WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3${branch}`,
        params
      )
    ).rows.filter((row) => row.status !== "cancelled")
    const ids = orders.map((row) => String(row.id))
    const lines = ids.length
      ? (
          await this.db.query<Row>(
            `SELECT item_name, service_name, quantity FROM laundry_order_lines
              WHERE order_id IN (${ids.map((_, index) => `$${index + 1}`).join(", ")})`,
            ids
          )
        ).rows
      : []
    const settings = await this.getSettings(organizationId)
    const byService = new Map<string, number>()
    const byItem = new Map<string, number>()
    for (const line of lines) {
      byService.set(
        String(line.service_name),
        (byService.get(String(line.service_name)) ?? 0) + Number(line.quantity)
      )
      byItem.set(
        String(line.item_name),
        (byItem.get(String(line.item_name)) ?? 0) + Number(line.quantity)
      )
    }
    const byDay = new Map<string, { orders: number; pieces: number }>()
    for (const row of orders) {
      const day = new Date(String(row.created_at)).toISOString().slice(0, 10)
      const entry = byDay.get(day) ?? { orders: 0, pieces: 0 }
      byDay.set(day, { orders: entry.orders + 1, pieces: entry.pieces + Number(row.pieces) })
    }
    const finished = orders.filter((row) => row.ready_at && row.promised_at)
    const onTime = finished.filter(
      (row) =>
        new Date(String(row.ready_at)).getTime() <= new Date(String(row.promised_at)).getTime()
    ).length
    const turnaround = finished.map(
      (row) =>
        (new Date(String(row.ready_at)).getTime() - new Date(String(row.created_at)).getTime()) /
        3_600_000
    )
    const unclaimedBefore = Date.now() - settings.unclaimedDays * 86_400_000
    const subscriptions = await this.db.query<Row>(
      `SELECT COUNT(*) AS count FROM laundry_subscriptions
        WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [organizationId, range.from, range.to]
    )
    const sorted = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, pieces]) => ({ name, pieces }))
    return {
      orders: orders.length,
      pieces: orders.reduce((sum, row) => sum + Number(row.pieces), 0),
      revenue: money(orders.reduce((sum, row) => sum + money(row.total), 0)),
      collected: money(
        orders.filter((row) => row.invoice_id).reduce((sum, row) => sum + money(row.total), 0)
      ),
      outstanding: money(
        orders
          .filter((row) => !row.invoice_id)
          .reduce((sum, row) => sum + money(row.total) - money(row.deposit_amount), 0)
      ),
      urgentOrders: orders.filter((row) => row.urgent === true).length,
      deliveryOrders: orders.filter((row) => row.fulfilment === "delivery").length,
      onTime,
      late: finished.length - onTime,
      averageTurnaroundHours: turnaround.length
        ? Math.round((turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length) * 10) /
          10
        : null,
      readyNotCollected: orders.filter((row) => row.status === "ready").length,
      unclaimed: orders.filter(
        (row) =>
          row.status === "ready" &&
          row.ready_at &&
          new Date(String(row.ready_at)).getTime() <= unclaimedBefore
      ).length,
      subscriptionsSold: Number(subscriptions.rows[0]?.count ?? 0),
      byService: sorted(byService),
      byItem: sorted(byItem).slice(0, 10),
      byDay: [...byDay.entries()].sort().map(([day, entry]) => ({ day, ...entry })),
    }
  }
}
