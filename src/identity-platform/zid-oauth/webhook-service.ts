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
  // The `store_id` query param registerZidWebhooks puts on the target URL -- the only way to
  // resolve a customer.* delivery, whose body has no store_id (an order.*/product.* body does).
  storeIdHint?: string | null
}

// Order events whose delivery means the store's stock may have moved: Zid deducts stock when an
// order is created and returns it when one is cancelled, but has no stock webhook of its own.
const STOCK_MOVING_ORDER_EVENTS = new Set(["order.create", "order.status.update"])

// Confirmed real event catalog, https://docs.zid.sa/webhooks. product.delete is deliberately
// unmapped, same reasoning as Salla's order.deleted/product.deleted (upsertRecords only ever
// inserts/updates). Everything else maps to the entity type its own record belongs under.
// order.*/customer.* sit on Zid's Merchant API (different auth headers, no confirmed
// single-record GET endpoint) -- but a product.* delivery's own body already turned out to BE
// the canonical resource with no wrapper (confirmed live), so order/customer deliveries are
// assumed to follow the same convention and are trusted directly rather than re-fetched; see
// handleWebhookEvent's orders/customers branch for exactly where that assumption is used.
type ZidWebhookEntityType = "products" | "orders" | "customers"
const ZID_EVENT_TO_ENTITY_TYPE: Record<string, ZidWebhookEntityType> = {
  "product.create": "products",
  "product.update": "products",
  "product.publish": "products",
  "product.stock.create": "products",
  "product.stock.update": "products",
  "product.stock.delete": "products",
  "order.create": "orders",
  "order.status.update": "orders",
  "order.payment_status.update": "orders",
  "customer.create": "customers",
  "customer.update": "customers",
  "customer.merchant.update": "customers",
}

type WebhookTarget = NonNullable<
  Awaited<ReturnType<ZidOAuthRepository["findWebhookTargetByStoreId"]>>
>

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
    const { event, payload, storeIdHint } = envelope
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
    const storeId = String(payload.store_id ?? storeIdHint ?? "")
    const target = isStockEvent
      ? await this.oauthRepository.findWebhookTargetByZidProductId(entityId)
      : await this.oauthRepository.findWebhookTargetByStoreId(storeId)
    if (!target) {
      console.log("zid.webhook_target_unknown", { event, entityId, storeId })
      return
    }

    // Best-effort: upgrades connections registered before order.*/customer.* existed (a no-op
    // once done) -- see ZidOAuthService.ensureWebhooksRegistered.
    this.oauthService.ensureWebhooksRegistered(target.connectionId).catch((error: unknown) => {
      console.error("zid.webhook_registration_failed", error)
    })

    // A component the merchant turned off isn't updated (an order's stock refresh is a products
    // update, so it's skipped too when products are off).
    const components = await this.syncRepository.findSyncComponents(target.connectionId)
    if (!components[entityType]) {
      console.log("zid.webhook_component_disabled", { event, entityType, entityId })
      return
    }

    if (entityType !== "products") {
      // Orders/customers sit on Zid's Merchant API (different auth headers than products, and
      // no confirmed single-record GET endpoint) -- there is nothing to re-fetch against even if
      // the defensive products pattern below were extended here. Assumed instead (not yet
      // empirically confirmed the way products was) to follow the same convention products
      // turned out to use: the webhook body IS the canonical resource already, trusted directly.
      await this.syncRepository.upsertRecords({
        connectionId: target.connectionId,
        customerId: target.customerId,
        records: [{ entityType, entityId, recordDate: recordDateFor(payload), payload }],
      })
      console.log("zid.webhook_synced", { event, entityType, entityId })

      if (STOCK_MOVING_ORDER_EVENTS.has(event) && components.products) {
        await this.refreshOrderProducts(target, payload)
      }
      return
    }

    await this.syncProduct(target, entityId, event)
  }

  // Re-fetches every product on an order so the stock Zid just deducted (or returned, on a
  // cancellation) reaches zid_records and the linked native product. A line item's `id` is the
  // Zid product id (confirmed against real synced orders); a variant's parent is `parent_id`.
  private async refreshOrderProducts(target: WebhookTarget, order: Record<string, unknown>) {
    const lines = Array.isArray(order.products) ? (order.products as Record<string, unknown>[]) : []
    const productIds = new Set<string>()
    for (const line of lines) {
      const productId = line.parent_id ?? line.id
      if (productId) productIds.add(String(productId))
    }
    for (const productId of productIds) {
      await this.syncProduct(target, productId, "order.stock_refresh").catch((error: unknown) => {
        console.error("zid.order_product_refresh_failed", { productId, error })
      })
    }
  }

  private async syncProduct(target: WebhookTarget, entityId: string, event: string) {
    const entityType = "products"
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
