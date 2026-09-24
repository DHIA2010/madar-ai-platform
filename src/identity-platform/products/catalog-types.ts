// Types for the native (Madar-authored) product catalogue -- the write side that migration 047
// introduced. Deliberately separate from products/service.ts, whose NormalizedProduct describes
// a read-only product synced from Salla/Shopify/Zid.

export const PRODUCT_TYPES = [
  "raw",
  "simple",
  "bundle",
  "variable",
  "weighted",
  "service",
  "digital",
] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

// A bundle is identified by its components and a raw material by its own stock record, so
// neither carries a stock code. Mirrors TYPES_WITHOUT_SKU on the Add Product page.
export const TYPES_WITHOUT_SKU: ProductType[] = ["raw", "bundle"]

// Types that must carry their own selling price -- a bundle is sold at its own set combo price
// (not derived from its components' cost), same as any other sellable product. A variable
// product prices each variant in its own row instead, and a raw material may be bought but never
// sold, so neither of those two has a single price of its own.
export const TYPES_REQUIRING_SELL_PRICE: ProductType[] = [
  "simple",
  "weighted",
  "service",
  "digital",
  "bundle",
]

// Types that hold stock directly. A bundle's availability is derived from its components, a
// variable product holds stock per variant, and a service or digital download has none.
export const TYPES_REQUIRING_STOCK: ProductType[] = ["raw", "simple", "weighted"]

export const PRODUCT_UNITS = ["حبة", "كرتون", "جرام", "كجم", "مل", "لتر"] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]

// A product's own baseUnit carries an English abbreviation the Add Product page displays
// ("حبة (PCS)") -- this is the reverse of that page's own baseUnitShort (baseUnit.split(" ")[0]),
// used when a bundle component materializes into a real product (see
// ProductCatalogRepository.materializeCustomComponents) so the new row's baseUnit round-trips
// back through the same picker instead of showing as an unrecognized value.
export const BASE_UNIT_BY_COMPONENT_UNIT: Record<ProductUnit, string> = {
  حبة: "حبة (PCS)",
  كرتون: "كرتون (CTN)",
  جرام: "جرام (G)",
  كجم: "كجم (KG)",
  مل: "مل (ML)",
  لتر: "لتر (L)",
}

// Each unit reduces to a base dimension, so a recipe measured in جرام can be checked against
// stock counted in كجم. Units in different dimensions never convert by formula -- an item
// specific pairing (حبة against كجم) needs a conversion factor supplied per component.
// Kept in step with the same table in the Add Product page.
export const UNIT_BASE: Record<
  ProductUnit,
  { dimension: "count" | "pack" | "mass" | "volume"; factor: number }
> = {
  حبة: { dimension: "count", factor: 1 },
  // A carton has no universal size -- 12 waters, 6 oils, 24 juices -- so it sits in its own
  // dimension and can never be bridged to pieces by formula. A recipe pairing the two must
  // supply the count explicitly, which is what the conversion factor is for.
  كرتون: { dimension: "pack", factor: 1 },
  جرام: { dimension: "mass", factor: 1 },
  كجم: { dimension: "mass", factor: 1000 },
  مل: { dimension: "volume", factor: 1 },
  لتر: { dimension: "volume", factor: 1000 },
}

export function isProductUnit(value: string): value is ProductUnit {
  return (PRODUCT_UNITS as readonly string[]).includes(value)
}

export function unitsShareDimension(left: ProductUnit, right: ProductUnit): boolean {
  return UNIT_BASE[left].dimension === UNIT_BASE[right].dimension
}

// How many of a component's own stock units a bundle recipe's required quantity actually
// consumes -- a same-dimension pair (جرام required against كجم stock) converts by the unit
// table's own factor ratio; a cross-dimension pair (validated at authoring time, see
// validateBundle in catalog-service.ts) has no formula to bridge it, so it uses the recipe's own
// conversionFactor instead, which is authored as "how many stock units make one recipe unit."
// Used both when a sale consumes a bundle's components and when a return gives them back (see
// PosInvoicesService.computeStockConsumption).
export function convertRequiredQuantityToStock(
  component: {
    requiredUnit: ProductUnit
    stockUnit: ProductUnit
    conversionFactor: number | null
  },
  requiredQuantity: number
): number {
  if (unitsShareDimension(component.requiredUnit, component.stockUnit)) {
    return (
      (requiredQuantity * UNIT_BASE[component.requiredUnit].factor) /
      UNIT_BASE[component.stockUnit].factor
    )
  }
  return requiredQuantity * (component.conversionFactor ?? 0)
}

// The inverse of convertRequiredQuantityToStock: how much of a component's current stock is
// worth in the recipe's own required unit -- used to work out how many times a bundle could
// actually be produced from what its components have on hand right now (see
// computeProducibleQuantity in catalog-repository.ts, and the same calculation mirrored
// client-side in the Add Product page's `resolvedComponents`). A cross-dimension pair with no
// conversion factor has no way to answer this, so it returns null rather than a wrong number --
// validateBundle already prevents that pairing from being saved with no factor at all, but an
// existing row's factor is not re-validated as it degrades to something invalid over time.
export function convertStockToRequiredUnit(
  component: {
    requiredUnit: ProductUnit
    stockUnit: ProductUnit
    conversionFactor: number | null
  },
  stockQuantity: number
): number | null {
  if (unitsShareDimension(component.requiredUnit, component.stockUnit)) {
    return (
      (stockQuantity * UNIT_BASE[component.stockUnit].factor) /
      UNIT_BASE[component.requiredUnit].factor
    )
  }
  if (component.conversionFactor === null || component.conversionFactor <= 0) return null
  return stockQuantity / component.conversionFactor
}

