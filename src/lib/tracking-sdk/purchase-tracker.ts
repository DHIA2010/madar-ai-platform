import { collectTrackingContext } from "./context-collector"
import { EventTracker } from "./event-tracker"

export interface PurchasePayload {
  orderId: string
  value: number
  currency: string
  items?: Array<{
    productId: string
    quantity: number
    price: number
  }>
}

export class PurchaseTracker {
  constructor(private readonly eventTracker: EventTracker) {}

  async purchase(payload: PurchasePayload): Promise<void> {
    await this.eventTracker.track("order_completed", payload, collectTrackingContext())
  }
}
