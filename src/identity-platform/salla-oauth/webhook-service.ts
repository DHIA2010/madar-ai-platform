import type { SallaProductPromotionService } from "../products/salla-product-promotion-service"
import type { SallaProductApiPayload } from "../products/salla-product-mapper"
import { toRecordDate } from "./record-date"
import type { SallaOAuthRepository } from "./repository"
import type { SallaOAuthService } from "./service"
import type { SallaSyncRepository } from "./sync-repository"

const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

export interface SallaWebhookPayload {
  event: string
  merchant: number | string
  created_at?: string
  data: Record<string, unknown>
}

// Fetched directly from https://docs.salla.dev/webhooks's own event catalog. Add/remove a row
// here to change what the webhook path syncs -- no other code needs to change. Since
// handleWebhookEvent() below only uses an event to decide WHETHER to re-fetch the canonical
// record (never what's inside the event's own payload), mapping a new event here is purely about
// widening which triggers cause that re-fetch, not about any field-shape concern.
//
// Deliberately not mapped: order.deleted/product.deleted (upsertRecords only ever inserts/
// updates -- a delete-shaped event needs a distinct branch, flagged as follow-up work, not built
// here) and every shipping/coupon/store/cart/invoice/special-offer/review event (outside the
// products/orders/customers scope salla_records models at all today).
//
// product.updated is mapped per explicit instruction, covering name/SKU/cost/quantity changes --
// Salla's docs show it struck through with no description and no OTHER documented event exists
// for those four fields, so this is the only candidate for them. Not yet confirmed empirically
// against a real sandbox edit (unclear if it's live, deprecated, or what exactly triggers it) --
// if it never fires, this entry is simply inert; the re-fetch-on-any-mapped-event design means
// there's no downside to having it mapped either way.
const SALLA_EVENT_TO_ENTITY_TYPE: Record<string, "products" | "orders" | "customers"> = {
  "order.created": "orders",
  "order.updated": "orders",
  "order.status.updated": "orders",
  "order.cancelled": "orders",
  "order.refunded": "orders",
  "order.products.updated": "orders",
  "order.payment.updated": "orders",
  "order.total.price.updated": "orders",
  "order.coupon.updated": "orders",
  "order.shipping.address.updated": "orders",

  "product.created": "products",
  "product.updated": "products",
  "product.price.updated": "products",
  "product.status.updated": "products",
  "product.quantity.low": "products",
  "product.image.updated": "products",
  "product.category.updated": "products",
  "product.brand.updated": "products",
  "product.tags.updated": "products",

  "customer.created": "customers",
  "customer.updated": "customers",
}

// Per-entity-type date candidates, mirroring sync-service.ts's own per-entity calls to
// toRecordDate exactly -- a webhook-written row and a later poll-written row for the same
// record must compute the identical record_date regardless of which path wrote it.
function recordDateFor(
  entityType: "products" | "orders" | "customers",
  data: Record<string, unknown>
): string {
  if (entityType === "orders") {
    const date = data.date as { date?: string } | undefined
    return toRecordDate([
      date?.date,
      data.updated_at as string | undefined,
      data.created_at as string | undefined,
    ])
  }
  return toRecordDate([
    data.updated_at as string | undefined,
    data.created_at as string | undefined,
  ])
}

