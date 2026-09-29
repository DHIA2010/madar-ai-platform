// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IdentityCommandHandlers } from "../application/handlers/command-handlers"
import { IdentityQueryHandlers } from "../application/handlers/query-handlers"
import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { ConsoleLogger } from "../infrastructure/logger/console-logger"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createPostgresRepositories } from "../infrastructure/postgres/repositories"
import { InMemoryEventPublisher } from "../infrastructure/queue/in-memory-event-publisher"
import { ZidIntegrationProvider } from "../integrations/zid/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { ZidOAuthRepository } from "../zid-oauth/repository"
import { ZidOAuthService } from "../zid-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

// Only the store-profile endpoint is ever hit by connectDirect -- there is no token exchange,
// since the merchant already supplies a live access token instead of an authorization code.
function mockZidProfile(input: {
  store: { id: string; title: string; currencyCode?: string; timezone?: string; url?: string }
  expectAccessToken?: string
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/managers/account/profile")) {
      if (input.expectAccessToken) {
        const headers = new Headers(init?.headers)
        if (headers.get("x-manager-token") !== input.expectAccessToken) {
          return new Response("{}", { status: 401 })
        }
      }

      return new Response(
        JSON.stringify({
          user: {
            email: "merchant@store.test",
            name: "Merchant",
            store: {
              id: input.store.id,
              url: input.store.url,
              title: input.store.title,
              currency: { code: input.store.currencyCode ?? "SAR" },
              timezone: input.store.timezone ?? "Asia/Riyadh",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.ZID_CLIENT_ID = "zid-client-id"
  process.env.ZID_CLIENT_SECRET = "zid-client-secret"
  process.env.ZID_REDIRECT_URI = "http://localhost:4000/v1/integrations/zid/oauth/callback"
  process.env.ZID_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  const pgIdentityRepos = createPostgresRepositories({
    db: database,
    tokenService: container.zidAutoProvisionDeps!.tokenService,
    sessions: container.zidAutoProvisionDeps!.sessions,
  })
  container.commands = new IdentityCommandHandlers({
    config: container.config,
    repositories: pgIdentityRepos,
    clock: container.zidAutoProvisionDeps!.clock,
    uuid: container.zidAutoProvisionDeps!.uuid,
    hasher: container.zidAutoProvisionDeps!.hasher,
    tokenService: container.zidAutoProvisionDeps!.tokenService,
    rateLimiter: container.infrastructure.rateLimiter!,
    emailGateway: container.zidAutoProvisionDeps!.emailGateway,
    logger: new ConsoleLogger(),
    eventPublisher: new InMemoryEventPublisher(),
    featureFlags: container.infrastructure.featureFlags,
    metrics: container.infrastructure.metrics,
  })
  container.queries = new IdentityQueryHandlers(pgIdentityRepos)
  container.zidAutoProvisionDeps = { ...container.zidAutoProvisionDeps!, ...pgIdentityRepos }
  container.infrastructure.integrations?.register(
    new ZidIntegrationProvider(database, container.zidAutoProvisionDeps)
  )

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

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Zid Direct Connect Test",
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
     values ($1, $2, 'hash', 'Zid Direct Connect Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Default Workspace', 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId]
    )
  }

  return { login, actor }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

let projectSeq = 0

// resolveProject (used by connectDirect, same as startAuthorization) requires an existing
// project row -- unlike claimInstall's resolveOrCreateDefaultProject, it doesn't auto-create one.
// A real MADAR org always has one by the time a merchant reaches the integrations page; tests
// need to seed it explicitly.
async function provisionProject(actor: {
  organizationId: string
  userId: string
  workspaceId: string | null
}) {
  const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000009000"
  projectSeq += 1
  const projectId = `00000000-0000-4000-8000-0000000091${String(projectSeq).padStart(2, "0")}`

  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Default Workspace', 'active') on conflict (id) do nothing`,
    [workspaceId, actor.organizationId]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Default Project', 'active') on conflict (id) do nothing`,
    [projectId, actor.organizationId, workspaceId, actor.userId]
  )

  return { workspaceId, projectId }
}

describe("Zid direct connect (merchant-supplied Direct API Integration token)", () => {
  it("connects a store with a store id + access token, no OAuth redirect involved", async () => {
    mockZidProfile({
      store: { id: "3058261", title: "My Real Store", url: "https://my-real-store.zid.store" },
      expectAccessToken: "direct-access-token-123",
    })

    const { login, actor } = await registerAndProvisionOrg(
      "direct-owner@madar.test",
      "Direct Connect Org"
    )
    await provisionProject(actor)

    const response = await fetch(`${baseUrl}/v1/integrations/zid/direct-connect`, {
      method: "POST",
      headers: authHeaders(login.session.accessToken),
      body: JSON.stringify({ storeId: "3058261", accessToken: "direct-access-token-123" }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      connectionId: string
      status: string
      accountName: string
    }
    expect(body.status).toBe("connected")
    expect(body.accountName).toBe("My Real Store")

    const connectionResponse = await fetch(`${baseUrl}/v1/integrations/zid/connection`, {
      headers: authHeaders(login.session.accessToken),
    })
    const connectionBody = (await connectionResponse.json()) as {
      connection: { status: string; providerAccountName: string } | null
    }
    expect(connectionBody.connection?.status).toBe("connected")
    expect(connectionBody.connection?.providerAccountName).toBe("My Real Store")
  })

  it("rejects an access token Zid's API doesn't accept, with a clear error rather than a bare 500", async () => {
    mockZidProfile({
      store: { id: "3058261", title: "My Real Store" },
      expectAccessToken: "the-only-valid-token",
    })

    const { login, actor } = await registerAndProvisionOrg("bad-token@madar.test", "Bad Token Org")
    await provisionProject(actor)

    const response = await fetch(`${baseUrl}/v1/integrations/zid/direct-connect`, {
      method: "POST",
      headers: authHeaders(login.session.accessToken),
      body: JSON.stringify({ storeId: "3058261", accessToken: "wrong-token" }),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe("ZID_DIRECT_TOKEN_INVALID")
  })

  it("rejects an empty access token before ever calling Zid", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const { login, actor } = await registerAndProvisionOrg(
      "empty-token@madar.test",
      "Empty Token Org"
    )
    await provisionProject(actor)
    fetchSpy.mockClear()

    const response = await fetch(`${baseUrl}/v1/integrations/zid/direct-connect`, {
      method: "POST",
      headers: authHeaders(login.session.accessToken),
      body: JSON.stringify({ storeId: "3058261", accessToken: "" }),
    })

    // Schema-level rejection (min length 10) -- fails validation before the provider is ever
    // reached, so Zid's own API is never called (only this request itself, to the test server).
    expect(response.status).toBe(400)
    const externalCalls = fetchSpy.mock.calls.filter(
      ([rawInput]) => !String(rawInput).startsWith(baseUrl)
    )
    expect(externalCalls).toHaveLength(0)
  })

  it("resolveAccessToken returns a direct connection's token as-is, with no refresh attempt", async () => {
    mockZidProfile({
      store: { id: "3058261", title: "My Real Store" },
      expectAccessToken: "direct-access-token-456",
    })

    const { actor } = await registerAndProvisionOrg("service-level@madar.test", "Service Level Org")
    await provisionProject(actor)

    const repository = new ZidOAuthRepository(database)
    const service = new ZidOAuthService(repository)

    const result = await service.connectDirect(actor, {
      storeId: "3058261",
      accessToken: "direct-access-token-456",
    })
    expect(result.status).toBe("connected")

    const resolved = await service.resolveAccessToken(result.connectionId)
    expect(resolved.accessToken).toBe("direct-access-token-456")
    expect(resolved.authorizationHeader).toBe("Bearer direct-access-token-456")

    // No refresh_token grant should ever be attempted for a direct connection -- the only fetch
    // calls made across connectDirect + resolveAccessToken are the two profile-validation checks
    // (once per connectDirect call), never a /oauth/token request.
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    const tokenCalls = fetchMock.mock.calls.filter(([rawInput]) =>
      String(rawInput).includes("/oauth/token")
    )
    expect(tokenCalls).toHaveLength(0)
  })
})
