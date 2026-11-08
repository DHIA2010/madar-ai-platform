import type { ZidProductApiPayload } from "../products/zid-product-mapper"

// GET /products/{id}/ -- the only endpoint whose response includes a parent product's variants[]
// (the list endpoint leaves it out). Same Manager headers as the products list in sync-service.ts.
// Null when Zid refuses or doesn't have it; the caller logs and moves on.
export async function fetchZidProduct(input: {
  apiBaseUrl: string
  storeId: string
  accessToken: string
  productId: string
}): Promise<(ZidProductApiPayload & Record<string, unknown>) | null> {
  const response = await fetch(
    `${input.apiBaseUrl.replace(/\/$/, "")}/products/${encodeURIComponent(input.productId)}/`,
    {
      headers: {
        "access-token": input.accessToken,
        "store-id": input.storeId,
        "accept-language": "en",
        role: "Manager",
        accept: "application/json",
      },
    }
  )
  if (!response.ok) {
    console.error("zid.product_fetch_failed", {
      productId: input.productId,
      status: response.status,
    })
    return null
  }
  return (await response.json()) as ZidProductApiPayload & Record<string, unknown>
}
