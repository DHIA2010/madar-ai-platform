import { IdentityError } from "../application/errors/IdentityError"

import type { NormalizedProduct, NormalizedProductStatus } from "./service"
import type { ProductCatalogRepository } from "./catalog-repository"
import {
  isProductUnit,
  TYPES_REQUIRING_SELL_PRICE,
  TYPES_REQUIRING_STOCK,
  TYPES_WITHOUT_SKU,
  unitsShareDimension,
  type CreateProductInput,
  type ProductView,
} from "./catalog-types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PRODUCT_ERRORS = {
  notFound: () => new IdentityError("PRODUCT_NOT_FOUND", 404, "business", "Product not found."),
  duplicateSku: (sku: string) =>
    new IdentityError(
      "PRODUCT_SKU_TAKEN",
      409,
      "business",
      `A product with the stock code "${sku}" already exists in this organization.`
    ),
  validation: (fields: Record<string, string>) =>
    new IdentityError("PRODUCT_VALIDATION_FAILED", 422, "validation", "Product is not valid.", {
      fields,
    }),
}

export class ProductCatalogService {
  constructor(private readonly repository: ProductCatalogRepository) {}

  async list(organizationId: string, workspaceId: string | null): Promise<ProductView[]> {
    return this.repository.list(organizationId, workspaceId)
  }

  async getById(organizationId: string, id: string): Promise<ProductView> {
    // products.id is a uuid column, so a non-uuid path segment would make Postgres raise a type
    // error (a 500) for what is really just a request for something that does not exist. The
    // aggregation's ids look like "salla:123", and those legitimately reach this route.
    if (!UUID_PATTERN.test(id)) throw PRODUCT_ERRORS.notFound()

    const product = await this.repository.findById(organizationId, id)
    if (!product) throw PRODUCT_ERRORS.notFound()
    return product
  }

  async create(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    product: CreateProductInput
  }): Promise<ProductView> {
    const normalized = normalizeProduct(input.product)
    const fields = validateProduct(normalized)

    if (Object.keys(fields).length > 0) {
      throw PRODUCT_ERRORS.validation(fields)
    }

    // Checked here for a clear 409 rather than letting uq_products_org_sku surface as an opaque
    // constraint violation. The index is still the authority -- this read-then-write has a gap
    // that two concurrent creates can slip through, and the index closes it.
    if (normalized.sku) {
      const existing = await this.repository.findBySku(input.organizationId, normalized.sku)
      if (existing) throw PRODUCT_ERRORS.duplicateSku(normalized.sku)
    }

    return this.repository.create({ ...input, product: normalized })
  }
}

const STATUS_TO_NORMALIZED: Record<ProductView["status"], NormalizedProductStatus> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
}

// Projects a native product into the shape GET /v1/products already returns for synced ones, so
// both appear in one list without the client having to branch on source.
//
// A variable product has no single stock or price of its own: stock is the sum across its
// variants (what is actually sellable), and the headline price is the cheapest variant, which is
// the figure a storefront listing shows. A bundle's availability is derived from component stock
// held elsewhere, so it reports 0 rather than inventing a number.
export function toNormalizedProduct(product: ProductView): NormalizedProduct {
  const variantStock = product.variants.reduce((total, variant) => total + (variant.stock ?? 0), 0)
  const variantPrices = product.variants
    .map((variant) => variant.price)
    .filter((price): price is number => price !== null)

  const availableStock =
    product.productType === "variable" ? variantStock : (product.stockQuantity ?? 0)

  const sellingPrice =
    product.productType === "variable"
      ? variantPrices.length > 0
        ? Math.min(...variantPrices)
        : 0
      : (product.sellPrice ?? 0)

  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    category: product.category,
    status: STATUS_TO_NORMALIZED[product.status],
    availableStock,
    costPrice: product.costPrice,
    sellingPrice,
    currency: product.currency,
    platform: "Madar",
    productType: product.productType,
    image: product.imageUrls[0] ?? null,
    activityDate: product.updatedAt,
  }
}

// Trims the strings the form sends and drops the fields that do not apply to the chosen type,
// so a service that once had stock typed into it while the author was on another type does not
// silently persist that number.
function normalizeProduct(input: CreateProductInput): CreateProductInput {
  const carriesSku = !TYPES_WITHOUT_SKU.includes(input.productType)
  const holdsStock = TYPES_REQUIRING_STOCK.includes(input.productType)
  const isBundle = input.productType === "bundle"
  const isVariable = input.productType === "variable"

  return {
    ...input,
    name: input.name.trim(),
    sku: carriesSku ? input.sku?.trim() || null : null,
    category: input.category.trim(),
    description: input.description.trim(),
    baseUnit: input.baseUnit?.trim() || null,
    // A variable product's prices live on its variants, and a bundle is priced from its
    // components -- neither carries one of its own.
    sellPrice: isVariable || isBundle ? null : input.sellPrice,
    stockQuantity: holdsStock ? input.stockQuantity : null,
    minStock: holdsStock ? input.minStock : null,
    components: isBundle
      ? input.components.map((component) => ({
          ...component,
          customName: component.customName?.trim() || null,
          note: component.note?.trim() || null,
        }))
      : [],
    variantOptions: isVariable
      ? input.variantOptions.map((option) => ({
          name: option.name.trim(),
          values: option.values.map((value) => value.trim()).filter(Boolean),
        }))
      : [],
    variants: isVariable
      ? input.variants.map((variant) => ({
          ...variant,
          sku: variant.sku?.trim() || null,
        }))
      : [],
  }
}

