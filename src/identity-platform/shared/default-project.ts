import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Every integration connection belongs to a project, but nothing creates one when an
// organization or workspace is set up -- only the Salla/Zid marketplace installs did. A workspace
// without a project couldn't connect Google Analytics, Meta, Google Ads, Snapchat, TikTok or
// Shopify at all (PROJECT_NOT_FOUND). Starting a connection now creates the workspace's default
// project the first time it's needed, the same way Salla and Zid do.
export async function createDefaultProject(
  db: PostgresDatabase,
  input: { organizationId: string; workspaceId: string | null; ownerUserId: string }
): Promise<{ projectId: string; workspaceId: string | null }> {
  const projectId = randomUUID()
  await db.query(
    `INSERT INTO projects (id, organization_id, workspace_id, owner_user_id, name)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, input.organizationId, input.workspaceId, input.ownerUserId, "Madar"]
  )
  return { projectId, workspaceId: input.workspaceId }
}
