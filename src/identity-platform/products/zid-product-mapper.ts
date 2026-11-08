import type {
  CreateProductInput,
  ProductVariantInput,
  ProductVariantOptionInput,
} from "./catalog-types"

// Confirmed live against the real connected sandbox store (GET /products/{id}/): name/categories
// are bilingual {en, ar} objects, price/cost are plain numbers (not {amount, currency} like
// Salla), and stock is NOT a flat top-level `quantity` (often null) -- it lives in `stocks[]`, one
// entry per stock location, each with its own `is_infinite`/`available_quantity`. The text shown
// under a product is `short_description` ({ar, en}); each product carries its own `currency`.
//
// Variants (docs.zid.sa/get-a-product-by-id): a product with options is a `structure: "parent"`
// whose `variants[]` are full child products (`structure: "child"`, `parent_id` set) -- each with
// its own id, sku, price and stocks, and `attributes[]` naming its option values ("Color: Red").
// Only the single-product endpoint includes `variants[]`; the list endpoint leaves it out, so a
// parent seen in a list is re-fetched before it is mapped (sync-service.ts / webhook-service.ts).
export interface ZidProductStock {
  is_infinite?: boolean
  available_quantity?: number | null
}

type ZidLocalizedText = string | { en?: string | null; ar?: string | null } | null

export interface ZidProductAttribute {
  slug?: string | null
  name?: ZidLocalizedText
  value?: ZidLocalizedText
}

export interface ZidProductApiPayload {
  id: string | number
  name?: ZidLocalizedText
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
  structure?: "standalone" | "parent" | "child" | string | null
  parent_id?: string | null
  description?: ZidLocalizedText
  short_description?: ZidLocalizedText
  currency?: string | null
  attributes?: ZidProductAttribute[] | null
  variants?: ZidProductApiPayload[] | null
}

// Used only when a payload carries no currency of its own -- Zid always sends one today.
const FALLBACK_CURRENCY = "SAR"

// Same precedence normalizeZidProduct already uses (products/service.ts) -- prefer English,
// fall back to Arabic, then empty.
function localizedText(value: ZidLocalizedText | undefined): string {
  if (typeof value === "string") return value.trim()
  return (value?.en?.trim() || value?.ar?.trim()) ?? ""
}

// A parent seen in a list response has has_options but no variants[] yet -- it still needs the
// single-product fetch before it can be mapped with its variants.
export function needsZidVariantFetch(payload: ZidProductApiPayload): boolean {
  return (
    (payload.structure === "parent" || payload.has_options === true) &&
    (payload.variants ?? []).length === 0
  )
}

export function isZidVariantChild(payload: ZidProductApiPayload): boolean {
  return payload.structure === "child" && Boolean(payload.parent_id)
}

// A judgment call, not a confirmed product decision: Madar's native product model has no
// "infinite stock" concept today. If ANY stock location is marked infinite, this treats the
// product as effectively untracked by reporting a large sentinel figure rather than 0 (0 would
// make the product look falsely out-of-stock everywhere it's sold) -- otherwise sums each
// location's own available_quantity, the real number for a store that doesn't use infinite stock.
// Exported so the reverse direction (zid-product-stock-push-service.ts, pushing a Madar sale's
// new stock figure back to Zid) can recognize this exact figure and push `is_infinite: true`
// instead of a concrete (and wrong) quantity for a product Zid itself tracks as unlimited.
export const INFINITE_STOCK_SENTINEL = 999_999

export function resolveStockQuantity(payload: ZidProductApiPayload): number {
  const stocks = payload.stocks ?? []
  if (stocks.length === 0) return payload.quantity ?? 0
  if (stocks.some((stock) => stock.is_infinite)) return INFINITE_STOCK_SENTINEL
  return stocks.reduce((sum, stock) => sum + (stock.available_quantity ?? 0), 0)
}

