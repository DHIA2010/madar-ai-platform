import type { CreateProductInput } from "./catalog-types"

// Confirmed live against the real connected sandbox store (GET /products/{id}/): name/categories
// are bilingual {en, ar} objects, price/cost are plain numbers (not {amount, currency} like
// Salla), and stock is NOT a flat top-level `quantity` (often null) -- it lives in `stocks[]`, one
// entry per stock location, each with its own `is_infinite`/`available_quantity`. `has_options`
// confirms Zid does support variants, but no real example with it populated was available this
// session -- products with has_options: true are mapped as simple for now (their real stock/
// price still come through correctly; only their variant structure isn't represented), flagged
// explicitly here rather than guessing a shape.
export interface ZidProductStock {
  is_infinite?: boolean
  available_quantity?: number | null
}

export interface ZidProductApiPayload {
  id: string | number
  name?: string | { en?: string; ar?: string }
  sku?: string | null
  price?: number | null
  cost?: number | null
  quantity?: number | null
  is_published?: boolean
  is_draft?: boolean
  categories?: Array<{ name?: string | { en?: string; ar?: string } }>
  images?: Array<{ image?: { large?: string; thumbnail?: string } }>
  stocks?: ZidProductStock[]
  has_options?: boolean
}

// Same precedence normalizeZidProduct already uses (products/service.ts) -- prefer English,
// fall back to Arabic, then empty.
function localizedText(value: string | { en?: string; ar?: string } | undefined): string {
  if (typeof value === "string") return value
  return value?.en ?? value?.ar ?? ""
}

// A judgment call, not a confirmed product decision: Madar's native product model has no
// "infinite stock" concept today. If ANY stock location is marked infinite, this treats the
// product as effectively untracked by reporting a large sentinel figure rather than 0 (0 would
// make the product look falsely out-of-stock everywhere it's sold) -- otherwise sums each
// location's own available_quantity, the real number for a store that doesn't use infinite stock.
const INFINITE_STOCK_SENTINEL = 999_999

function resolveStockQuantity(payload: ZidProductApiPayload): number {
  const stocks = payload.stocks ?? []
  if (stocks.length === 0) return payload.quantity ?? 0
  if (stocks.some((stock) => stock.is_infinite)) return INFINITE_STOCK_SENTINEL
  return stocks.reduce((sum, stock) => sum + (stock.available_quantity ?? 0), 0)
}

export function mapZidProductToCreateInput(
  payload: ZidProductApiPayload,
  fallbackCategory: string
): CreateProductInput {
  const name = localizedText(payload.name) || `Zid #${payload.id}`
  const sku = (payload.sku ?? "").trim() || `ZID-${payload.id}`
  const category = localizedText(payload.categories?.[0]?.name) || fallbackCategory
  const imageUrls = (payload.images ?? [])
    .map((image) => image.image?.large ?? image.image?.thumbnail)
    .filter((url): url is string => Boolean(url))
  const status = payload.is_published ? "active" : payload.is_draft ? "draft" : "archived"

  return {
    productType: "simple",
    name,
    sku,
    category,
    description: "",
    status,
    currency: "SAR",
    baseUnit: null,
    sellPrice: payload.price ?? 0,
    costPrice: payload.cost ?? null,
    stockQuantity: resolveStockQuantity(payload),
    minStock: null,
    imageUrls,
    attributes: {},
    components: [],
    variantOptions: [],
    variants: [],
    taxRateId: null,
    priceIncludesTax: false,
  }
}
