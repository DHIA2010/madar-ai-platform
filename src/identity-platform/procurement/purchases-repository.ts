import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { nextProcurementCode } from "./code-counter"
import type { PurchaseDto, PurchaseLineItemDto, SavePurchaseInput } from "./types"

function mapPurchase(row: Record<string, unknown>, items: PurchaseLineItemDto[]): PurchaseDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    supplierImageUrl: (row.supplier_image_url as string | null) ?? null,
    warehouseId: String(row.warehouse_id),
    date: toDateString(row.date),
    dueDate: row.due_date ? toDateString(row.due_date) : null,
    deliveryDate: row.delivery_date ? toDateString(row.delivery_date) : null,
    status: row.status as PurchaseDto["status"],
    items,
    orderTaxPercent: Number(row.order_tax_percent),
    discountAmount: Number(row.discount_amount),
    shippingAmount: Number(row.shipping_amount),
    otherCosts: Number(row.other_costs),
    currency: String(row.currency),
    paymentMethod: (row.payment_method as PurchaseDto["paymentMethod"]) ?? null,
    referenceNumber: (row.reference_number as string | null) ?? "",
    note: (row.note as string | null) ?? "",
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

function toDateString(value: unknown): string {
  return new Date(value as string).toISOString().slice(0, 10)
}

function mapLineItem(row: Record<string, unknown>): PurchaseLineItemDto {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku),
    netUnitCost: Number(row.net_unit_cost),
    qty: Number(row.qty),
    discount: Number(row.discount),
    taxPercent: Number(row.tax_percent),
  }
}

export class PurchasesRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<PurchaseDto[]> {
    const headers = await this.db.query<Record<string, unknown>>(
      `SELECT p.*, s.name AS supplier_name, s.image_url AS supplier_image_url
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.organization_id = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
      [organizationId]
    )
    if (headers.rows.length === 0) return []

    // An explicit IN list rather than "= ANY($1::uuid[])" -- the array form is silently
    // unsupported under pg-mem (this codebase's test harness), matching the same workaround
    // catalog-repository.ts's hydrate() already uses.
    const ids = headers.rows.map((row) => String(row.id))
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ")
    const itemRows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM purchase_line_items WHERE purchase_id IN (${placeholders}) ORDER BY position ASC`,
      ids
    )
    const itemsByPurchase = new Map<string, PurchaseLineItemDto[]>()
    for (const row of itemRows.rows) {
      const purchaseId = String(row.purchase_id)
      const list = itemsByPurchase.get(purchaseId) ?? []
      list.push(mapLineItem(row))
      itemsByPurchase.set(purchaseId, list)
    }