export class SallaWebhookService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: SallaOAuthRepository,
    private readonly syncRepository: SallaSyncRepository,
    private readonly oauthService: SallaOAuthService,
    config?: { apiBaseUrl?: string },
    // Optional -- when null, handleWebhookEvent() behaves exactly as it always has: salla_records
    // gets written, no native product is ever created/updated from it.
    private readonly promotionService: SallaProductPromotionService | null = null
  ) {
    this.apiBaseUrl =
      config?.apiBaseUrl ?? process.env.SALLA_API_BASE_URL ?? DEFAULT_SALLA_API_BASE_URL
  }

  async handleWebhookEvent(payload: SallaWebhookPayload): Promise<void> {
    // Every delivery is logged up front, mapped or not -- without this there is no way to tell
    // "Salla never sent this event" apart from "Salla sent it and something downstream silently
    // dropped it" (confirmed live: a product's name/SKU/cost/quantity change showed no server-side
    // trace at all, and it was only by re-deriving the deploy timeline that the real cause -- the
    // product.updated mapping not being live yet at test time -- was found, not from the logs).
    console.log("salla.webhook_received", {
      event: payload.event,
      merchant: payload.merchant,
      entityId: (payload.data as { id?: unknown })?.id,
    })

    // App Store install (Easy Mode) -- delivers the exchanged access/refresh token directly,
    // unlike every other event here, which only signals "go re-fetch entity X." Handled entirely
    // by SallaOAuthService since it owns token encryption/storage; nothing here needs an existing
    // connection (there isn't one yet -- see handleAppStoreInstall's own comment).
    if (payload.event === "app.store.authorize") {
      await this.oauthService.handleAppStoreInstall(payload)
      return
    }

    const entityType = SALLA_EVENT_TO_ENTITY_TYPE[payload.event]
    // Unhandled event type -- ack-but-no-op at the route level, same as Moyasar's non-payment_paid
    // event types. Not every event Salla can send is one this sync models.
    if (!entityType) {
      console.log("salla.webhook_event_unmapped", { event: payload.event })
      return
    }

    const target = await this.oauthRepository.findWebhookTargetByStoreId(String(payload.merchant))
    // Unknown/disconnected store -- ack-but-no-op. Never a 4xx/5xx here: a store that disconnected
    // yesterday can still have in-flight deliveries, and this must never look like a failure to
    // Salla (which could trigger its own retry/backoff or auto-disable-on-repeated-failure).
    if (!target) {
      console.log("salla.webhook_store_unknown", { merchant: payload.merchant })
      return
    }

    const entityId = String((payload.data as { id?: unknown })?.id ?? "")
    if (!entityId) return

    // Confirmed live against the real Salla sandbox: a webhook event's own payload.data is not
    // just partial (missing fields a poll-sync's full fetch would have) -- fields it DOES include
    // can use a different, incompatible shape. product.price.updated sends `price`/`regular_price`
    // as bare numbers and `sale_price` as {amount, expired_at}, while GET /products/{id} (what
    // poll-sync writes) wraps all three as {amount, currency}. normalizeSallaProduct() (the
    // products list's read path) expects the GET shape, so writing the webhook's own payload
    // verbatim -- even merged over the existing row -- corrupted price display to 0. Rather than
    // hand-reconcile every field Salla's webhooks happen to shape differently (and miss ones not
    // yet discovered, across products/orders/customers), treat the webhook purely as "entity X on
    // store Y changed" and re-fetch the canonical record the same way a poll run would, so a
    // webhook-written row and a poll-written row for the same entity are always byte-for-byte the
    // same shape.
    let accessToken: string
    try {
      accessToken = await this.oauthService.resolveAccessToken(target.connectionId)
    } catch (error) {
      console.error("salla.webhook_access_token_failed", error)
      return
    }

    const response = await fetch(
      `${this.apiBaseUrl.replace(/\/$/, "")}/${entityType}/${entityId}`,
      { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }
    )
    if (!response.ok) {
      // Most commonly a 404 (the entity was deleted between the event firing and this fetch) --
      // nothing to store either way, and never treated as a failure Salla should retry/back off on.
      console.error("salla.webhook_refetch_failed", {
        entityType,
        entityId,
        status: response.status,
      })
      return
    }

    const body = (await response.json()) as { data?: Record<string, unknown> }
    if (!body.data) return
    // GET /orders/{id} has no items (the GET /orders list the poll sync uses does), so an order a
    // webhook re-fetched showed no products -- add them in the list's own {name, quantity,
    // thumbnail} shape. A failed items fetch keeps the order without them rather than dropping it.
    if (entityType === "orders" && !Array.isArray(body.data.items)) {
      const items = await this.fetchOrderItems(entityId, accessToken)
      if (items) body.data = { ...body.data, items }
    }

    // salla_records' own (connection_id, entity_type, entity_id) unique constraint is what makes
    // this safe against a replayed/duplicate delivery -- no separate dedup table needed, same as
    // upsertRecords already behaves for the poll-sync path. A full-column replace is correct here
    // (unlike the webhook's own partial payload) because body.data is always a complete snapshot.
    await this.syncRepository.upsertRecords({
      connectionId: target.connectionId,
      customerId: target.customerId,
      records: [
        {
          entityType,
          entityId,
          recordDate: recordDateFor(entityType, body.data),
          payload: body.data,
        },
      ],
    })
    console.log("salla.webhook_synced", { event: payload.event, entityType, entityId })

    // Auto-promotes/reverse-syncs the linked native product (see SallaProductPromotionService) --
    // best-effort, a failure here must never fail the webhook's own 200 ack to Salla.
    if (entityType === "products" && this.promotionService) {
      await this.promotionService
        .promoteOrSync(
          target.organizationId,
          target.workspaceId,
          body.data as unknown as SallaProductApiPayload
        )
        .catch((error: unknown) => {
          console.error("salla.product_promotion_failed", { entityId, error })
        })
    }
  }

  // GET /orders/items?order_id= -- null when the request fails, so the caller keeps the order.
  private async fetchOrderItems(
    orderId: string,
    accessToken: string
  ): Promise<Array<{ name: string; quantity: number; thumbnail: string | null }> | null> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl.replace(/\/$/, "")}/orders/items?order_id=${encodeURIComponent(orderId)}`,
        { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }
      )
      if (!response.ok) {
        console.error("salla.webhook_order_items_failed", { orderId, status: response.status })
        return null
      }
      const body = (await response.json()) as {
        data?: Array<{
          name?: string
          quantity?: number | string
          product_thumbnail?: string | null
          thumbnail?: string | null
          images?: Array<{ image?: string }>
        }>
      }
      return (body.data ?? []).map((item) => ({
        name: item.name ?? "",
        quantity: Number(item.quantity) || 0,
        thumbnail: item.product_thumbnail ?? item.thumbnail ?? item.images?.[0]?.image ?? null,
      }))
    } catch (error) {
      console.error("salla.webhook_order_items_failed", { orderId, error })
      return null
    }
  }
}
