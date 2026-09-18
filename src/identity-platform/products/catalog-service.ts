import { IdentityError } from "../application/errors/IdentityError"

import type { NormalizedProduct, NormalizedProductStatus } from "./service"
import type { TaxRatesService } from "../tax/tax-rates-service"
import type { ProductCatalogRepository } from "./catalog-repository"
import {
  FLAT_IMPORTABLE_TYPES,
  isProductUnit,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  TYPES_REQUIRING_SELL_PRICE,
  TYPES_REQUIRING_STOCK,
  TYPES_WITHOUT_SKU,
  unitsShareDimension,
  type BulkImportProductResult,
  type BulkImportProductRow,
  type CreateProductInput,
  type ProductStatus,
  type ProductType,
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
  unknownTaxRate: () =>
    new IdentityError(
      "PRODUCT_UNKNOWN_TAX_RATE",
      422,
      "validation",
      "The selected tax rate does not exist in this organization."
    ),
}

export class ProductCatalogService {
  constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly taxRatesService: TaxRatesService
  ) {}

  // A product's own tax_rate_id has to be a real rate this organization owns -- otherwise a sale
  // of this product would silently resolve to "no rate found" at checkout time instead of
  // failing loudly here, when the product is actually saved.
  private async assertTaxRateExists(organizationId: string, taxRateId: string | null) {
    if (!taxRateId) return
    const rates = await this.taxRatesService.list(organizationId)
    if (!rates.some((rate) => rate.id === taxRateId)) {
      throw PRODUCT_ERRORS.unknownTaxRate()
    }
  }

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

  async update(input: {
    organizationId: string
    id: string
    product: CreateProductInput
  }): Promise<ProductView> {
    if (!UUID_PATTERN.test(input.id)) throw PRODUCT_ERRORS.notFound()

    const normalized = normalizeProduct(input.product)
    const fields = validateProduct(normalized)

    if (Object.keys(fields).length > 0) {
      throw PRODUCT_ERRORS.validation(fields)
    }

    // Existence is settled before the stock-code check. The other order reports "code taken" for
    // a product that does not exist, because the code legitimately belongs to some other row --
    // a confusing answer to a request that was never going to apply to anything.
    const current = await this.repository.findById(input.organizationId, input.id)
    if (!current) throw PRODUCT_ERRORS.notFound()

    if (normalized.sku) {
      const existing = await this.repository.findBySku(input.organizationId, normalized.sku)
      // A product keeping its own code is not a conflict -- only another row holding it is.
      if (existing && existing.id !== input.id) {
        throw PRODUCT_ERRORS.duplicateSku(normalized.sku)
      }
    }

    await this.assertTaxRateExists(input.organizationId, normalized.taxRateId)

    const updated = await this.repository.update({ ...input, product: normalized })
    if (!updated) throw PRODUCT_ERRORS.notFound()
    return updated
  }

  async delete(organizationId: string, id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) throw PRODUCT_ERRORS.notFound()

    // Only products authored here can be deleted. A synced storefront product is owned by
    // Salla/Shopify/Zid -- it has no row in this table, and the next sync would bring it back
    // regardless, so pretending to delete it would be a lie.
    const deleted = await this.repository.softDelete(organizationId, id)
    if (!deleted) throw PRODUCT_ERRORS.notFound()
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

    await this.assertTaxRateExists(input.organizationId, normalized.taxRateId)

    return this.repository.create({ ...input, product: normalized })
  }

  // A CSV import -- every row goes through the exact same create() above (numbering, validation,
  // SKU-conflict check included), so a bulk-imported product can never be valid by different
  // rules than one typed into the Add Product form. Only bad rows are skipped and reported back;
  // one row's problem never fails the rest of the file. See catalog-types.ts's
  // BulkImportProductRow for why bundle/variable rows can't be represented here at all.
  async bulkImport(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    rows: BulkImportProductRow[]
  }): Promise<BulkImportProductResult> {
    let created = 0
    const skipped: BulkImportProductResult["skipped"] = []

    for (let index = 0; index < input.rows.length; index += 1) {
      const row = input.rows[index]
      const name = row.name.trim()
      if (!name) {
        skipped.push({ row: index + 1, reason: "الاسم مطلوب" })
        continue
      }

      const rawType = (row.productType ?? "").trim().toLowerCase()
      const productType = (rawType || "simple") as ProductType
      if (!(PRODUCT_TYPES as readonly string[]).includes(productType)) {
        skipped.push({ row: index + 1, reason: `نوع المنتج "${rawType}" غير معروف` })
        continue
      }
      if (!FLAT_IMPORTABLE_TYPES.includes(productType)) {
        skipped.push({
          row: index + 1,
          reason:
            "منتجات الحزم والمنتجات متعددة الخيارات لا يمكن استيرادها من ملف -- أضفها يدوياً من صفحة إضافة منتج",
        })
        continue
      }

      const rawStatus = (row.status ?? "").trim().toLowerCase()
      const status = (rawStatus || "draft") as ProductStatus
      if (!(PRODUCT_STATUSES as readonly string[]).includes(status)) {
        skipped.push({ row: index + 1, reason: `حالة غير معروفة "${rawStatus}"` })
        continue
      }

      try {
        await this.create({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          createdBy: input.createdBy,
          product: {
            productType,
            name,
            sku: row.sku?.trim() || null,
            // Unlike every other optional column, create() requires a category unconditionally
            // (validateProduct below) regardless of product type -- a blank cell defaults to
            // "عام" (general) rather than skipping the whole row over what is, for a quick bulk
            // import, a genuinely cosmetic field.
            category: row.category?.trim() || "عام",
            description: row.description?.trim() || "",
            status,
            currency: "SAR",
            baseUnit: row.baseUnit?.trim() || null,
            sellPrice: parseImportNumber(row.sellPrice),
            costPrice: parseImportNumber(row.costPrice),
            stockQuantity: parseImportNumber(row.stockQuantity),
            minStock: parseImportNumber(row.minStock),
            imageUrls: [],
            attributes: {},
            components: [],
            variantOptions: [],
            variants: [],
            // Bulk-imported rows always use the organization's default rate -- there is no CSV
            // column for a per-product override yet; assign one afterwards from the product's own
            // edit form if it needs one.
            taxRateId: null,
            // Bulk-imported prices are treated as tax-exclusive (net), the same default a manually
            // created product gets -- there is no CSV column to say otherwise.
            priceIncludesTax: false,
          },
        })
        created += 1
      } catch (error) {
        skipped.push({ row: index + 1, reason: describeImportError(error) })
      }
    }

    return { created, skipped }
  }

  // Bulk-flips every priced native product between tax-inclusive and tax-exclusive pricing, in
  // response to Settings -> الضرائب -> "الأسعار تشمل الضريبة" being applied to "جميع المنتجات
  // الحالية" (as opposed to "المنتجات الجديدة فقط", which only changes what new products default
  // to and never calls this method). Converts each product's own stored sell_price by its own
  // effective rate (its own tax_rate_id override, or the organization's default) so the same real
  // shelf price keeps being charged either way -- a 115 SAR tax-inclusive product at 15% VAT
  // becomes a 100 SAR tax-exclusive product, not a 115 SAR one that would now also have 15% added
  // on top.
  async applyPriceTaxConvention(
    organizationId: string,
    includeTax: boolean
  ): Promise<{ updated: number }> {
    const products = await this.repository.listPriceable(organizationId)
    const toConvert = products.filter((product) => product.priceIncludesTax !== includeTax)
    if (toConvert.length === 0) return { updated: 0 }

    const defaultRatePercent = await this.taxRatesService.getDefaultRatePercent(organizationId)
    const overrideIds = [
      ...new Set(
        toConvert.map((product) => product.taxRateId).filter((id): id is string => id !== null)
      ),
    ]
    const overrideRates =
      overrideIds.length > 0
        ? await this.taxRatesService.getRatePercentsByIds(organizationId, overrideIds)
        : new Map<string, number>()

    const updates = toConvert.map((product) => {
      const rate = product.taxRateId
        ? (overrideRates.get(product.taxRateId) ?? defaultRatePercent)
        : defaultRatePercent
      const sellPrice = includeTax
        ? Math.round(product.sellPrice * (1 + rate) * 100) / 100
        : Math.round((product.sellPrice / (1 + rate)) * 100) / 100
      return { id: product.id, sellPrice, priceIncludesTax: includeTax }
    })

    await this.repository.applyPriceTaxConversion(organizationId, updates)
    return { updated: updates.length }
  }
}

function parseImportNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const IMPORT_FIELD_LABEL_AR: Record<string, string> = {
  name: "الاسم",
  category: "الفئة",
  sku: "رمز المخزون (SKU)",
  sellPrice: "سعر البيع",
  stockQuantity: "الكمية بالمخزون",
  description: "الوصف",
}

// Reuses create()'s own real validation/conflict errors rather than re-deriving a reason, so the
// message a user sees for a skipped row can never disagree with why it was actually rejected.
function describeImportError(error: unknown): string {
  if (error instanceof IdentityError) {
    if (error.code === "PRODUCT_SKU_TAKEN") {
      return "رمز المخزون (SKU) مستخدم بالفعل"
    }
    if (error.code === "PRODUCT_VALIDATION_FAILED") {
      const fields = Object.keys((error.details?.fields as Record<string, string>) ?? {})
      const labels = fields.map((field) => IMPORT_FIELD_LABEL_AR[field] ?? field)
      if (labels.length > 0) {
        return `حقول ناقصة أو غير صحيحة لهذا النوع من المنتجات: ${labels.join("، ")}`
      }
    }
  }
  return "تعذر إنشاء هذا المنتج"
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
    baseUnit: product.baseUnit,
    taxRateId: product.taxRateId,
    priceIncludesTax: product.priceIncludesTax,
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
