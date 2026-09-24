import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import {
  BASE_UNIT_BY_COMPONENT_UNIT,
  convertStockToRequiredUnit,
  TYPES_REQUIRING_STOCK,
  isProductUnit,
  type CreateProductInput,
  type ProductAttributes,
  type ProductComponentInput,
  type ProductComponentView,
  type ProductStatus,
  type ProductType,
  type ProductUnit,
  type ProductVariantOptionView,
  type ProductVariantView,
  type ProductView,
} from "./catalog-types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ProductRow {
  id: string
  organization_id: string
  workspace_id: string | null
  product_type: string
  name: string
  sku: string | null
  category: string
  description: string
  status: string
  currency: string
  base_unit: string | null
  sell_price: string | number | null
  cost_price: string | number | null
  stock_quantity: string | number | null
  min_stock: string | number | null
  image_urls: unknown
  attributes: unknown
  tax_rate_id: string | null
  price_includes_tax: boolean
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

interface ComponentRow {
  id: string
  product_id: string
  component_ref: string | null
  custom_name: string | null
  custom_stock: string | number | null
  required_quantity: string | number
  required_unit: string
  stock_unit: string
  conversion_factor: string | number | null
  note: string | null
  position: number
  [key: string]: unknown
}

interface VariantOptionRow {
  id: string
  product_id: string
  name: string
  option_values: unknown
  position: number
  [key: string]: unknown
}

interface VariantRow {
  id: string
  product_id: string
  sku: string | null
  price: string | number | null
  stock: string | number | null
  option_values: unknown
  position: number
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// Postgres returns numeric as a string to avoid the precision loss a float64 would introduce.
// Everything this table stores (prices, quantities) is well inside float64's exact range, so
// converting at the edge is safe and keeps the JSON response numeric rather than stringly typed.
function toNullableNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// jsonb round-trips as a parsed value through node-postgres but as a string through some
// drivers (and pg-mem, depending on how the column was written), so both are handled.
function toJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toStringArray(value: unknown): string[] {
  return toJsonArray(value).filter((entry): entry is string => typeof entry === "string")
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

// Matches MAX_PRODUCTS_PER_PROVIDER in the synced aggregation this list is merged with, and
// bounds the child-row IN list below to a size Postgres is comfortable with.
const MAX_PRODUCTS = 500

const PRODUCT_SELECT = `
  SELECT id, organization_id, workspace_id, product_type, name, sku, category, description,
    status, currency, base_unit, sell_price, cost_price, stock_quantity, min_stock,
    image_urls, attributes, tax_rate_id, price_includes_tax, created_by, created_at, updated_at
  FROM products
`

// How many times a bundle could be produced right now, given each component's current stock --
// mirrors the Add Product page's own `resolvedComponents`/`limiting` calculation (AddProduct.tsx)
// so the figure a merchant sees while authoring a recipe and the one shown once it's saved never
// disagree. A component with no resolvable stock (an external catalogue reference, a hand-named
// component with no customStock, or a componentRef pointing at a product type that holds no
// stock of its own) is simply left out of the comparison rather than zeroing the whole bundle --
// same as the client-side calculation. Returns null when nothing was resolvable at all.
function computeProducibleQuantity(
  components: ProductComponentView[],
  stockByComponentId: Map<string, { stockQuantity: number | null; productType: string }>
): number | null {
  let limiting: number | null = null

  for (const component of components) {
    let stock: number | null = null
    if (component.customStock !== null) {
      stock = component.customStock
    } else if (component.componentRef && UUID_PATTERN.test(component.componentRef)) {
      const info = stockByComponentId.get(component.componentRef)
      if (
        info &&
        TYPES_REQUIRING_STOCK.includes(info.productType as ProductType) &&
        info.stockQuantity !== null
      ) {
        stock = info.stockQuantity
      }
    }

    if (stock === null) continue
    if (!isProductUnit(component.requiredUnit) || !isProductUnit(component.stockUnit)) continue
    if (component.requiredQuantity <= 0) continue

    const stockInRequiredUnit = convertStockToRequiredUnit(component, stock)
    if (stockInRequiredUnit === null) continue

    const producible = Math.floor(stockInRequiredUnit / component.requiredQuantity)
    if (limiting === null || producible < limiting) limiting = producible
  }

  return limiting
}

function mapComponent(row: ComponentRow): ProductComponentView {
  return {
    id: row.id,
    componentRef: row.component_ref,
    customName: row.custom_name,
    customStock: toNullableNumber(row.custom_stock),
    requiredQuantity: toNullableNumber(row.required_quantity) ?? 0,
    requiredUnit: row.required_unit as ProductUnit,
    stockUnit: row.stock_unit as ProductUnit,
    conversionFactor: toNullableNumber(row.conversion_factor),
    note: row.note,
    position: row.position,
  }
}

function mapVariantOption(row: VariantOptionRow): ProductVariantOptionView {
  return {
    id: row.id,
    name: row.name,
    values: toStringArray(row.option_values),
    position: row.position,
  }
}

function mapVariant(row: VariantRow): ProductVariantView {
  return {
    id: row.id,
    sku: row.sku,
    price: toNullableNumber(row.price),
    stock: toNullableNumber(row.stock),
    optionValues: toStringArray(row.option_values),
    position: row.position,
  }
}

export class ProductCatalogRepository {
  constructor(private readonly database: PostgresDatabase) {}

  // Soft delete: the row stays so anything already referencing it (a bundle recipe, an order
  // line) still resolves, and every read path already filters on deleted_at IS NULL.
  async softDelete(organizationId: string, id: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE products SET deleted_at = now(), updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    return result.rowCount > 0
  }

  // Status-only, not a full update() -- a bulk "select several products, set them all to
  // draft/active" action from the products list has no reason to touch (or risk clobbering) a
  // product's name/price/components/variants, which update()'s full-replace contract would
  // otherwise require sending back untouched.
  async bulkUpdateStatus(
    organizationId: string,
    ids: string[],
    status: ProductStatus
  ): Promise<number> {
    const placeholders = ids.map((_, index) => `$${index + 3}`).join(", ")
    const result = await this.database.query(
      `UPDATE products SET status = $1, updated_at = now()
       WHERE organization_id = $2 AND deleted_at IS NULL AND id IN (${placeholders})`,
      [status, organizationId, ...ids]
    )
    return result.rowCount
  }

  async findBySku(organizationId: string, sku: string): Promise<{ id: string } | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM products
       WHERE organization_id = $1 AND sku = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [organizationId, sku]
    )
    return result.rows[0] ?? null
  }

