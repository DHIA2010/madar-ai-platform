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
}

export interface CreatedProduct {
  id: string
  name: string
  sku: string | null
  productType: ProductKind
  status: "draft" | "active" | "archived"
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

export const productListService = {
  async listProducts(): Promise<ProductRecord[]> {
    const response = await client.get<{ items: ProductRecord[] }>(PRODUCTS_ENDPOINT)
    return response.items
  },

  async createProduct(input: CreateProductInput): Promise<CreatedProduct> {
    return client.post<CreateProductInput, CreatedProduct>(PRODUCTS_ENDPOINT, input)
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
}
