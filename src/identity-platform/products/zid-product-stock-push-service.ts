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
// store-id headers, not Salla's Bearer token) and its real stock-update endpoint. Zid has no
// variant support (products/zid-product-mapper.ts maps every product to "simple"), so unlike
// Salla's service there is no product-level-vs-variant-level branch -- a push target is always
// the product's own stock_quantity.
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
    const nativeProductByZidId = new Map<string, string>()

    for (const line of lines) {
      if (!line.productId) continue
      const link = await this.linksService.findLinkForLine(organizationId, {
        productId: line.productId,
        variantId: line.variantId ?? null,
      })
      if (!link) continue
      zidProductIds.add(link.zidProductId)
      nativeProductByZidId.set(link.zidProductId, line.productId)
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
    try {
      ;({ accessToken } = await this.zidOAuthService.resolveAccessToken(connection.id))
    } catch (error) {
      console.error("zid.stock_push_access_token_failed", error)
      return
    }

    for (const zidProductId of zidProductIds) {
      const productId = nativeProductByZidId.get(zidProductId)
      if (!productId) continue
      try {
        const currentStock = await this.readCurrentStock(productId)
        if (currentStock === null) continue
        await this.pushQuantity(accessToken, storeId, zidProductId, currentStock)
      } catch (error) {
        // One failing product must never block another's push.
        console.error("zid.stock_push_failed", { zidProductId, error })
      }
    }
  }

  private async readCurrentStock(productId: string): Promise<number | null> {
    const result = await this.database.query<{ stock_quantity: string | number | null }>(
      `SELECT stock_quantity FROM products WHERE id = $1`,
      [productId]
    )
    const stock = result.rows[0]?.stock_quantity
    return stock === null || stock === undefined ? null : Number(stock)
  }

  // Confirmed via docs.zid.sa ("Update Single Product Stock"): a product's stock is a list of
  // per-location entries (stocks[]), each with its own id -- unlike push-to-create's initial POST
  // (which accepts a flat `quantity` and auto-creates a default location), updating an existing
  // product's stock means PATCHing that specific location entry, so its id has to be looked up
  // first. The sandbox store used for every other Zid finding this session has exactly one
  // location ("Default"), so only stocks[0] is targeted -- a product with several real locations
  // would need a real per-location mapping this pass doesn't have.
  private async pushQuantity(
    accessToken: string,
    storeId: string,
    zidProductId: string,
    quantity: number
  ): Promise<void> {
    const headers = {
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
    const product = (await productResponse.json()) as { stocks?: Array<{ id?: string }> }
    const stockId = product.stocks?.[0]?.id
    if (!stockId) {
      console.error("zid.stock_push_no_stock_location", { zidProductId })
      return
    }

    // Madar's own sentinel for "this came from a Zid location Zid itself tracks as unlimited"
    // (see zid-product-mapper.ts) -- pushed back as is_infinite: true rather than a concrete,
    // wrong quantity, matching the docs' own "set the quantity to null when unlimited" guidance.
    const isInfinite = quantity >= INFINITE_STOCK_SENTINEL
    const response = await fetch(`${this.apiBaseUrl}/products/${zidProductId}/stocks/${stockId}/`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        available_quantity: isInfinite ? null : quantity,
        is_infinite: isInfinite,
      }),
    })
    if (!response.ok) {
      console.error("zid.stock_push_rejected", { zidProductId, status: response.status })
    }
  }
}
