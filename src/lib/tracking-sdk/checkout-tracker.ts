import { collectTrackingContext } from "./context-collector"
import { EventTracker } from "./event-tracker"

export interface CheckoutPayload {
  checkoutId?: string
  step?: string
  value?: number
  currency?: string
}

export class CheckoutTracker {
  constructor(private readonly eventTracker: EventTracker) {}

  async checkout(payload: CheckoutPayload): Promise<void> {
    await this.eventTracker.track("checkout_started", payload, collectTrackingContext())
  }
}