// Builds the option groups ("درجة اللون": 12, 55, ...) from the variants' own attributes, and one
// native variant per Zid child, in the same order as payload.variants -- the promotion service
// links each native variant back to its Zid child by that position. validateVariable
// (catalog-service.ts) wants every variant to name a value for every option, and no two variants
// to share a combination: a child missing an attribute, or repeating another's combination, gets
// a value made from its own sku/id so the product still imports whole.
function buildVariantOptionsAndVariants(children: ZidProductApiPayload[]): {
  variantOptions: ProductVariantOptionInput[]
  variants: ProductVariantInput[]
} {
  const groupNames: string[] = []
  const groupKeyIndex = new Map<string, number>()
  const attributesOf = (child: ZidProductApiPayload) =>
    (child.attributes ?? []).map((attribute) => ({
      key: (attribute.slug ?? "").trim() || localizedText(attribute.name),
      name: localizedText(attribute.name) || (attribute.slug ?? "").trim(),
      value: localizedText(attribute.value),
    }))
  for (const child of children) {
    for (const attribute of attributesOf(child)) {
      if (!attribute.key || groupKeyIndex.has(attribute.key)) continue
      groupKeyIndex.set(attribute.key, groupNames.length)
      groupNames.push(attribute.name)
    }
  }
  // A parent whose children carry no attributes at all still imports, as one "النوع" option.
  if (groupNames.length === 0) groupNames.push("النوع")

  const valuesByGroup: string[][] = groupNames.map(() => [])
  const addValue = (groupIndex: number, value: string) => {
    if (!valuesByGroup[groupIndex].includes(value)) valuesByGroup[groupIndex].push(value)
  }
  const seen = new Set<string>()
  const variants = children.map((child) => {
    const fallbackLabel = (child.sku ?? "").trim() || String(child.id).slice(0, 8)
    const optionValues = new Array<string>(groupNames.length).fill("")
    for (const attribute of attributesOf(child)) {
      const groupIndex = groupKeyIndex.get(attribute.key)
      if (groupIndex !== undefined && attribute.value) optionValues[groupIndex] = attribute.value
    }
    optionValues.forEach((value, groupIndex) => {
      if (!value) optionValues[groupIndex] = fallbackLabel
    })
    if (seen.has(optionValues.join(" / "))) {
      const last = optionValues.length - 1
      optionValues[last] = `${optionValues[last]} (${fallbackLabel})`
    }
    seen.add(optionValues.join(" / "))
    optionValues.forEach((value, groupIndex) => addValue(groupIndex, value))
    return {
      sku: (child.sku ?? "").trim() || null,
      price: child.price ?? 0,
      stock: resolveStockQuantity(child),
      optionValues,
    }
  })

  return {
    variantOptions: groupNames.map((name, groupIndex) => ({
      name,
      values: valuesByGroup[groupIndex],
    })),
    variants,
  }
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

  const base = {
    name,
    sku,
    category,
    description: localizedText(payload.description) || localizedText(payload.short_description),
    status,
    currency: (payload.currency ?? "").trim().toUpperCase() || FALLBACK_CURRENCY,
    baseUnit: null,
    costPrice: payload.cost ?? null,
    minStock: null,
    imageUrls,
    attributes: {},
    components: [],
    taxRateId: null,
    priceIncludesTax: false,
  } satisfies Partial<CreateProductInput>

  const children = payload.variants ?? []
  if (children.length > 0) {
    const { variantOptions, variants } = buildVariantOptionsAndVariants(children)
    return {
      ...base,
      productType: "variable",
      // A variable product carries no price/stock of its own -- each variant does.
      sellPrice: null,
      stockQuantity: null,
      variantOptions,
      variants,
    }
  }

  return {
    ...base,
    productType: "simple",
    sellPrice: payload.price ?? 0,
    stockQuantity: resolveStockQuantity(payload),
    variantOptions: [],
    variants: [],
  }
}
