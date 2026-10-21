import type { ZidProductPromotionService } from "../products/zid-product-promotion-service"
import type { ZidProductApiPayload } from "../products/zid-product-mapper"
import { toRecordDate } from "./record-date"
import type { ZidOAuthRepository } from "./repository"
import type { ZidOAuthService } from "./service"
import type { ZidSyncRepository } from "./sync-repository"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

// Confirmed live against a real delivery: Zid sends the event name in the `webhook-event` HTTP
// header (e.g. "product.update"), never in the body -- there is no {event, data} envelope at all.
// The body for a product.* event IS the product resource itself (same shape GET /products/{id}/
// returns, id/store_id/... at the top level). A product.stock.* event's body is a completely
// different, smaller shape: {id (the stock entry's own id), location, available_quantity,
// is_infinite, product_id, sale_channels} -- no store_id at all.
export interface ZidWebhookEnvelope {
  event: string
  payload: Record<string, unknown>
}

// Confirmed real event catalog, https://docs.zid.sa/webhooks, but PRODUCTS ONLY for this pass --
// order.*/customer.* events exist too, but orders/customers sit on Zid's Merchant API (different
// auth headers -- authorization+x-manager-token, not access-token+store-id -- and no single-
// record GET endpoint confirmed, unlike the products one confirmed live this session). Mapping
// them here without a confirmed re-fetch path for that API surface would ship logic guaranteed to
// break on the first real delivery -- flagged as explicit follow-up work, not guessed at. product
// .delete is also deliberately unmapped, same reasoning as Salla's order.deleted/product.deleted
// (upsertRecords only ever inserts/updates). product.stock.* IS mapped (confirmed live, a real
// event Zid actually sends for a plain stock/quantity change) -- same re-fetch-and-promote flow as
// a full product event, just resolved via product_id instead of store_id (see
// findWebhookTargetByZidProductId).
const ZID_EVENT_TO_ENTITY_TYPE: Record<string, "products"> = {
  "product.create": "products",
  "product.update": "products",
  "product.publish": "products",
  "product.stock.create": "products",
  "product.stock.update": "products",
  "product.stock.delete": "products",
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

  async handleWebhookEvent(envelope: ZidWebhookEnvelope): Promise<void> {
    const { event, payload } = envelope
    // A product.stock.* delivery's own `id` is the stock entry's id, not the product's -- the
    // product itself is `product_id`. Every other mapped event's body is the product resource
    // itself, so `id` at the top level already is the product's id.
    const isStockEvent = event.startsWith("product.stock.")
    const entityId = String((isStockEvent ? payload.product_id : payload.id) ?? "")

    console.log("zid.webhook_received", { event, entityId })

    const entityType = ZID_EVENT_TO_ENTITY_TYPE[event]
    if (!entityType) {
      console.log("zid.webhook_event_unmapped", { event })
      return
    }
    if (!entityId) return

    // A stock event carries no store_id at all (confirmed live) -- the product it belongs to was
    // already synced earlier via its own product.create/update delivery, so its connection is
    // resolved from that existing record instead of from this payload.
    const target = isStockEvent
      ? await this.oauthRepository.findWebhookTargetByZidProductId(entityId)
      : await this.oauthRepository.findWebhookTargetByStoreId(String(payload.store_id ?? ""))
    if (!target) {
      console.log("zid.webhook_target_unknown", { event, entityId })
      return
    }

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
    console.log("zid.webhook_synced", { event, entityType, entityId })

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
