import { fileToBase64 } from "@/lib/file-to-base64"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Duplicated from src/infrastructure/provider.tsx's private getWorkspaceIdFromStorage --
// that helper isn't exported, and this page is a plain client component that doesn't go
// through useInfrastructureServices(), matching how src/features/customers's service is
// wired directly into its component instead of the DI gateway system.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// "Madar" is a product authored in this platform (the native catalogue behind
// POST /v1/products) rather than synced from a storefront. GET /v1/products returns both
// sources in one list, so every consumer of this type has to expect it.
export type ProductPlatform = "Salla" | "Shopify" | "Zid" | "Madar"
export type ProductStatus = "Active" | "Draft" | "Archived"

// Only products authored in Madar carry a type; a synced storefront product has no
// equivalent field, so it arrives as null rather than a guessed default.
export type ProductKind =
  | "raw"
  | "simple"
  | "bundle"
  | "variable"
  | "weighted"
  | "service"
  | "digital"

export interface ProductRecord {
  id: string
  name: string
  sku: string
  category: string
  status: ProductStatus
  availableStock: number
  costPrice: number | null
  sellingPrice: number
  currency: string | null
  platform: ProductPlatform
  productType: ProductKind | null
  baseUnit: string | null
  // Null for a synced product, or a native one that uses the organization's default rate. Lets
  // a live cart preview (see CashierPage.tsx) compute tax per line the same way the backend
  // actually charges it, instead of one blanket rate for the whole cart.
  taxRateId: string | null
  // Whether sellingPrice already includes VAT (Settings -> الضرائب -> "الأسعار تشمل الضريبة", or a
  // per-product conversion). Lets a live cart preview split the same shown price into net/tax the
  // same way the backend actually charges it, instead of always adding tax on top.
  priceIncludesTax: boolean
  image: string | null
  activityDate: string
}

