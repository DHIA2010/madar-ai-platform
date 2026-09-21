import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"

export class ScheduleFailureAlertRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async create(input: {
    organizationId: string
    workspaceId: string | null
    providerId: string
    connectionId: string
    scheduleId: string
    errorCode: string | null
    errorMessage: string | null
  }) {
    await this.db.query(
      `
      insert into schedule_failure_alerts (
        id, organization_id, workspace_id, provider_id, connection_id, schedule_id,
        error_code, error_message, is_read, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,false,now())
      `,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.providerId,
        input.connectionId,
        input.scheduleId,
        input.errorCode,
        input.errorMessage,
      ]
    )
  }
}
