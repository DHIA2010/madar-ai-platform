import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { IntegrationProviderOrderDetail } from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { SallaOAuthRepository } from "../salla-oauth/repository"
import type { TaxRatesService } from "../tax/tax-rates-service"
import { SallaOrderPushService } from "./salla-order-push-service"

const MADAR_ORDER_ERRORS = {
  notFound: () => new IdentityError("MADAR_ORDER_NOT_FOUND", 404, "business", "Order not found."),
  noWorkspace: () =>
    new IdentityError(
      "MADAR_ORDER_NO_WORKSPACE",
      400,
      "validation",
      "A branch must be selected before creating an order."
    ),
  refundedOrdersNotPushed: () =>
    new IdentityError(
      "MADAR_ORDER_REFUNDED_NOT_PUSHABLE",
      409,
      "business",
      "A refunded order can't be pushed to Salla -- there is no matching payment status on their side."
    ),
  noSallaConnection: () =>
    new IdentityError(
      "MADAR_ORDER_NO_SALLA_CONNECTION",
      409,
      "business",
      "No connected Salla store was found to push this order to."
    ),
}

// IntegrationProviderError.message alone is a static, generic string ("Salla rejected the order
// payload.") -- the actually useful diagnostic (which field, why) only ever lives in .details,
// Salla's own parsed response body. Surfacing it here is what makes a failed push's error_message
// column self-diagnosable from the DB/UI instead of requiring a one-off repro against Salla's API
// to find out what was actually wrong.
function describePushError(error: unknown): string {
  if (!(error instanceof IntegrationProviderError)) {
    return error instanceof Error ? error.message : "The push to Salla failed."
  }
  const details = error.details as { error?: { fields?: Record<string, string[]> } } | undefined
  const fields = details?.error?.fields
  if (fields && Object.keys(fields).length > 0) {
    const summary = Object.entries(fields)
      .map(([field, messages]) => `${field}: ${messages.join("; ")}`)
      .join(" | ")
    return `${error.message} (${summary})`.slice(0, 2000)
  }
  return error.message
}

export interface MadarOrderItemInput {
  productId: string | null
  productName: string
  sku: string | null
  unitPrice: number
  quantity: number
  discountAmount?: number
  costPrice?: number | null
  weight?: number | null
}

export interface MadarOrderReceiverInput {
  name: string
  phone: string
  countryCode: string
  email: string | null
  notify: boolean
}

export interface MadarOrderShipToInput {
  country: string
  city: string
  district?: string | null
  address?: string | null
  postalCode?: string | null
}

export interface CreateMadarOrderInput {
  organizationId: string
  workspaceId: string | null
  createdByUserId: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  customerId: string | null
  isGuestCustomer: boolean
  paymentStatus: "paid" | "pending"
  paymentMethodCode: string
  receiver: MadarOrderReceiverInput
  deliveryMethod: "shipping" | "pickup" | null
  shipTo: MadarOrderShipToInput | null
  courierId: string | null
  shippingCost: number
  discountCode: string | null
  discountAmount: number
  shippingDiscountAmount: number
  notes: string | null
  items: MadarOrderItemInput[]
}

export type MadarOrderPushStatus = "not_applicable" | "pending" | "pushed" | "failed"

