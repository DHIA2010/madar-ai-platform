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

// Types that must carry their own selling price. A bundle is priced from its components, a
// variable product prices each variant in its own row, and a raw material may be bought but
// never sold -- none of the three has a single price of its own.
export const TYPES_REQUIRING_SELL_PRICE: ProductType[] = [
  "simple",
  "weighted",
  "service",
  "digital",
]

// Types that hold stock directly. A bundle's availability is derived from its components, a
// variable product holds stock per variant, and a service or digital download has none.
export const TYPES_REQUIRING_STOCK: ProductType[] = ["raw", "simple", "weighted"]

export const PRODUCT_UNITS = ["حبة", "كرتون", "جرام", "كجم", "مل", "لتر"] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]

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
  createdBy: string | null
  createdAt: string
  updatedAt: string
}
