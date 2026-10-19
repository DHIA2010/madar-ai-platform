import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  convertRequiredQuantityToStock,
  isProductUnit,
  TYPES_REQUIRING_STOCK,
  type ProductType,
} from "./catalog-types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface StockConsumptionLine {
  productId: string | null
  variantId?: string | null
  quantity: number
}

export interface StockConsumptionResult {
  products: Map<string, number>
  variants: Map<string, number>
}

// How much of each REAL, tracked native product (and each real variant) a set of sale (or
// return) lines actually consumes -- a stock-tracked product (raw/simple/weighted) consumes
// itself directly, one unit per unit sold; a bundle consumes each of its own native components
// by the recipe's required_quantity converted into that component's own stock unit (see
// catalog-types.ts's convertRequiredQuantityToStock); a line carrying a variantId (a "variable"
// product's specific size/color combination) consumes that exact variant's own stock
// (product_variants.stock) directly, one unit per unit sold -- a variable product's own row
// never carries any stock to touch instead. A synced/storefront product, a free-text line, a
// service, and a component named by hand (no catalogue reference) can never appear here -- there
// is no products/product_variants row this organization owns to touch stock on for any of them.
// Shared by every caller that both consumes stock on a sale and restores it on a return/cancel,
// so a return restocks exactly the same way the sale consumed it.
export async function computeStockConsumption(
  database: PostgresDatabase,
  organizationId: string,
  lines: StockConsumptionLine[]
): Promise<StockConsumptionResult> {
  const products = new Map<string, number>()
  const variants = new Map<string, number>()

  // Confirmed against this organization's own products before touching anything -- a
  // variantId is entirely client-supplied, so without this check a line could name another
  // organization's variant and have its stock silently adjusted.
  const variantIds = [
    ...new Set(
      lines
        .map((line) => line.variantId)
        .filter((id): id is string => !!id && UUID_PATTERN.test(id))
    ),
  ]
  if (variantIds.length > 0) {
    const variantPlaceholders = variantIds.map((_, index) => `$${index + 2}`).join(", ")
    const ownedVariants = await database.query<{ id: string }>(
      `SELECT pv.id FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
        WHERE p.organization_id = $1 AND pv.id IN (${variantPlaceholders})`,
      [organizationId, ...variantIds]
    )
    const ownedVariantIds = new Set(ownedVariants.rows.map((row) => row.id))
    for (const line of lines) {
      if (line.variantId && ownedVariantIds.has(line.variantId)) {
        variants.set(line.variantId, (variants.get(line.variantId) ?? 0) + line.quantity)
      }
    }
  }

  const nativeIds = [
    ...new Set(
      lines
        .map((line) => line.productId)
        .filter((id): id is string => id !== null && UUID_PATTERN.test(id))
    ),
  ]
  if (nativeIds.length === 0) return { products, variants }

  const placeholders = nativeIds.map((_, index) => `$${index + 2}`).join(", ")
  const productRows = await database.query<{ id: string; product_type: string }>(
    `SELECT id, product_type FROM products WHERE organization_id = $1 AND id IN (${placeholders})`,
    [organizationId, ...nativeIds]
  )
  const typeById = new Map(productRows.rows.map((row) => [row.id, row.product_type]))

  const bundleIds = nativeIds.filter((id) => typeById.get(id) === "bundle")
  const componentsByBundle = new Map<
    string,
    Array<{
      component_ref: string | null
      required_quantity: string | number
      required_unit: string
      stock_unit: string
      conversion_factor: string | number | null
    }>
  >()
  if (bundleIds.length > 0) {
    const bundlePlaceholders = bundleIds.map((_, index) => `$${index + 1}`).join(", ")
    const componentRows = await database.query<{
      product_id: string
      component_ref: string | null
      required_quantity: string | number
      required_unit: string
      stock_unit: string
      conversion_factor: string | number | null
    }>(
      `SELECT product_id, component_ref, required_quantity, required_unit, stock_unit,
              conversion_factor
         FROM product_components WHERE product_id IN (${bundlePlaceholders})`,
      bundleIds
    )
    for (const row of componentRows.rows) {
      const list = componentsByBundle.get(row.product_id) ?? []
      list.push(row)
      componentsByBundle.set(row.product_id, list)
    }
  }

  const addConsumption = (productId: string, amount: number) => {
    products.set(productId, (products.get(productId) ?? 0) + amount)
  }

  for (const line of lines) {
    // A variant line's own productId is the PARENT variable product -- it never carries stock
    // of its own (not in TYPES_REQUIRING_STOCK, and never "bundle"), so it naturally falls
    // through here with no effect; only the variants map above touches it, via variantId.
    if (!line.productId || !UUID_PATTERN.test(line.productId)) continue
    const type = typeById.get(line.productId)
    if (!type) continue

    if (TYPES_REQUIRING_STOCK.includes(type as ProductType)) {
      addConsumption(line.productId, line.quantity)
      continue
    }

    if (type === "bundle") {
      for (const component of componentsByBundle.get(line.productId) ?? []) {
        if (!component.component_ref || !UUID_PATTERN.test(component.component_ref)) continue
        if (!isProductUnit(component.required_unit) || !isProductUnit(component.stock_unit))
          continue
        const perUnit = convertRequiredQuantityToStock(
          {
            requiredUnit: component.required_unit,
            stockUnit: component.stock_unit,
            conversionFactor:
              component.conversion_factor === null ? null : Number(component.conversion_factor),
          },
          Number(component.required_quantity)
        )
        addConsumption(component.component_ref, perUnit * line.quantity)
      }
    }
  }

  return { products, variants }
}

