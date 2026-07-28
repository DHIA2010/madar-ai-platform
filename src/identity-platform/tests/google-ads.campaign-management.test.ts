// @vitest-environment node

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { GoogleAdsCampaignManagementService } from "../google-ads/campaign-management-service"
import { GoogleAdsRepository } from "../google-ads/repository"
import type { Campaign } from "../google-ads/models"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"

const CONNECTION = {
  id: "00000000-0000-4000-8000-000000000301",
  organizationId: "00000000-0000-4000-8000-000000000302",
  workspaceId: "00000000-0000-4000-8000-000000000303",
  projectId: "00000000-0000-4000-8000-000000000304",
  dataSourceId: null,
  providerAccountId: "oauth-account",
  providerAccountName: "Google Ads Account",
  providerAccountEmail: null,
  scopes: [],
  tokenExpiresAt: null,
  status: "connected" as const,
  connectionReference: "customer-management-test",
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function makeCampaign(overrides: Partial<Campaign> & Pick<Campaign, "id">): Campaign {
  return {
    id: overrides.id,
    customerId: overrides.customerId ?? "123456",
    name: overrides.name ?? `Campaign ${overrides.id}`,
    status: overrides.status ?? "ENABLED",
    budgetMicros: overrides.budgetMicros ?? 1000,
    biddingStrategyType: overrides.biddingStrategyType ?? "MANUAL_CPC",
    channelType: overrides.channelType ?? "SEARCH",
    startDate: overrides.startDate ?? "2026-06-01",
    endDate: overrides.endDate ?? null,
  }
}

describe("google ads campaign management service", () => {
  let database: PostgresDatabase
  let repository: GoogleAdsRepository

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    repository = new GoogleAdsRepository(database)

    await runIdentityMigrations(database, process.cwd())
    await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ('00000000-0000-4000-8000-000000000300', 'owner@campaign.test', 'hash', 'Owner', now())`
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'Org', '00000000-0000-4000-8000-000000000300', 'active')`,
      [CONNECTION.organizationId]
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Ws', 'active')`,
      [CONNECTION.workspaceId, CONNECTION.organizationId]
    )
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, '00000000-0000-4000-8000-000000000300', 'Project', 'active')`,
      [CONNECTION.projectId, CONNECTION.organizationId, CONNECTION.workspaceId]
    )
    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id, data_source_id,
        connection_reference, configuration, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1, 'google-ads', 'google', 'marketing',
        $2, $3, $4, null, null,
        'customer-management-test', '{}'::jsonb, 'connected',
        '00000000-0000-4000-8000-000000000300', '00000000-0000-4000-8000-000000000300', now(), now()
      )`,
      [CONNECTION.id, CONNECTION.organizationId, CONNECTION.workspaceId, CONNECTION.projectId]
    )
  })

  it("discovers campaigns and persists new canonical rows", async () => {
    const service = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [makeCampaign({ id: "cmp-1" }), makeCampaign({ id: "cmp-2", status: "PAUSED" })],
    })

    const result = await service.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })

    expect(result.summary).toMatchObject({
      discoveredCount: 2,
      insertedCount: 2,
      updatedCount: 0,
      unchangedCount: 0,
      inactiveCount: 0,
    })

    const rows = await repository.listMarketingCampaigns({
      connectionId: CONNECTION.id,
      externalCustomerId: "123456",
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.providerEntityId)).toEqual(["cmp-1", "cmp-2"])
  })

  it("updates existing campaigns and preserves idempotency on repeated syncs", async () => {
    const service = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [makeCampaign({ id: "cmp-1", name: "Campaign One" })],
    })

    const first = await service.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })
    expect(first.summary.insertedCount).toBe(1)

    const secondService = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [makeCampaign({ id: "cmp-1", name: "Campaign One Updated", budgetMicros: 2500 })],
    })
    const second = await secondService.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })
    expect(second.summary).toMatchObject({
      discoveredCount: 1,
      insertedCount: 0,
      updatedCount: 1,
      unchangedCount: 0,
    })

    const third = await secondService.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })
    expect(third.summary).toMatchObject({
      discoveredCount: 1,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 1,
    })

    const rows = await repository.listMarketingCampaigns({
      connectionId: CONNECTION.id,
      externalCustomerId: "123456",
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe("Campaign One Updated")
    expect(rows[0]?.budgetMicros).toBe(2500)
  })

  it("marks missing campaigns inactive instead of deleting them", async () => {
    const seedService = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [makeCampaign({ id: "cmp-1" }), makeCampaign({ id: "cmp-2" })],
    })

    await seedService.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })

    const service = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [makeCampaign({ id: "cmp-1", status: "PAUSED" })],
    })

    const result = await service.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })

    expect(result.summary.inactiveCount).toBe(1)

    const rows = await repository.listMarketingCampaigns({
      connectionId: CONNECTION.id,
      externalCustomerId: "123456",
    })
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.providerEntityId === "cmp-1")?.status).toBe("PAUSED")
    expect(rows.find((row) => row.providerEntityId === "cmp-2")?.status).toBe("INACTIVE")
  })

  it("handles empty API responses without creating rows", async () => {
    const service = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => [],
    })

    const result = await service.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })

    expect(result.summary).toMatchObject({
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      inactiveCount: 0,
    })

    await expect(repository.listMarketingCampaigns({
      connectionId: CONNECTION.id,
      externalCustomerId: "123456",
    })).resolves.toHaveLength(0)
  })

  it("propagates API failures without persisting campaigns", async () => {
    const service = new GoogleAdsCampaignManagementService(repository, {
      listCampaigns: async () => {
        throw new Error("upstream failed")
      },
    })

    await expect(service.synchronizeCampaigns({
      connection: CONNECTION,
      customerId: "123456",
      currencyCode: "USD",
      actorUserId: "00000000-0000-4000-8000-000000000300",
    })).rejects.toThrow("upstream failed")

    await expect(repository.listMarketingCampaigns({
      connectionId: CONNECTION.id,
      externalCustomerId: "123456",
    })).resolves.toHaveLength(0)
  })
})