    return headers.rows.map((row) => mapPurchase(row, itemsByPurchase.get(String(row.id)) ?? []))
  }

  async findById(organizationId: string, id: string): Promise<PurchaseDto | null> {
    const headerResult = await this.db.query<Record<string, unknown>>(
      `SELECT p.*, s.name AS supplier_name, s.image_url AS supplier_image_url
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.organization_id = $1 AND p.id = $2 AND p.deleted_at IS NULL`,
      [organizationId, id]
    )
    const row = headerResult.rows[0]
    if (!row) return null

    const itemsResult = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM purchase_line_items WHERE purchase_id = $1 ORDER BY position ASC`,
      [id]
    )
    return mapPurchase(row, itemsResult.rows.map(mapLineItem))
  }

  // Creates the purchase + its line items, then -- inside the same transaction -- applies each
  // line's effect on the matching REAL product's stock/cost via a safe, partial SQL UPDATE (never
  // the products module's own full-replace PATCH). See server.ts/purchases-service.ts callers for
  // why this must never re-run on update().
  async create(
    organizationId: string,
    workspaceId: string | null,
    input: SavePurchaseInput
  ): Promise<PurchaseDto> {
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      const code = await nextProcurementCode(this.db, organizationId, "purchase", "#PUR", 4)

      await this.db.query(
        `INSERT INTO purchases (
           id, organization_id, workspace_id, code, supplier_id, warehouse_id, date, due_date,
           delivery_date, status, order_tax_percent, discount_amount, shipping_amount,
           other_costs, currency, payment_method, reference_number, note, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now(), now()
         )`,
        [
          id,
          organizationId,
          workspaceId,
          code,
          input.supplierId,
          input.warehouseId,
          input.date,
          input.dueDate,
          input.deliveryDate,
          input.status,
          input.orderTaxPercent,
          input.discountAmount,
          input.shippingAmount,
          input.otherCosts,
          input.currency,
          input.paymentMethod,
          input.referenceNumber,
          input.note,
        ]
      )

      await this.insertLineItemsAndApplyStock(organizationId, id, input.items)
    })

    const created = await this.findById(organizationId, id)
    if (!created) throw ERRORS.notFound("Purchase")
    return created
  }

  // Full replace of the header + line items (the edit form always submits the whole purchase),
  // same "delete all children, re-insert" convention products' own catalog-repository.ts update()
  // uses. Deliberately does NOT touch product stock/cost -- that side effect applies exactly once,
  // at creation; editing an existing purchase later must never double-count it.
  async update(
    organizationId: string,
    id: string,
    input: SavePurchaseInput
  ): Promise<PurchaseDto | null> {
    let updated = false
    await this.db.withTransaction(async () => {
      const result = await this.db.query(
        `UPDATE purchases SET
           supplier_id = $3, warehouse_id = $4, date = $5, due_date = $6, delivery_date = $7,
           status = $8, order_tax_percent = $9, discount_amount = $10, shipping_amount = $11,
           other_costs = $12, currency = $13, payment_method = $14, reference_number = $15,
           note = $16, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [
          organizationId,
          id,
          input.supplierId,
          input.warehouseId,
          input.date,
          input.dueDate,
          input.deliveryDate,
          input.status,
          input.orderTaxPercent,
          input.discountAmount,
          input.shippingAmount,
          input.otherCosts,
          input.currency,
          input.paymentMethod,
          input.referenceNumber,
          input.note,
        ]
      )
      if (result.rowCount === 0) return
      updated = true

      await this.db.query(`DELETE FROM purchase_line_items WHERE purchase_id = $1`, [id])
      await this.insertLineItems(id, input.items)
    })

    return updated ? this.findById(organizationId, id) : null
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    await this.db.query(
      `UPDATE purchases SET deleted_at = now() WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
  }

  // Shared by create()/update() for the plain insert (no stock effect) -- create() wraps this
  // with insertLineItemsAndApplyStock instead.
  private async insertLineItems(
    purchaseId: string,
    items: SavePurchaseInput["items"]
  ): Promise<void> {
    for (const [index, item] of items.entries()) {
      const product = await this.db.query<{ name: string; sku: string | null }>(
        `SELECT name, sku FROM products WHERE id = $1`,
        [item.productId]
      )
      if (product.rows.length === 0) {
        throw ERRORS.validation({ productId: `Product ${item.productId} not found.` })
      }
      await this.db.query(
        `INSERT INTO purchase_line_items
           (id, purchase_id, product_id, product_name, sku, net_unit_cost, qty, discount, tax_percent, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          purchaseId,
          item.productId,
          product.rows[0].name,
          product.rows[0].sku ?? "",
          item.netUnitCost,
          item.qty,
          item.discount,
          item.taxPercent,
          index,
        ]
      )
    }
  }

  private async insertLineItemsAndApplyStock(
    organizationId: string,
    purchaseId: string,
    items: SavePurchaseInput["items"]
  ): Promise<void> {
    for (const [index, item] of items.entries()) {
      const product = await this.db.query<{ name: string; sku: string | null }>(
        `SELECT name, sku FROM products WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [item.productId, organizationId]
      )
      if (product.rows.length === 0) {
        throw ERRORS.validation({ productId: `Product ${item.productId} not found.` })
      }

      await this.db.query(
        `INSERT INTO purchase_line_items
           (id, purchase_id, product_id, product_name, sku, net_unit_cost, qty, discount, tax_percent, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          purchaseId,
          item.productId,
          product.rows[0].name,
          product.rows[0].sku ?? "",
          item.netUnitCost,
          item.qty,
          item.discount,
          item.taxPercent,
          index,
        ]
      )

      // Safe, partial update -- never the products module's full-replace PATCH. The cost formula
      // is literally (newCost + currentCost) / (newQty + currentStock), as specified, not a true
      // quantity-weighted average. Guards: skip repricing (keep existing cost_price) when the
      // denominator wouldn't be positive (a product already oversold via POS, see migration 079);
      // stock_quantity IS NOT NULL excludes non-stock-tracked product types (bundle/service/
      // digital) from ever being silently flipped into a tracked one.
      await this.db.query(
        `UPDATE products
         SET stock_quantity = stock_quantity + $1,
             cost_price = CASE
               WHEN (cost_price IS NULL OR cost_price != $2) AND ($1 + stock_quantity) > 0
               THEN ($2 + COALESCE(cost_price, 0)) / ($1 + stock_quantity)
               ELSE cost_price
             END,
             updated_at = now()
         WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL AND stock_quantity IS NOT NULL`,
        [item.qty, item.netUnitCost, item.productId, organizationId]
      )
    }
  }
}