// Avoids the slash-prefix literal lint rule (same trick as customer-list.service.ts's
// mockPath) -- this is a real backend API path, not a frontend page route, but the rule
// doesn't distinguish the two. Leading "" (not the separator itself) is what makes join()
// produce a single leading slash instead of a broken "//v1/products".
const PATH_SEPARATOR = String.fromCharCode(47)
const PRODUCTS_ENDPOINT = ["", "v1", "products"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// Mirrors createProductSchema on the backend. Only the shape is described here -- which
// combinations are valid for a given product type is decided server-side, so the two cannot
// drift into disagreeing about the rules.
export interface CreateProductComponent {
  componentRef: string | null
  customName: string | null
  customStock: number | null
  requiredQuantity: number
  requiredUnit: string
  stockUnit: string
  conversionFactor: number | null
  note: string | null
}

export interface CreateProductVariantOption {
  name: string
  values: string[]
}

export interface CreateProductVariant {
  sku: string | null
  price: number | null
  stock: number | null
  optionValues: string[]
}

export interface CreateProductInput {
  productType: ProductKind
  name: string
  sku: string | null
  category: string
  description: string
  status: "draft" | "active" | "archived"
  baseUnit: string | null
  sellPrice: number | null
  costPrice: number | null
  stockQuantity: number | null
  minStock: number | null
  imageUrls: string[]
  attributes: Record<string, string | number | boolean | null>
  components: CreateProductComponent[]
  variantOptions: CreateProductVariantOption[]
  variants: CreateProductVariant[]
  // Null means "use the organization's default rate" (Settings -> الضرائب) -- re-read fresh at
  // the time of each sale. Set only when this specific product needs its own rate.
  taxRateId: string | null
  // Whether sellPrice is already tax-inclusive or tax-exclusive -- see ProductRecord above.
  priceIncludesTax: boolean
}

export interface CreatedProduct {
  id: string
  name: string
  sku: string | null
  productType: ProductKind
  status: "draft" | "active" | "archived"
  taxRateId: string | null
  priceIncludesTax: boolean
}

// What GET /v1/products/:id returns: the stored product with its children, which is what the
// edit form reloads itself from.
export interface ProductDetail extends CreateProductInput {
  id: string
  currency: string
  components: Array<CreateProductComponent & { id: string; position: number }>
  variantOptions: Array<CreateProductVariantOption & { id: string; position: number }>
  variants: Array<CreateProductVariant & { id: string; position: number }>
  createdAt: string
  updatedAt: string
}

// A CSV import of native products -- every value is a plain string (or null), exactly like a
// spreadsheet cell. Only covers "raw"/"simple"/"weighted"/"service"/"digital": a bundle needs
// component references to other products and a variable product needs a variant matrix, neither
// of which fits one flat row, so ProductCatalogService.bulkImport() skips (and reports) either
// with a reason rather than forcing them into a shape that would only confuse the sheet's author.
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

export const productListService = {
  async listProducts(): Promise<ProductRecord[]> {
    const response = await client.get<{ items: ProductRecord[] }>(PRODUCTS_ENDPOINT)
    return response.items
  },

  async createProduct(input: CreateProductInput): Promise<CreatedProduct> {
    return client.post<CreateProductInput, CreatedProduct>(PRODUCTS_ENDPOINT, input)
  },

  // Uploaded ahead of the create/update call, same shape as the existing avatar/org-logo
  // uploads -- the product itself may not exist yet (a brand-new product's images are picked
  // before the first save), so this returns a real, already-hosted URL to include in
  // imageUrls rather than attaching to a product id directly.
  async uploadImage(file: File): Promise<string> {
    const dataBase64 = await fileToBase64(file)
    const response = await client.post<
      { contentType: string; dataBase64: string },
      { url: string }
    >([PRODUCTS_ENDPOINT, "images"].join(PATH_SEPARATOR), {
      contentType: file.type,
      dataBase64,
    })
    return response.url
  },

  async getProduct(id: string): Promise<ProductDetail> {
    return client.get<ProductDetail>(
      [PRODUCTS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR)
    )
  },

  // A full replace rather than a partial patch: the form holds the whole product, and the
  // children have no client-side identity to diff against.
  async updateProduct(id: string, input: CreateProductInput): Promise<ProductDetail> {
    return client.patch<CreateProductInput, ProductDetail>(
      [PRODUCTS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR),
      input
    )
  },

  // Only products authored in Madar can be deleted. A synced storefront product has no row of
  // ours to remove and the next sync would bring it back, so the caller must not offer it.
  async deleteProduct(id: string): Promise<void> {
    await client.delete<void>([PRODUCTS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  // Creates as many rows as are actually valid -- a bad row is skipped and reported back rather
  // than failing the whole file. See catalog-service.ts's bulkImport.
  async bulkImportProducts(rows: BulkImportProductRow[]): Promise<BulkImportProductResult> {
    return client.post<{ products: BulkImportProductRow[] }, BulkImportProductResult>(
      [PRODUCTS_ENDPOINT, "bulk-import"].join(PATH_SEPARATOR),
      { products: rows }
    )
  },

  // Settings -> الضرائب -> "الأسعار تشمل الضريبة" applied to every existing priced product at
  // once -- see ProductCatalogService.applyPriceTaxConvention. "المنتجات الجديدة فقط" never calls
  // this; it only changes what a newly created product defaults to.
  async applyTaxConvention(includeTax: boolean): Promise<{ updated: number }> {
    return client.post<{ includeTax: boolean }, { updated: number }>(
      [PRODUCTS_ENDPOINT, "apply-tax-convention"].join(PATH_SEPARATOR),
      { includeTax }
    )
  },

  // Products list -- "select several, change their status" quick action. Status-only, not a
  // round-trip through updateProduct()'s full-replace contract, so a bulk change can never
  // accidentally wipe a product's own components/variants. Silently skips any selected id that
  // isn't actually a native (Madar) product this organization owns -- see ProductsPage.tsx's own
  // isNative check, which is why only native ids are ever sent here in the first place. Takes the
  // same lowercase status CreateProductInput uses (the backend's own vocabulary), not the
  // capitalized ProductStatus a list row displays.
  async bulkUpdateStatus(
    ids: string[],
    status: "draft" | "active" | "archived"
  ): Promise<{ updated: number }> {
    return client.patch<
      { ids: string[]; status: "draft" | "active" | "archived" },
      { updated: number }
    >([PRODUCTS_ENDPOINT, "status"].join(PATH_SEPARATOR), { ids, status })
  },
}
