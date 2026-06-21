import { collectTrackingContext } from "./context-collector"
import { EventTracker } from "./event-tracker"

export interface CartPayload {
  cartId?: string
  productId?: string
  quantity?: number
  value?: number
  currency?: string
}

export class CartTracker {
  constructor(private readonly eventTracker: EventTracker) {}

  async cart(payload: CartPayload): Promise<void> {
    await this.eventTracker.track("cart_updated", payload, collectTrackingContext())
  }
}
