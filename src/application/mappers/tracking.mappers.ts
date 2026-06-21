import type { TrackingEvent, TrackingEventName } from "../contracts/tracking.contracts"

const canonicalEventMap: Record<TrackingEventName, TrackingEventName> = {
  page_viewed: "page_viewed",
  product_viewed: "product_viewed",
  category_viewed: "category_viewed",
  search_performed: "search_performed",
  add_to_cart: "add_to_cart",
  remove_from_cart: "remove_from_cart",
  checkout_started: "checkout_started",
  checkout_completed: "checkout_completed",
  purchase_completed: "purchase_completed",
  banner_clicked: "banner_clicked",
  promotion_clicked: "promotion_clicked",
  collection_viewed: "collection_viewed",
  login: "login",
  signup: "signup",
}

export function mapToCanonicalTrackingEvent(event: TrackingEvent): TrackingEvent {
  return {
    ...event,
    name: canonicalEventMap[event.name],
  }
}
