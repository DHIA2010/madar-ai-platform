import { toRecordDate } from "./record-date"
import type { SallaOAuthRepository } from "./repository"
import type { SallaSyncRepository } from "./sync-repository"

export interface SallaWebhookPayload {
  event: string
  merchant: number | string
  created_at?: string
  data: Record<string, unknown>
}

// Fetched directly from https://docs.salla.dev/webhooks's own event catalog. Add/remove a row
// here to change what the webhook path syncs -- no other code needs to change. Deliberately not
// mapped: order.deleted/product.deleted (upsertRecords only ever inserts/updates -- a delete-shaped
// event needs a distinct branch, flagged as follow-up work, not built here) and every
// shipping/category/brand/store/cart/invoice/special-offer/review event (outside the
// products/orders/customers scope salla_records models at all today).
const SALLA_EVENT_TO_ENTITY_TYPE: Record<string, "products" | "orders" | "customers"> = {
  "order.created": "orders",
  "order.updated": "orders",
  "order.status.updated": "orders",
  "order.cancelled": "orders",
  "order.refunded": "orders",
  "order.products.updated": "orders",
  "order.payment.updated": "orders",
  "order.total.price.updated": "orders",

  "product.created": "products",
  "product.price.updated": "products",
  "product.status.updated": "products",
  "product.quantity.low": "products",

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
  constructor(
    private readonly oauthRepository: SallaOAuthRepository,
    private readonly syncRepository: SallaSyncRepository
  ) {}

  async handleWebhookEvent(payload: SallaWebhookPayload): Promise<void> {
    const entityType = SALLA_EVENT_TO_ENTITY_TYPE[payload.event]
    // Unhandled event type -- ack-but-no-op at the route level, same as Moyasar's non-payment_paid
    // event types. Not every event Salla can send is one this sync models.
    if (!entityType) return

    const target = await this.oauthRepository.findWebhookTargetByStoreId(String(payload.merchant))
    // Unknown/disconnected store -- ack-but-no-op. Never a 4xx/5xx here: a store that disconnected
    // yesterday can still have in-flight deliveries, and this must never look like a failure to
    // Salla (which could trigger its own retry/backoff or auto-disable-on-repeated-failure).
    if (!target) return

    const entityId = String((payload.data as { id?: unknown })?.id ?? "")
    if (!entityId) return

    // salla_records' own (connection_id, entity_type, entity_id) unique constraint is what makes
    // this safe against a replayed/duplicate delivery -- no separate dedup table needed, same as
    // upsertRecords already behaves for the poll-sync path.
    //
    // upsertPartialRecord, not upsertRecords: a webhook event's payload.data is only the fields
    // that event actually changed (confirmed live -- product.price.updated carries no `name` at
    // all), not a full entity snapshot the way a poll-sync's own fetch always is. upsertRecords'
    // full-column replace would wipe out every field this event didn't mention.
    await this.syncRepository.upsertPartialRecord({
      connectionId: target.connectionId,
      customerId: target.customerId,
      record: {
        entityType,
        entityId,
        recordDate: recordDateFor(entityType, payload.data),
        payload: payload.data,
      },
    })
  }
}
