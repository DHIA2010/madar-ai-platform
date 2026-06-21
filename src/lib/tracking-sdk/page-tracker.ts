import { collectTrackingContext } from "./context-collector"
import { EventTracker } from "./event-tracker"

export class PageTracker {
  constructor(private readonly eventTracker: EventTracker) {}

  async page(path: string, title?: string): Promise<void> {
    const context = collectTrackingContext()
    await this.eventTracker.track(
      "page_viewed",
      {
        path,
        title: title ?? (typeof document === "undefined" ? "" : document.title),
      },
      context
    )
  }
}
