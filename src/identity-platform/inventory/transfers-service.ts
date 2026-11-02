import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { moveBetweenBranches, productQuantitiesInBranch } from "./branch-stock"

// Product types whose stock is a single number on the product itself -- the ones a transfer can
// move. A variable product keeps stock per variant, and bundles/services/digital carry none.
const TRANSFERABLE_TYPES = ["raw", "simple", "weighted"]

export interface StockTransferItem {
  productId: string
  productName: string
  sku: string
  quantity: number
}

export interface StockTransfer {
  id: string
  reference: string
  fromWorkspaceId: string
  fromWorkspaceName: string
  toWorkspaceId: string
  toWorkspaceName: string
  transferDate: string
  notes: string
  items: StockTransferItem[]
  totalQuantity: number
  createdByName: string | null
  createdAt: string
}

export interface CreateStockTransferInput {
  fromWorkspaceId: string
  toWorkspaceId: string
  transferDate: string
  notes: string
  items: { productId: string; quantity: number }[]
}

interface TransferRow {
  id: string
  reference: string
  from_workspace_id: string
  from_name: string | null
  to_workspace_id: string
  to_name: string | null
  transfer_date: string | Date
  notes: string
  created_by_name: string | null
  created_at: string | Date
  [key: string]: unknown
}

