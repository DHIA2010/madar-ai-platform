import { collectTrackingContext } from "./context-collector"
import { EventTracker } from "./event-tracker"

export interface ProductPayload {
  productId: string
  name?: string
  category?: string
  price?: number
  currency?: string
}

export class ProductTracker {
  constructor(private readonly eventTracker: EventTracker) {}

  async product(payload: ProductPayload): Promise<void> {
    await this.eventTracker.track("product_viewed", payload, collectTrackingContext())
  }
}
