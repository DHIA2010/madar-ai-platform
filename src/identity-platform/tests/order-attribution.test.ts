// @vitest-environment node

import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

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

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
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
      fullName: "Attribution Test Owner",
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
     values ($1, $2, 'hash', 'Attribution Test Owner', now()) on conflict (id) do nothing`,
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

  return {
    accessToken: login.session.accessToken,
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
  }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

// workspace_id must match the actor's own workspace -- the attribution query scopes
// connections by workspace the same way every other identity-platform query does.
async function seedShopifyConnection(
  organizationId: string,
  workspaceId: string | null,
  userId: string
) {
  const projectId = randomUUID()
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Project', 'active')`,
    [projectId, organizationId, workspaceId, userId]
  )

  const connectionId = randomUUID()
  await database.query(
    `insert into shopify_oauth_connections (
       id, organization_id, workspace_id, project_id, shop_domain, status, created_by_user_id, updated_by_user_id
     ) values ($1, $2, $3, $4, 'test-shop.myshopify.com', 'connected', $5, $5)`,
    [connectionId, organizationId, workspaceId, projectId, userId]
  )
  return connectionId
}

async function seedShopifyOrder(
  connectionId: string,
  entityId: string,
  payload: Record<string, unknown>
) {
  await database.query(
    `insert into shopify_records (id, connection_id, customer_id, entity_type, entity_id, payload, record_date)
     values ($1, $2, 'test-shop.myshopify.com', 'orders', $3, $4, current_date)`,
    [randomUUID(), connectionId, entityId, JSON.stringify(payload)]
  )
}

describe("order attribution", () => {
  it("matches an order via UTM extracted from Shopify's landing_site", async () => {
    const { accessToken, organizationId, workspaceId, userId } = await registerAndProvisionOrg(
      "owner@attribution-utm.madar",
      "Attribution UTM Org"
    )

    const campaignResponse = await fetch(`${baseUrl}/v1/campaigns`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ displayName: "Attribution Campaign" }),
    })
    const campaign = (await campaignResponse.json()) as { id: string }

    const linkResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Attribution Link",
        trackingType: "FULL_URL",
        destinationBaseUrl: "https://shop.example.com/product",
        utmSource: "TikTok",
        utmMedium: "Paid Social",
        utmCampaign: "Attribution Test",
      }),
    })
    const link = (await linkResponse.json()) as { id: string; campaignId: string }

    const connectionId = await seedShopifyConnection(organizationId, workspaceId, userId)
    await seedShopifyOrder(connectionId, "order-1", {
      order_number: 1001,
      total_price: "199.00",
      currency: "SAR",
      created_at: new Date().toISOString(),
      landing_site:
        "/product?utm_source=tiktok&utm_medium=paid-social&utm_campaign=attribution-test",
    })

    const matchResponse = await fetch(`${baseUrl}/v1/campaigns/attribution/match-orders`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ provider: "shopify" }),
    })
    expect(matchResponse.status).toBe(200)
    const matchResult = (await matchResponse.json()) as {
      processed: number
      attributed: number
      unattributed: number
    }
    expect(matchResult.processed).toBe(1)
    expect(matchResult.attributed).toBe(1)
    expect(matchResult.unattributed).toBe(0)

    const stored = await database.query(
      `SELECT match_method, attribution_status, campaign_id, campaign_link_id FROM order_attributions
       WHERE provider = 'shopify' AND external_order_id = 'order-1'`
    )
    expect(stored.rows).toHaveLength(1)
    const row = stored.rows[0] as {
      match_method: string
      attribution_status: string
      campaign_id: string
      campaign_link_id: string
    }
    expect(row.match_method).toBe("utm_match")
    expect(row.attribution_status).toBe("ATTRIBUTED")
    expect(row.campaign_id).toBe(link.campaignId)
    expect(row.campaign_link_id).toBe(link.id)
  })

  it("lands an order with no matching signals as UNATTRIBUTED rather than guessing", async () => {
    const { accessToken, organizationId, workspaceId, userId } = await registerAndProvisionOrg(
      "owner@attribution-none.madar",
      "Attribution None Org"
    )

    const connectionId = await seedShopifyConnection(organizationId, workspaceId, userId)
    await seedShopifyOrder(connectionId, "order-2", {
      order_number: 2002,
      total_price: "50.00",
      currency: "SAR",
      created_at: new Date().toISOString(),
      landing_site: "/product",
    })

    const matchResponse = await fetch(`${baseUrl}/v1/campaigns/attribution/match-orders`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ provider: "shopify" }),
    })
    const matchResult = (await matchResponse.json()) as { attributed: number; unattributed: number }
    expect(matchResult.attributed).toBe(0)
    expect(matchResult.unattributed).toBe(1)

    const stored = await database.query(
      `SELECT match_method, attribution_status FROM order_attributions WHERE external_order_id = 'order-2'`
    )
    const row = stored.rows[0] as { match_method: string; attribution_status: string }
    expect(row.match_method).toBe("unattributed")
    expect(row.attribution_status).toBe("UNATTRIBUTED")
  })

  it("is idempotent -- re-running does not duplicate order_attributions rows", async () => {
    const { accessToken, organizationId, workspaceId, userId } = await registerAndProvisionOrg(
      "owner@attribution-idempotent.madar",
      "Attribution Idempotent Org"
    )
    const connectionId = await seedShopifyConnection(organizationId, workspaceId, userId)
    await seedShopifyOrder(connectionId, "order-3", {
      order_number: 3003,
      total_price: "75.00",
      currency: "SAR",
      created_at: new Date().toISOString(),
    })

    await fetch(`${baseUrl}/v1/campaigns/attribution/match-orders`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ provider: "shopify" }),
    })
    await fetch(`${baseUrl}/v1/campaigns/attribution/match-orders`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ provider: "shopify" }),
    })

    const stored = await database.query(
      `SELECT id FROM order_attributions WHERE external_order_id = 'order-3'`
    )
    expect(stored.rows).toHaveLength(1)
  })
})
