import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { productQuantitiesInBranch, recordBranchMovement } from "./branch-stock"

export type StockCountStatus = "draft" | "completed"

export interface StockCountItem {
  productId: string
  productName: string
  sku: string
  systemQuantity: number
  countedQuantity: number
  // countedQuantity - systemQuantity: positive = more on the shelf than Madar had.
  difference: number
  unitCost: number | null
}

export interface StockCount {
  id: string
  reference: string
  workspaceId: string
  workspaceName: string
  countDate: string
  status: StockCountStatus
  notes: string
  items: StockCountItem[]
  // Products whose count differs from Madar, the net units, and their value at cost.
  differences: number
  netDifference: number
  netDifferenceValue: number
  createdByName: string | null
  completedByName: string | null
  createdAt: string
  completedAt: string | null
}

export interface SaveStockCountInput {
  workspaceId: string
  countDate: string
  notes: string
  items: { productId: string; countedQuantity: number }[]
}

interface CountRow {
  id: string
  reference: string
  workspace_id: string
  workspace_name: string | null
  count_date: string | Date
  status: StockCountStatus
  notes: string
  created_by_name: string | null
  completed_by_name: string | null
  created_at: string | Date
  completed_at: string | Date | null
  [key: string]: unknown
}

const COUNT_SELECT = `
  SELECT c.id, c.reference, c.workspace_id, w.name AS workspace_name, c.count_date, c.status,
         c.notes, cu.full_name AS created_by_name, du.full_name AS completed_by_name,
         c.created_at, c.completed_at
    FROM stock_counts c
    LEFT JOIN workspaces w ON w.id = c.workspace_id
    LEFT JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users du ON du.id = c.completed_by`

function toDateString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

// Stock take: count a branch's products, then approve to set their stock to what was counted.
export class StockCountsService {
  constructor(private readonly db: PostgresDatabase) {}

  private async requireBranch(organizationId: string, workspaceId: string) {
    const result = await this.db.query(
      "SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
      [workspaceId, organizationId]
    )
    if (result.rows.length === 0) throw ERRORS.validation({ workspaceId: "Unknown branch." })
  }

  private async hydrate(organizationId: string, rows: CountRow[]): Promise<StockCount[]> {
    if (rows.length === 0) return []
    const placeholders = rows.map((_, index) => `$${index + 2}`).join(", ")
    const items = await this.db.query<{
      count_id: string
      product_id: string
      product_name: string
      sku: string
      system_quantity: string | number
      counted_quantity: string | number
      unit_cost: string | number | null
    }>(
      `SELECT i.count_id, i.product_id, i.product_name, i.sku, i.system_quantity,
              i.counted_quantity, i.unit_cost
         FROM stock_count_items i
         JOIN stock_counts c ON c.id = i.count_id
        WHERE c.organization_id = $1 AND i.count_id IN (${placeholders})
        ORDER BY i.position ASC`,
      [organizationId, ...rows.map((row) => row.id)]
    )
    const itemsByCount = new Map<string, StockCountItem[]>()
    for (const row of items.rows) {
      const systemQuantity = Number(row.system_quantity)
      const countedQuantity = Number(row.counted_quantity)
      const list = itemsByCount.get(row.count_id) ?? []
      list.push({
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        systemQuantity,
        countedQuantity,
        difference: countedQuantity - systemQuantity,
        unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
      })
      itemsByCount.set(row.count_id, list)
    }

    return rows.map((row) => {
      const countItems = itemsByCount.get(row.id) ?? []
      return {
        id: row.id,
        reference: row.reference,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name ?? "",
        countDate: toDateString(row.count_date),
        status: row.status,
        notes: row.notes,
        items: countItems,
        differences: countItems.filter((item) => Math.abs(item.difference) > 1e-9).length,
        netDifference: countItems.reduce((sum, item) => sum + item.difference, 0),
        netDifferenceValue: countItems.reduce(
          (sum, item) => sum + item.difference * (item.unitCost ?? 0),
          0
        ),
        createdByName: row.created_by_name,
        completedByName: row.completed_by_name,
        createdAt: new Date(row.created_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      }
    })
  }

  async list(organizationId: string): Promise<StockCount[]> {
    const rows = await this.db.query<CountRow>(
      `${COUNT_SELECT} WHERE c.organization_id = $1 ORDER BY c.created_at DESC`,
      [organizationId]
    )
    return this.hydrate(organizationId, rows.rows)
  }

  async get(organizationId: string, id: string): Promise<StockCount> {
    const rows = await this.db.query<CountRow>(
      `${COUNT_SELECT} WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, id]
    )
    const [count] = await this.hydrate(organizationId, rows.rows)
    if (!count) throw ERRORS.notFound("Stock count")
    return count
  }

  // Replaces a draft's counted lines, snapshotting each product's current quantity in the branch.
  private async writeItems(
    organizationId: string,
    countId: string,
    workspaceId: string,
    items: SaveStockCountInput["items"]
  ) {
    const quantities = await productQuantitiesInBranch(this.db, organizationId, workspaceId)
    await this.db.query("DELETE FROM stock_count_items WHERE count_id = $1", [countId])
    const seen = new Set<string>()
    let position = 0
    for (const item of items) {
      if (seen.has(item.productId)) continue
      seen.add(item.productId)
      const product = await this.db.query<{
        name: string
        sku: string | null
        cost_price: string | number | null
      }>(
        `SELECT name, sku, cost_price FROM products
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
            AND stock_quantity IS NOT NULL`,
        [item.productId, organizationId]
      )
      const row = product.rows[0]
      if (!row) throw ERRORS.notFound("Product")
      await this.db.query(
        `INSERT INTO stock_count_items
           (id, count_id, product_id, product_name, sku, system_quantity, counted_quantity,
            unit_cost, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          countId,
          item.productId,
          row.name,
          row.sku ?? "",
          quantities.get(item.productId) ?? 0,
          item.countedQuantity,
          row.cost_price === null ? null : Number(row.cost_price),
          position++,
        ]
      )
    }
  }

