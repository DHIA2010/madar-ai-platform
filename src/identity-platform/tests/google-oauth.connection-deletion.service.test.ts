// @vitest-environment node

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { GoogleOAuthRepository } from "../google-oauth/repository"
import { GoogleOAuthConnectionDeletionService } from "../google-oauth/connection-deletion-service"

const OWNER_ID = "20000000-0000-4000-8000-000000000001"
const ADMIN_ID = "20000000-0000-4000-8000-000000000002"
const ORG_ID = "20000000-0000-4000-8000-000000000003"
const WS_ID = "20000000-0000-4000-8000-000000000004"
const PROJECT_ID = "20000000-0000-4000-8000-000000000005"
const CONNECTION_ID = "20000000-0000-4000-8000-000000000006"

let database: PostgresDatabase
let repository: GoogleOAuthRepository
let service: GoogleOAuthConnectionDeletionService

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  repository = new GoogleOAuthRepository(database)
  service = new GoogleOAuthConnectionDeletionService(repository)

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'owner@delete.test', 'hash', 'Owner', now())`,
    [OWNER_ID]
  )
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'admin@delete.test', 'hash', 'Admin', now())`,
    [ADMIN_ID]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Org', $2, 'active')`,
    [ORG_ID, OWNER_ID]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Workspace', 'active')`,
    [WS_ID, ORG_ID]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Project', 'active')`,
    [PROJECT_ID, ORG_ID, WS_ID, OWNER_ID]
  )
  await database.query(
    `insert into google_oauth_connections (
      id, organization_id, workspace_id, project_id, status,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [CONNECTION_ID, ORG_ID, WS_ID, PROJECT_ID, OWNER_ID]
  )
})

afterEach(async () => {
  await database.end()
})

describe("google oauth connection deletion service", () => {
  it("deletes connection for authorized owner in same workspace", async () => {
    await service.deleteConnection(
      {
        userId: OWNER_ID,
        sessionId: "session-owner",
        organizationId: ORG_ID,
        workspaceId: WS_ID,
        roles: ["owner"],
      },
      CONNECTION_ID
    )

    const connection = await repository.findConnectionById(CONNECTION_ID)
    expect(connection).toBeNull()
  })

  it("rejects users without owner/admin roles", async () => {
    await expect(
      service.deleteConnection(
        {
          userId: ADMIN_ID,
          sessionId: "session-member",
          organizationId: ORG_ID,
          workspaceId: WS_ID,
          roles: ["viewer"],
        },
        CONNECTION_ID
      )
    ).rejects.toMatchObject({ code: "GOOGLE_OAUTH_FORBIDDEN", status: 403 })
  })

  it("rejects deletes across workspace boundaries", async () => {
    const otherWorkspaceId = "20000000-0000-4000-8000-000000000007"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Other Workspace', 'active')`,
      [otherWorkspaceId, ORG_ID]
    )

    await expect(
      service.deleteConnection(
        {
          userId: OWNER_ID,
          sessionId: "session-owner",
          organizationId: ORG_ID,
          workspaceId: otherWorkspaceId,
          roles: ["owner"],
        },
        CONNECTION_ID
      )
    ).rejects.toMatchObject({ code: "GOOGLE_OAUTH_CONNECTION_NOT_FOUND", status: 404 })
  })
})
