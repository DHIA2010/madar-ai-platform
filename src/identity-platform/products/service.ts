import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { ProductType } from "./catalog-types"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export type NormalizedProductStatus = "Active" | "Draft" | "Archived"

// "Madar" is a product authored in this platform (the native catalogue, migration 047) rather
// than synced from a storefront. It shares this shape so a single list can show both.
export type NormalizedProductPlatform = "Salla" | "Shopify" | "Zid" | "Madar"

export interface NormalizedProduct {
  id: string
  name: string
  sku: string
  category: string
  status: NormalizedProductStatus
  availableStock: number
  costPrice: number | null
  sellingPrice: number
  currency: string | null
  platform: NormalizedProductPlatform
  // Null for a synced product: Salla, Shopify and Zid have no equivalent of our product-type
  // vocabulary, so the type is genuinely unknown rather than defaulted to something plausible.
  // Only native (Madar-authored) products carry one, which is what lets a bundle's component
  // picker offer raw materials alone.
  productType: ProductType | null
  // Also null for a synced product: the storefronts do not expose a unit of measure, and it is
  // what lets a carton product be linked to the piece product it packages.
  baseUnit: string | null
  // Also null for a synced product -- only a native product can carry its own tax_rate_id
  // override (Settings -> المنتجات -> الضريبة); everything else uses the organization's default
  // rate. Lets the POS cart compute its live preview per line instead of one blanket rate,
  // matching invoices-service.ts's own real per-line calculation.
  taxRateId: string | null
  // Also false for a synced product -- a storefront's own price is whatever the storefront says
  // it is, with no Madar-side gross/net convention to track. Only a native product can be
  // switched between tax-inclusive and tax-exclusive pricing (Settings -> الضرائب -> "الأسعار
  // تشمل الضريبة").
  priceIncludesTax: boolean
  image: string | null
  activityDate: string
  // True for every row backed by a real products.id -- a genuinely native product AND a
  // synced product that's been auto-promoted/linked (see SallaProductPromotionService/
  // ZidProductPromotionService). `platform` on a promoted row names where it came from (can read
  // "Salla"/"Zid", not "Madar" -- see the /v1/products route's platform override), but it is
  // still a real, editable, stock-tracked, sellable row underneath, unlike a raw synced display
  // row (isNative: false) that has no products.id at all and is read-only here by nature.
  // Anything that gates actual Madar-side behavior (edit/delete, bulk status change, "usable as a
  // packaging/purchase/order line item") must check this, never `platform === "Madar"` -- that
  // string comparison is only ever correct for telling origin apart, not for what a row can do.
  isNative: boolean
}