export interface MadarOrderItemView extends Omit<MadarOrderItemInput, "discountAmount"> {
  id: string
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

export interface MadarOrderView {
  id: string
  organizationId: string
  workspaceId: string
  orderNumber: string
  status: "processing" | "completed" | "cancelled" | "refunded"
  paymentStatus: "paid" | "pending" | "refunded"
  paymentMethodCode: string
  currency: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  customerId: string | null
  isGuestCustomer: boolean
  receiver: MadarOrderReceiverInput
  deliveryMethod: "shipping" | "pickup" | null
  shipTo: MadarOrderShipToInput | null
  courierId: string | null
  shippingCost: number
  discountCode: string | null
  discountAmount: number
  shippingDiscountAmount: number
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  sallaConnectionId: string | null
  sallaPushStatus: MadarOrderPushStatus
  sallaOrderId: string | null
  sallaReferenceId: string | null
  sallaPushErrorCode: string | null
  sallaPushErrorMessage: string | null
  createdAt: string
  items: MadarOrderItemView[]
}

interface MadarOrderRow {
  id: string
  organization_id: string
  workspace_id: string
  order_number: string
  status: string
  payment_status: string
  payment_method_code: string
  currency: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_id: string | null
  is_guest_customer: boolean
  receiver_name: string
  receiver_phone: string
  receiver_country_code: string
  receiver_email: string | null
  receiver_notify: boolean
  delivery_method: string | null
  ship_to_country: string | null
  ship_to_city: string | null
  ship_to_district: string | null
  ship_to_address: string | null
  ship_to_postal_code: string | null
  courier_id: string | null
  shipping_cost: string | number
  discount_code: string | null
  discount_amount: string | number
  shipping_discount_amount: string | number
  subtotal_amount: string | number
  tax_amount: string | number
  total_amount: string | number
  notes: string | null
  salla_connection_id: string | null
  salla_push_status: string
  salla_order_id: string | null
  salla_reference_id: string | null
  salla_push_error_code: string | null
  salla_push_error_message: string | null
  created_at: Date | string
  [key: string]: unknown
}

interface MadarOrderItemRow {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  sku: string | null
  unit_price: string | number
  quantity: string | number
  tax_amount: string | number
  discount_amount: string | number
  line_total: string | number
  cost_price: string | number | null
  weight: string | number | null
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapItem(row: MadarOrderItemRow): MadarOrderItemView {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    discountAmount: Number(row.discount_amount),
    taxAmount: Number(row.tax_amount),
    lineTotal: Number(row.line_total),
    costPrice: row.cost_price === null ? null : Number(row.cost_price),
    weight: row.weight === null ? null : Number(row.weight),
  }
}

function mapOrder(row: MadarOrderRow, items: MadarOrderItemView[]): MadarOrderView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    orderNumber: row.order_number,
    status: row.status as MadarOrderView["status"],
    paymentStatus: row.payment_status as MadarOrderView["paymentStatus"],
    paymentMethodCode: row.payment_method_code,
    currency: row.currency,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerId: row.customer_id,
    isGuestCustomer: row.is_guest_customer,
    receiver: {
      name: row.receiver_name,
      phone: row.receiver_phone,
      countryCode: row.receiver_country_code,
      email: row.receiver_email,
      notify: row.receiver_notify,
    },
    deliveryMethod: row.delivery_method as MadarOrderView["deliveryMethod"],
    shipTo: row.ship_to_country
      ? {
          country: row.ship_to_country,
          city: row.ship_to_city ?? "",
          district: row.ship_to_district,
          address: row.ship_to_address,
          postalCode: row.ship_to_postal_code,
        }
      : null,
    courierId: row.courier_id,
    shippingCost: Number(row.shipping_cost),
    discountCode: row.discount_code,
    discountAmount: Number(row.discount_amount),
    shippingDiscountAmount: Number(row.shipping_discount_amount),
    subtotalAmount: Number(row.subtotal_amount),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
    notes: row.notes,
    sallaConnectionId: row.salla_connection_id,
    sallaPushStatus: row.salla_push_status as MadarOrderPushStatus,
    sallaOrderId: row.salla_order_id,
    sallaReferenceId: row.salla_reference_id,
    sallaPushErrorCode: row.salla_push_error_code,
    sallaPushErrorMessage: row.salla_push_error_message,
    createdAt: toIso(row.created_at),
    items,
  }
}

const ORDER_SELECT = `
  SELECT id, organization_id, workspace_id, order_number, status, payment_status,
         payment_method_code, currency, customer_name, customer_phone, customer_email,
         customer_id, is_guest_customer, receiver_name, receiver_phone, receiver_country_code,
         receiver_email, receiver_notify, delivery_method, ship_to_country, ship_to_city,
         ship_to_district, ship_to_address, ship_to_postal_code, courier_id, shipping_cost,
         discount_code, discount_amount, shipping_discount_amount, subtotal_amount, tax_amount,
         total_amount, notes, salla_connection_id, salla_push_status, salla_order_id,
         salla_reference_id, salla_push_error_code, salla_push_error_message, created_at
    FROM madar_orders
`

