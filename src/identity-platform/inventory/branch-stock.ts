import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { notify } from "../notifications/service"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Stock per branch (migration 128). products.stock_quantity / product_variants.stock remain the
// total across branches; branch_stock splits it. Anything that changes a total without naming a
// branch -- the product form, a store import -- is settled into the product's own branch (or the
// organization's main branch, for a product shared by all branches) before the split is read or
// moved, so the rows always add up to the total.

interface StockKey {
  organizationId: string
  productId: string
  // null for the product itself, or one variant of a variable product.
  variantId?: string | null
}

function variantKeyOf(key: StockKey) {
  return key.variantId ?? ""
}

// The organization's first branch.
async function mainBranch(db: PostgresDatabase, organizationId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM workspaces WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
    [organizationId]
  )
  return result.rows[0]?.id ?? null
}

// A branch named by a caller, if it really is one of this organization's.
async function ownBranch(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null | undefined
): Promise<string | null> {
  if (!workspaceId || !UUID_PATTERN.test(workspaceId)) return null
  const result = await db.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL",
    [workspaceId, organizationId]
  )
  return result.rows[0]?.id ?? null
}

async function homeBranch(db: PostgresDatabase, key: StockKey): Promise<string | null> {
  const product = await db.query<{ workspace_id: string | null }>(
    "SELECT workspace_id FROM products WHERE id = $1 AND organization_id = $2",
    [key.productId, key.organizationId]
  )
  return (
    (await ownBranch(db, key.organizationId, product.rows[0]?.workspace_id)) ??
    (await mainBranch(db, key.organizationId))
  )
}

async function totalOf(db: PostgresDatabase, key: StockKey): Promise<number | null> {
  if (key.variantId) {
    const result = await db.query<{ stock: string | number | null }>(
      "SELECT stock FROM product_variants WHERE id = $1 AND product_id = $2",
      [key.variantId, key.productId]
    )
    const stock = result.rows[0]?.stock
    return stock === null || stock === undefined ? null : Number(stock)
  }
  const result = await db.query<{ stock_quantity: string | number | null }>(
    "SELECT stock_quantity FROM products WHERE id = $1 AND organization_id = $2",
    [key.productId, key.organizationId]
  )
  const stock = result.rows[0]?.stock_quantity
  return stock === null || stock === undefined ? null : Number(stock)
}