function validateProduct(product: CreateProductInput): Record<string, string> {
  const fields: Record<string, string> = {}

  if (!product.name) fields.name = "Name is required."
  if (!product.category) fields.category = "Category is required."

  const carriesSku = !TYPES_WITHOUT_SKU.includes(product.productType)
  if (carriesSku && !product.sku) {
    fields.sku = "Stock code is required for this product type."
  }

  if (product.productType === "digital" && !product.description) {
    fields.description = "Description is required for a digital product."
  }

  if (TYPES_REQUIRING_SELL_PRICE.includes(product.productType) && product.sellPrice === null) {
    fields.sellPrice = "Selling price is required for this product type."
  }

  if (TYPES_REQUIRING_STOCK.includes(product.productType) && product.stockQuantity === null) {
    fields.stockQuantity = "Stock quantity is required for this product type."
  }

  if (product.productType === "bundle") {
    validateBundle(product, fields)
  }

  if (product.productType === "variable") {
    validateVariable(product, fields)
  }

  return fields
}

function validateBundle(product: CreateProductInput, fields: Record<string, string>) {
  if (product.components.length === 0) {
    fields.components = "A bundle needs at least one component."
    return
  }

  product.components.forEach((component, index) => {
    const prefix = `components.${index}`

    const hasRef = Boolean(component.componentRef)
    const hasCustomName = Boolean(component.customName)
    if (hasRef === hasCustomName) {
      fields[prefix] =
        "A component must reference a catalogue product or carry a name of its own, not both."
      return
    }

    if (!isProductUnit(component.requiredUnit)) {
      fields[`${prefix}.requiredUnit`] = `Unknown unit "${component.requiredUnit}".`
      return
    }
    if (!isProductUnit(component.stockUnit)) {
      fields[`${prefix}.stockUnit`] = `Unknown unit "${component.stockUnit}".`
      return
    }

    if (component.requiredQuantity <= 0) {
      fields[`${prefix}.requiredQuantity`] = "Required quantity must be greater than zero."
    }

    // Units in different dimensions cannot be bridged by a formula, so the recipe has to say
    // how many stock units make one recipe unit. Without it the available-production figure is
    // not computable at all -- guessing a factor would silently produce wrong stock deductions.
    if (
      !unitsShareDimension(component.requiredUnit, component.stockUnit) &&
      (component.conversionFactor === null || component.conversionFactor <= 0)
    ) {
      fields[`${prefix}.conversionFactor`] =
        `A conversion factor is required to compare ${component.requiredUnit} with ${component.stockUnit}.`
    }
  })
}

function validateVariable(product: CreateProductInput, fields: Record<string, string>) {
  const usableOptions = product.variantOptions.filter(
    (option) => option.name !== "" && option.values.length > 0
  )

  if (usableOptions.length === 0) {
    fields.variantOptions = "A variable product needs at least one option with values."
  }

  if (product.variants.length === 0) {
    fields.variants = "A variable product needs at least one variant."
    return
  }

  // Every kept combination is separately sellable, so each one needs its own price -- this is
  // the rule the page surfaces as "حدد سعراً لكل متغير قبل الحفظ".
  product.variants.forEach((variant, index) => {
    if (variant.price === null) {
      fields[`variants.${index}.price`] = "Every variant needs a price."
    }
    if (variant.optionValues.length !== usableOptions.length && usableOptions.length > 0) {
      fields[`variants.${index}.optionValues`] =
        `Expected ${usableOptions.length} option value(s) for this variant.`
    }
  })

  const seen = new Set<string>()
  for (const [index, variant] of product.variants.entries()) {
    const key = variant.optionValues.join(" / ")
    if (seen.has(key)) {
      fields[`variants.${index}.optionValues`] = `Duplicate variant combination "${key}".`
    }
    seen.add(key)
  }

  const skus = new Set<string>()
  for (const [index, variant] of product.variants.entries()) {
    if (!variant.sku) continue
    if (skus.has(variant.sku)) {
      fields[`variants.${index}.sku`] = `Duplicate variant stock code "${variant.sku}".`
    }
    skus.add(variant.sku)
  }
}
