import { IdentityError } from "../application/errors/IdentityError"

import type { NormalizedProduct, NormalizedProductStatus } from "./service"
import type { TaxRatesService } from "../tax/tax-rates-service"
import type { ProductCatalogRepository } from "./catalog-repository"
import {
  buildComponent,
  buildQuickVariants,
  buildVariantsFromRows,
  generateImportSku,
  MAX_QUICK_VARIANTS,
  parseImportNumber,
  parseQuickOptions,
  recipeUnitOf,
  type ResolvedComponentTarget,
} from "./catalog-import"
import {
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
  type ProductVariantInput,
  type ProductVariantOptionInput,
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

  async lookupBySku(
    organizationId: string,
    sku: string
  ): Promise<{ productId: string; variantId: string | null } | null> {
    return this.repository.findByAnySku(organizationId, sku)
  }

  async update(input: {
    organizationId: string
    id: string
    updatedBy: string | null
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

    const updated = await this.repository.update({
      organizationId: input.organizationId,
      id: input.id,
      workspaceId: current.workspaceId,
      updatedBy: input.updatedBy,
      product: normalized,
    })
    if (!updated) throw PRODUCT_ERRORS.notFound()
    return updated
  }

  // A products-list "select several, change their status" quick action -- see
  // catalog-repository.ts's bulkUpdateStatus for why this never touches update()'s full-replace
  // path. Silently ignores any id this organization doesn't actually own rather than failing the
  // whole batch over one bad id -- the caller (server.ts) reports back how many actually changed.
  async bulkUpdateStatus(
    organizationId: string,
    ids: string[],
    status: ProductStatus
  ): Promise<number> {
    const uniqueIds = [...new Set(ids)].filter((id) => UUID_PATTERN.test(id))
    if (uniqueIds.length === 0) return 0
    return this.repository.bulkUpdateStatus(organizationId, uniqueIds, status)
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

  // A spreadsheet import -- every row goes through the exact same create()/update() above
  // (numbering, validation, SKU-conflict check included), so an imported product can never be
  // valid by different rules than one typed into the Add Product form. A row whose SKU already
  // exists updates that product instead of failing as a duplicate; one without a SKU matches an
  // existing product of the same type by its exact name, and is otherwise created with a
  // generated SKU. Only bad rows are skipped and reported back; one row's problem never fails the
  // rest of the file. Bundles are imported last, so a component naming a product from the same
  // file finds it already saved.
  async bulkImport(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    rows: BulkImportProductRow[]
  }): Promise<BulkImportProductResult> {
    const result: BulkImportProductResult = { created: 0, updated: 0, unchanged: 0, skipped: [] }
    const prepared: PreparedImportRow[] = []

    input.rows.forEach((row, index) => {
      const rowNumber = row.sourceRow ?? index + 1
      const name = row.name.trim()
      if (!name) {
        result.skipped.push({ row: rowNumber, reason: "الاسم مطلوب" })
        return
      }

      const rawType = (row.productType ?? "").trim().toLowerCase()
      const productType = (rawType || "simple") as ProductType
      if (!(PRODUCT_TYPES as readonly string[]).includes(productType)) {
        result.skipped.push({ row: rowNumber, reason: `نوع المنتج "${rawType}" غير معروف` })
        return
      }

      const rawStatus = (row.status ?? "").trim().toLowerCase()
      if (rawStatus && !(PRODUCT_STATUSES as readonly string[]).includes(rawStatus)) {
        result.skipped.push({ row: rowNumber, reason: `حالة غير معروفة "${rawStatus}"` })
        return
      }

      prepared.push({
        row,
        rowNumber,
        name,
        productType,
        status: rawStatus ? (rawStatus as ProductStatus) : null,
      })
    })

    const ordered = [
      ...prepared.filter((entry) => entry.productType !== "bundle"),
      ...prepared.filter((entry) => entry.productType === "bundle"),
    ]
    const context: ImportContext = {
      ...input,
      catalogue: ordered.length > 0 ? await this.repository.list(input.organizationId, null) : [],
      idByRef: new Map(),
    }

    for (const entry of ordered) {
      try {
        const outcome = await this.importRow(context, entry)
        result[outcome.kind] += 1
        const ref = entry.row.ref?.trim()
        if (ref) context.idByRef.set(ref.toLowerCase(), outcome.product.id)
        context.catalogue = [
          outcome.product,
          ...context.catalogue.filter((product) => product.id !== outcome.product.id),
        ]
      } catch (error) {
        result.skipped.push({ row: entry.rowNumber, reason: describeImportError(error) })
      }
    }

    result.skipped.sort((left, right) => left.row - right.row)
    return result
  }

  private async importRow(
    context: ImportContext,
    entry: PreparedImportRow
  ): Promise<{ kind: "created" | "updated" | "unchanged"; product: ProductView }> {
    const { row, name } = entry
    const rowSku = row.sku?.trim() || null
    const structure = suppliedStructure(row)
    const existing = await this.findImportMatch(context, {
      productType: entry.productType,
      name,
      sku: TYPES_WITHOUT_SKU.includes(entry.productType) ? null : rowSku,
      structure,
    })
    // A flat sheet (a CSV report, a merchant's own list) cannot describe sizes/colours or a
    // bundle's recipe, so it reads every row as a regular product. Matched to a variable product
    // or a bundle and carrying none of that structure, the row is that product -- its type is
    // kept, never flattened into a regular product that loses its variants or components.
    const productType =
      existing && keepsStructuredType(existing.productType, structure)
        ? existing.productType
        : entry.productType
    const carriesSku = !TYPES_WITHOUT_SKU.includes(productType)
    const typedSku = carriesSku ? rowSku : null
    // A new product the sheet gave no stock code gets one generated, and a stocked one with no
    // quantity starts at zero -- the two things a merchant's own list most often leaves out, and
    // neither worth refusing the row over. A matched product keeps its own (a blank cell never
    // overwrites).
    const sku =
      typedSku ?? (carriesSku && !existing ? generateImportSku(catalogueSkus(context)) : null)
    const sellPrice = parseImportNumber(row.sellPrice)
    const typedStock = parseImportNumber(row.stockQuantity)
    const stockQuantity =
      typedStock ?? (!existing && TYPES_REQUIRING_STOCK.includes(productType) ? 0 : null)

    let variantOptions: ProductVariantOptionInput[] = []
    let variants: ProductVariantInput[] = []
    if (productType === "variable") {
      const variantRows = row.variants ?? []
      if (variantRows.length > 0) {
        ;({ variantOptions, variants } = buildVariantsFromRows(variantRows, {
          price: sellPrice,
          stock: stockQuantity,
        }))
        // A new product's variants left without a code get "<product sku>-<n>", like quick
        // variants do, so each can still be scanned at the till.
        if (!existing && sku) {
          variants = variants.map((variant, index) =>
            variant.sku ? variant : { ...variant, sku: `${sku}-${index + 1}` }
          )
        }
      } else if (row.options?.trim()) {
        const options = parseQuickOptions(row.options)
        if (!options) {
          throw new ImportRowError(
            "صيغة عمود الخيارات غير صحيحة -- مثال: اللون: أحمر|أزرق ; المقاس: M|L"
          )
        }
        const count = options.reduce((total, option) => total * option.values.length, 1)
        if (count > MAX_QUICK_VARIANTS) {
          throw new ImportRowError(
            `عدد المتغيرات (${count}) أكبر من الحد المسموح (${MAX_QUICK_VARIANTS})`
          )
        }
        variantOptions = options
        variants = buildQuickVariants(options, { sku, price: sellPrice, stock: stockQuantity })
      }
    }

    const components =
      productType === "bundle"
        ? (row.components ?? [])
            .filter((component) => component.component.trim() !== "")
            .map((component) =>
              buildComponent(component, resolveComponentTarget(context, component.component))
            )
        : []

    if (!existing) {
      const product = await this.create({
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        createdBy: context.createdBy,
        product: {
          productType,
          name,
          sku,
          // Category is optional -- a blank cell leaves the product uncategorized.
          category: row.category?.trim() || "",
          description: row.description?.trim() || "",
          status: entry.status ?? "draft",
          currency: "SAR",
          baseUnit: row.baseUnit?.trim() || null,
          sellPrice,
          costPrice: parseImportNumber(row.costPrice),
          stockQuantity,
          minStock: parseImportNumber(row.minStock),
          imageUrls: [],
          attributes: {},
          components,
          variantOptions,
          variants,
          // Imported rows always use the organization's default rate and tax-exclusive prices --
          // the same defaults a manually created product gets; there is no column for either.
          taxRateId: null,
          priceIncludesTax: false,
        },
      })
      return { kind: "created", product }
    }

    // A blank cell keeps what the product already has -- the sheet only has to carry what is
    // changing. Images, attributes and tax settings have no column at all and are always kept.
    const base = productToInput(existing)
    const suppliesVariants = variants.length > 0
    const suppliesComponents = components.length > 0
    const merged: CreateProductInput = {
      ...base,
      productType,
      name,
      sku: typedSku ?? (carriesSku ? base.sku : null),
      category: row.category?.trim() || base.category,
      description: row.description?.trim() || base.description,
      status: entry.status ?? base.status,
      baseUnit: row.baseUnit?.trim() || base.baseUnit,
      sellPrice: sellPrice ?? base.sellPrice,
      costPrice: parseImportNumber(row.costPrice) ?? base.costPrice,
      stockQuantity: typedStock ?? base.stockQuantity,
      minStock: parseImportNumber(row.minStock) ?? base.minStock,
      variantOptions: suppliesVariants ? variantOptions : base.variantOptions,
      variants: suppliesVariants
        ? variants.map((variant) => {
            // Same rule per variant: one the product already has (by its option values) keeps
            // its saved code and stock where the sheet left them blank.
            const key = variant.optionValues.join("\u0000")
            const saved = base.variants.find(
              (candidate) => candidate.optionValues.join("\u0000") === key
            )
            if (!saved) return variant
            return {
              ...variant,
              sku: variant.sku ?? saved.sku,
              price: variant.price ?? saved.price,
              stock: variant.stock ?? saved.stock,
            }
          })
        : base.variants,
      components: suppliesComponents
        ? components.map((component) => {
            // A hand-named component keeps the stock figure it was saved with -- the sheet has no
            // column for it, and dropping it would rebuild an untouched bundle on every import.
            const saved = component.customName
              ? base.components.find((candidate) => candidate.customName === component.customName)
              : undefined
            return saved ? { ...component, customStock: saved.customStock } : component
          })
        : base.components,
    }

    if (JSON.stringify(normalizeProduct(merged)) === JSON.stringify(normalizeProduct(base))) {
      return { kind: "unchanged", product: existing }
    }

    const product = await this.update({
      organizationId: context.organizationId,
      id: existing.id,
      updatedBy: context.createdBy,
      product: merged,
    })
    return { kind: "updated", product }
  }

  private async findImportMatch(
    context: ImportContext,
    row: {
      productType: ProductType
      name: string
      sku: string | null
      structure: { variants: boolean; components: boolean }
    }
  ): Promise<ProductView | null> {
    if (row.sku) {
      const match = await this.repository.findBySku(context.organizationId, row.sku)
      return match ? this.repository.findById(context.organizationId, match.id) : null
    }
    // No stock code (a raw material or bundle never has one, and a merchant's own list often
    // leaves it out): the same type with the exact same name is the same product, so importing
    // the same file twice updates instead of duplicating.
    return (
      context.catalogue.find(
        (product) => product.productType === row.productType && product.name === row.name
      ) ??
      // Failing that, a variable product or bundle of that name, when the row carries none of
      // the structure that would make it something else (see keepsStructuredType).
      context.catalogue.find(
        (product) =>
          product.name === row.name && keepsStructuredType(product.productType, row.structure)
      ) ??
      null
    )
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

interface PreparedImportRow {
  row: BulkImportProductRow
  rowNumber: number
  name: string
  productType: ProductType
  // Null when the cell was blank: a new product defaults to draft, an updated one keeps its own.
  status: ProductStatus | null
}

interface ImportContext {
  organizationId: string
  workspaceId: string | null
  createdBy: string | null
  // Every native product, kept current as the import saves rows -- what a raw material or bundle
  // without a SKU, and a bundle component named by SKU or name, is matched against.
  catalogue: ProductView[]
  // Lower-cased product code (the sheet's ref column) -> the product saved for it.
  idByRef: Map<string, string>
}

function suppliedStructure(row: BulkImportProductRow): { variants: boolean; components: boolean } {
  return {
    variants: (row.variants?.length ?? 0) > 0 || Boolean(row.options?.trim()),
    components: (row.components?.length ?? 0) > 0,
  }
}

// Whether a saved product of this type stays that type for an import row bringing no variants
// (for a variable product) or no components (for a bundle).
function keepsStructuredType(
  savedType: ProductType,
  structure: { variants: boolean; components: boolean }
): boolean {
  if (savedType === "variable") return !structure.variants
  if (savedType === "bundle") return !structure.components
  return false
}

// Every stock code already taken -- products' and their variants' -- for a generated one to avoid.
function catalogueSkus(context: ImportContext): Set<string> {
  const taken = new Set<string>()
  for (const product of context.catalogue) {
    if (product.sku) taken.add(product.sku)
    for (const variant of product.variants) if (variant.sku) taken.add(variant.sku)
  }
  return taken
}

// A reason the import itself works out (a malformed quick-variants cell, say), reported as-is.
class ImportRowError extends Error {}

const STOREFRONT_REF_PATTERN = /^(salla|zid|shopify):\S+$/i

function resolveComponentTarget(context: ImportContext, text: string): ResolvedComponentTarget {
  const value = text.trim()
  if (STOREFRONT_REF_PATTERN.test(value)) {
    return { kind: "product", ref: value.toLowerCase(), stockUnit: null }
  }

  const refId = context.idByRef.get(value.toLowerCase())
  const product =
    (refId ? context.catalogue.find((candidate) => candidate.id === refId) : undefined) ??
    context.catalogue.find((candidate) => candidate.sku === value) ??
    context.catalogue.find((candidate) => candidate.name === value)
  if (product) {
    return { kind: "product", ref: product.id, stockUnit: recipeUnitOf(product.baseUnit) }
  }
  return { kind: "custom", name: value }
}

// A saved product back in the create/update input shape -- children rebuilt field by field, in
// the same key order the import's own builders use, so an untouched row compares equal.
function productToInput(product: ProductView): CreateProductInput {
  return {
    productType: product.productType,
    name: product.name,
    sku: product.sku,
    category: product.category,
    description: product.description,
    status: product.status,
    currency: product.currency,
    baseUnit: product.baseUnit,
    sellPrice: product.sellPrice,
    costPrice: product.costPrice,
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    imageUrls: product.imageUrls,
    attributes: product.attributes,
    components: product.components.map((component) => ({
      componentRef: component.componentRef,
      customName: component.customName,
      customStock: component.customStock,
      requiredQuantity: component.requiredQuantity,
      requiredUnit: component.requiredUnit,
      stockUnit: component.stockUnit,
      conversionFactor: component.conversionFactor,
      note: component.note,
    })),
    variantOptions: product.variantOptions.map((option) => ({
      name: option.name,
      values: option.values,
    })),
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      price: variant.price,
      stock: variant.stock,
      optionValues: variant.optionValues,
    })),
    taxRateId: product.taxRateId,
    priceIncludesTax: product.priceIncludesTax,
  }
}

