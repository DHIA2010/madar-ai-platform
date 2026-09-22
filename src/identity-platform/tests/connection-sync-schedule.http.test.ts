// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.SNAPCHAT_CLIENT_ID = "snapchat-client-id"
  process.env.SNAPCHAT_CLIENT_SECRET = "snapchat-client-secret"
  process.env.SNAPCHAT_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/snapchat-ads/oauth/callback"
  process.env.SNAPCHAT_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"
  process.env.SNAPCHAT_AUTHORIZATION_URL = "https://accounts.snapchat.com/login/oauth2/authorize"
  process.env.SNAPCHAT_TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token"
  process.env.SNAPCHAT_MARKETING_API_BASE_URL = "https://adsapi.snapchat.com/v1"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  vi.restoreAllMocks()

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
  await database.end()
})

// The schedule routes never call /sync themselves, but connectSnapchat()'s OAuth callback
// still does a real token exchange + account discovery round-trip against Snapchat's API --
// mocked here the same way snapchat-sync.http.test.ts does, minus the campaigns/ads/stats
// mocks this file never exercises.
function mockSnapchatOAuth(input: {
  baseUrl: string
  accountId: string
  accountName: string
  organizationId: string
  organizationName: string
}) {
  const nativeFetch = globalThis.fetch
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/login/oauth2/access_token")) {
      return new Response(
        JSON.stringify({
          access_token: "snap-access-schedule",
          refresh_token: "snap-refresh-schedule",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "snapchat-marketing-api",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.endsWith("/me/organizations")) {
      return new Response(
        JSON.stringify({
          organizations: [
            {
              sub_request_status: "SUCCESS",
              organization: { id: input.organizationId, name: input.organizationName },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes(`/organizations/${input.organizationId}/adaccounts`)) {
      return new Response(
        JSON.stringify({
          adaccounts: [
            {
              sub_request_status: "SUCCESS",
              adaccount: {
                id: input.accountId,
                name: input.accountName,
                currency: "USD",
                timezone: "UTC",
                organization_id: input.organizationId,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  })
}

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Schedule Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Schedule Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { login, actor }
}

async function provisionWorkspaceProject(input: {
  organizationId: string
  ownerUserId: string
  workspaceId: string
  projectId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, $5, 'active') on conflict (id) do nothing`,
    [
      input.projectId,
      input.organizationId,
      input.workspaceId,
      input.ownerUserId,
      `${input.label} Project`,
    ]
  )
}

async function connectSnapchat(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/oauth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.login.session.accessToken}`,
      "x-workspace-id": input.workspaceId,
    },
    body: JSON.stringify({ workspaceId: input.workspaceId }),
  })
  const started = (await startResponse.json()) as { state: string; connectionId: string }

  await fetch(
    `${baseUrl}/v1/integrations/snapchat-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=snap-code`,
    { redirect: "manual" }
  )

  return started
}

function headers(login: { session: { accessToken: string } }, workspaceId: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${login.session.accessToken}`,
    "x-workspace-id": workspaceId,
  }
}

const VALID_SCHEDULE_BODY = {
  enabled: true,
  frequencyMinutes: 60,
  customCron: null,
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  startTimeLocal: "09:00",
  timezone: "Asia/Riyadh",
  retryOnConnectionFailure: true,
  retryMaxAttempts: 3,
  notifyOnFailure: true,
}

describe("connection sync schedule: GET/PUT /v1/integrations/:providerId/:connectionId/schedule", () => {
  it("returns a disabled default before anything has ever been saved", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "schedule-default@madar.test",
      "Schedule Default Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002001"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000002002",
      label: "Schedule Default",
    })
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-default",
      accountName: "Default Account",
      organizationId: "snap-org-default",
      organizationName: "Snap Org Default",
    })
    const started = await connectSnapchat({ login, workspaceId })

    const response = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${started.connectionId}/schedule`,
      { headers: headers(login, workspaceId) }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { enabled: boolean; nextRunAt: string | null }
    expect(body.enabled).toBe(false)
    expect(body.nextRunAt).toBeNull()
  })

  it("saves a schedule and returns it back with a computed nextRunAt", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "schedule-save@madar.test",
      "Schedule Save Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002011"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000002012",
      label: "Schedule Save",
    })
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-save",
      accountName: "Save Account",
      organizationId: "snap-org-save",
      organizationName: "Snap Org Save",
    })
    const started = await connectSnapchat({ login, workspaceId })

    const saveResponse = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${started.connectionId}/schedule`,
      {
        method: "PUT",
        headers: headers(login, workspaceId),
        body: JSON.stringify(VALID_SCHEDULE_BODY),
      }
    )
    expect(saveResponse.status).toBe(200)
    const saved = (await saveResponse.json()) as {
      enabled: boolean
      frequencyMinutes: number | null
      nextRunAt: string | null
    }
    expect(saved.enabled).toBe(true)
    expect(saved.frequencyMinutes).toBe(60)
    expect(saved.nextRunAt).not.toBeNull()

    const getResponse = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${started.connectionId}/schedule`,
      { headers: headers(login, workspaceId) }
    )
    const fetched = (await getResponse.json()) as { enabled: boolean; frequencyMinutes: number }
    expect(fetched.enabled).toBe(true)
    expect(fetched.frequencyMinutes).toBe(60)
  })

  it("rejects a schedule for a connection that belongs to a different organization", async () => {
    const orgA = await registerAndProvisionOrg("schedule-org-a@madar.test", "Schedule Org A")
    const workspaceIdA = orgA.actor.workspaceId ?? "00000000-0000-4000-8000-000000002021"
    await provisionWorkspaceProject({
      organizationId: orgA.actor.organizationId,
      ownerUserId: orgA.actor.userId,
      workspaceId: workspaceIdA,
      projectId: "00000000-0000-4000-8000-000000002022",
      label: "Schedule Org A",
    })
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-org-a",
      accountName: "Org A Account",
      organizationId: "snap-org-a",
      organizationName: "Snap Org A",
    })
    const startedA = await connectSnapchat({ login: orgA.login, workspaceId: workspaceIdA })

    const orgB = await registerAndProvisionOrg("schedule-org-b@madar.test", "Schedule Org B")
    const workspaceIdB = orgB.actor.workspaceId ?? "00000000-0000-4000-8000-000000002031"
    await provisionWorkspaceProject({
      organizationId: orgB.actor.organizationId,
      ownerUserId: orgB.actor.userId,
      workspaceId: workspaceIdB,
      projectId: "00000000-0000-4000-8000-000000002032",
      label: "Schedule Org B",
    })

    const response = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${startedA.connectionId}/schedule`,
      { headers: headers(orgB.login, workspaceIdB) }
    )
    expect(response.status).toBe(404)
  })

  it("rejects a save with both frequencyMinutes and customCron set", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "schedule-invalid@madar.test",
      "Schedule Invalid Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002041"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000002042",
      label: "Schedule Invalid",
    })
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-invalid",
      accountName: "Invalid Account",
      organizationId: "snap-org-invalid",
      organizationName: "Snap Org Invalid",
    })
    const started = await connectSnapchat({ login, workspaceId })

    const response = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${started.connectionId}/schedule`,
      {
        method: "PUT",
        headers: headers(login, workspaceId),
        body: JSON.stringify({ ...VALID_SCHEDULE_BODY, customCron: "*/15 * * * *" }),
      }
    )
    expect(response.status).toBe(400)
  })
})

