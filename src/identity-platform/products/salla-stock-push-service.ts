import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { SallaOAuthRepository } from "../salla-oauth/repository"
import type { SallaOAuthService } from "../salla-oauth/service"
import type { SallaProductLinksService } from "./salla-product-links-service"

const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

export interface StockPushLine {
  productId: string | null
  variantId?: string | null
}

export class SallaStockPushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly sallaOAuthService: SallaOAuthService,
    private readonly sallaOAuthRepository: SallaOAuthRepository,
    private readonly linksService: SallaProductLinksService,
    private readonly database: PostgresDatabase,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.SALLA_API_BASE_URL ??
      DEFAULT_SALLA_API_BASE_URL
    ).replace(/\/$/, "")
  }

  // Never throws -- every call site already wraps this in .catch(() => {}), but swallowing
  // internally too means a caller that forgets that can't break a sale/order/return either. `sign`
  // is accepted for symmetry with applyStockConsumption's own call sites, but is otherwise unused
  // here: this always pushes the CURRENT, already-committed absolute stock figure (re-read fresh),
  // not sign * quantity as a delta -- correct regardless of whether Salla's own endpoint turns out
  // to want a delta or a set-value, and safe against two concurrent sales racing on the same
  // product.
  async pushStockForLines(
    organizationId: string,
    workspaceId: string | null,
    lines: StockPushLine[],
    _sign: 1 | -1
  ): Promise<void> {
    const sallaProductIds = new Set<string>()
    const nativeTargets = new Map<string, { productId: string; variantId: string | null }>()

    for (const line of lines) {
      if (!line.productId) continue
      const link = await this.linksService.findLinkForLine(organizationId, {
        productId: line.productId,
        variantId: line.variantId ?? null,
      })
      if (!link) continue
      sallaProductIds.add(link.sallaProductId)
      nativeTargets.set(link.sallaProductId, {
        productId: line.productId,
        variantId: line.variantId ?? null,
      })
    }
    if (sallaProductIds.size === 0) return

    const connection = await this.sallaOAuthRepository.findActiveConnection(
      organizationId,
      workspaceId
    )
    if (!connection) return

    let accessToken: string
    try {
      accessToken = await this.sallaOAuthService.resolveAccessToken(connection.id)
    } catch (error) {
      console.error("salla.stock_push_access_token_failed", error)
      return
    }

    for (const sallaProductId of sallaProductIds) {
      const target = nativeTargets.get(sallaProductId)
      if (!target) continue
      try {
        const currentStock = await this.readCurrentStock(target)
        if (currentStock === null) continue
        // A variant-level link's sallaProductId is one of the product's own skus[].id (see
        // SallaProductPromotionService.linkVariants), never the parent product's own id --
        // pushing it through PUT /products/{id} (the product-level path) 404s, since Salla has no
        // product by that id. Confirmed live on stage. Salla's bulk-quantities endpoint accepts
        // either kind via identifer_type, so which one to push is just that flag.
        //
        // Madar's own "allow out-of-stock sale" setting can let a sale oversell a product past
        // zero (negative stock has a real meaning here: how far over-committed this product is).
        // Salla has no such concept and rejects a negative quantity outright -- confirmed live on
        // stage (422), which silently left Salla stuck showing its last valid, now-wrong figure.
        // 0 is the truthful nearest thing Salla can represent for "oversold," so that's what gets
        // pushed instead of the raw, possibly-negative number.
        await this.pushQuantity(
          accessToken,
          sallaProductId,
          Math.max(0, currentStock),
          target.variantId ? "variant_id" : "id"
        )
      } catch (error) {
        // One failing SKU must never block another's push.
        console.error("salla.stock_push_failed", { sallaProductId, error })
      }
    }
  }

  private async readCurrentStock(target: {
    productId: string
    variantId: string | null
  }): Promise<number | null> {
    if (target.variantId) {
      const result = await this.database.query<{ stock: string | number | null }>(
        `SELECT stock FROM product_variants WHERE id = $1`,
        [target.variantId]
      )
      const stock = result.rows[0]?.stock
      return stock === null || stock === undefined ? null : Number(stock)
    }
    const result = await this.database.query<{ stock_quantity: string | number | null }>(
      `SELECT stock_quantity FROM products WHERE id = $1`,
      [target.productId]
    )
    const stock = result.rows[0]?.stock_quantity
    return stock === null || stock === undefined ? null : Number(stock)
  }

  // Salla's bulk-quantities endpoint (docs.salla.dev: "Update Bulk Quantities",
  // POST /products/quantities/bulk) replaces both of the endpoints this used to alternate
  // between: PUT /products/{id} (product-level only -- a Salla product with options/variants
  // rejects a direct quantity write on itself, confirmed live with a 422) and the deprecated
  // PUT /products/quantities/variant/{variant}. One request body shape handles either kind via
  // identifer_type, which is exactly the "product-level link vs. variant-level link" distinction
  // pushStockForLines already has to make. A 201 only means Salla queued the update ("may take
  // several minutes to finish the process") -- there is no synchronous per-item result to check,
  // so this can't confirm the write actually landed, only that Salla accepted the request.
  private async pushQuantity(
    accessToken: string,
    identifer: string,
    quantity: number,
    identiferType: "id" | "variant_id"
  ): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/products/quantities/bulk`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        products: [{ identifer_type: identiferType, identifer, quantity, mode: "overwrite" }],
      }),
    })
    if (!response.ok) {
      console.error("salla.stock_push_rejected", {
        sallaProductId: identifer,
        status: response.status,
      })
    }
  }
}
