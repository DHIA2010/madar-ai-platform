import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type {
  CreateProductInput,
  ProductAttributes,
  ProductComponentView,
  ProductStatus,
  ProductType,
  ProductUnit,
  ProductVariantOptionView,
  ProductVariantView,
  ProductView,
} from "./catalog-types"

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
    image_urls, attributes, created_by, created_at, updated_at
  FROM products
`

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

  async findBySku(organizationId: string, sku: string): Promise<{ id: string } | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM products
       WHERE organization_id = $1 AND sku = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [organizationId, sku]
    )
    return result.rows[0] ?? null
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

    return this.hydrate(result.rows)
  }

  async findById(organizationId: string, id: string): Promise<ProductView | null> {
    const result = await this.database.query<ProductRow>(
      `${PRODUCT_SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (!result.rows[0]) return null
    const [hydrated] = await this.hydrate(result.rows)
    return hydrated ?? null
  }

  // One round trip per child table for the whole page of products rather than per product --
  // a 200-product list would otherwise issue 600 queries.
  private async hydrate(rows: ProductRow[]): Promise<ProductView[]> {
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

    return rows.map((row) => ({
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
      components: componentsByProduct.get(row.id) ?? [],
      variantOptions: optionsByProduct.get(row.id) ?? [],
      variants: variantsByProduct.get(row.id) ?? [],
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }))
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
           image_urls, attributes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16::jsonb, $17::jsonb, $18)`,
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
          input.createdBy,
        ]
      )

      for (const [index, component] of input.product.components.entries()) {
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

      for (const [index, option] of input.product.variantOptions.entries()) {
        await this.database.query(
          `INSERT INTO product_variant_options (id, product_id, name, option_values, position)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [randomUUID(), productId, option.name, JSON.stringify(option.values), index]
        )
      }

      for (const [index, variant] of input.product.variants.entries()) {
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
    })

    const created = await this.findById(input.organizationId, productId)
    if (!created) {
      throw new Error("Product row disappeared immediately after creation.")
    }
    return created
  }
}