  async create(
    organizationId: string,
    userId: string,
    input: SaveStockCountInput
  ): Promise<StockCount> {
    await this.requireBranch(organizationId, input.workspaceId)
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      const counter = await this.db.query<{ next_number: string }>(
        `INSERT INTO inventory_code_counters (organization_id, code_type, next_number)
         VALUES ($1, 'stock_count', 1)
         ON CONFLICT (organization_id, code_type)
         DO UPDATE SET next_number = inventory_code_counters.next_number + 1
         RETURNING next_number`,
        [organizationId]
      )
      const reference = `STK-${String(counter.rows[0].next_number).padStart(4, "0")}`
      await this.db.query(
        `INSERT INTO stock_counts
           (id, organization_id, reference, workspace_id, count_date, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)`,
        [id, organizationId, reference, input.workspaceId, input.countDate, input.notes, userId]
      )
      await this.writeItems(organizationId, id, input.workspaceId, input.items)
    })
    return this.get(organizationId, id)
  }

  private async requireDraft(organizationId: string, id: string): Promise<StockCount> {
    const count = await this.get(organizationId, id)
    if (count.status !== "draft") {
      throw ERRORS.conflict("STOCK_COUNT_COMPLETED", "This stock count is already approved.")
    }
    return count
  }

  // A draft's branch is fixed once started; its date, notes and counts can change.
  async update(
    organizationId: string,
    id: string,
    input: Omit<SaveStockCountInput, "workspaceId">
  ): Promise<StockCount> {
    const count = await this.requireDraft(organizationId, id)
    await this.db.withTransaction(async () => {
      await this.db.query(
        `UPDATE stock_counts SET count_date = $3, notes = $4, updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, input.countDate, input.notes]
      )
      await this.writeItems(organizationId, id, count.workspaceId, input.items)
    })
    return this.get(organizationId, id)
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.requireDraft(organizationId, id)
    await this.db.query("DELETE FROM stock_counts WHERE id = $1 AND organization_id = $2", [
      id,
      organizationId,
    ])
  }

  // Sets each counted product's stock in the branch to the counted quantity, against its
  // quantity right now (sales since the draft was saved are accounted for), and locks the count.
  async complete(organizationId: string, userId: string, id: string): Promise<StockCount> {
    const count = await this.requireDraft(organizationId, id)
    if (count.items.length === 0) {
      throw ERRORS.validation({ items: "Count at least one product before approving." })
    }
    await this.db.withTransaction(async () => {
      const quantities = await productQuantitiesInBranch(this.db, organizationId, count.workspaceId)
      for (const item of count.items) {
        const current = quantities.get(item.productId) ?? 0
        const delta = item.countedQuantity - current
        await this.db.query(
          `UPDATE stock_count_items SET system_quantity = $3
            WHERE count_id = $1 AND product_id = $2`,
          [id, item.productId, current]
        )
        if (Math.abs(delta) < 1e-9) continue
        const updated = await this.db.query(
          `UPDATE products SET stock_quantity = stock_quantity + $3, updated_at = now()
            WHERE id = $1 AND organization_id = $2 AND stock_quantity IS NOT NULL
            RETURNING id`,
          [item.productId, organizationId, delta]
        )
        if (updated.rows.length === 0) continue
        await recordBranchMovement(this.db, {
          organizationId,
          productId: item.productId,
          workspaceId: count.workspaceId,
          delta,
        })
      }
      await this.db.query(
        `UPDATE stock_counts
            SET status = 'completed', completed_by = $3, completed_at = now(), updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, userId]
      )
    })
    return this.get(organizationId, id)
  }
}
