import { IntegrationProviderError } from "../integrations/provider-error"
import type { ProductView } from "./catalog-types"
import type { SallaOAuthService } from "../salla-oauth/service"

const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

// Confirmed real values from https://docs.salla.dev/product/create-product.md's product_type
// enum -- "product" is Salla's own generic catalog-item type (matches the "type": "product" field
// already seen on every real product payload this session has read); service/digital map to
// their own closer Salla equivalents, every other Madar type (raw/simple/bundle/weighted/
// variable) has no closer match than the generic "product".
function mapProductType(productType: ProductView["productType"]): string {
  if (productType === "service") return "service"
  if (productType === "digital") return "digital"
  return "product"
}

export interface SallaCreateProductBody {
  name: string
  price: number
  product_type: string
  quantity?: number
  sku?: string
  status: "sale" | "out" | "hidden"
  images?: Array<{ original: string }>
  options?: Array<{
    name: string
    required: boolean
    display_type: "text"
    values: Array<{ name: string; price: number; quantity: number; is_default: boolean }>
  }>
}

// Maps a native Madar product to Salla's real create-product request body (confirmed live
// endpoint/fields, docs.salla.dev/product/create-product.md). Pure and independently testable,
// same split as mapMadarOrderToSallaExternalOrder (salla-order-push-service.ts).
export function mapProductToSallaCreateBody(product: ProductView): SallaCreateProductBody {
  const isVariable = product.productType === "variable"
  const variantPrices = product.variants.map((variant) => variant.price ?? 0)

  const basePrice = isVariable
    ? variantPrices.length > 0
      ? Math.min(...variantPrices)
      : 0
    : (product.sellPrice ?? 0)

  const body: SallaCreateProductBody = {
    name: product.name,
    price: basePrice,
    product_type: mapProductType(product.productType),
    sku: product.sku ?? undefined,
    status: product.status === "active" ? "sale" : "hidden",
    images: product.imageUrls.map((url) => ({ original: url })),
  }

  if (isVariable) {
    // KNOWN LIMITATION: resolves each option value's own price/quantity by matching against
    // variants.optionValues[0] only -- correct for a product with exactly one option group (e.g.
    // size only, the shape every real Salla variable product seen this session actually had), but
    // for a product with more than one option group (size AND color), a value shared across
    // multiple combinations would incorrectly take the first matching variant's own price/stock
    // rather than a true per-value figure (Salla's own option-value price/quantity isn't really
    // "per combination" the way Madar's variants are -- this is an approximation, not a precise
    // round-trip of Madar's own multi-axis model).
    body.options = product.variantOptions.map((option, optionIndex) => ({
      name: option.name,
      required: true,
      display_type: "text",
      values: option.values.map((value, index) => {
        const variant = product.variants.find((v) => v.optionValues[optionIndex] === value)
        return {
          name: value,
          price: variant?.price ?? basePrice,
          quantity: variant?.stock ?? 0,
          is_default: index === 0,
        }
      }),
    }))
  } else {
    body.quantity = product.stockQuantity ?? 0
  }

  return body
}

export class SallaProductCreatePushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly sallaOAuthService: SallaOAuthService,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.SALLA_API_BASE_URL ??
      DEFAULT_SALLA_API_BASE_URL
    ).replace(/\/$/, "")
  }

  async pushProduct(
    connectionId: string,
    product: ProductView
  ): Promise<{ sallaProductId: string }> {
    const accessToken = await this.sallaOAuthService.resolveAccessToken(connectionId)
    const body = mapProductToSallaCreateBody(product)

    const response = await fetch(`${this.apiBaseUrl}/products`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new IntegrationProviderError(
        "Salla rejected the product creation.",
        "SALLA_PRODUCT_PUSH_REJECTED",
        response.status >= 500,
        response.status === 401 ? 401 : 422,
        errorBody
      )
    }

    const responseBody = (await response.json()) as { data?: { id?: string | number } }
    const sallaProductId = responseBody.data?.id
    if (sallaProductId === undefined || sallaProductId === null) {
      throw new IntegrationProviderError(
        "Salla accepted the product but returned no id.",
        "SALLA_PRODUCT_PUSH_NO_ID",
        false,
        502
      )
    }

    return { sallaProductId: String(sallaProductId) }
  }
}
