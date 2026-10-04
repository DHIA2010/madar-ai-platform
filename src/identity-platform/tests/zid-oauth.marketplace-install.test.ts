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

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

// Mirrors zid-sync.http.test.ts's mockZidResponses -- only the token exchange and store-profile
// endpoints matter here, no product/order/customer sync involved.
function mockZidTokenAndProfile(input: {
  accessToken: string
  refreshToken: string
  store: {
    id: string
    title: string
    currencyCode?: string
    timezone?: string
    uuid?: string
    url?: string
  }
  // Omitted in most tests -- exercises fetchStoreInfo's fallback to the claim-token flow
  // whenever Zid's profile response carries no manager email at all. Set only by the
  // auto-provisioning tests below.
  merchantEmail?: string
  merchantName?: string
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    // Pass through calls to the test server itself (register/login/the install routes) --
    // only external Zid endpoints are intercepted below.
    if (url.startsWith(baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth/token")) {
      return new Response(
        JSON.stringify({
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600 * 24 * 365,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/managers/account/profile")) {
      return new Response(
        JSON.stringify({
          user: {
            email: input.merchantEmail,
            name: input.merchantName,
            store: {
              id: input.store.id,
              // Both real fields of Zid's profile response. The storefront snippet parameter
              // {{store.id}} expands to the uuid, not the numeric id, so tracking resolution
              // depends on this one being persisted.
              uuid: input.store.uuid,
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
  // Memory mode's own repositories are fake, in-process Maps, not backed by `database` -- but
  // claimInstall's FK constraints (projects.organization_id, etc.) and the auto-provisioning
  // tests below need users/organizations/workspaces/memberships to be the SAME real SQL tables
  // Zid's own repository queries, and container.commands/queries must see those same rows too
  // (resolveActorFromAccessToken looks users/memberships up there) -- so this rebuilds both on
  // real Postgres-backed repositories instead of leaving them on the memory-mode fakes.
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
      fullName: "Zid Marketplace Install Test",
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
     values ($1, $2, 'hash', 'Zid Marketplace Install Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  // Note: deliberately NOT inserting a `projects` row here -- this test exercises
  // resolveOrCreateDefaultProject's auto-create path, matching a brand-new merchant who has
  // never used MADAR before and has no project yet.
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

// Zid support's confirmed fix: the App Market "Activate" button's Redirection URL must point at
// this new, unauthenticated GET /v1/integrations/zid/start route -- not the callback -- so a
// real `state` exists before Zid ever redirects back. Every marketplace test below now goes
// through this first, exactly like a real merchant would via Zid's own Redirection URL.
async function startMarketplaceAuthorization(): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/integrations/zid/start`, { redirect: "manual" })
  expect(response.status).toBe(302)
  const location = response.headers.get("location") ?? ""
  const state = new URL(location).searchParams.get("state")
  expect(state).not.toBeNull()
  return state!
}

async function completeMarketplaceCallback(): Promise<string> {
  const state = await startMarketplaceAuthorization()
  const response = await fetch(
    `${baseUrl}/v1/integrations/zid/oauth/callback?state=${encodeURIComponent(state)}&code=zid-mkt-code`,
    { redirect: "manual" }
  )
  expect(response.status).toBe(302)
  const location = response.headers.get("location") ?? ""
  const match = location.match(/\/integrations\/zid\/claim\/([^/?]+)/)
  expect(match).not.toBeNull()
  return decodeURIComponent(match![1])
}

async function completeMarketplaceCallbackExpectingAutoLogin(): Promise<string> {
  const state = await startMarketplaceAuthorization()
  const response = await fetch(
    `${baseUrl}/v1/integrations/zid/oauth/callback?state=${encodeURIComponent(state)}&code=zid-mkt-code`,
    { redirect: "manual" }
  )
  expect(response.status).toBe(302)
  const location = response.headers.get("location") ?? ""
  const match = location.match(/\/integrations\/zid\/auto-login\/([^/?]+)/)
  expect(match).not.toBeNull()
  return decodeURIComponent(match![1])
}

describe("GET /v1/integrations/zid/start (the new Redirection URL target)", () => {
  it("redirects to Zid's authorize endpoint with client_id, redirect_uri, response_type, and a real state -- with no authentication required", async () => {
    const response = await fetch(`${baseUrl}/v1/integrations/zid/start`, { redirect: "manual" })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("location") ?? "")
    expect(location.origin + location.pathname).toBe("https://oauth.zid.sa/oauth/authorize")
    expect(location.searchParams.get("client_id")).toBe("zid-client-id")
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/v1/integrations/zid/oauth/callback"
    )
    expect(location.searchParams.get("response_type")).toBe("code")
    const state = location.searchParams.get("state")
    expect(state).toBeTruthy()

    const stateRows = await database.query(
      `SELECT flow, organization_id, project_id, user_id, connection_id, status FROM zid_oauth_states WHERE state = $1`,
      [state]
    )
    expect(stateRows.rows[0]).toMatchObject({
      flow: "marketplace",
      organization_id: null,
      project_id: null,
      user_id: null,
      connection_id: null,
      status: "pending",
    })
  })
})

describe("Zid marketplace-initiated install (Activate from Zid's App Market)", () => {
  // The actual bug Zid support identified and the actual fix: a bare `code` with no `state` at
  // all must be rejected outright, never exchanged. This was exactly the behavior the old
  // `!state -> exchange anyway` branch masked -- the Redirection URL pointing straight at the
  // callback produced this same request shape, and the callback happily treated it as a
  // legitimate marketplace install.
  it("rejects a callback with a code but no state at all, without ever exchanging it", async () => {
    const tokenFetchSpy = mockZidTokenAndProfile({
      accessToken: "should-never-be-used",
      refreshToken: "should-never-be-used",
      store: { id: "000000", title: "Should Never Be Fetched" },
    })

    const response = await fetch(
      `${baseUrl}/v1/integrations/zid/oauth/callback?code=zid-mkt-code`,
      {
        redirect: "manual",
      }
    )
    expect(response.status).toBe(302)
    const location = response.headers.get("location") ?? ""
    expect(location).toContain("zid_oauth=error")
    expect(location).toContain("reason=missing_code_or_state")

    // No token exchange should have been attempted at all -- only this test server's own
    // fetch calls (register/login, none here) should have gone through.
    const tokenCalls = tokenFetchSpy.mock.calls.filter(([rawInput]) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      return url.includes("/oauth/token")
    })
    expect(tokenCalls).toHaveLength(0)

    const installRows = await database.query(
      `SELECT count(*)::int AS count FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0].count).toBe(0)
  })

  it("exchanges the code with no state, lands on an unclaimed install, and claims it into the actor's org", async () => {
    mockZidTokenAndProfile({
      accessToken: "mkt-access-token",
      refreshToken: "mkt-refresh-token",
      store: { id: "778899", title: "Marketplace Test Store" },
    })

    const claimToken = await completeMarketplaceCallback()

    // Public summary lookup -- no auth needed, no secrets returned.
    const summaryResponse = await fetch(`${baseUrl}/v1/integrations/zid/install/${claimToken}`)
    expect(summaryResponse.status).toBe(200)
    const summary = (await summaryResponse.json()) as {
      storeName: string
      currency: string | null
      status: string
    }
    expect(summary).toEqual({
      storeName: "Marketplace Test Store",
      currency: "SAR",
      status: "unclaimed",
    })

    const { login, actor } = await registerAndProvisionOrg(
      "zid-marketplace-owner@madar.test",
      "Zid Marketplace Org"
    )

    const claimResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(claimResponse.status).toBe(200)
    const claimed = (await claimResponse.json()) as {
      connectionId: string
      organizationId: string
      projectId: string
      status: string
      accountName: string
      redirectUrl: string
    }
    expect(claimed.organizationId).toBe(actor.organizationId)
    expect(claimed.status).toBe("connected")
    expect(claimed.accountName).toBe("Marketplace Test Store")
    // Zid's app-activation policy requires continuing straight through to "service ready" --
    // this must be the exact same success URL a direct (admin-initiated) Zid connect redirects
    // to, not a generic page, so the frontend can send the merchant there immediately.
    expect(claimed.redirectUrl).toContain("http://localhost:3000/integrations/new")
    expect(claimed.redirectUrl).toContain("zid_oauth=connected")
    expect(claimed.redirectUrl).toContain(`zid_connection_id=${claimed.connectionId}`)

    const connectionRows = await database.query(
      `SELECT status, provider_account_id, project_id FROM zid_oauth_connections WHERE id = $1`,
      [claimed.connectionId]
    )
    expect(connectionRows.rows[0]).toMatchObject({
      status: "connected",
      provider_account_id: "778899",
    })

    // resolveOrCreateDefaultProject's auto-create path -- no project existed before the claim.
    const projectRows = await database.query(`SELECT name FROM projects WHERE id = $1`, [
      claimed.projectId,
    ])
    expect(projectRows.rows[0]).toMatchObject({ name: "Zid Store" })

    const installRows = await database.query(
      `SELECT status, claimed_organization_id, claimed_connection_id FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0]).toMatchObject({
      status: "claimed",
      claimed_organization_id: actor.organizationId,
      claimed_connection_id: claimed.connectionId,
    })

    // Single-use: a replayed claim of the same token must fail, not silently re-process.
    const replayResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(replayResponse.status).not.toBe(200)
  })

  // Confirmed as a real failure on stage (2026-10-04): a claimed marketplace install's
  // zid_marketplace_installs row still points at the connection via claimed_connection_id, and
  // deleteConnectionCascade used to delete the connection row without clearing that reference
  // first, so every delete of a claimed connection threw a foreign key violation (the DELETE
  // request failed outright, leaving the stale connection in place).
  it("deletes a claimed marketplace connection cleanly, without a foreign key violation", async () => {
    mockZidTokenAndProfile({
      accessToken: "mkt-delete-access-token",
      refreshToken: "mkt-delete-refresh-token",
      store: { id: "665544", title: "Marketplace Delete Store" },
    })

    const claimToken = await completeMarketplaceCallback()
    const { login } = await registerAndProvisionOrg(
      "zid-marketplace-delete@madar.test",
      "Zid Marketplace Delete Org"
    )

    const claimResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(claimResponse.status).toBe(200)
    const claimed = (await claimResponse.json()) as { connectionId: string }

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${claimed.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const connectionRows = await database.query(
      `SELECT id FROM zid_oauth_connections WHERE id = $1`,
      [claimed.connectionId]
    )
    expect(connectionRows.rows).toHaveLength(0)

    // The install row itself survives (it's the historical record of the claim) -- only its
    // reference to the now-deleted connection is cleared.
    const installRows = await database.query(
      `SELECT status, claimed_connection_id FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0]).toMatchObject({ status: "claimed", claimed_connection_id: null })
  })

  it("carries the store UUID and domain through the claim so tracking resolves immediately", async () => {
    // Before this, zid_marketplace_installs persisted only name/currency/timezone, so a merchant
    // arriving through Zid's App Market got a connection with no store_uuid and no store_domain
    // -- and the storefront snippet could never resolve them to a site key until they reconnected
    // through the direct flow.
    mockZidTokenAndProfile({
      accessToken: "mkt-access-token",
      refreshToken: "mkt-refresh-token",
      store: {
        id: "3223383",
        uuid: "a2701fa2-7128-423c-857c-9cc7f3781144",
        url: "https://6am6no.zid.store/",
        title: "Marketplace Tracking Store",
      },
    })

    const claimToken = await completeMarketplaceCallback()
    const { login } = await registerAndProvisionOrg(
      "zid-marketplace-tracking@madar.test",
      "Zid Marketplace Tracking Org"
    )

    const claimResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(claimResponse.status).toBe(200)
    const claimed = (await claimResponse.json()) as { connectionId: string }

    const rows = await database.query(
      `SELECT provider_account_id, store_uuid, store_domain FROM zid_oauth_connections WHERE id = $1`,
      [claimed.connectionId]
    )
    expect(rows.rows[0]).toMatchObject({
      provider_account_id: "3223383",
      store_uuid: "a2701fa2-7128-423c-857c-9cc7f3781144",
      // Normalized to a bare hostname, matching what a storefront reads from location.hostname.
      store_domain: "6am6no.zid.store",
    })

    // The identifier Zid's {{store.id}} actually sends now resolves end to end.
    const resolveResponse = await fetch(
      `${baseUrl}/v1/tracking/resolve/zid/store/a2701fa2-7128-423c-857c-9cc7f3781144`
    )
    expect(resolveResponse.status).toBe(200)
    expect(((await resolveResponse.json()) as { siteKey: string }).siteKey).toMatch(/^mtk_/)
  })

  it("returns 404 for an unknown or garbage claim token", async () => {
    const response = await fetch(`${baseUrl}/v1/integrations/zid/install/not-a-real-token`)
    expect(response.status).toBe(404)
  })

  it("still completes the admin-initiated flow unchanged when state IS present", async () => {
    mockZidTokenAndProfile({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
      store: { id: "112233", title: "Admin Flow Store" },
    })

    const { login, actor } = await registerAndProvisionOrg(
      "zid-admin-owner@madar.test",
      "Zid Admin Org"
    )
    const workspaceId = actor.workspaceId as string
    const projectId = "00000000-0000-4000-8000-00000000ad01"
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, $4, 'Admin Project', 'active')`,
      [projectId, actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/zid/oauth/start`, {
      method: "POST",
      headers: {
        ...authHeaders(login.session.accessToken),
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, projectId }),
    })
    const started = (await startResponse.json()) as { state: string }

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/oauth/callback?state=${encodeURIComponent(started.state)}&code=admin-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    const location = callbackResponse.headers.get("location") ?? ""
    expect(location).toContain("zid_oauth=connected")
    // Not the marketplace claim page -- the admin flow's own success redirect.
    expect(location).not.toContain("/integrations/zid/claim/")

    // No unclaimed install row should exist for the admin-initiated path.
    const installRows = await database.query(
      `SELECT count(*)::int AS count FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0].count).toBe(0)
  })

  it("auto-provisions and logs in a brand-new merchant whose email matches no existing user", async () => {
    mockZidTokenAndProfile({
      accessToken: "auto-access-token",
      refreshToken: "auto-refresh-token",
      store: { id: "998877", title: "Auto Provision Store" },
      merchantEmail: "brand-new-merchant@zid.test",
      merchantName: "Brand New Merchant",
    })

    const handoffToken = await completeMarketplaceCallbackExpectingAutoLogin()

    // The account, org, workspace, membership, and connection must already exist and be fully
    // wired together immediately after the callback -- consuming the handoff only mints the
    // session, it doesn't do any more provisioning.
    const userRows = await database.query(
      `SELECT id, email, account_status, email_verified_at FROM users WHERE email = $1`,
      ["brand-new-merchant@zid.test"]
    )
    expect(userRows.rows[0]).toMatchObject({ account_status: "active" })
    expect(userRows.rows[0].email_verified_at).not.toBeNull()
    const userId = String(userRows.rows[0].id)

    const membershipRows = await database.query(
      `SELECT role_code, status FROM memberships WHERE user_id = $1`,
      [userId]
    )
    expect(membershipRows.rows[0]).toMatchObject({ role_code: "owner", status: "active" })

    // Confirmed as a real failure in production (2026-10-04): with no settings passed, a
    // brand-new org starts with zero active applications -- app-sidebar.tsx hides "Integrations"
    // (and every other application-scoped nav item) entirely in that state, so a merchant bounced
    // off the direct zid_oauth=connected redirect has no way back into the Zid setup wizard.
    const orgRows = await database.query(
      `SELECT settings FROM organizations WHERE owner_user_id = $1`,
      [userId]
    )
    expect(orgRows.rows[0].settings).toMatchObject({ ecommerceEnabled: true })

    const installRows = await database.query(
      `SELECT status, auto_provisioned_user_id FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0]).toMatchObject({
      status: "claimed",
      auto_provisioned_user_id: userId,
    })

    const consumeResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/auto-login/${handoffToken}/consume`,
      { method: "POST" }
    )
    expect(consumeResponse.status).toBe(200)
    const consumed = (await consumeResponse.json()) as {
      user: { id: string; email: string }
      session: { accessToken: string }
      redirectUrl: string
    }
    expect(consumed.user.id).toBe(userId)
    expect(consumed.user.email).toBe("brand-new-merchant@zid.test")
    expect(consumed.redirectUrl).toContain("http://localhost:3000/integrations/new")
    expect(consumed.redirectUrl).toContain("zid_oauth=connected")

    // The session actually works for authenticated calls.
    const sessionResponse = await fetch(`${baseUrl}/v1/auth/session`, {
      headers: authHeaders(consumed.session.accessToken),
    })
    expect(sessionResponse.status).toBe(200)

    // Single-use: replaying the same handoff token must fail, not mint a second session.
    const replayResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/auto-login/${handoffToken}/consume`,
      { method: "POST" }
    )
    expect(replayResponse.status).toBe(404)
  })

  it("falls back to the claim-token flow, unchanged, when the email matches an existing user", async () => {
    await registerAndProvisionOrg("already-a-madar-user@madar.test", "Pre-existing Org")

    mockZidTokenAndProfile({
      accessToken: "existing-email-access-token",
      refreshToken: "existing-email-refresh-token",
      store: { id: "554433", title: "Existing Email Store" },
      merchantEmail: "already-a-madar-user@madar.test",
      merchantName: "Already A Madar User",
    })

    // Never auto-login -- Zid's own policy warns against attaching a store to an existing
    // account on an email match alone, so this must be byte-for-byte today's claim-token path.
    const claimToken = await completeMarketplaceCallback()

    const installRows = await database.query(
      `SELECT status, auto_provisioned_user_id, auto_login_token_hash FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0]).toMatchObject({
      status: "unclaimed",
      auto_provisioned_user_id: null,
      auto_login_token_hash: null,
    })

    // No second user was created for this email.
    const userCountRows = await database.query(
      `SELECT count(*)::int AS count FROM users WHERE email = $1`,
      ["already-a-madar-user@madar.test"]
    )
    expect(userCountRows.rows[0].count).toBe(1)

    const summaryResponse = await fetch(`${baseUrl}/v1/integrations/zid/install/${claimToken}`)
    expect(summaryResponse.status).toBe(200)
    expect(((await summaryResponse.json()) as { status: string }).status).toBe("unclaimed")
  })
})
