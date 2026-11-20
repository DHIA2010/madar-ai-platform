// @vitest-environment node

// Switching and deleting campaigns, ad groups and ads on TikTok and Google Ads from the campaigns
// list (campaigns/control-service.ts, control-platforms.ts): the exact call each platform gets,
// that Madar's own copy follows, and that nothing is asked of a platform for a row that is not
// the organization's.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  GoogleCampaignControl,
  TikTokCampaignControl,
  type GoogleAdsMutator,
} from "../campaigns/control-platforms"
import { CampaignControlService } from "../campaigns/control-service"
import { GoogleAdsMutateError } from "../google-ads/client"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

const ORG = "20000000-0000-0000-0000-000000000001"
const OTHER_ORG = "20000000-0000-0000-0000-000000000002"
const USER = "10000000-0000-0000-0000-000000000001"
const TIKTOK = "40000000-0000-0000-0000-000000000002"
const GOOGLE = "40000000-0000-0000-0000-000000000003"
const ADVERTISER = "7700000000000000001"
const CUSTOMER = "2739111244"

const actor: AuthenticatedActor = {
  userId: USER,
  sessionId: "s",
  organizationId: ORG,
  workspaceId: null,
  roles: [],
  modulePermissions: [],
}

// TikTok's API stood in for: records each call and answers with TikTok's own envelope.
function fakeTikTok(answer: { code: number; message?: string } = { code: 0, message: "OK" }) {
  const calls: Array<{ path: string; body: Record<string, unknown>; token: string | null }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      path: new URL(String(input)).pathname.replace("/open_api/v1.3", ""),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      token: new Headers(init?.headers).get("access-token"),
    })
    return new Response(JSON.stringify(answer), { status: 200 })
  }) as typeof fetch
  return {
    calls,
    api: new TikTokCampaignControl({
      apiBaseUrl: "https://tiktok.test/open_api/v1.3",
      fetch: fetchImpl,
    }),
  }
}

function fakeGoogle(refuse?: GoogleAdsMutateError) {
  const calls: Array<Parameters<GoogleAdsMutator["mutate"]>[0]> = []
  const client: GoogleAdsMutator = {
    mutate: async (input) => {
      calls.push(input)
      if (refuse) throw refuse
      return {}
    },
  }
  return { calls, api: new GoogleCampaignControl(client) }
}