const IMPORT_FIELD_LABEL_AR: Record<string, string> = {
  name: "الاسم",
  category: "الفئة",
  sku: "رمز المخزون (SKU)",
  sellPrice: "سعر البيع",
  stockQuantity: "الكمية بالمخزون",
  description: "الوصف",
  variantOptions: "خيارات المنتج",
  variants: "المتغيرات",
  components: "مكونات الحزمة",
}

// Reuses create()'s own real validation/conflict errors rather than re-deriving a reason, so the
// message a user sees for a skipped row can never disagree with why it was actually rejected.
function describeImportError(error: unknown): string {
  if (error instanceof ImportRowError) return error.message
  if (error instanceof IdentityError) {
    if (error.code === "PRODUCT_SKU_TAKEN") {
      return "رمز المخزون (SKU) مستخدم بالفعل"
    }
    if (error.code === "PRODUCT_VALIDATION_FAILED") {
      // "variants.2.price" reads as the variants it belongs to, not a dotted path.
      const fields = Object.keys((error.details?.fields as Record<string, string>) ?? {}).map(
        (field) => field.split(".")[0]
      )
      const labels = [...new Set(fields.map((field) => IMPORT_FIELD_LABEL_AR[field] ?? field))]
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
// the figure a storefront listing shows. A bundle's availability is derived from its components'
// stock (see producibleQuantity, computed in catalog-repository.ts's hydrate()) rather than a
// stock_quantity of its own, which the row never carries.
export function toNormalizedProduct(product: ProductView): NormalizedProduct {
  const variantStock = product.variants.reduce((total, variant) => total + (variant.stock ?? 0), 0)
  const variantPrices = product.variants
    .map((variant) => variant.price)
    .filter((price): price is number => price !== null)

  const availableStock =
    product.productType === "variable"
      ? variantStock
      : product.productType === "bundle"
        ? (product.producibleQuantity ?? 0)
        : (product.stockQuantity ?? 0)

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
    isNative: true,
    workspaceId: product.workspaceId,
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
    // A variable product's prices live on its variants, not a single value here -- a bundle DOES
    // carry its own real sell price, same as any other sellable type (see
    // TYPES_REQUIRING_SELL_PRICE).
    sellPrice: isVariable ? null : input.sellPrice,
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
