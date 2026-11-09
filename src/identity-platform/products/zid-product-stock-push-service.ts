import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ZidOAuthRepository } from "../zid-oauth/repository"
import type { ZidOAuthService } from "../zid-oauth/service"
import { INFINITE_STOCK_SENTINEL } from "./zid-product-mapper"
import type { ZidProductLinksService } from "./zid-product-links-service"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

export interface StockPushLine {
  productId: string | null
  variantId?: string | null
}

// Mirrors SallaStockPushService's shape exactly, adapted to Zid's own Products API (access-token/
// store-id headers, not Salla's Bearer token) and its real stock-update endpoint. A variant is
// linked to its Zid child product, itself a product with its own stock entry on Zid's side -- so
// the push is the same call either way; only the figure read on Madar's side differs (the
// variant's own stock rather than the product's).
export class ZidProductStockPushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly zidOAuthService: ZidOAuthService,
    private readonly zidOAuthRepository: ZidOAuthRepository,
    private readonly linksService: ZidProductLinksService,
    private readonly database: PostgresDatabase,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.ZID_API_BASE_URL ??
      DEFAULT_ZID_API_BASE_URL
    ).replace(/\/$/, "")
  }

  // Never throws -- every call site already wraps this in .catch(() => {}), but swallowing
  // internally too means a caller that forgets that can't break a sale/order/return either. `sign`
  // is accepted for symmetry with applyStockConsumption's own call sites, but is otherwise unused
  // here: this always pushes the CURRENT, already-committed absolute stock figure (re-read fresh),
  // not sign * quantity as a delta.
  async pushStockForLines(
    organizationId: string,
    workspaceId: string | null,
    lines: StockPushLine[],
    _sign: 1 | -1
  ): Promise<void> {
    const zidProductIds = new Set<string>()
    const nativeTargetByZidId = new Map<string, { productId: string; variantId: string | null }>()

    for (const line of lines) {
      if (!line.productId) continue
      const link = await this.linksService.findLinkForLine(organizationId, {
        productId: line.productId,
        variantId: line.variantId ?? null,
      })
      if (!link) continue
      zidProductIds.add(link.zidProductId)
      nativeTargetByZidId.set(link.zidProductId, {
        productId: line.productId,
        variantId: link.variantId,
      })
    }
    if (zidProductIds.size === 0) return

    const connection = await this.zidOAuthRepository.findActiveConnection(
      organizationId,
      workspaceId
    )
    if (!connection) return
    const storeId = await this.zidOAuthRepository.findSelectedStoreAccountId(connection.id)
    if (!storeId) return

    let accessToken: string
    let authorizationHeader: string
    try {
      ;({ accessToken, authorizationHeader } = await this.zidOAuthService.resolveAccessToken(
        connection.id
      ))
    } catch (error) {
      console.error("zid.stock_push_access_token_failed", error)
      return
    }

    for (const zidProductId of zidProductIds) {
      const target = nativeTargetByZidId.get(zidProductId)
      if (!target) continue
      try {
        const currentStock = await this.readCurrentStock(target.productId, target.variantId)
        if (currentStock === null) continue
        await this.pushQuantity(
          accessToken,
          authorizationHeader,
          storeId,
          zidProductId,
          currentStock
        )
      } catch (error) {
        // One failing product must never block another's push.
        console.error("zid.stock_push_failed", { zidProductId, error })
      }
    }
  }

  private async readCurrentStock(
    productId: string,
    variantId: string | null
  ): Promise<number | null> {
    const result = variantId
      ? await this.database.query<{ stock_quantity: string | number | null }>(
          `SELECT stock AS stock_quantity FROM product_variants WHERE id = $1 AND product_id = $2`,
          [variantId, productId]
        )
      : await this.database.query<{ stock_quantity: string | number | null }>(
          `SELECT stock_quantity FROM products WHERE id = $1`,
          [productId]
        )
    const stock = result.rows[0]?.stock_quantity
    return stock === null || stock === undefined ? null : Number(stock)
  }

  // docs.zid.sa "Update Product Stock for Location": POST /locations/{location_id}/stock-update/
  // with [{product_id, available_quantity, is_infinite}], under the inventories.read_write scope.
  // Found live: the older per-entry PATCH /products/{id}/stocks/{stock_id}/ answers every call
  // with 403 "Insufficient role privileges", whatever scopes the app holds. The location comes
  // from the product's own stocks[] (each entry carries location.id); the sandbox store has one
  // location ("Default"), so only stocks[0] is targeted -- a product with several real locations
  // would need a real per-location mapping this pass doesn't have.
  private async pushQuantity(
    accessToken: string,
    authorizationHeader: string,
    storeId: string,
    zidProductId: string,
    quantity: number
  ): Promise<void> {
    // docs.zid.sa marks Authorization, Access-Token, Store-Id and Role all required.
    const headers = {
      authorization: authorizationHeader,
      "access-token": accessToken,
      "store-id": storeId,
      "accept-language": "en",
      role: "Manager",
      accept: "application/json",
      "content-type": "application/json",
    }

    const productResponse = await fetch(`${this.apiBaseUrl}/products/${zidProductId}/`, {
      headers,
    })
    if (!productResponse.ok) {
      console.error("zid.stock_push_refetch_failed", {
        zidProductId,
        status: productResponse.status,
      })
      return
    }
    const product = (await productResponse.json()) as {
      stocks?: Array<{ location?: { id?: string } | null }>
    }
    const locationId = product.stocks?.[0]?.location?.id
    if (!locationId) {
      console.error("zid.stock_push_no_stock_location", { zidProductId })
      return
    }

    // Madar's own sentinel for "this came from a Zid location Zid itself tracks as unlimited"
    // (see zid-product-mapper.ts) -- pushed back as is_infinite: true rather than a concrete,
    // wrong quantity, matching the docs' own "set the quantity to null when unlimited" guidance.
    const isInfinite = quantity >= INFINITE_STOCK_SENTINEL
    // Zid takes no negative figure (minimum 0) -- an oversold product is simply out of stock there.
    const response = await fetch(`${this.apiBaseUrl}/locations/${locationId}/stock-update/`, {
      method: "POST",
      headers,
      body: JSON.stringify([
        {
          product_id: zidProductId,
          available_quantity: isInfinite ? 0 : Math.max(0, Math.floor(quantity)),
          is_infinite: isInfinite,
        },
      ]),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.error("zid.stock_push_rejected", {
        zidProductId,
        status: response.status,
        body: body.slice(0, 500),
      })
    }
  }
}
