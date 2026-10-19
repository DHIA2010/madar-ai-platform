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
        await this.pushQuantity(accessToken, sallaProductId, currentStock)
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

  // Confirmed empirically against the real connected sandbox store: PUT /admin/v2/products/{id}
  // with {quantity} in the body updates that exact field (verified via a before/after GET, and
  // the response echoes the new value back on success). Salla rejects this with a 422
  // ("لا يمكن تغيير الكمية لأن المنتج لديه خيارات" -- quantity can't be changed because the
  // product has options/variants) for a Salla product that has its own variants -- confirmed live
  // against a real product with options. Only a product-level link (the only kind this screen's
  // UI exposes today) is safe to push through this method; a variant-level link would need
  // Salla's variant-specific quantity endpoint instead, which hasn't been identified yet -- a
  // 422 here is swallowed the same as any other failure (see pushStockForLines' try/catch), so
  // this never breaks a sale, it just silently fails to sync for that one Salla product.
  private async pushQuantity(
    accessToken: string,
    sallaProductId: string,
    quantity: number
  ): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/products/${sallaProductId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ quantity }),
    })
    if (!response.ok) {
      console.error("salla.stock_push_rejected", { sallaProductId, status: response.status })
    }
  }
}
