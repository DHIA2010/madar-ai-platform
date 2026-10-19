import type { ZidProductPromotionService } from "../products/zid-product-promotion-service"
import type { ZidProductApiPayload } from "../products/zid-product-mapper"
import { toRecordDate } from "./record-date"
import type { ZidOAuthRepository } from "./repository"
import type { ZidOAuthService } from "./service"
import type { ZidSyncRepository } from "./sync-repository"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

// NOT YET EMPIRICALLY CONFIRMED against a real delivery (no webhook was registered yet at the
// time this was written) -- modeled on Zid's own Create-Webhook response shape (id/event/
// target_url/store_id/...), the same {event, <store identifier>, data} envelope Salla's real
// webhooks use, and REST-webhook convention generally. Once a real subscription is registered
// (see auto-registration in service.ts) and a real test edit triggers a delivery, verify the
// actual field names against this shape and adjust here -- this is the only place that needs to
// change if they differ, same discipline as salla-oauth/webhook-service.ts's own payload shape.
export interface ZidWebhookPayload {
  event: string
  store_id?: number | string
  merchant_id?: number | string
  data: Record<string, unknown>
}

// Confirmed real event catalog, https://docs.zid.sa/webhooks, but PRODUCTS ONLY for this pass --
// order.*/customer.* events exist too, but orders/customers sit on Zid's Merchant API (different
// auth headers -- authorization+x-manager-token, not access-token+store-id -- and no single-
// record GET endpoint confirmed, unlike the products one confirmed live this session). Mapping
// them here without a confirmed re-fetch path for that API surface would ship logic guaranteed to
// break on the first real delivery -- flagged as explicit follow-up work, not guessed at. product
// .delete is also deliberately unmapped, same reasoning as Salla's order.deleted/product.deleted
// (upsertRecords only ever inserts/updates). No dedicated stock/quantity event exists either way,
// same gap already accepted for Salla.
const ZID_EVENT_TO_ENTITY_TYPE: Record<string, "products"> = {
  "product.create": "products",
  "product.update": "products",
  "product.publish": "products",
}

function recordDateFor(data: Record<string, unknown>): string {
  return toRecordDate([
    data.updated_at as string | undefined,
    data.created_at as string | undefined,
  ])
}

export class ZidWebhookService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: ZidOAuthRepository,
    private readonly syncRepository: ZidSyncRepository,
    private readonly oauthService: ZidOAuthService,
    apiBaseUrl?: string,
    // Optional -- when null, handleWebhookEvent() behaves exactly as it always has: zid_records
    // gets written, no native product is ever created/updated from it.
    private readonly promotionService: ZidProductPromotionService | null = null
  ) {
    this.apiBaseUrl = apiBaseUrl ?? process.env.ZID_API_BASE_URL ?? DEFAULT_ZID_API_BASE_URL
  }

  async handleWebhookEvent(payload: ZidWebhookPayload): Promise<void> {
    console.log("zid.webhook_received", {
      event: payload.event,
      storeId: payload.store_id ?? payload.merchant_id,
      entityId: (payload.data as { id?: unknown })?.id,
    })

    const entityType = ZID_EVENT_TO_ENTITY_TYPE[payload.event]
    if (!entityType) {
      console.log("zid.webhook_event_unmapped", { event: payload.event })
      return
    }

    const storeId = String(payload.store_id ?? payload.merchant_id ?? "")
    if (!storeId) return

    const target = await this.oauthRepository.findWebhookTargetByStoreId(storeId)
    if (!target) {
      console.log("zid.webhook_store_unknown", { storeId })
      return
    }

    const entityId = String((payload.data as { id?: unknown })?.id ?? "")
    if (!entityId) return

    // Confirmed live (same sandbox store used for every other Zid finding this session):
    // GET /products/{id}/ returns the exact same full shape as the list endpoint's items, so
    // webhook ingestion re-fetches the canonical record rather than trusting whatever shape the
    // event's own payload carries -- the same defensive pattern Salla's webhook needed once its
    // own payload shapes were confirmed to diverge from its REST API's.
    let accessToken: string
    try {
      ;({ accessToken } = await this.oauthService.resolveAccessToken(target.connectionId))
    } catch (error) {
      console.error("zid.webhook_access_token_failed", error)
      return
    }

    const response = await fetch(
      `${this.apiBaseUrl.replace(/\/$/, "")}/${entityType}/${entityId}/`,
      {
        headers: {
          "access-token": accessToken,
          "store-id": target.customerId,
          "accept-language": "en",
          role: "Manager",
          accept: "application/json",
        },
      }
    )
    if (!response.ok) {
      console.error("zid.webhook_refetch_failed", { entityType, entityId, status: response.status })
      return
    }

    const data = (await response.json()) as Record<string, unknown>

    await this.syncRepository.upsertRecords({
      connectionId: target.connectionId,
      customerId: target.customerId,
      records: [
        {
          entityType,
          entityId,
          recordDate: recordDateFor(data),
          payload: data,
        },
      ],
    })
    console.log("zid.webhook_synced", { event: payload.event, entityType, entityId })

    // Auto-promotes/reverse-syncs the linked native product (see ZidProductPromotionService) --
    // best-effort, a failure here must never fail the webhook's own 200 ack to Zid.
    if (this.promotionService) {
      await this.promotionService
        .promoteOrSync(
          target.organizationId,
          target.workspaceId,
          data as unknown as ZidProductApiPayload
        )
        .catch((error: unknown) => {
          console.error("zid.product_promotion_failed", { entityId, error })
        })
    }
  }
}