export interface ProductComponentInput {
  // A catalogue reference ("salla:123", or a native product's uuid as text) or null when the
  // component is named by hand. Exactly one of componentRef / customName is set.
  componentRef: string | null
  customName: string | null
  customStock: number | null
  requiredQuantity: number
  requiredUnit: ProductUnit
  stockUnit: ProductUnit
  conversionFactor: number | null
  note: string | null
}

export interface ProductVariantOptionInput {
  name: string
  values: string[]
}

export interface ProductVariantInput {
  sku: string | null
  price: number | null
  stock: number | null
  optionValues: string[]
}

export interface ProductAttributes {
  // How many base units make one carton of this product. A carton has no universal size, so it
  // is recorded per product rather than derived from the unit.
  unitsPerCarton?: number | null
  // The piece-measured product this carton packages. Selling a carton is selling that many of
  // it, so the two stock figures are the same stock counted differently.
  linkedUnitProductId?: string | null
  supplier?: string | null
  stockNotes?: string | null
  stockLocation?: string | null
  batchNumber?: string | null
  brand?: string | null
  model?: string | null
  barcode?: string | null
  countryOfOrigin?: string | null
  minPurchase?: number | null
  internalNotes?: string | null
  expiryDate?: string | null
  pricingType?: string | null
  serviceDuration?: number | null
  serviceDurationUnit?: string | null
  deliveryMethod?: string | null
  bookingEnabled?: boolean | null
  offerPrice?: number | null
  systemRequirements?: string | null
  productLanguage?: string | null
  preparationMinutes?: number | null
}

export interface CreateProductInput {
  productType: ProductType
  name: string
  sku: string | null
  category: string
  description: string
  status: ProductStatus
  currency: string
  baseUnit: string | null
  sellPrice: number | null
  costPrice: number | null
  stockQuantity: number | null
  minStock: number | null
  imageUrls: string[]
  attributes: ProductAttributes
  components: ProductComponentInput[]
  variantOptions: ProductVariantOptionInput[]
  variants: ProductVariantInput[]
  // Null means "use the organization's default rate" (Settings -> الضرائب), re-read fresh at the
  // time of each sale -- never frozen to whatever the default was when this product was created.
  // Set only when this specific product needs its own rate (e.g. exempt, zero-rated).
  taxRateId: string | null
  // Whether sellPrice is already tax-inclusive (what the customer actually pays) or tax-exclusive
  // (VAT added on top at sale time) -- see catalog-service.ts's applyPriceTaxConvention for how a
  // merchant switches an existing product (or every product) between the two.
  priceIncludesTax: boolean
}

export interface ProductComponentView extends ProductComponentInput {
  id: string
  position: number
}

export interface ProductVariantOptionView extends ProductVariantOptionInput {
  id: string
  position: number
}

export interface ProductVariantView extends ProductVariantInput {
  id: string
  position: number
}

export interface ProductView {
  id: string
  organizationId: string
  workspaceId: string | null
  productType: ProductType
  name: string
  sku: string | null
  category: string
  description: string
  status: ProductStatus
  currency: string
  baseUnit: string | null
  sellPrice: number | null
  costPrice: number | null
  stockQuantity: number | null
  minStock: number | null
  imageUrls: string[]
  attributes: ProductAttributes
  components: ProductComponentView[]
  variantOptions: ProductVariantOptionView[]
  variants: ProductVariantView[]
  taxRateId: string | null
  priceIncludesTax: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
  // How many times a bundle could be produced right now from its components' current stock --
  // computed at read time from product_components + the stock of whichever native products they
  // reference (see computeProducibleQuantity in catalog-repository.ts). Null for every
  // non-bundle type, and also null for a bundle none of whose components resolve to a real,
  // stock-tracked figure (an external catalogue reference, or a hand-named component with no
  // customStock).
  producibleQuantity: number | null
}

// A CSV import of native products -- every value arrives as a plain string (or null), the same
// way a spreadsheet cell does, and ProductCatalogService.bulkImport() does all the type coercion
// and per-row validation a single POST /v1/products call already does for one product. Only
// covers the product types a flat spreadsheet row can actually describe (see
// FLAT_IMPORTABLE_TYPES below) -- a bundle needs component references to other products and a
// variable product needs a variant matrix, neither of which fits one row, so a row naming either
// is skipped with a reason rather than forced into a shape that would only confuse whoever filled
// out the sheet.
export interface BulkImportProductRow {
  name: string
  sku: string | null
  category: string | null
  productType: string | null
  status: string | null
  costPrice: string | null
  sellPrice: string | null
  stockQuantity: string | null
  minStock: string | null
  baseUnit: string | null
  description: string | null
}

export interface BulkImportProductResult {
  created: number
  skipped: Array<{ row: number; reason: string }>
}

// The only types a single flat CSV row can fully describe -- a bundle's components and a
// variable product's option/variant matrix both need more structure than one row has room for.
export const FLAT_IMPORTABLE_TYPES: ProductType[] = [
  "raw",
  "simple",
  "weighted",
  "service",
  "digital",
]
