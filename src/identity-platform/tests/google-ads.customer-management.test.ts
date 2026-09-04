// @vitest-environment node

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { GoogleAdsClient } from "../google-ads/client"
import { GoogleAdsCustomerManagementService } from "../google-ads/customer-management-service"
import { GoogleOAuthRepository } from "../google-oauth/repository"

const ORG_ID = "00000000-0000-4000-8000-000000000302"
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000303"
const PROJECT_ID = "00000000-0000-4000-8000-000000000304"
const USER_ID = "00000000-0000-4000-8000-000000000301"
const CONNECTION_ID = "00000000-0000-4000-8000-000000000305"
const OAUTH_ACCOUNT_ID = "00000000-0000-4000-8000-000000000307"

// Fake Google Ads API over fetch -- same technique already used by google-ads.client.test.ts --
// rather than a structural fake of GoogleAdsClient (its private fields make it non-assignable).
function fakeFetch(customerId: string, currencyCode: string | null) {
  return (async (url: string | URL) => {
    const requestUrl = url.toString()

    if (requestUrl.includes("listAccessibleCustomers")) {
      return new Response(JSON.stringify({ resourceNames: [`customers/${customerId}`] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (requestUrl.includes("googleAds:search")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              customerClient: {
                id: customerId,
                descriptiveName: "Test Account",
                currencyCode,
                timeZone: "Asia/Riyadh",
                manager: false,
                level: 0,
                clientCustomer: null,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  }) as unknown as typeof fetch
}

describe("GoogleAdsCustomerManagementService: real currency capture", () => {
  let database: PostgresDatabase

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())

    await runIdentityMigrations(database, process.cwd())
    await runSqlFile(
      database,
      `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
    )

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'owner@customer-mgmt.test', 'hash', 'Owner', now())`,
      [USER_ID]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'Org', $2, 'active')`,
      [ORG_ID, USER_ID]
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Ws', 'active')`,
      [WORKSPACE_ID, ORG_ID]
    )
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, $4, 'Project', 'active')`,
      [PROJECT_ID, ORG_ID, WORKSPACE_ID, USER_ID]
    )
    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1, 'google', $2, $3, 'active', $4, $4, now(), now())`,
      [OAUTH_ACCOUNT_ID, ORG_ID, WORKSPACE_ID, USER_ID]
    )
    // google_ads_customer_accounts (and most google_ads_* tables) reference integration_connections,
    // not google_oauth_connections directly, since migration 010 unified them onto a shared id.
    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1, 'google-ads', 'google', 'marketing', $2, $3, $4, $5, 'connected', $6, $6, now(), now())`,
      [CONNECTION_ID, ORG_ID, WORKSPACE_ID, PROJECT_ID, OAUTH_ACCOUNT_ID, USER_ID]
    )
    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
      [CONNECTION_ID, ORG_ID, WORKSPACE_ID, PROJECT_ID, USER_ID]
    )
  })

  it("persists the real currency returned by Google's API instead of hardcoding null", async () => {
    const repository = new GoogleOAuthRepository(database)
    const client = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fakeFetch("999888777", "SAR")
    )
    const service = new GoogleAdsCustomerManagementService(repository, client)

    await service.listAccessibleAccounts(CONNECTION_ID, USER_ID)

    const rows = await database.query<{ customer_id: string; currency_code: string | null }>(
      `select customer_id, currency_code from google_ads_customer_accounts where connection_id = $1`,
      [CONNECTION_ID]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.currency_code).toBe("SAR")
  })

  it("does not stomp a previously-captured real currency back to null on a second discovery run", async () => {
    const repository = new GoogleOAuthRepository(database)

    // First run: real currency captured.
    const firstClient = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fakeFetch("999888777", "SAR")
    )
    await new GoogleAdsCustomerManagementService(repository, firstClient).listAccessibleAccounts(
      CONNECTION_ID,
      USER_ID
    )

    // Second run (e.g. user reopens the account picker) -- must still resolve the same real
    // currency, not silently revert to null via replaceAccessibleCustomerAccounts' unconditional
    // overwrite (the bug this fix closes).
    const secondClient = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fakeFetch("999888777", "SAR")
    )
    await new GoogleAdsCustomerManagementService(repository, secondClient).listAccessibleAccounts(
      CONNECTION_ID,
      USER_ID
    )

    const rows = await database.query<{ currency_code: string | null }>(
      `select currency_code from google_ads_customer_accounts where connection_id = $1`,
      [CONNECTION_ID]
    )
    expect(rows.rows[0]?.currency_code).toBe("SAR")
  })
})
