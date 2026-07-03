import type { EventPublisher } from "../../application/ports"
import type { DomainEvent } from "../../domain/events"
import { PostgresDatabase } from "./database"

export class PostgresOutboxEventPublisher implements EventPublisher {
  constructor(private readonly db: PostgresDatabase) {}

  async publish(events: DomainEvent[]) {
    for (const event of events) {
      await this.db.query({
        name: "identity-outbox-insert",
        text: `
          INSERT INTO outbox_events (
            id, event_type, event_version, aggregate_type, aggregate_id,
            occurred_at, metadata, payload, status, attempts, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',0,$6)
          ON CONFLICT (id) DO NOTHING
        `,
        values: [
          event.eventId,
          event.eventType,
          event.eventVersion,
          event.aggregateType,
          event.aggregateId,
          event.occurredAt,
          JSON.stringify(event.metadata),
          JSON.stringify(event.payload),
        ],
      })
    }
  }
}
