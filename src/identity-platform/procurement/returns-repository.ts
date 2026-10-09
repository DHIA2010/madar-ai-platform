import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { nextProcurementCode } from "./code-counter"
import type {
  CreatePurchaseReturnInput,
  PurchaseReturnDto,
  ReturnLineItemDto,
  ReturnStatus,
} from "./types"

function mapReturnItem(row: Record<string, unknown>): ReturnLineItemDto {
  return {
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku),
    qty: Number(row.qty),
    unitCost: Number(row.unit_cost),
  }
}

function mapReturn(row: Record<string, unknown>, items: ReturnLineItemDto[]): PurchaseReturnDto {
  const returnQty = items.reduce((sum, item) => sum + item.qty, 0)
  const returnAmount = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    purchaseId: String(row.purchase_id),
    purchaseCode: String(row.purchase_code),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    supplierImageUrl: (row.supplier_image_url as string | null) ?? null,
    warehouseId: String(row.warehouse_id),
    items,
    returnQty,
    returnAmount,
    status: row.status as ReturnStatus,
    returnDate: new Date(row.return_date as string).toISOString().slice(0, 10),
    notes: (row.notes as string | null) ?? "",
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export class ReturnsRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<PurchaseReturnDto[]> {
    const headers = await this.db.query<Record<string, unknown>>(
      `SELECT r.*, s.name AS supplier_name, s.image_url AS supplier_image_url, p.code AS purchase_code
       FROM purchase_returns r
       JOIN suppliers s ON s.id = r.supplier_id
       JOIN purchases p ON p.id = r.purchase_id
       WHERE r.organization_id = $1 AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [organizationId]
    )
    if (headers.rows.length === 0) return []

    // An explicit IN list rather than "= ANY($1::uuid[])" -- see purchases-repository.ts's
    // identical comment for why.
    const ids = headers.rows.map((row) => String(row.id))
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ")
    const itemRows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE return_id IN (${placeholders}) ORDER BY position ASC`,
      ids
    )
    const itemsByReturn = new Map<string, ReturnLineItemDto[]>()
    for (const row of itemRows.rows) {
      const returnId = String(row.return_id)
      const list = itemsByReturn.get(returnId) ?? []
      list.push(mapReturnItem(row))
      itemsByReturn.set(returnId, list)
    }

    return headers.rows.map((row) => mapReturn(row, itemsByReturn.get(String(row.id)) ?? []))
  }

  async findById(organizationId: string, id: string): Promise<PurchaseReturnDto | null> {
    const headerResult = await this.db.query<Record<string, unknown>>(
      `SELECT r.*, s.name AS supplier_name, s.image_url AS supplier_image_url, p.code AS purchase_code
       FROM purchase_returns r
       JOIN suppliers s ON s.id = r.supplier_id
       JOIN purchases p ON p.id = r.purchase_id
       WHERE r.organization_id = $1 AND r.id = $2 AND r.deleted_at IS NULL`,
      [organizationId, id]
    )
    const row = headerResult.rows[0]
    if (!row) return null

    const itemsResult = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM purchase_return_items WHERE return_id = $1 ORDER BY position ASC`,
      [id]
    )
    return mapReturn(row, itemsResult.rows.map(mapReturnItem))
  }

  // Validates every item against the ORIGINAL purchase line (same product must actually be on
  // that purchase, and cumulative returned qty across every other non-deleted return against the
  // same purchase+product may never exceed what was actually purchased) -- same invariant the
  // frontend's maxReturnableFor already enforced, now also guaranteed server-side. unitCost/
  // productName/sku are always resolved from that original purchase line, never trusted from the
  // client. Stock is decremented (no floor at 0, see purchases-repository.ts's own comment on why)
  // inside the same transaction, once, at creation only.
  async create(
    organizationId: string,
    workspaceId: string | null,
    input: CreatePurchaseReturnInput
  ): Promise<PurchaseReturnDto> {
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      const purchaseResult = await this.db.query<{ id: string; supplier_id: string }>(
        `SELECT id, supplier_id FROM purchases WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [input.purchaseId, organizationId]
      )
      const purchase = purchaseResult.rows[0]
      if (!purchase) throw ERRORS.notFound("Purchase")

      // Full vs partial is computed against the purchase's own full set of line items, not just
      // the items this return names -- a return covering only some of the purchase's products can
      // never be "full" even if every product it does name comes back at its full qty.
      const purchaseLinesResult = await this.db.query<{ product_id: string; qty: string }>(
        `SELECT product_id, qty FROM purchase_line_items WHERE purchase_id = $1`,
        [input.purchaseId]
      )
      const purchaseQtyByProduct = new Map(
        purchaseLinesResult.rows.map((row) => [row.product_id, Number(row.qty)])
      )
      const status =
        purchaseQtyByProduct.size === input.items.length &&
        input.items.every((item) => purchaseQtyByProduct.get(item.productId) === item.qty)
          ? "full"
          : "partial"

      const code = await nextProcurementCode(this.db, organizationId, "return", "#RET", 4)

      await this.db.query(
        `INSERT INTO purchase_returns (
           id, organization_id, workspace_id, code, purchase_id, supplier_id, warehouse_id,
           status, return_date, notes, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now())`,
        [
          id,
          organizationId,
          workspaceId,
          code,
          input.purchaseId,
          purchase.supplier_id,
          input.warehouseId,
          status,
          input.returnDate,
          input.notes,
        ]
      )

      for (const [index, item] of input.items.entries()) {
        const lineResult = await this.db.query<{
          product_name: string
          sku: string
          net_unit_cost: string
          qty: string
        }>(
          `SELECT product_name, sku, net_unit_cost, qty FROM purchase_line_items
           WHERE purchase_id = $1 AND product_id = $2`,
          [input.purchaseId, item.productId]
        )
        const line = lineResult.rows[0]
        if (!line) {
          throw ERRORS.validation({
            productId: `Product ${item.productId} was not part of purchase ${input.purchaseId}.`,
          })
        }

        const alreadyReturnedResult = await this.db.query<{ total: string | null }>(
          `SELECT SUM(ri.qty) AS total
           FROM purchase_return_items ri
           JOIN purchase_returns r ON r.id = ri.return_id
           WHERE r.purchase_id = $1 AND ri.product_id = $2 AND r.deleted_at IS NULL AND r.id != $3`,
          [input.purchaseId, item.productId, id]
        )
        const alreadyReturned = Number(alreadyReturnedResult.rows[0]?.total ?? 0)
        const maxReturnable = Number(line.qty) - alreadyReturned
        if (item.qty > maxReturnable) {
          throw ERRORS.validation({
            qty: `Only ${Math.max(0, maxReturnable)} unit(s) of this product remain returnable for this purchase.`,
          })
        }

        await this.db.query(
          `INSERT INTO purchase_return_items
             (id, return_id, product_id, product_name, sku, qty, unit_cost, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            id,
            item.productId,
            line.product_name,
            line.sku,
            item.qty,
            line.net_unit_cost,
            index,
          ]
        )

        await this.db.query(
          `UPDATE products
           SET stock_quantity = stock_quantity - $1, updated_at = now()
           WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL AND stock_quantity IS NOT NULL`,
          [item.qty, item.productId, organizationId]
        )
      }
    })

    const created = await this.findById(organizationId, id)
    if (!created) throw ERRORS.notFound("Purchase return")
    return created
  }
}
