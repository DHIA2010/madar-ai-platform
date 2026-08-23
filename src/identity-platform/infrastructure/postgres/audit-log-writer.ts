import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "./database"

// A direct, simple parameterized insert for self-contained modules (campaign-links, attribution,
// etc.) that don't have access to the private `audit()` helper on IdentityCommandHandlers or the
// unexported PostgresAuditLogRepository. Writes to the same audit_logs table those use.
export async function writeAuditLog(
  database: PostgresDatabase,
  entry: {
    action: string
    actorUserId: string | null
    organizationId: string | null
    workspaceId: string | null
    entityType: string
    entityId: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await database.query(
    `INSERT INTO audit_logs (
       id, actor_user_id, organization_id, workspace_id, action, entity_type, entity_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      entry.actorUserId,
      entry.organizationId,
      entry.workspaceId,
      entry.action,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.metadata ?? {}),
    ]
  )
}
