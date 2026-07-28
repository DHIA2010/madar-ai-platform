import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresOutboxEventPublisher } from "../infrastructure/postgres/outbox-event-publisher"

describe("outbox foundation", () => {
  it("persists versioned events transactionally", async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    const database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())

    const publisher = new PostgresOutboxEventPublisher(database)
    await publisher.publish([
      {
        eventId: "00000000-0000-0000-0000-000000000010",
        eventType: "UserRegistered",
        eventVersion: 1,
        aggregateType: "user",
        aggregateId: "00000000-0000-0000-0000-000000000001",
        occurredAt: new Date().toISOString(),
        metadata: { requestId: "req-1" },
        payload: { userId: "00000000-0000-0000-0000-000000000001" },
      },
    ])

    const result = await database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM outbox_events"
    )
    expect(Number(result.rows[0]?.count ?? 0)).toBe(1)
  })
})