  // The POS scan box's fast path matches the loaded product list's own (parent) sku entirely
  // client-side -- this is the fallback for a code that doesn't match any of those: a variable
  // product's individual combination (product_variants.sku) carries its own code the parent
  // list never includes, so it can only be resolved with a real query. Checks the parent sku
  // too (not just variants) so the one round trip this backs covers a stale or not-yet-loaded
  // client list as well, not only the variant case it was written for.
  async findByAnySku(
    organizationId: string,
    sku: string
  ): Promise<{ productId: string; variantId: string | null } | null> {
    const direct = await this.findBySku(organizationId, sku)
    if (direct) return { productId: direct.id, variantId: null }

    const variant = await this.database.query<{ product_id: string; id: string }>(
      `SELECT pv.product_id, pv.id FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
        WHERE p.organization_id = $1 AND p.deleted_at IS NULL AND pv.sku = $2
        LIMIT 1`,
      [organizationId, sku]
    )
    const match = variant.rows[0]
    return match ? { productId: match.product_id, variantId: match.id } : null
  }

  // Every priced, non-deleted native product -- the candidate set for
  // ProductCatalogService.applyPriceTaxConvention's bulk gross/net conversion. A product with no
  // sell_price (a bundle, a raw material) has nothing to convert and is left out.
  async listPriceable(
    organizationId: string
  ): Promise<
    Array<{ id: string; sellPrice: number; taxRateId: string | null; priceIncludesTax: boolean }>
  > {
    const result = await this.database.query<{
      id: string
      sell_price: string | number
      tax_rate_id: string | null
      price_includes_tax: boolean
    }>(
      `SELECT id, sell_price, tax_rate_id, price_includes_tax FROM products
        WHERE organization_id = $1 AND deleted_at IS NULL AND sell_price IS NOT NULL`,
      [organizationId]
    )
    return result.rows.map((row) => ({
      id: row.id,
      sellPrice: Number(row.sell_price),
      taxRateId: row.tax_rate_id,
      priceIncludesTax: row.price_includes_tax,
    }))
  }