// Only called when the organization has turned "السماح بالبيع عند نفاد المخزون" off --
// migration 079's platform-wide default is still to allow it unconditionally (never call this
// and stock_quantity/stock is free to go negative, exactly as before this setting existed).
// Reads current stock fresh right before the transaction rather than trusting anything cached
// earlier, so a concurrent sale that already depleted stock is still caught.
//
// onInsufficientStock lets each caller throw its own error type (POS's
// INVOICE_ERRORS.outOfStockSaleNotAllowed vs. Madar orders' own equivalent) without this shared
// module depending on either caller's error catalogue.
export async function assertStockAvailability(
  database: PostgresDatabase,
  consumption: StockConsumptionResult,
  nameByProduct: Map<string, string>,
  onInsufficientStock: (productName: string) => Error
): Promise<void> {
  if (consumption.products.size > 0) {
    const ids = [...consumption.products.keys()]
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ")
    const rows = await database.query<{
      id: string
      stock_quantity: string | number | null
      name: string
    }>(`SELECT id, stock_quantity, name FROM products WHERE id IN (${placeholders})`, ids)
    const stockById = new Map(rows.rows.map((row) => [row.id, row]))
    for (const [productId, required] of consumption.products) {
      const row = stockById.get(productId)
      if (!row || row.stock_quantity === null) continue
      if (Number(row.stock_quantity) < required) {
        throw onInsufficientStock(nameByProduct.get(productId) ?? row.name ?? "")
      }
    }
  }

  if (consumption.variants.size > 0) {
    const ids = [...consumption.variants.keys()]
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ")
    const rows = await database.query<{ id: string; stock: string | number | null }>(
      `SELECT id, stock FROM product_variants WHERE id IN (${placeholders})`,
      ids
    )
    const stockById = new Map(rows.rows.map((row) => [row.id, row.stock]))
    for (const [variantId, required] of consumption.variants) {
      const stock = stockById.get(variantId)
      if (stock === null || stock === undefined) continue
      if (Number(stock) < required) {
        throw onInsufficientStock("")
      }
    }
  }
}

// Applies a computeStockConsumption() result -- sign -1 for a sale (subtracts), +1 for a return
// (adds back). Deliberately allows stock_quantity/stock to go negative (see migration 079):
// checkout must never be blocked by a stale/undercounted stock figure, so a negative number is
// treated as purely informational rather than an error state.
export async function applyStockConsumption(
  database: PostgresDatabase,
  consumption: StockConsumptionResult,
  sign: 1 | -1
): Promise<void> {
  for (const [productId, amount] of consumption.products) {
    if (amount === 0) continue
    await database.query(
      `UPDATE products SET stock_quantity = stock_quantity + $2, updated_at = now()
        WHERE id = $1 AND stock_quantity IS NOT NULL`,
      [productId, sign * amount]
    )
  }
  for (const [variantId, amount] of consumption.variants) {
    if (amount === 0) continue
    await database.query(
      `UPDATE product_variants SET stock = stock + $2 WHERE id = $1 AND stock IS NOT NULL`,
      [variantId, sign * amount]
    )
  }
}
