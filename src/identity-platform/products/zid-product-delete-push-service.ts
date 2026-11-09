import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ZidOAuthRepository } from "../zid-oauth/repository"
import type { ZidOAuthService } from "../zid-oauth/service"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

const DELETE_ERRORS = {
  rejected: (status: number) =>
    new IdentityError(
      "ZID_PRODUCT_DELETE_FAILED",
      502,
      "business",
      `Zid refused to delete this product (HTTP ${status}), so it was kept in Madar too. Try again, or delete it on Zid first.`
    ),
}

// Deleting a product in Madar deletes it on Zid too, so the two catalogues don't drift apart --
// and so the next sync can't bring it back: a soft-deleted product's link no longer resolves, and
// ZidProductPromotionService would recreate it from the still-live Zid product. That is also why
// this runs before the local delete and a refusal stops it.
//
// A variable product is linked per variant, each to a Zid child; it is the parent that gets
// deleted (DELETE /products/{id}/, docs.zid.sa/delete-a-product), which takes its children with
// it. The parent's id comes from a child's synced record (`parent_id`).
export class ZidProductDeletePushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly database: PostgresDatabase,
    private readonly zidOAuthRepository: ZidOAuthRepository,
    private readonly zidOAuthService: ZidOAuthService,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.ZID_API_BASE_URL ??
      DEFAULT_ZID_API_BASE_URL
    ).replace(/\/$/, "")
  }

  async deleteLinkedProduct(organizationId: string, productId: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return
    const links = await this.database.query<{
      zid_product_id: string
      workspace_id: string | null
    }>(
      `SELECT l.zid_product_id, p.workspace_id
         FROM zid_product_links l
         JOIN products p ON p.id = l.product_id
        WHERE l.organization_id = $1 AND l.product_id = $2`,
      [organizationId, productId]
    )
    if (links.rows.length === 0) return

    // Not connected any more: there is nothing to delete on Zid's side from here, and nothing
    // left to sync it back either.
    const connection = await this.zidOAuthRepository.findActiveConnection(
      organizationId,
      links.rows[0].workspace_id
    )
    if (!connection) return
    const connectionId = String(connection.id)
    const storeId = await this.zidOAuthRepository.findSelectedStoreAccountId(connectionId)
    if (!storeId) return

    const linkedIds = links.rows.map((row) => row.zid_product_id)
    const targetIds = new Set<string>()
    for (const zidId of linkedIds) {
      const record = await this.database.query<{ payload: { parent_id?: string | null } }>(
        `SELECT payload FROM zid_records
          WHERE connection_id = $1 AND entity_type = 'products' AND entity_id = $2`,
        [connectionId, zidId]
      )
      targetIds.add(String(record.rows[0]?.payload?.parent_id || zidId))
    }

    const { accessToken, authorizationHeader } =
      await this.zidOAuthService.resolveAccessToken(connectionId)
    for (const zidId of targetIds) {
      const response = await fetch(`${this.apiBaseUrl}/products/${encodeURIComponent(zidId)}/`, {
        method: "DELETE",
        headers: {
          authorization: authorizationHeader,
          "access-token": accessToken,
          "store-id": storeId,
          role: "Manager",
          "accept-language": "en",
          accept: "application/json",
        },
      })
      // Already gone on Zid is what we wanted anyway.
      if (!response.ok && response.status !== 404) {
        const body = await response.text().catch(() => "")
        console.error("zid.product_delete_push_failed", {
          zidId,
          status: response.status,
          body: body.slice(0, 500),
        })
        throw DELETE_ERRORS.rejected(response.status)
      }
      console.log("zid.product_delete_pushed", { zidId, status: response.status })
    }

    const ids = [...new Set([...linkedIds, ...targetIds])]
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(", ")
    await this.database.query(
      `DELETE FROM zid_product_links WHERE organization_id = $1 AND zid_product_id IN (${placeholders})`,
      [organizationId, ...ids]
    )
    await this.database.query(
      `DELETE FROM zid_records
        WHERE connection_id = $1 AND entity_type = 'products' AND entity_id IN (${placeholders})`,
      [connectionId, ...ids]
    )
  }
}
