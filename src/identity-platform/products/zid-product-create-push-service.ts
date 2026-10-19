import { IntegrationProviderError } from "../integrations/provider-error"
import type { ProductView } from "./catalog-types"
import type { ZidOAuthService } from "../zid-oauth/service"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

export interface ZidCreateProductBody {
  name: { ar: string; en: string }
  price: number
  sku: string
  is_published: boolean
  quantity: number
}

// Maps a native Madar product to Zid's real create-product request body -- confirmed live against
// the connected sandbox store this session (POST /products/ with exactly this shape returns 201
// and auto-creates a default stock-location entry from the flat `quantity` field, no need to deal
// with the stocks[] array directly on create). Pure and independently testable, same split as
// mapProductToSallaCreateBody.
export function mapProductToZidCreateBody(product: ProductView): ZidCreateProductBody {
  return {
    name: { ar: product.name, en: product.name },
    price: product.sellPrice ?? 0,
    sku: product.sku ?? `MADAR-${product.id}`,
    is_published: product.status === "active",
    quantity: product.stockQuantity ?? 0,
  }
}

export class ZidProductCreatePushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly zidOAuthService: ZidOAuthService,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.ZID_API_BASE_URL ??
      DEFAULT_ZID_API_BASE_URL
    ).replace(/\/$/, "")
  }

  async pushProduct(
    connectionId: string,
    storeId: string,
    product: ProductView
  ): Promise<{ zidProductId: string }> {
    const { accessToken } = await this.zidOAuthService.resolveAccessToken(connectionId)
    const body = mapProductToZidCreateBody(product)

    const response = await fetch(`${this.apiBaseUrl}/products/`, {
      method: "POST",
      headers: {
        "access-token": accessToken,
        "store-id": storeId,
        "accept-language": "en",
        role: "Manager",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      throw new IntegrationProviderError(
        "Zid rejected the product creation.",
        "ZID_PRODUCT_PUSH_REJECTED",
        response.status >= 500,
        response.status === 401 ? 401 : 422,
        errorBody
      )
    }

    const responseBody = (await response.json()) as { id?: string | number }
    if (responseBody.id === undefined || responseBody.id === null) {
      throw new IntegrationProviderError(
        "Zid accepted the product but returned no id.",
        "ZID_PRODUCT_PUSH_NO_ID",
        false,
        502
      )
    }

    return { zidProductId: String(responseBody.id) }
  }
}