interface CommerceRecordRow {
  entity_id: string
  payload: Record<string, unknown>
  updated_at: Date | string
  [key: string]: unknown
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Confirmed against a real synced Salla product payload (stage: salla_records, entity_type
// 'products'): price/regular_price/sale_price/taxed_price are all {amount, currency} objects;
// cost_price and quantity are plain values; there's no explicit publish-state enum on the
// product itself, so "is_available" (directly present, unambiguous) drives Active/Archived
// rather than guessing at the meaning of the separate stock-flavored "status" string field.
function normalizeSallaProduct(row: CommerceRecordRow): NormalizedProduct {
  const payload = row.payload as {
    name?: string
    sku?: string
    price?: { amount?: number; currency?: string }
    cost_price?: string | number
    quantity?: number
    is_available?: boolean
    categories?: Array<{ name?: string }>
    main_image?: string
    thumbnail?: string
    images?: Array<{ url?: string }>
  }

  return {
    id: `salla:${row.entity_id}`,
    name: payload.name ?? "",
    sku: payload.sku ?? "",
    category: payload.categories?.[0]?.name ?? "",
    status: payload.is_available ? "Active" : "Archived",
    availableStock: toNumber(payload.quantity),
    costPrice: toNullableNumber(payload.cost_price),
    sellingPrice: toNumber(payload.price?.amount),
    currency: payload.price?.currency ?? null,
    platform: "Salla",
    productType: null,
    baseUnit: null,
    taxRateId: null,
    priceIncludesTax: false,
    image: payload.main_image ?? payload.thumbnail ?? payload.images?.[0]?.url ?? null,
    activityDate: toIsoDate(row.updated_at),
    isNative: false,
  }
}

// Confirmed against a real synced Shopify product payload (stage: shopify_records, entity_type
// 'products'): status is Shopify's own "active"/"draft"/"archived" enum (maps directly), price
// and inventory_quantity live on the first variant (this connector doesn't sync per-variant
// rows separately), and there's no cost-of-goods field on the product/variant object itself
// (Shopify exposes that via a separate, unsynced InventoryItem lookup) -- left null rather than
// guessed.
function normalizeShopifyProduct(row: CommerceRecordRow): NormalizedProduct {
  const payload = row.payload as {
    title?: string
    status?: string
    product_type?: string
    tags?: string
    variants?: Array<{ sku?: string; price?: string; inventory_quantity?: number }>
    image?: { src?: string }
    images?: Array<{ src?: string }>
  }
  const primaryVariant = payload.variants?.[0]

  const status: NormalizedProductStatus =
    payload.status === "active" ? "Active" : payload.status === "draft" ? "Draft" : "Archived"

  return {
    id: `shopify:${row.entity_id}`,
    name: payload.title ?? "",
    sku: primaryVariant?.sku ?? "",
    category: payload.product_type || (payload.tags?.split(",")[0]?.trim() ?? ""),
    status,
    availableStock: toNumber(primaryVariant?.inventory_quantity),
    costPrice: null,
    sellingPrice: toNumber(primaryVariant?.price),
    currency: null,
    platform: "Shopify",
    productType: null,
    baseUnit: null,
    taxRateId: null,
    priceIncludesTax: false,
    image: payload.image?.src ?? payload.images?.[0]?.src ?? null,
    activityDate: toIsoDate(row.updated_at),
    isNative: false,
  }
}

// Confirmed against Zid's official docs (docs.zid.sa/retrieve-a-list-of-products): name and
// category names are bilingual objects ({ar, en}), price/sale_price/cost are plain numbers (not
// {amount, currency} like Salla), and publish state is two explicit booleans (is_published/
// is_draft) rather than a single enum -- Draft only applies when is_published is false and
// is_draft is true, otherwise Archived.
function normalizeZidProduct(row: CommerceRecordRow): NormalizedProduct {
  const payload = row.payload as {
    name?: string | { en?: string; ar?: string }
    sku?: string
    price?: number
    cost?: number
    quantity?: number
    is_published?: boolean
    is_draft?: boolean
    categories?: Array<{ name?: string | { en?: string; ar?: string } }>
    images?: Array<{ image?: { large?: string; thumbnail?: string } }>
  }

  function localizedText(value: string | { en?: string; ar?: string } | undefined): string {
    if (typeof value === "string") return value
    return value?.en ?? value?.ar ?? ""
  }

  const status: NormalizedProductStatus = payload.is_published
    ? "Active"
    : payload.is_draft
      ? "Draft"
      : "Archived"

  return {
    id: `zid:${row.entity_id}`,
    name: localizedText(payload.name),
    sku: payload.sku ?? "",
    category: localizedText(payload.categories?.[0]?.name),
    status,
    availableStock: toNumber(payload.quantity),
    costPrice: toNullableNumber(payload.cost),
    sellingPrice: toNumber(payload.price),
    currency: null,
    platform: "Zid",
    productType: null,
    baseUnit: null,
    taxRateId: null,
    priceIncludesTax: false,
    image: payload.images?.[0]?.image?.large ?? payload.images?.[0]?.image?.thumbnail ?? null,
    activityDate: toIsoDate(row.updated_at),
    isNative: false,
  }
}

const MAX_PRODUCTS_PER_PROVIDER = 500

export class ProductsAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  async listProducts(actor: AuthenticatedActor): Promise<NormalizedProduct[]> {
    const [promotedSallaIds, promotedZidIds] = await Promise.all([
      this.fetchPromotedProductIds("salla_product_links", "salla_product_id", actor.organizationId),
      this.fetchPromotedProductIds("zid_product_links", "zid_product_id", actor.organizationId),
    ])

    const [salla, shopify, zid] = await Promise.all([
      this.fetchProvider({
        recordsTable: "salla_records",
        connectionsTable: "salla_oauth_connections",
        actor,
        normalize: normalizeSallaProduct,
        // A variable Salla product is never self-linked by its own top-level id -- it's linked
        // per-variant, one row per sku (see SallaProductPromotionService.linkVariants; a
        // product-level link is actively rejected for a "variable" product type). So "already
        // promoted" for a product with skus means "any one of its own sku ids is linked", not
        // "the product's own id is linked" -- the same candidateIds rule promoteOrSync itself
        // uses to decide whether a product has already been promoted.
        isPromoted: (row, promotedIds) => {
          const skuIds = ((row.payload as { skus?: Array<{ id?: unknown }> }).skus ?? []).map(
            (sku) => String(sku.id)
          )
          const candidateIds = skuIds.length > 0 ? skuIds : [row.entity_id]
          return candidateIds.some((id) => promotedIds.has(id))
        },
        promotedIds: promotedSallaIds,
      }),
      this.fetchProvider({
        recordsTable: "shopify_records",
        connectionsTable: "shopify_oauth_connections",
        actor,
        normalize: normalizeShopifyProduct,
      }),
      this.fetchProvider({
        recordsTable: "zid_records",
        connectionsTable: "zid_oauth_connections",
        actor,
        normalize: normalizeZidProduct,
        // Zid has no variant support (products/zid-product-mapper.ts maps every product to
        // "simple"), so a product is always self-linked by its own top-level id -- the plain
        // single-id check is correct here, unlike Salla above.
        isPromoted: (row, promotedIds) => promotedIds.has(row.entity_id),
        promotedIds: promotedZidIds,
      }),
    ])

    return [...salla, ...shopify, ...zid].sort((a, b) =>
      b.activityDate.localeCompare(a.activityDate)
    )
  }

  // The reverse of fetchPromotedProductIds: which native products.id rows are actually a
  // promoted/linked Salla or Zid product, keyed by the native row's own id rather than the
  // provider's id -- what the /v1/products route needs to relabel a native row's `platform` to
  // say where it actually came from, instead of always "Madar".
  async fetchLinkedNativeProductIds(
    table: "salla_product_links" | "zid_product_links",
    organizationId: string
  ): Promise<Set<string>> {
    const result = await this.db.query<{ product_id: string }>(
      `SELECT DISTINCT product_id FROM ${table} WHERE organization_id = $1`,
      [organizationId]
    )
    return new Set(result.rows.map((row) => row.product_id))
  }

  private async fetchPromotedProductIds(
    table: "salla_product_links" | "zid_product_links",
    column: "salla_product_id" | "zid_product_id",
    organizationId: string
  ): Promise<Set<string>> {
    const result = await this.db.query<Record<string, string>>(
      `SELECT ${column} FROM ${table} WHERE organization_id = $1`,
      [organizationId]
    )
    return new Set(result.rows.map((row) => row[column]))
  }

  private async fetchProvider(input: {
    recordsTable: "salla_records" | "shopify_records" | "zid_records"
    connectionsTable:
      | "salla_oauth_connections"
      | "shopify_oauth_connections"
      | "zid_oauth_connections"
    actor: AuthenticatedActor
    normalize: (row: CommerceRecordRow) => NormalizedProduct
    // A product that's been auto-promoted/linked to a native product (see
    // SallaProductPromotionService/ZidProductPromotionService) already appears as that native
    // row -- excluded here (before normalizing) so it doesn't also show up as its own, now-stale,
    // read-only synced display row too. Absent for a provider with no promotion/linking yet
    // (Shopify), which keeps every row exactly as it always showed.
    isPromoted?: (row: CommerceRecordRow, promotedIds: Set<string>) => boolean
    promotedIds?: Set<string>
  }): Promise<NormalizedProduct[]> {
    const result = await this.db.query<CommerceRecordRow>({
      name: `products-aggregation-${input.recordsTable}`,
      text: `
        SELECT r.entity_id, r.payload, r.updated_at
        FROM ${input.recordsTable} r
        JOIN ${input.connectionsTable} c ON c.id = r.connection_id
        WHERE c.organization_id = $1
          AND c.deleted_at IS NULL
          AND c.status = 'connected'
          AND r.entity_type = 'products'
          AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
        ORDER BY r.updated_at DESC
        LIMIT $3
      `,
      values: [
        input.actor.organizationId,
        input.actor.workspaceId ?? null,
        MAX_PRODUCTS_PER_PROVIDER,
      ],
    })

    const rows =
      input.isPromoted && input.promotedIds
        ? result.rows.filter((row) => !input.isPromoted!(row, input.promotedIds!))
        : result.rows

    return rows.map(input.normalize)
  }
}
