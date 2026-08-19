import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export type NormalizedProductStatus = "Active" | "Draft" | "Archived"

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
  platform: "Salla" | "Shopify" | "Zid"
  image: string | null
  activityDate: string
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
    image: payload.main_image ?? payload.thumbnail ?? payload.images?.[0]?.url ?? null,
    activityDate: toIsoDate(row.updated_at),
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
    image: payload.image?.src ?? payload.images?.[0]?.src ?? null,
    activityDate: toIsoDate(row.updated_at),
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
    image: payload.images?.[0]?.image?.large ?? payload.images?.[0]?.image?.thumbnail ?? null,
    activityDate: toIsoDate(row.updated_at),
  }
}

const MAX_PRODUCTS_PER_PROVIDER = 500

export class ProductsAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  async listProducts(actor: AuthenticatedActor): Promise<NormalizedProduct[]> {
    const [salla, shopify, zid] = await Promise.all([
      this.fetchProvider({
        recordsTable: "salla_records",
        connectionsTable: "salla_oauth_connections",
        actor,
        normalize: normalizeSallaProduct,
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
      }),
    ])

    return [...salla, ...shopify, ...zid].sort((a, b) =>
      b.activityDate.localeCompare(a.activityDate)
    )
  }

  private async fetchProvider(input: {
    recordsTable: "salla_records" | "shopify_records" | "zid_records"
    connectionsTable:
      | "salla_oauth_connections"
      | "shopify_oauth_connections"
      | "zid_oauth_connections"
    actor: AuthenticatedActor
    normalize: (row: CommerceRecordRow) => NormalizedProduct
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

    return result.rows.map(input.normalize)
  }
}
