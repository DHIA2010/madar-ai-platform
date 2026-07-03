import type { EventPublisher } from "../../application/ports"
import type { DomainEvent } from "../../domain/events"

export class InMemoryEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = []

  async publish(events: DomainEvent[]) {
    this.events.push(...events)
  }
}
