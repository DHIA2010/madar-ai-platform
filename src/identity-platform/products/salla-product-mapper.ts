import type {
  CreateProductInput,
  ProductVariantOptionInput,
  ProductVariantInput,
} from "./catalog-types"

// Confirmed live against the real connected sandbox store (GET /admin/v2/products/{id}): a plain
// product has no options/skus at all; a product WITH variants carries both -- options[] is the
// axis definitions (e.g. "المقاس"/size -> ["44 - XL", "42 - L", ...]), skus[] is one row per
// actual sellable combination, each with its OWN stock_quantity and a related_option_values id
// array that must be cross-referenced against options[].values[].id to recover which combination
// it is (skus[] carries no human-readable value name of its own).
export interface SallaProductOptionValue {
  id: number
  name: string
}

export interface SallaProductOption {
  id: number
  name: string
  purpose?: string
  values: SallaProductOptionValue[]
}

export interface SallaProductSku {
  id: number | string
  sku?: string | null
  price?: { amount?: number; currency?: string } | null
  regular_price?: { amount?: number; currency?: string } | null
  stock_quantity?: number | null
  related_option_values?: number[]
}

export interface SallaProductApiPayload {
  id: number | string
  name?: string
  sku?: string | null
  price?: { amount?: number; currency?: string } | null
  cost_price?: string | number | null
  quantity?: number | null
  is_available?: boolean
  categories?: Array<{ name?: string }>
  main_image?: string | null
  images?: Array<{ url?: string }>
  options?: SallaProductOption[]
  skus?: SallaProductSku[]
}

function buildImageUrls(payload: SallaProductApiPayload): string[] {
  const urls = [payload.main_image, ...(payload.images ?? []).map((image) => image.url)].filter(
    (url): url is string => Boolean(url)
  )
  return [...new Set(urls)]
}

// skus[] carries no human-readable option-value name of its own -- only related_option_values, an
// array of option-value ids that must be resolved against options[].values[].id. Builds variants
// in the SAME order variantOptions was built in (both derived from the same filtered options
// array), since validateVariable (catalog-service.ts) requires each variant's optionValues to
// line up positionally with variantOptions, not by name.
function buildVariantOptionsAndVariants(
  variantOptionGroups: SallaProductOption[],
  skus: SallaProductSku[]
): { variantOptions: ProductVariantOptionInput[]; variants: ProductVariantInput[] } {
  const groupIndexByValueId = new Map<number, number>()
  const valueNameById = new Map<number, string>()
  const valuesByGroup: string[][] = variantOptionGroups.map((group) =>
    group.values.map((value) => value.name)
  )
  variantOptionGroups.forEach((group, groupIndex) => {
    for (const value of group.values) {
      groupIndexByValueId.set(value.id, groupIndex)
      valueNameById.set(value.id, value.name)
    }
  })

  const variants: ProductVariantInput[] = skus.map((sku) => {
    const optionValues = new Array<string>(variantOptionGroups.length).fill("")
    const resolved = new Array<boolean>(variantOptionGroups.length).fill(false)
    for (const valueId of sku.related_option_values ?? []) {
      const groupIndex = groupIndexByValueId.get(valueId)
      const valueName = valueNameById.get(valueId)
      if (groupIndex !== undefined && valueName !== undefined) {
        optionValues[groupIndex] = valueName
        resolved[groupIndex] = true
      }
    }
    // Confirmed live: a real Salla product can leave related_option_values missing an id for one
    // axis on some of its skus. Left blank, two such skus can collapse onto the same combination
    // and get rejected as a duplicate by validateVariable (catalog-service.ts), failing promotion
    // for the WHOLE product. A label built from the sku's own (always-unique) id keeps every real
    // sku as its own distinct variant instead of silently losing the product to a validation error.
    resolved.forEach((isResolved, groupIndex) => {
      if (isResolved) return
      const placeholder = `SKU ${sku.id}`
      optionValues[groupIndex] = placeholder
      if (!valuesByGroup[groupIndex].includes(placeholder)) {
        valuesByGroup[groupIndex].push(placeholder)
      }
    })
    return {
      sku: sku.sku?.trim() || null,
      price: sku.price?.amount ?? sku.regular_price?.amount ?? 0,
      stock: sku.stock_quantity ?? 0,
      optionValues,
    }
  })

  const variantOptions: ProductVariantOptionInput[] = variantOptionGroups.map(
    (group, groupIndex) => ({
      name: group.name,
      values: valuesByGroup[groupIndex],
    })
  )

  return { variantOptions, variants }
}

// Maps a real Salla product payload (the same shape the poll/webhook ingestion paths already
// fetch) into a native CreateProductInput -- used by SallaProductPromotionService to auto-create/
// update the linked native product on every sync. fallbackCategory is passed in rather than
// hardcoded here, since category is a required, non-nullable field (catalog-service.ts:444) but a
// real Salla product can have an empty categories array.
export function mapSallaProductToCreateInput(
  payload: SallaProductApiPayload,
  fallbackCategory: string
): CreateProductInput {
  const variantOptionGroups = (payload.options ?? []).filter(
    (option) => option.purpose === "variants"
  )
  const isVariable = variantOptionGroups.length > 0 && Boolean(payload.skus?.length)

  const name = (payload.name ?? "").trim() || `Salla #${payload.id}`
  // Both "simple" and "variable" require a non-null top-level sku (TYPES_WITHOUT_SKU only
  // excludes raw/bundle) -- a real Salla product's own top-level sku field can be empty,
  // especially for a variable product whose real SKUs live under skus[] instead.
  const sku = (payload.sku ?? "").trim() || `SALLA-${payload.id}`
  const category = payload.categories?.[0]?.name?.trim() || fallbackCategory
  const imageUrls = buildImageUrls(payload)
  const status = payload.is_available ? "active" : "draft"
  const currency = payload.price?.currency || "SAR"

  const base: Omit<
    CreateProductInput,
    "productType" | "sellPrice" | "stockQuantity" | "variantOptions" | "variants"
  > = {
    name,
    sku,
    category,
    description: "",
    status,
    currency,
    baseUnit: null,
    costPrice: payload.cost_price != null ? Number(payload.cost_price) : null,
    minStock: null,
    imageUrls,
    attributes: {},
    components: [],
    taxRateId: null,
    priceIncludesTax: false,
  }

  if (!isVariable) {
    return {
      ...base,
      productType: "simple",
      sellPrice: payload.price?.amount ?? 0,
      stockQuantity: payload.quantity ?? 0,
      variantOptions: [],
      variants: [],
    }
  }

  const { variantOptions, variants } = buildVariantOptionsAndVariants(
    variantOptionGroups,
    payload.skus ?? []
  )

  return {
    ...base,
    productType: "variable",
    // A variable product carries no price/stock of its own -- each variant does. Matches
    // normalizeProduct's own forcing of these fields to null for this type.
    sellPrice: null,
    stockQuantity: null,
    variantOptions,
    variants,
  }
}