// Same reading as procurement's purchases: node-pg turns a date column into local midnight.
function toDateString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export class StockTransfersService {
  constructor(private readonly db: PostgresDatabase) {}

  private async requireBranch(organizationId: string, workspaceId: string, field: string) {
    const result = await this.db.query(
      "SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
      [workspaceId, organizationId]
    )
    if (result.rows.length === 0) throw ERRORS.validation({ [field]: "Unknown branch." })
  }

  // The organization's branches, as the server knows them.
  async branches(organizationId: string): Promise<{ id: string; name: string }[]> {
    const result = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM workspaces WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [organizationId]
    )
    return result.rows
  }

  // Every transferable product of the organization with its quantity in one branch -- what the
  // transfer form offers, whichever branch the user is working in.
  async branchStock(
    organizationId: string,
    workspaceId: string
  ): Promise<{ productId: string; name: string; sku: string; quantity: number }[]> {
    await this.requireBranch(organizationId, workspaceId, "workspaceId")
    const quantities = await productQuantitiesInBranch(this.db, organizationId, workspaceId)
    const products = await this.db.query<{ id: string; name: string; sku: string | null }>(
      `SELECT id, name, sku FROM products
        WHERE organization_id = $1 AND deleted_at IS NULL AND stock_quantity IS NOT NULL
          AND product_type IN ('raw', 'simple', 'weighted')
        ORDER BY name ASC`,
      [organizationId]
    )
    return products.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      sku: row.sku ?? "",
      quantity: quantities.get(row.id) ?? 0,
    }))
  }

  async list(organizationId: string): Promise<StockTransfer[]> {
    const transfers = await this.db.query<TransferRow>(
      `SELECT t.id, t.reference, t.from_workspace_id, wf.name AS from_name,
              t.to_workspace_id, wt.name AS to_name, t.transfer_date, t.notes,
              u.full_name AS created_by_name, t.created_at
         FROM stock_transfers t
         LEFT JOIN workspaces wf ON wf.id = t.from_workspace_id
         LEFT JOIN workspaces wt ON wt.id = t.to_workspace_id
         LEFT JOIN users u ON u.id = t.created_by
        WHERE t.organization_id = $1
        ORDER BY t.created_at DESC`,
      [organizationId]
    )
    if (transfers.rows.length === 0) return []

    const items = await this.db.query<{
      transfer_id: string
      product_id: string
      product_name: string
      sku: string
      quantity: string | number
    }>(
      `SELECT i.transfer_id, i.product_id, i.product_name, i.sku, i.quantity
         FROM stock_transfer_items i
         JOIN stock_transfers t ON t.id = i.transfer_id
        WHERE t.organization_id = $1
        ORDER BY i.position ASC`,
      [organizationId]
    )
    const itemsByTransfer = new Map<string, StockTransferItem[]>()
    for (const row of items.rows) {
      const list = itemsByTransfer.get(row.transfer_id) ?? []
      list.push({
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        quantity: Number(row.quantity),
      })
      itemsByTransfer.set(row.transfer_id, list)
    }

    return transfers.rows.map((row) => {
      const transferItems = itemsByTransfer.get(row.id) ?? []
      return {
        id: row.id,
        reference: row.reference,
        fromWorkspaceId: row.from_workspace_id,
        fromWorkspaceName: row.from_name ?? "",
        toWorkspaceId: row.to_workspace_id,
        toWorkspaceName: row.to_name ?? "",
        transferDate: toDateString(row.transfer_date),
        notes: row.notes,
        items: transferItems,
        totalQuantity: transferItems.reduce((sum, item) => sum + item.quantity, 0),
        createdByName: row.created_by_name,
        createdAt: new Date(row.created_at).toISOString(),
      }
    })
  }

  // Moves the products from one branch to the other. A product can't leave a branch with more
  // than it has there.
  async create(
    organizationId: string,
    userId: string,
    input: CreateStockTransferInput
  ): Promise<StockTransfer> {
    if (input.fromWorkspaceId === input.toWorkspaceId) {
      throw ERRORS.validation({ toWorkspaceId: "Choose a different branch to transfer to." })
    }
    await this.requireBranch(organizationId, input.fromWorkspaceId, "fromWorkspaceId")
    await this.requireBranch(organizationId, input.toWorkspaceId, "toWorkspaceId")

    // The same product twice is one line.
    const quantityByProduct = new Map<string, number>()
    for (const item of input.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) ?? 0) + item.quantity
      )
    }

    const id = randomUUID()
    await this.db.withTransaction(async () => {
      const available = await productQuantitiesInBranch(
        this.db,
        organizationId,
        input.fromWorkspaceId
      )
      const lines: { productId: string; name: string; sku: string; quantity: number }[] = []
      for (const [productId, quantity] of quantityByProduct) {
        const product = await this.db.query<{
          name: string
          sku: string | null
          product_type: string
          stock_quantity: string | number | null
        }>(
          `SELECT name, sku, product_type, stock_quantity FROM products
            WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [productId, organizationId]
        )
        const row = product.rows[0]
        if (!row) throw ERRORS.notFound("Product")
        if (!TRANSFERABLE_TYPES.includes(row.product_type) || row.stock_quantity === null) {
          throw ERRORS.conflict(
            "PRODUCT_NOT_TRANSFERABLE",
            `"${row.name}" doesn't keep stock that can be transferred.`
          )
        }
        if (quantity > (available.get(productId) ?? 0) + 1e-9) {
          throw ERRORS.conflict(
            "STOCK_INSUFFICIENT",
            `Only ${Math.max(0, available.get(productId) ?? 0)} of "${row.name}" is in the branch.`
          )
        }
        lines.push({ productId, name: row.name, sku: row.sku ?? "", quantity })
      }

      const counter = await this.db.query<{ next_number: string }>(
        `INSERT INTO inventory_code_counters (organization_id, code_type, next_number)
         VALUES ($1, 'stock_transfer', 1)
         ON CONFLICT (organization_id, code_type)
         DO UPDATE SET next_number = inventory_code_counters.next_number + 1
         RETURNING next_number`,
        [organizationId]
      )
      const reference = `TRF-${String(counter.rows[0].next_number).padStart(4, "0")}`

      await this.db.query(
        `INSERT INTO stock_transfers
           (id, organization_id, reference, from_workspace_id, to_workspace_id, transfer_date,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          organizationId,
          reference,
          input.fromWorkspaceId,
          input.toWorkspaceId,
          input.transferDate,
          input.notes,
          userId,
        ]
      )
      for (const [index, line] of lines.entries()) {
        await this.db.query(
          `INSERT INTO stock_transfer_items
             (id, transfer_id, product_id, product_name, sku, quantity, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), id, line.productId, line.name, line.sku, line.quantity, index]
        )
        await moveBetweenBranches(this.db, {
          organizationId,
          productId: line.productId,
          fromWorkspaceId: input.fromWorkspaceId,
          toWorkspaceId: input.toWorkspaceId,
          quantity: line.quantity,
        })
      }
    })

    const created = (await this.list(organizationId)).find((transfer) => transfer.id === id)
    if (!created) throw ERRORS.notFound("Stock transfer")
    return created
  }
}
