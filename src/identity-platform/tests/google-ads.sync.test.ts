// @vitest-environment node

import { createCipheriv } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { GoogleAdsSyncService } from "../google-ads/sync-service"

function deferredResponse() {
  let resolve!: (value: Response) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Response>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const ACTOR = {
  userId: "00000000-0000-4000-8000-000000000101",
  sessionId: "session",
  organizationId: "00000000-0000-4000-8000-000000000102",
  workspaceId: "00000000-0000-4000-8000-000000000103",
  roles: ["owner" as const],
}

function encrypt(token: string) {
  const key = "12345678901234567890123456789012"
  const iv = Buffer.from(Array.from({ length: 12 }).map((_, i) => i + 1))
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "utf8"), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

describe("google ads sync service", () => {
  let database: PostgresDatabase

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())

    await runIdentityMigrations(database, process.cwd())
    await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'owner@sync.test', 'hash', 'Owner', now())`,
      [ACTOR.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'Org', $2, 'active')`,
      [ACTOR.organizationId, ACTOR.userId]
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Ws', 'active')`,
      [ACTOR.workspaceId, ACTOR.organizationId]
    )
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000104', $1, $2, $3, 'Project', 'active')`,
      [ACTOR.organizationId, ACTOR.workspaceId, ACTOR.userId]
    )

    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id,
        encrypted_refresh_token, encrypted_access_token, token_expires_at,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000105',
        $1,
        $2,
        '00000000-0000-4000-8000-000000000104',
        $3,
        $4,
        now() + interval '1 hour',
        'connected',
        $5,
        $5,
        now(),
        now()
      )`,
      [ACTOR.organizationId, ACTOR.workspaceId, encrypt("refresh"), encrypt("access"), ACTOR.userId]
    )

    await database.query(
      `insert into google_ads_customer_accounts (
        id, connection_id, customer_id, display_name, status, is_selected, discovered_at, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000106',
        '00000000-0000-4000-8000-000000000105',
        '123',
        'Google Ads 123',
        'active',
        true,
        now(),
        now(),
        now()
      )`
    )
  })

  it("syncs and persists normalized records with idempotency", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: "cmp-1", name: "Campaign 1", status: "ENABLED", biddingStrategyType: "MANUAL_CPC" },
              campaignBudget: { amountMicros: 1000 },
              customerClient: { id: "123", descriptiveName: "Account", currencyCode: "USD", timeZone: "UTC", manager: false, level: 0 },
              adGroup: { id: "ag-1", name: "Ad Group", status: "ENABLED" },
              adGroupAd: { ad: { id: "ad-1", type: "RESPONSIVE_SEARCH_AD", responsiveSearchAd: { headlines: ["Headline"] } }, status: "ENABLED" },
              adGroupCriterion: { criterionId: "kw-1", keyword: { text: "keyword", matchType: "EXACT" }, status: "ENABLED" },
              searchTermView: { searchTerm: "keyword" },
              geographicView: { locationType: "LOCATION_OF_PRESENCE", countryCriterionId: "682" },
              conversionAction: { id: "conv-1", name: "Purchase", category: "PURCHASE", status: "ENABLED", type: "WEBPAGE" },
              segments: { date: "2026-06-01", device: "MOBILE" },
              metrics: {
                costMicros: 100,
                clicks: 5,
                impressions: 100,
                ctr: 0.05,
                averageCpc: 20,
                averageCpm: 1000,
                conversions: 1,
                conversionsValue: 50,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    })

    const service = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 1,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    const run = await service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-1",
    })

    expect(run.status).toBe("completed")

    const second = await service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-1",
    })

    expect(second.id).toBe(run.id)

    const rows = await service.listRecords(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      pageSize: 200,
    })

    expect(rows.length).toBeGreaterThan(0)
  })

  it("maps permission and quota failures", async () => {
    const permissionService = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch
    )

    await expect(permissionService.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-2",
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_PERMISSION_DENIED" })

    const quotaService = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch
    )

    await expect(quotaService.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-3",
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_QUOTA_EXCEEDED" })
  })

  it("handles empty responses and invalid connection", async () => {
    const service = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    )

    const run = await service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-4",
    })

    expect(run.status).toBe("completed")

    await expect(service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000999",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-idem-5",
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_CONNECTION_NOT_FOUND" })
  })

  it("returns typed errors when listing records for deleted or invalid customers", async () => {
    await database.query(
      `insert into google_ads_customer_accounts (
        id, connection_id, customer_id, display_name, status, is_selected, discovered_at, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000107',
        '00000000-0000-4000-8000-000000000105',
        'google-ads-1',
        'Google Ads 1',
        'active',
        true,
        now(),
        now(),
        now()
      )`
    )

    const service = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    )

    await expect(service.listRecords(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "google-ads-1",
      pageSize: 20,
    })).resolves.toEqual([])

    await expect(service.listRecords(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "missing-customer",
      pageSize: 20,
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_INVALID_CUSTOMER", status: 400 })

    await database.query(
      `delete from google_oauth_connections where id = $1`,
      ["00000000-0000-4000-8000-000000000105"]
    )

    await expect(service.listRecords(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "google-ads-1",
      pageSize: 20,
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_CONNECTION_NOT_FOUND", status: 404 })
  })

  it("blocks duplicate concurrent syncs with a database lease", async () => {
    const blocked = deferredResponse()
    let googleQueryStartedResolve!: () => void
    const googleQueryStarted = new Promise<void>((resolve) => {
      googleQueryStartedResolve = resolve
    })
    let blockedOnce = false

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      googleQueryStartedResolve()
      if (!blockedOnce) {
        blockedOnce = true
        return blocked.promise
      }

      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const firstService = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    const secondService = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    const first = firstService.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-lock-1",
    })

    await googleQueryStarted

    await expect(secondService.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-lock-2",
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_SYNC_IN_PROGRESS" })

    blocked.resolve(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } }))
    await expect(first).resolves.toMatchObject({ status: "completed" })
  })

  it("resumes from checkpoint after a mid-sync failure", async () => {
    const queryBodies: string[] = []
    let failOnce = true

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (typeof init?.body === "string") {
        queryBodies.push(init.body)
      }

      const query = typeof init?.body === "string" ? JSON.parse(init.body).query as string : ""
      if (failOnce && query.includes("FROM ad_group")) {
        failOnce = false
        return new Response("temporary", { status: 500 })
      }

      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const service = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    await expect(service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-crash-1",
    })).rejects.toMatchObject({ code: "GOOGLE_ADS_TRANSIENT_FAILURE" })

    const checkpoint = await database.query<{ checkpoint_state: Record<string, unknown> }>(
      `select checkpoint_state from google_ads_sync_checkpoints where provider_key = $1 and connection_id = $2 and customer_id = $3 limit 1`,
      ["google-ads", "00000000-0000-4000-8000-000000000105", "123"]
    )

    expect(checkpoint.rows[0]?.checkpoint_state).toMatchObject({ stage: "campaignMetrics" })

    await expect(service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-crash-1",
    })).resolves.toMatchObject({ status: "completed" })
  })

  it("respects incremental resume from the stored checkpoint date", async () => {
    const queries: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (typeof init?.body === "string") {
        const parsed = JSON.parse(init.body) as { query?: string }
        if (parsed.query) {
          queries.push(parsed.query)
        }
      }

      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const service = new GoogleAdsSyncService(
      database,
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: "12345678901234567890123456789012",
        developerToken: "developer-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    await service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      idempotencyKey: "sync-inc-1",
    })

    queries.length = 0

    await service.sync(ACTOR, {
      connectionId: "00000000-0000-4000-8000-000000000105",
      customerId: "123",
      startDate: "2026-05-01",
      endDate: "2026-05-02",
      idempotencyKey: "sync-inc-2",
      mode: "incremental",
    })

    expect(queries.some((query) => query.includes("2026-06-03"))).toBe(true)
  })
})
