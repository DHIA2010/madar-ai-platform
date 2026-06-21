import type {
  TrackingDispatcherPort,
  TrackingEvent,
} from "@/application/contracts/tracking.contracts"

export class InMemoryTrackingDispatcher implements TrackingDispatcherPort {
  private readonly failEventIds = new Set<string>()
  private readonly dispatched: TrackingEvent[] = []

  setFailureMode(eventIds: string[]) {
    this.failEventIds.clear()
    for (const id of eventIds) {
      this.failEventIds.add(id)
    }
  }

  getDispatchedEvents() {
    return this.dispatched.slice()
  }

  async dispatch(events: TrackingEvent[]): Promise<{ success: boolean; failedEventIds: string[] }> {
    const failedEventIds = events
      .filter((event) => this.failEventIds.has(event.eventId))
      .map((event) => event.eventId)

    for (const event of events) {
      if (!this.failEventIds.has(event.eventId)) {
        this.dispatched.push(event)
      }
    }

    return {
      success: failedEventIds.length === 0,
      failedEventIds,
    }
  }
}