// Regression: the connections overview list's own "المزامنة التالية" column read from an
// unrelated in-memory cache that a real saved schedule never populated, so it always showed
// "-" even for a connection with a real, active schedule. GET /v1/integrations/schedules is
// the real data source that column should use instead.
describe("connection sync schedule: GET /v1/integrations/schedules", () => {
  it("lists only the caller's own organization's enabled schedules, each with a real nextRunAt", async () => {
    const orgA = await registerAndProvisionOrg(
      "schedules-list-org-a@madar.test",
      "Schedules List Org A"
    )
    const workspaceIdA = orgA.actor.workspaceId ?? "00000000-0000-4000-8000-000000002051"
    await provisionWorkspaceProject({
      organizationId: orgA.actor.organizationId,
      ownerUserId: orgA.actor.userId,
      workspaceId: workspaceIdA,
      projectId: "00000000-0000-4000-8000-000000002052",
      label: "Schedules List Org A",
    })
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-list-a",
      accountName: "List Org A Account",
      organizationId: "snap-org-list-a",
      organizationName: "Snap Org List A",
    })
    const startedA = await connectSnapchat({ login: orgA.login, workspaceId: workspaceIdA })
    const putA = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${startedA.connectionId}/schedule`,
      {
        method: "PUT",
        headers: headers(orgA.login, workspaceIdA),
        body: JSON.stringify(VALID_SCHEDULE_BODY),
      }
    )
    expect(putA.status).toBe(200)

    // A different organization's schedule -- must never leak into org A's list. Restores the
    // real fetch first: mockSnapchatOAuth captures "the current global fetch" as its own
    // fallback, so calling it again without restoring would wrap the previous mock instead of
    // the native implementation, recursing forever on any unmatched URL.
    const orgB = await registerAndProvisionOrg(
      "schedules-list-org-b@madar.test",
      "Schedules List Org B"
    )
    const workspaceIdB = orgB.actor.workspaceId ?? "00000000-0000-4000-8000-000000002061"
    await provisionWorkspaceProject({
      organizationId: orgB.actor.organizationId,
      ownerUserId: orgB.actor.userId,
      workspaceId: workspaceIdB,
      projectId: "00000000-0000-4000-8000-000000002062",
      label: "Schedules List Org B",
    })
    vi.restoreAllMocks()
    mockSnapchatOAuth({
      baseUrl,
      accountId: "acc-list-b",
      accountName: "List Org B Account",
      organizationId: "snap-org-list-b",
      organizationName: "Snap Org List B",
    })
    const startedB = await connectSnapchat({ login: orgB.login, workspaceId: workspaceIdB })
    const putB = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/${startedB.connectionId}/schedule`,
      {
        method: "PUT",
        headers: headers(orgB.login, workspaceIdB),
        body: JSON.stringify(VALID_SCHEDULE_BODY),
      }
    )
    expect(putB.status).toBe(200)

    const response = await fetch(`${baseUrl}/v1/integrations/schedules`, {
      headers: headers(orgA.login, workspaceIdA),
    })
    expect(response.status).toBe(200)
    const schedules = (await response.json()) as Array<{
      connectionId: string
      nextRunAt: string | null
    }>

    expect(schedules).toHaveLength(1)
    expect(schedules[0].connectionId).toBe(startedA.connectionId)
    expect(schedules[0].nextRunAt).not.toBeNull()
  })
})