  // Applies a bulk gross/net conversion (each entry's freshly-computed sell_price and the new
  // price_includes_tax flag) as one transaction -- either every product in the batch moves to the
  // new convention or none do, since a partial conversion would leave the catalogue in a state no
  // merchant asked for.
  async applyPriceTaxConversion(
    organizationId: string,
    updates: Array<{ id: string; sellPrice: number; priceIncludesTax: boolean }>
  ): Promise<void> {
    if (updates.length === 0) return
    await this.database.withTransaction(async () => {
      for (const update of updates) {
        await this.database.query(
          `UPDATE products SET sell_price = $3, price_includes_tax = $4, updated_at = now()
            WHERE organization_id = $1 AND id = $2`,
          [organizationId, update.id, update.sellPrice, update.priceIncludesTax]
        )
      }
    })
  }

  async list(organizationId: string, workspaceId: string | null): Promise<ProductView[]> {
    const result = await this.database.query<ProductRow>(
      `${PRODUCT_SELECT}
       WHERE organization_id = $1 AND deleted_at IS NULL
         AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT $3`,
      [organizationId, workspaceId, MAX_PRODUCTS]
    )

    return this.hydrate(organizationId, result.rows)
  }

  async findById(organizationId: string, id: string): Promise<ProductView | null> {
    const result = await this.database.query<ProductRow>(
      `${PRODUCT_SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (!result.rows[0]) return null
    const [hydrated] = await this.hydrate(organizationId, result.rows)
    return hydrated ?? null
  }

  // One round trip per child table for the whole page of products rather than per product --
  // a 200-product list would otherwise issue 600 queries.
  private async hydrate(organizationId: string, rows: ProductRow[]): Promise<ProductView[]> {
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.id)
    // An explicit IN list rather than "= ANY($1::uuid[])": the array form is silently
    // unsupported against these tables under pg-mem (it matches nothing on an indexed foreign
    // key column), which the whole test suite runs on. The list is bounded by MAX_PRODUCTS.
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ")

    const [components, options, variants] = await Promise.all([
      this.database.query<ComponentRow>(
        `SELECT id, product_id, component_ref, custom_name, custom_stock, required_quantity,
           required_unit, stock_unit, conversion_factor, note, position
         FROM product_components WHERE product_id IN (${placeholders}) ORDER BY position`,
        ids
      ),
      this.database.query<VariantOptionRow>(
        `SELECT id, product_id, name, option_values, position
         FROM product_variant_options WHERE product_id IN (${placeholders}) ORDER BY position`,
        ids
      ),
      this.database.query<VariantRow>(
        `SELECT id, product_id, sku, price, stock, option_values, position
         FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY position`,
        ids
      ),
    ])

    const componentsByProduct = new Map<string, ProductComponentView[]>()
    for (const row of components.rows) {
      const list = componentsByProduct.get(row.product_id) ?? []
      list.push(mapComponent(row))
      componentsByProduct.set(row.product_id, list)
    }

    const optionsByProduct = new Map<string, ProductVariantOptionView[]>()
    for (const row of options.rows) {
      const list = optionsByProduct.get(row.product_id) ?? []
      list.push(mapVariantOption(row))
      optionsByProduct.set(row.product_id, list)
    }

    const variantsByProduct = new Map<string, ProductVariantView[]>()
    for (const row of variants.rows) {
      const list = variantsByProduct.get(row.product_id) ?? []
      list.push(mapVariant(row))
      variantsByProduct.set(row.product_id, list)
    }

    // A bundle's producible quantity depends on the current stock of whatever native products
    // its components reference -- resolved here in one extra batched query (scoped to this same
    // organization, same as everything else in this file) rather than per bundle.
    const referencedIds = [
      ...new Set(
        components.rows
          .map((row) => row.component_ref)
          .filter((ref): ref is string => ref !== null && UUID_PATTERN.test(ref))
      ),
    ]
    const stockByComponentId = new Map<
      string,
      { stockQuantity: number | null; productType: string }
    >()
    if (referencedIds.length > 0) {
      const refPlaceholders = referencedIds.map((_, index) => `$${index + 2}`).join(", ")
      const referenced = await this.database.query<{
        id: string
        product_type: string
        stock_quantity: string | number | null
      }>(
        `SELECT id, product_type, stock_quantity FROM products
         WHERE organization_id = $1 AND id IN (${refPlaceholders})`,
        [organizationId, ...referencedIds]
      )
      for (const row of referenced.rows) {
        stockByComponentId.set(row.id, {
          stockQuantity: toNullableNumber(row.stock_quantity),
          productType: row.product_type,
        })
      }
    }

    return rows.map((row) => {
      const components = componentsByProduct.get(row.id) ?? []
      return {
        id: row.id,
        organizationId: row.organization_id,
        workspaceId: row.workspace_id,
        productType: row.product_type as ProductType,
        name: row.name,
        sku: row.sku,
        category: row.category,
        description: row.description,
        status: row.status as ProductStatus,
        currency: row.currency,
        baseUnit: row.base_unit,
        sellPrice: toNullableNumber(row.sell_price),
        costPrice: toNullableNumber(row.cost_price),
        stockQuantity: toNullableNumber(row.stock_quantity),
        minStock: toNullableNumber(row.min_stock),
        imageUrls: toStringArray(row.image_urls),
        attributes: toJsonObject(row.attributes) as ProductAttributes,
        components,
        variantOptions: optionsByProduct.get(row.id) ?? [],
        variants: variantsByProduct.get(row.id) ?? [],
        taxRateId: row.tax_rate_id,
        priceIncludesTax: row.price_includes_tax,
        createdBy: row.created_by,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        producibleQuantity:
          row.product_type === "bundle"
            ? computeProducibleQuantity(components, stockByComponentId)
            : null,
      }
    })
  }

  // A hand-typed component (componentRef null, customName set -- see ProductComponentInput) is
  // not linked to anything trackable: its "stock" is just a number typed into this one recipe,
  // gone the moment the row is deleted and invisible everywhere else a real product would show
  // up (the Products list, POS, other bundles). Materializing it into a real raw-material
  // product row -- in the same transaction as the bundle itself, so a failure here rolls back
  // the bundle too -- means it becomes exactly that: independently trackable, and never
  // recreated on a later save of this same bundle, since by then its componentRef is no longer
  // null. Runs unconditionally: normalizeProduct already empties `components` for anything that
  // isn't a bundle, so this is a no-op for every other product type.
  private async materializeCustomComponents(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    category: string
    currency: string
    components: ProductComponentInput[]
  }): Promise<ProductComponentInput[]> {
    const resolved: ProductComponentInput[] = []

    for (const component of input.components) {
      if (component.componentRef !== null || component.customName === null) {
        resolved.push(component)
        continue
      }

      const newId = randomUUID()
      await this.database.query(
        `INSERT INTO products (
           id, organization_id, workspace_id, product_type, name, sku, category, description,
           status, currency, base_unit, sell_price, cost_price, stock_quantity, min_stock,
           image_urls, attributes, tax_rate_id, price_includes_tax, created_by
         ) VALUES ($1, $2, $3, 'raw', $4, NULL, $5, '', 'active', $6, $7, NULL, NULL, $8, NULL,
           '[]'::jsonb, '{}'::jsonb, NULL, false, $9)`,
        [
          newId,
          input.organizationId,
          input.workspaceId,
          component.customName,
          input.category,
          input.currency,
          BASE_UNIT_BY_COMPONENT_UNIT[component.stockUnit],
          component.customStock ?? 0,
          input.createdBy,
        ]
      )

      resolved.push({ ...component, componentRef: newId, customName: null, customStock: null })
    }

    return resolved
  }

  // A full replace rather than a field-by-field patch: the form always submits the whole
  // product, and the children (components, options, variants) have no stable client-side
  // identity to diff against, so they are rewritten wholesale inside the same transaction.
  async update(input: {
    organizationId: string
    workspaceId: string | null
    updatedBy: string | null
    id: string
    product: CreateProductInput
  }): Promise<ProductView | null> {
    let updated = false

    await this.database.withTransaction(async () => {
      const result = await this.database.query(
        `UPDATE products SET
           product_type = $3, name = $4, sku = $5, category = $6, description = $7,
           status = $8, currency = $9, base_unit = $10, sell_price = $11, cost_price = $12,
           stock_quantity = $13, min_stock = $14, image_urls = $15::jsonb,
           attributes = $16::jsonb, tax_rate_id = $17, price_includes_tax = $18, updated_at = now()
         WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [
          input.organizationId,
          input.id,
          input.product.productType,
          input.product.name,
          input.product.sku,
          input.product.category,
          input.product.description,
          input.product.status,
          input.product.currency,
          input.product.baseUnit,
          input.product.sellPrice,
          input.product.costPrice,
          input.product.stockQuantity,
          input.product.minStock,
          JSON.stringify(input.product.imageUrls),
          JSON.stringify(input.product.attributes),
          input.product.taxRateId,
          input.product.priceIncludesTax,
        ]
      )

      if (result.rowCount === 0) return
      updated = true

      await this.database.query(`DELETE FROM product_components WHERE product_id = $1`, [input.id])
      await this.database.query(`DELETE FROM product_variant_options WHERE product_id = $1`, [
        input.id,
      ])
      await this.database.query(`DELETE FROM product_variants WHERE product_id = $1`, [input.id])

      const components = await this.materializeCustomComponents({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        createdBy: input.updatedBy,
        category: input.product.category,
        currency: input.product.currency,
        components: input.product.components,
      })

      await this.insertChildren(input.id, { ...input.product, components })
    })

    return updated ? this.findById(input.organizationId, input.id) : null
  }

  // The product and its children are one unit: a bundle with no components or a variable
  // product with no variants is not a valid half-state to leave behind, so a failure part-way
  // through the children rolls the parent back too.
  async create(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    product: CreateProductInput
  }): Promise<ProductView> {
    const productId = randomUUID()

    await this.database.withTransaction(async () => {
      await this.database.query(
        `INSERT INTO products (
           id, organization_id, workspace_id, product_type, name, sku, category, description,
           status, currency, base_unit, sell_price, cost_price, stock_quantity, min_stock,
           image_urls, attributes, tax_rate_id, price_includes_tax, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16::jsonb, $17::jsonb, $18, $19, $20)`,
        [
          productId,
          input.organizationId,
          input.workspaceId,
          input.product.productType,
          input.product.name,
          input.product.sku,
          input.product.category,
          input.product.description,
          input.product.status,
          input.product.currency,
          input.product.baseUnit,
          input.product.sellPrice,
          input.product.costPrice,
          input.product.stockQuantity,
          input.product.minStock,
          JSON.stringify(input.product.imageUrls),
          JSON.stringify(input.product.attributes),
          input.product.taxRateId,
          input.product.priceIncludesTax,
          input.createdBy,
        ]
      )

      const components = await this.materializeCustomComponents({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        createdBy: input.createdBy,
        category: input.product.category,
        currency: input.product.currency,
        components: input.product.components,
      })

      await this.insertChildren(productId, { ...input.product, components })
    })

    const created = await this.findById(input.organizationId, productId)
    if (!created) {
      throw new Error("Product row disappeared immediately after creation.")
    }
    return created
  }

  // Shared by create and update: both write the same child rows, and update rewrites them
  // wholesale after clearing the old ones.
  private async insertChildren(productId: string, product: CreateProductInput) {
    for (const [index, component] of product.components.entries()) {
      await this.database.query(
        `INSERT INTO product_components (
           id, product_id, component_ref, custom_name, custom_stock, required_quantity,
           required_unit, stock_unit, conversion_factor, note, position
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          productId,
          component.componentRef,
          component.customName,
          component.customStock,
          component.requiredQuantity,
          component.requiredUnit,
          component.stockUnit,
          component.conversionFactor,
          component.note,
          index,
        ]
      )
    }

    for (const [index, option] of product.variantOptions.entries()) {
      await this.database.query(
        `INSERT INTO product_variant_options (id, product_id, name, option_values, position)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [randomUUID(), productId, option.name, JSON.stringify(option.values), index]
      )
    }

    for (const [index, variant] of product.variants.entries()) {
      await this.database.query(
        `INSERT INTO product_variants (
           id, product_id, sku, price, stock, option_values, position
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          randomUUID(),
          productId,
          variant.sku,
          variant.price,
          variant.stock,
          JSON.stringify(variant.optionValues),
          index,
        ]
      )
    }
  }
}