async function addToBranch(
  db: PostgresDatabase,
  key: StockKey,
  workspaceId: string,
  delta: number
): Promise<void> {
  if (delta === 0) return
  await db.query(
    `INSERT INTO branch_stock (id, organization_id, workspace_id, product_id, variant_key, quantity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (product_id, variant_key, workspace_id)
     DO UPDATE SET quantity = branch_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
    [randomUUID(), key.organizationId, workspaceId, key.productId, variantKeyOf(key), delta]
  )
}

// Puts whatever the branch rows are missing (or have too much of) against `total` into the
// product's own branch.
async function settle(db: PostgresDatabase, key: StockKey, total: number): Promise<void> {
  const result = await db.query<{ total: string | number | null }>(
    `SELECT sum(quantity) AS total FROM branch_stock
      WHERE product_id = $1 AND variant_key = $2`,
    [key.productId, variantKeyOf(key)]
  )
  const diff = total - Number(result.rows[0]?.total ?? 0)
  if (Math.abs(diff) < 1e-9) return
  const home = await homeBranch(db, key)
  if (home) await addToBranch(db, key, home, diff)
}

// Records that `delta` of a product's stock went into (or out of, when negative) a branch. Call it
// after the caller has already added `delta` to the product's total. A branch that isn't this
// organization's falls back to the product's own branch. Untracked stock (a null total) is ignored.
export async function recordBranchMovement(
  db: PostgresDatabase,
  input: StockKey & { workspaceId: string | null | undefined; delta: number }
): Promise<void> {
  if (input.delta === 0) return
  const total = await totalOf(db, input)
  if (total === null) return
  await settle(db, input, total - input.delta)
  const branch =
    (await ownBranch(db, input.organizationId, input.workspaceId)) ?? (await homeBranch(db, input))
  if (branch) {
    await addToBranch(db, input, branch, input.delta)
    if (input.delta < 0) await alertIfStockFell(db, input, branch, input.delta)
  }
}

// Notifies when stock leaving a branch takes a product out of stock there, or to its minimum
// stock or below -- only on the move that crosses the line (not again on every later sale), and
// at most once per product, branch and day.
async function alertIfStockFell(
  db: PostgresDatabase,
  key: StockKey,
  workspaceId: string,
  delta: number
): Promise<void> {
  if (key.variantId) return
  const result = await db.query<{
    name: string
    min_stock: string | number | null
    quantity: string | number | null
    branch_name: string | null
  }>(
    `SELECT p.name, p.min_stock, b.quantity, w.name AS branch_name
       FROM products p
       LEFT JOIN branch_stock b
         ON b.product_id = p.id AND b.variant_key = '' AND b.workspace_id = $3
       LEFT JOIN workspaces w ON w.id = $3
      WHERE p.id = $1 AND p.organization_id = $2`,
    [key.productId, key.organizationId, workspaceId]
  )
  const row = result.rows[0]
  if (!row) return
  const after = Number(row.quantity ?? 0)
  const before = after - delta
  const minStock = row.min_stock === null ? null : Number(row.min_stock)
  const type =
    before > 0 && after <= 0
      ? "stock_out"
      : minStock !== null && before > minStock && after <= minStock
        ? "stock_low"
        : null
  if (!type) return
  await notify(db, {
    organizationId: key.organizationId,
    workspaceId,
    type,
    audience: "products:view",
    params: {
      productId: key.productId,
      productName: row.name,
      quantity: after,
      minStock,
      branchName: row.branch_name ?? "",
    },
    link: "/products",
    dedupeKey: `${type}:${key.productId}:${workspaceId}:${new Date().toISOString().slice(0, 10)}`,
  })
}

// Moves stock between two branches; the total doesn't change.
export async function moveBetweenBranches(
  db: PostgresDatabase,
  input: StockKey & { fromWorkspaceId: string; toWorkspaceId: string; quantity: number }
): Promise<void> {
  const total = await totalOf(db, input)
  if (total === null) return
  await settle(db, input, total)
  await addToBranch(db, input, input.fromWorkspaceId, -input.quantity)
  await addToBranch(db, input, input.toWorkspaceId, input.quantity)
  await alertIfStockFell(db, input, input.fromWorkspaceId, -input.quantity)
}

// Each stock-tracked product's quantity in one branch (product level, not variants). Settles every
// product of the organization first, in one pass.
export async function productQuantitiesInBranch(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string
): Promise<Map<string, number>> {
  const [totals, sums] = await Promise.all([
    db.query<{ id: string; stock_quantity: string | number }>(
      `SELECT id, stock_quantity FROM products
        WHERE organization_id = $1 AND deleted_at IS NULL AND stock_quantity IS NOT NULL`,
      [organizationId]
    ),
    db.query<{ product_id: string; total: string | number }>(
      `SELECT product_id, sum(quantity) AS total FROM branch_stock
        WHERE organization_id = $1 AND variant_key = '' GROUP BY product_id`,
      [organizationId]
    ),
  ])
  const sumByProduct = new Map(sums.rows.map((row) => [row.product_id, Number(row.total)]))
  for (const row of totals.rows) {
    const diff = Number(row.stock_quantity) - (sumByProduct.get(row.id) ?? 0)
    if (Math.abs(diff) < 1e-9) continue
    const key = { organizationId, productId: row.id }
    const home = await homeBranch(db, key)
    if (home) await addToBranch(db, key, home, diff)
  }

  const result = await db.query<{ product_id: string; quantity: string | number }>(
    `SELECT product_id, quantity FROM branch_stock
      WHERE organization_id = $1 AND workspace_id = $2 AND variant_key = ''`,
    [organizationId, workspaceId]
  )
  const quantities = new Map<string, number>()
  for (const row of totals.rows) quantities.set(row.id, 0)
  for (const row of result.rows) {
    if (quantities.has(row.product_id)) quantities.set(row.product_id, Number(row.quantity))
  }
  return quantities
}