export class MadarOrdersService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly taxRatesService: TaxRatesService,
    private readonly sallaOAuthRepository: SallaOAuthRepository,
    private readonly sallaPushService: SallaOrderPushService
  ) {}

  async create(input: CreateMadarOrderInput): Promise<MadarOrderView> {
    if (!input.workspaceId) throw MADAR_ORDER_ERRORS.noWorkspace()

    const defaultTaxRate = await this.taxRatesService.getDefaultRatePercent(input.organizationId)

    const lineComputations = input.items.map((item) => {
      const lineSubtotal = item.unitPrice * item.quantity
      const discount = Math.min(Math.max(0, item.discountAmount ?? 0), lineSubtotal)
      const lineNet = lineSubtotal - discount
      const lineTax = Math.round(lineNet * defaultTaxRate * 100) / 100
      return {
        discount: Math.round(discount * 100) / 100,
        lineTotal: Math.round(lineSubtotal * 100) / 100,
        taxAmount: lineTax,
      }
    })

    const subtotalAmount =
      Math.round(input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) /
      100
    const itemDiscountTotal = lineComputations.reduce((sum, line) => sum + line.discount, 0)
    const taxAmount =
      Math.round(lineComputations.reduce((sum, line) => sum + line.taxAmount, 0) * 100) / 100
    const orderDiscountTotal = Math.round((input.discountAmount + itemDiscountTotal) * 100) / 100
    const totalAmount =
      Math.round(
        (subtotalAmount -
          itemDiscountTotal -
          input.discountAmount +
          taxAmount +
          input.shippingCost -
          input.shippingDiscountAmount) *
          100
      ) / 100

    const connection = await this.sallaOAuthRepository.findActiveConnection(
      input.organizationId,
      input.workspaceId
    )

    const id = randomUUID()
    const externalOrderId = `MADAR-${id}`
    const sallaPushStatus: MadarOrderPushStatus = connection ? "pending" : "not_applicable"

    await this.database.withTransaction(async () => {
      // A per-workspace counter, incremented with a row-locked UPSERT inside this same
      // transaction -- see migration 099_madar_orders.sql's comment for why (same lesson
      // pos_invoices already learned in migration 067: a rollback must revert the counter too).
      const counterResult = await this.database.query<{ next_number: string }>(
        `INSERT INTO madar_order_number_counters (workspace_id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (workspace_id)
         DO UPDATE SET next_number = madar_order_number_counters.next_number + 1
         RETURNING next_number`,
        [input.workspaceId]
      )
      const orderNumber = `MO-${String(counterResult.rows[0].next_number).padStart(6, "0")}`

      await this.database.query(
        `INSERT INTO madar_orders
           (id, organization_id, workspace_id, order_number, payment_status, payment_method_code,
            customer_name, customer_phone, customer_email, customer_id, is_guest_customer,
            receiver_name, receiver_phone, receiver_country_code, receiver_email, receiver_notify,
            delivery_method, ship_to_country, ship_to_city, ship_to_district, ship_to_address,
            ship_to_postal_code, courier_id, shipping_cost, discount_code, discount_amount,
            shipping_discount_amount, subtotal_amount, tax_amount, total_amount, notes,
            created_by_user_id, salla_connection_id, salla_push_status, salla_external_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
                 $35)`,
        [
          id,
          input.organizationId,
          input.workspaceId,
          orderNumber,
          input.paymentStatus,
          input.paymentMethodCode,
          input.customerName,
          input.customerPhone,
          input.customerEmail,
          input.customerId,
          input.isGuestCustomer,
          input.receiver.name,
          input.receiver.phone,
          input.receiver.countryCode,
          input.receiver.email,
          input.receiver.notify,
          input.deliveryMethod,
          input.shipTo?.country ?? null,
          input.shipTo?.city ?? null,
          input.shipTo?.district ?? null,
          input.shipTo?.address ?? null,
          input.shipTo?.postalCode ?? null,
          input.courierId,
          input.shippingCost,
          input.discountCode,
          orderDiscountTotal,
          input.shippingDiscountAmount,
          subtotalAmount,
          taxAmount,
          totalAmount,
          input.notes,
          input.createdByUserId,
          connection?.id ?? null,
          sallaPushStatus,
          externalOrderId,
        ]
      )

      for (const [index, item] of input.items.entries()) {
        await this.database.query(
          `INSERT INTO madar_order_items
             (id, order_id, product_id, product_name, sku, unit_price, quantity, tax_rate,
              tax_amount, discount_amount, line_total, cost_price, weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            randomUUID(),
            id,
            item.productId,
            item.productName,
            item.sku,
            item.unitPrice,
            item.quantity,
            defaultTaxRate,
            lineComputations[index].taxAmount,
            lineComputations[index].discount,
            lineComputations[index].lineTotal,
            item.costPrice ?? null,
            item.weight ?? null,
          ]
        )
      }
    })

    // The local order is already committed at this point -- a push failure (or the entire
    // attempt, if no connection exists) must never undo or block the sale; it only ever updates
    // this same row's own salla_push_status/error_* columns afterwards.
    if (connection) {
      await this.pushToSalla(id).catch(() => {})
    }

    const created = await this.findById(input.organizationId, id)
    if (!created) throw MADAR_ORDER_ERRORS.notFound()
    return created
  }

  async retryPush(actor: AuthenticatedActor, orderId: string): Promise<MadarOrderView> {
    const existing = await this.findById(actor.organizationId, orderId)
    if (!existing) throw MADAR_ORDER_ERRORS.notFound()
    if (existing.status === "refunded") throw MADAR_ORDER_ERRORS.refundedOrdersNotPushed()

    const connection = await this.sallaOAuthRepository.findActiveConnection(
      actor.organizationId,
      existing.workspaceId
    )
    if (!connection) throw MADAR_ORDER_ERRORS.noSallaConnection()

    if (connection.id !== existing.sallaConnectionId) {
      await this.database.query(
        `UPDATE madar_orders SET salla_connection_id = $2, updated_at = now() WHERE id = $1`,
        [orderId, connection.id]
      )
    }

    // Unlike create()'s own best-effort push, a manual retry's whole point is telling the caller
    // whether it actually worked -- so this one rethrows.
    await this.pushToSalla(orderId)

    const updated = await this.findById(actor.organizationId, orderId)
    if (!updated) throw MADAR_ORDER_ERRORS.notFound()
    return updated
  }

  async getDetailView(
    actor: AuthenticatedActor,
    orderId: string
  ): Promise<IntegrationProviderOrderDetail | null> {
    const order = await this.findById(actor.organizationId, orderId)
    if (!order) return null

    return {
      currency: order.currency,
      subTotal: order.subtotalAmount,
      shippingCost: order.shippingCost,
      taxTotal: order.taxAmount,
      discountTotal: order.discountAmount,
      total: order.totalAmount,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discountAmount,
        tax: item.taxAmount,
        total: item.lineTotal,
        thumbnail: null,
      })),
    }
  }

  // Loads the order fresh and attempts the push, writing the outcome back onto the row. Never
  // throws when called from create() (that call site swallows it); retryPush() lets this
  // propagate since a manual retry is meaningless if the caller can't see it failed.
  private async pushToSalla(orderId: string): Promise<void> {
    const result = await this.database.query<MadarOrderRow>(`${ORDER_SELECT} WHERE id = $1`, [
      orderId,
    ])
    const row = result.rows[0]
    if (!row || !row.salla_connection_id) return
    if (row.payment_status === "refunded") return

    const itemRows = await this.database.query<MadarOrderItemRow>(
      `SELECT id, order_id, product_id, product_name, sku, unit_price, quantity, tax_amount,
              discount_amount, line_total, cost_price, weight
         FROM madar_order_items WHERE order_id = $1`,
      [orderId]
    )

    try {
      const pushResult = await this.sallaPushService.pushOrder(row.salla_connection_id, {
        id: row.id,
        currency: row.currency,
        subtotalAmount: Number(row.subtotal_amount),
        taxAmount: Number(row.tax_amount),
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email,
        isGuestCustomer: row.is_guest_customer,
        paymentStatus: row.payment_status as "paid" | "pending" | "refunded",
        paymentMethodCode: row.payment_method_code,
        totalAmount: Number(row.total_amount),
        receiver: {
          name: row.receiver_name,
          phone: row.receiver_phone,
          countryCode: row.receiver_country_code,
          email: row.receiver_email,
          notify: row.receiver_notify,
        },
        deliveryMethod: row.delivery_method as "shipping" | "pickup" | null,
        shipTo: row.ship_to_country
          ? {
              country: row.ship_to_country,
              city: row.ship_to_city ?? "",
              district: row.ship_to_district,
              address: row.ship_to_address,
              postalCode: row.ship_to_postal_code,
            }
          : null,
        courierId: row.courier_id,
        shippingCost: Number(row.shipping_cost),
        discountCode: row.discount_code,
        discountAmount: Number(row.discount_amount),
        shippingDiscountAmount: Number(row.shipping_discount_amount),
        items: itemRows.rows.map((item) => ({
          name: item.product_name,
          sku: item.sku,
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity),
          taxAmount: Number(item.tax_amount),
          discountAmount: Number(item.discount_amount),
          costPrice: item.cost_price === null ? null : Number(item.cost_price),
          weight: item.weight === null ? null : Number(item.weight),
        })),
      })

      await this.database.query(
        `UPDATE madar_orders
            SET salla_push_status = 'pushed', salla_order_id = $2, salla_reference_id = $3,
                salla_push_attempted_at = now(), salla_push_error_code = NULL,
                salla_push_error_message = NULL,
                salla_push_attempt_count = salla_push_attempt_count + 1, updated_at = now()
          WHERE id = $1`,
        [orderId, pushResult.sallaOrderId, pushResult.sallaReferenceId]
      )
    } catch (error) {
      if (error instanceof IntegrationProviderError && error.code === "SALLA_PUSH_DUPLICATE") {
        // Success-reconciliation: Salla already has this order from a previous attempt whose own
        // response we never saw (network blip, etc.) -- no sallaOrderId/referenceId to record,
        // but it no longer needs retrying.
        await this.database.query(
          `UPDATE madar_orders
              SET salla_push_status = 'pushed', salla_push_attempted_at = now(),
                  salla_push_error_code = NULL, salla_push_error_message = NULL,
                  salla_push_attempt_count = salla_push_attempt_count + 1, updated_at = now()
            WHERE id = $1`,
          [orderId]
        )
        return
      }

      const code =
        error instanceof IntegrationProviderError ? error.code : "SALLA_PUSH_UNKNOWN_ERROR"
      const message = describePushError(error)
      await this.database.query(
        `UPDATE madar_orders
            SET salla_push_status = 'failed', salla_push_attempted_at = now(),
                salla_push_error_code = $2, salla_push_error_message = $3,
                salla_push_attempt_count = salla_push_attempt_count + 1, updated_at = now()
          WHERE id = $1`,
        [orderId, code, message]
      )
      throw error
    }
  }

  private async findById(organizationId: string, id: string): Promise<MadarOrderView | null> {
    const result = await this.database.query<MadarOrderRow>(
      `${ORDER_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const row = result.rows[0]
    if (!row) return null

    const itemRows = await this.database.query<MadarOrderItemRow>(
      `SELECT id, order_id, product_id, product_name, sku, unit_price, quantity, tax_amount,
              discount_amount, line_total, cost_price, weight
         FROM madar_order_items WHERE order_id = $1`,
      [id]
    )

    return mapOrder(row, itemRows.rows.map(mapItem))
  }
}