describe("the campaigns list controls on TikTok and Google Ads", () => {
  let database: PostgresDatabase

  beforeEach(async () => {
    process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
    await runIdentityMigrations(database, process.cwd())
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'o@x.com', 'h', 'Owner', now())`,
      [USER]
    )
    for (const [id, name] of [
      [ORG, "Org"],
      [OTHER_ORG, "Other"],
    ]) {
      await database.query(
        `insert into organizations (id, name, owner_user_id) values ($1, $2, $3)`,
        [id, name, USER]
      )
    }
    await database.query(
      `insert into tiktok_ads_oauth_connections
         (id, organization_id, project_id, status, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, 'connected', $4, $4)`,
      [TIKTOK, ORG, randomUUID(), USER]
    )
    const project = randomUUID()
    const oauthAccount = randomUUID()
    await database.query(
      `insert into google_oauth_connections
         (id, organization_id, project_id, status, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, 'connected', $4, $4)`,
      [GOOGLE, ORG, project, USER]
    )
    await database.query(
      `insert into oauth_accounts
         (id, provider_family, organization_id, status, created_by_user_id, updated_by_user_id)
       values ($1, 'google', $2, 'active', $3, $3)`,
      [oauthAccount, ORG, USER]
    )
    await database.query(
      `insert into integration_connections
         (id, provider_id, provider_family, platform, organization_id, project_id,
          oauth_account_id, status, created_by_user_id, updated_by_user_id)
       values ($1, 'google-ads', 'google', 'marketing', $2, $3, $4, 'connected', $5, $5)`,
      [GOOGLE, ORG, project, oauthAccount, USER]
    )
  })

  afterEach(async () => {
    await database.end()
  })

  // ---- TikTok ----

  const tiktokRow = (id: string) => `tiktok_ads:${TIKTOK}:${ADVERTISER}:${id}`
  const tiktokRecord = (type: string, id: string, payload: object) =>
    database.query(
      `insert into tiktok_ads_records
         (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
       values ($1, $2, $3, $4, $5, '2026-01-10', $6::jsonb)`,
      [randomUUID(), TIKTOK, ADVERTISER, type, id, JSON.stringify(payload)]
    )
  const tiktokStored = async (type: string) =>
    (
      await database.query<{ entity_id: string; payload: unknown }>(
        `select entity_id, payload from tiktok_ads_records where entity_type = $1`,
        [type]
      )
    ).rows
      .map((row) => {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
        return [row.entity_id, payload.operation_status, payload.secondary_status]
      })
      .sort()
  const seedTikTok = async () => {
    await tiktokRecord("campaigns", "c1", {
      operation_status: "DISABLE",
      secondary_status: "CAMPAIGN_STATUS_DISABLE",
    })
    await tiktokRecord("campaigns", "c2", { operation_status: "ENABLE" })
    await tiktokRecord("adgroups", "g1", { operation_status: "ENABLE", campaign_id: "c1" })
    await tiktokRecord("adgroups", "g2", { operation_status: "ENABLE", campaign_id: "c2" })
    await tiktokRecord("ads", "a1", { operation_status: "ENABLE", adgroup_id: "g1" })
    await tiktokRecord("ads", "a2", { operation_status: "ENABLE", adgroup_id: "g2" })
  }
  const tiktokService = (fake = fakeTikTok()) => ({
    fake,
    service: new CampaignControlService(database, {
      tiktok: { access: { resolveAccessToken: async () => "tt-token" }, api: fake.api },
    }),
  })

  it("switches each TikTok level with its own call and corrects Madar's copy", async () => {
    await seedTikTok()
    const { service, fake } = tiktokService()
    expect(await service.setActive(actor, tiktokRow("c1"), "campaign", true)).toEqual({
      id: tiktokRow("c1"),
      status: "ENABLE",
    })
    await service.setActive(actor, tiktokRow("g1"), "adGroup", false)
    await service.setActive(actor, tiktokRow("a1"), "ad", false)
    expect(fake.calls).toEqual([
      {
        path: "/campaign/status/update/",
        token: "tt-token",
        body: { advertiser_id: ADVERTISER, campaign_ids: ["c1"], operation_status: "ENABLE" },
      },
      {
        path: "/adgroup/status/update/",
        token: "tt-token",
        body: { advertiser_id: ADVERTISER, adgroup_ids: ["g1"], operation_status: "DISABLE" },
      },
      {
        path: "/ad/status/update/",
        token: "tt-token",
        body: { advertiser_id: ADVERTISER, ad_ids: ["a1"], operation_status: "DISABLE" },
      },
    ])
    // The stale finer state is cleared with the switch.
    expect(await tiktokStored("campaigns")).toContainEqual(["c1", "ENABLE", ""])
    expect(await tiktokStored("adgroups")).toContainEqual(["g1", "DISABLE", ""])
    expect(await tiktokStored("ads")).toContainEqual(["a1", "DISABLE", ""])
  })

  it("deletes a TikTok campaign with what is under it, and keeps all of it when refused", async () => {
    await seedTikTok()
    const refused = tiktokService(
      fakeTikTok({ code: 40002, message: "Campaign cannot be changed" })
    )
    await expect(refused.service.remove(actor, tiktokRow("c1"), "campaign")).rejects.toMatchObject({
      code: "PLATFORM_REFUSED",
      message: "Campaign cannot be changed",
    })
    expect(await tiktokStored("campaigns")).toHaveLength(2)

    const { service, fake } = tiktokService()
    await service.remove(actor, tiktokRow("c1"), "campaign")
    expect(fake.calls[0].body).toMatchObject({ campaign_ids: ["c1"], operation_status: "DELETE" })
    expect((await tiktokStored("campaigns")).map((row) => row[0])).toEqual(["c2"])
    expect((await tiktokStored("adgroups")).map((row) => row[0])).toEqual(["g2"])
    expect((await tiktokStored("ads")).map((row) => row[0])).toEqual(["a2"])
  })

  it("asks TikTok for nothing when the row is not the organization's", async () => {
    await seedTikTok()
    const { service, fake } = tiktokService()
    await expect(
      service.setActive({ ...actor, organizationId: OTHER_ORG }, tiktokRow("c1"), "campaign", true)
    ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
    // Another advertiser's id under the same connection is not theirs either.
    await expect(
      service.remove(actor, `tiktok_ads:${TIKTOK}:999:c1`, "campaign")
    ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
    expect(fake.calls).toEqual([])
  })

  // ---- Google Ads ----

  const googleRow = (id: string) => `google_ads:${GOOGLE}:${CUSTOMER}:${id}`
  const seedGoogle = async () => {
    const campaign = (id: string, status: string) =>
      database.query(
        `insert into google_ads_campaigns
           (id, connection_id, customer_id, campaign_id, name, status, channel_type, payload)
         values ($1, $2, $3, $4, 'c', $5, 'SEARCH', '{}'::jsonb)`,
        [randomUUID(), GOOGLE, CUSTOMER, id, status]
      )
    const adGroup = (id: string, campaignId: string) =>
      database.query(
        `insert into google_ads_ad_groups
           (id, connection_id, customer_id, ad_group_id, campaign_id, name, status, payload)
         values ($1, $2, $3, $4, $5, 'g', 'ENABLED', '{}'::jsonb)`,
        [randomUUID(), GOOGLE, CUSTOMER, id, campaignId]
      )
    const ad = (id: string, campaignId: string, adGroupId: string) =>
      database.query(
        `insert into google_ads_ads
           (id, connection_id, customer_id, ad_id, campaign_id, ad_group_id, ad_type, status, payload)
         values ($1, $2, $3, $4, $5, $6, 'RESPONSIVE_SEARCH_AD', 'ENABLED', '{}'::jsonb)`,
        [randomUUID(), GOOGLE, CUSTOMER, id, campaignId, adGroupId]
      )
    await campaign("11", "PAUSED")
    await campaign("12", "ENABLED")
    await adGroup("21", "11")
    await adGroup("22", "12")
    await ad("31", "11", "21")
    await ad("32", "12", "22")
  }
  const googleStored = async (table: string, column: string) =>
    (
      await database.query<{ id: string; status: string }>(
        `select ${column} as id, status from ${table}`
      )
    ).rows
      .map((row) => [row.id, row.status])
      .sort()
  const googleService = (fake = fakeGoogle()) => ({
    fake,
    service: new CampaignControlService(database, { google: { api: fake.api } }),
  })

  it("changes only the status on Google Ads, addressing an ad through its ad group", async () => {
    await seedGoogle()
    const { service, fake } = googleService()
    expect(await service.setActive(actor, googleRow("11"), "campaign", true)).toEqual({
      id: googleRow("11"),
      status: "ENABLED",
    })
    await service.setActive(actor, googleRow("21"), "adGroup", false)
    await service.setActive(actor, googleRow("31"), "ad", false)
    expect(fake.calls.map((call) => [call.service, call.operations[0]])).toEqual([
      [
        "campaigns",
        {
          update: { resourceName: `customers/${CUSTOMER}/campaigns/11`, status: "ENABLED" },
          updateMask: "status",
        },
      ],
      [
        "adGroups",
        {
          update: { resourceName: `customers/${CUSTOMER}/adGroups/21`, status: "PAUSED" },
          updateMask: "status",
        },
      ],
      [
        "adGroupAds",
        {
          update: { resourceName: `customers/${CUSTOMER}/adGroupAds/21~31`, status: "PAUSED" },
          updateMask: "status",
        },
      ],
    ])
    expect(fake.calls.every((call) => call.connectionId === GOOGLE)).toBe(true)
    expect(await googleStored("google_ads_campaigns", "campaign_id")).toContainEqual([
      "11",
      "ENABLED",
    ])
    expect(await googleStored("google_ads_ad_groups", "ad_group_id")).toContainEqual([
      "21",
      "PAUSED",
    ])
    expect(await googleStored("google_ads_ads", "ad_id")).toContainEqual(["31", "PAUSED"])
  })

  it("removes a Google campaign with what is under it, and keeps all of it when refused", async () => {
    await seedGoogle()
    const refused = googleService(fakeGoogle(new GoogleAdsMutateError(400, "Cannot remove.")))
    await expect(refused.service.remove(actor, googleRow("11"), "campaign")).rejects.toMatchObject({
      code: "PLATFORM_REFUSED",
      message: "Cannot remove.",
    })
    expect(await googleStored("google_ads_campaigns", "campaign_id")).toHaveLength(2)

    const { service, fake } = googleService()
    await service.remove(actor, googleRow("11"), "campaign")
    expect(fake.calls[0]).toMatchObject({
      service: "campaigns",
      operations: [{ remove: `customers/${CUSTOMER}/campaigns/11` }],
    })
    expect(await googleStored("google_ads_campaigns", "campaign_id")).toEqual([["12", "ENABLED"]])
    expect(await googleStored("google_ads_ad_groups", "ad_group_id")).toEqual([["22", "ENABLED"]])
    expect(await googleStored("google_ads_ads", "ad_id")).toEqual([["32", "ENABLED"]])

    // One ad of the campaign that is left.
    await service.remove(actor, googleRow("32"), "ad")
    expect(fake.calls.at(-1)?.operations).toEqual([
      { remove: `customers/${CUSTOMER}/adGroupAds/22~32` },
    ])
    expect(await googleStored("google_ads_ads", "ad_id")).toEqual([])
    expect(await googleStored("google_ads_ad_groups", "ad_group_id")).toHaveLength(1)
  })

  it("asks Google for nothing when the row is not the organization's, and reports a denial", async () => {
    await seedGoogle()
    const { service, fake } = googleService()
    await expect(
      service.setActive({ ...actor, organizationId: OTHER_ORG }, googleRow("11"), "campaign", true)
    ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
    await expect(service.remove(actor, googleRow("404"), "campaign")).rejects.toMatchObject({
      code: "CAMPAIGN_CONTROL_NOT_FOUND",
    })
    expect(fake.calls).toEqual([])

    const denied = googleService(fakeGoogle(new GoogleAdsMutateError(403, "No permission.")))
    await expect(
      denied.service.setActive(actor, googleRow("11"), "campaign", true)
    ).rejects.toMatchObject({ code: "PLATFORM_ACCESS_DENIED" })
    expect(await googleStored("google_ads_campaigns", "campaign_id")).toContainEqual([
      "11",
      "PAUSED",
    ])
  })
})
