// @vitest-environment node

// Viewing, editing and copying a campaign, an ad group or an ad from the campaigns list
// (campaigns/control-service.ts with publishing/snapchat-publisher.ts): what Snapchat is asked
// for and sent, what a copy is made of, and what Madar's own list holds afterwards.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CampaignControlService } from "../campaigns/control-service"
import { SnapchatCampaignPublisher } from "../campaigns/publishing/snapchat-publisher"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

const ORG = "20000000-0000-0000-0000-000000000001"
const OTHER_ORG = "20000000-0000-0000-0000-000000000002"
const USER = "10000000-0000-0000-0000-000000000001"
const CONNECTION = "40000000-0000-0000-0000-000000000001"
const TIKTOK_CONNECTION = "40000000-0000-0000-0000-000000000002"
const ACCOUNT = "acc-1"

const actor: AuthenticatedActor = {
  userId: USER,
  sessionId: "s",
  organizationId: ORG,
  workspaceId: null,
  roles: [],
  modulePermissions: [],
}

type Json = Record<string, unknown>

const KINDS = {
  campaigns: { item: "campaign", parent: "adaccounts", parentKey: "ad_account_id" },
  adsquads: { item: "adsquad", parent: "campaigns", parentKey: "campaign_id" },
  ads: { item: "ad", parent: "adsquads", parentKey: "ad_squad_id" },
  creatives: { item: "creative", parent: "adaccounts", parentKey: "ad_account_id" },
} as const
type Kind = keyof typeof KINDS

// A small Snapchat ad account held in memory: one campaign with one ad group and two ads, each
// ad with a creative. It answers the way Snapchat does, and can be told to refuse one write.
function snapchatAccount(options: { refuseCreativeNumber?: number } = {}) {
  const store: Record<Kind, Map<string, Json>> = {
    campaigns: new Map(),
    adsquads: new Map(),
    ads: new Map(),
    creatives: new Map(),
  }
  const put = (kind: Kind, item: Json) => store[kind].set(String(item.id), item)
  put("campaigns", {
    id: "camp-1",
    name: "حملة الكاشير",
    status: "ACTIVE",
    ad_account_id: ACCOUNT,
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-02-01T00:00:00.000Z",
    objective_v2_properties: { objective_v2_type: "LEADS" },
    updated_at: "x",
    delivery_status: ["VALID"],
  })
  put("adsquads", {
    id: "squad-1",
    name: "الجميع 25+",
    status: "ACTIVE",
    campaign_id: "camp-1",
    daily_budget_micro: 250_000_000,
    optimization_goal: "PIXEL_SIGNUP",
    start_time: "2026-01-01T00:00:00.000Z",
    targeting: {
      regulated_content: false,
      geos: [{ country_code: "sa", operation: "INCLUDE" }],
      demographics: [{ min_age: "25", operation: "INCLUDE" }],
      interests: [{ category_id: ["SLC_1"], operation: "INCLUDE" }],
    },
    targeting_reach_status: "VALID",
    delivery_status: ["VALID"],
  })
  for (const number of [1, 2]) {
    put("creatives", {
      id: `creative-${number}`,
      ad_account_id: ACCOUNT,
      name: `إعلان ${number}`,
      type: "WEB_VIEW",
      headline: "كاشير سريع",
      brand_name: "مدار",
      call_to_action: "SIGN_UP",
      top_snap_media_id: `media-${number}`,
      web_view_properties: { url: "https://www.madar.my/?utm_source=snapchat" },
      profile_properties: { profile_id: "profile-1" },
      review_status: "APPROVED",
      packaging_status: "SUCCESS",
      updated_at: "x",
    })
    put("ads", {
      id: `ad-${number}`,
      name: `إعلان ${number}`,
      status: number === 1 ? "ACTIVE" : "PAUSED",
      ad_squad_id: "squad-1",
      creative_id: `creative-${number}`,
      type: "REMOTE_WEBPAGE",
      review_status: "APPROVED",
    })
  }

  const calls: Array<{ method: string; path: string; body: Json | null }> = []
  let made = 0
  let creativesMade = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/v1/, "")
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Json) : null
    calls.push({ method, path, body })
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    const listed = (kind: Kind, items: Json[]) => ({
      request_status: "SUCCESS",
      [kind]: items.map((item) => ({ sub_request_status: "SUCCESS", [KINDS[kind].item]: item })),
    })
    const [, first, id, second] = path.split("/")

    // One thing by its id: /campaigns/camp-1
    if (first in store && id && !second) {
      const kind = first as Kind
      const found = store[kind].get(id)
      if (method === "GET") {
        return found ? reply(listed(kind, [found])) : reply({ request_status: "ERROR" }, 404)
      }
      if (method === "DELETE") {
        store[kind].delete(id)
        return reply({ request_status: "SUCCESS" })
      }
    }
    // What is under a parent: /campaigns/camp-1/adsquads
    if (second && second in store) {
      const kind = second as Kind
      const shape = KINDS[kind]
      if (method === "GET") {
        return reply(
          listed(
            kind,
            [...store[kind].values()].filter((item) => item[shape.parentKey] === id)
          )
        )
      }
      const sent = ((body?.[kind] as Json[] | undefined) ?? [])[0] ?? {}
      if (method === "POST") {
        if (kind === "creatives") {
          creativesMade += 1
          if (creativesMade === options.refuseCreativeNumber) {
            return reply({
              request_status: "ERROR",
              creatives: [
                { sub_request_status: "ERROR", sub_request_error_reason: "Headline is too long" },
              ],
            })
          }
        }
        made += 1
        const item = { ...sent, id: `new-${shape.item}-${made}`, created_at: "now" }
        put(kind, item)
        return reply(listed(kind, [item]))
      }
      if (method === "PUT") {
        const next = { ...sent, updated_at: "later" }
        put(kind, next)
        return reply(listed(kind, [next]))
      }
    }
    return reply({ request_status: "ERROR", debug_message: `unexpected ${method} ${path}` }, 404)
  }) as typeof fetch

  return {
    store,
    calls,
    writes: () => calls.filter((call) => call.method !== "GET"),
    publisher: new SnapchatCampaignPublisher({
      apiBaseUrl: "https://snap.test/v1",
      fetch: fetchImpl,
    }),
  }
}

describe("viewing, editing and copying from the campaigns list", () => {
  let database: PostgresDatabase

  const rowId = (id: string) => `snapchat_ads:${CONNECTION}:${ACCOUNT}:${id}`
  const record = (table: string, connection: string, type: string, id: string, payload: object) =>
    database.query(
      `insert into ${table}
         (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
       values ($1, $2, $3, $4, $5, '2026-01-10', $6::jsonb)`,
      [randomUUID(), connection, ACCOUNT, type, id, JSON.stringify(payload)]
    )
  const copies = async (type: string) =>
    (
      await database.query<{ entity_id: string; payload: unknown }>(
        `select entity_id, payload from snapchat_records where entity_type = $1`,
        [type]
      )
    ).rows.map((row): Json & { id: string } => ({
      ...((typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Json),
      id: row.entity_id,
    }))
  const control = (account = snapchatAccount()) => ({
    account,
    service: new CampaignControlService(database, {
      snapchat: { access: { resolveAccessToken: async () => "token" }, api: account.publisher },
    }),
  })

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
    for (const [table, id] of [
      ["snapchat_oauth_connections", CONNECTION],
      ["tiktok_ads_oauth_connections", TIKTOK_CONNECTION],
    ]) {
      await database.query(
        `insert into ${table}
           (id, organization_id, project_id, status, created_by_user_id, updated_by_user_id)
         values ($1, $2, $3, 'connected', $4, $4)`,
        [id, ORG, randomUUID(), USER]
      )
    }
    // Madar's copies from the last sync, a little behind what Snapchat holds.
    await record("snapchat_records", CONNECTION, "campaigns", "camp-1", { name: "حملة الكاشير" })
    await record("snapchat_records", CONNECTION, "ad_squads", "squad-1", {
      name: "الجميع 25+",
      campaign_id: "camp-1",
      daily_budget_micro: 100_000_000,
    })
    await record("snapchat_records", CONNECTION, "ads", "ad-1", {
      name: "إعلان 1",
      ad_squad_id: "squad-1",
    })
  })

  afterEach(async () => {
    await database.end()
  })

  it("shows the settings as Snapchat holds them now, an ad with its text and link", async () => {
    const { service } = control()
    expect(await service.settings(actor, rowId("squad-1"), "adGroup")).toMatchObject({
      live: true,
      canEdit: true,
      canClone: true,
      platform: "snapchat",
      name: "الجميع 25+",
      dailyBudget: 250,
      goal: "PIXEL_SIGNUP",
      countries: ["SA"],
      minAge: 25,
      maxAge: null,
      gender: "all",
    })
    expect(await service.settings(actor, rowId("ad-1"), "ad")).toMatchObject({
      name: "إعلان 1",
      headline: "كاشير سريع",
      brandName: "مدار",
      callToAction: "SIGN_UP",
      url: "https://www.madar.my/?utm_source=snapchat",
    })
    expect(await service.settings(actor, rowId("camp-1"), "campaign")).toMatchObject({
      objective: "LEADS",
      endAt: "2026-02-01T00:00:00.000Z",
    })
  })

  it("shows another platform from the last sync, and will not edit or copy it", async () => {
    await record("tiktok_ads_records", TIKTOK_CONNECTION, "adgroups", "g-1", {
      adgroup_name: "مجموعة تيك توك",
      operation_status: "ENABLE",
      budget: 75,
      age_groups: ["AGE_25_34", "AGE_35_44"],
      gender: "GENDER_MALE",
    })
    const { service, account } = control()
    const id = `tiktok_ads:${TIKTOK_CONNECTION}:${ACCOUNT}:g-1`
    expect(await service.settings(actor, id, "adGroup")).toMatchObject({
      live: false,
      canEdit: false,
      canClone: false,
      name: "مجموعة تيك توك",
      dailyBudget: 75,
      minAge: 25,
      maxAge: 44,
      gender: "male",
    })
    await expect(service.edit(actor, id, "adGroup", { name: "آخر" })).rejects.toMatchObject({
      code: "CAMPAIGN_CONTROL_NOT_SUPPORTED",
    })
    await expect(service.clone(actor, id, "adGroup", { name: "نسخة" })).rejects.toMatchObject({
      code: "CAMPAIGN_CONTROL_NOT_SUPPORTED",
    })
    expect(account.calls).toEqual([])
  })

  it("edits an ad group: only what was asked changes, the rest goes back as it was", async () => {
    const { service, account } = control()
    const saved = await service.edit(actor, rowId("squad-1"), "adGroup", {
      name: "رجال 30-45",
      dailyBudget: 120,
      minAge: 30,
      maxAge: 45,
      gender: "male",
      endDate: "2026-03-10",
    })
    expect(saved).toMatchObject({ name: "رجال 30-45", dailyBudget: 120, minAge: 30, maxAge: 45 })
    const [write] = account.writes()
    expect(write).toMatchObject({ method: "PUT", path: "/campaigns/camp-1/adsquads" })
    const sent = (write.body?.adsquads as Json[])[0]
    expect(sent).toMatchObject({
      id: "squad-1",
      name: "رجال 30-45",
      daily_budget_micro: 120_000_000,
      // The last minute of that day in Riyadh.
      end_time: "2026-03-10T20:59:00.000Z",
      optimization_goal: "PIXEL_SIGNUP",
      targeting: {
        geos: [{ country_code: "sa", operation: "INCLUDE" }],
        demographics: [{ min_age: "30", max_age: "45", gender: "MALE", operation: "INCLUDE" }],
        interests: [{ category_id: ["SLC_1"], operation: "INCLUDE" }],
      },
    })
    // What only Snapchat writes is not sent back.
    expect(sent).not.toHaveProperty("delivery_status")
    expect(sent).not.toHaveProperty("targeting_reach_status")
    // Madar's own copy follows at once.
    expect((await copies("ad_squads"))[0]).toMatchObject({
      name: "رجال 30-45",
      daily_budget_micro: 120_000_000,
    })
  })

  it("leaves the audience untouched when only the name changes", async () => {
    const { service, account } = control()
    const before = structuredClone(account.store.adsquads.get("squad-1")?.targeting)
    await service.edit(actor, rowId("squad-1"), "adGroup", { name: "اسم جديد" })
    const sent = (account.writes()[0].body?.adsquads as Json[])[0]
    expect(sent.targeting).toEqual(before)
    expect(sent.daily_budget_micro).toBe(250_000_000)
  })

  it("edits an ad's text on its creative, and does not touch the ad when its name stays", async () => {
    const { service, account } = control()
    const saved = await service.edit(actor, rowId("ad-1"), "ad", {
      headline: "جرّب مدار مجانًا",
      callToAction: "MORE",
    })
    expect(saved).toMatchObject({ headline: "جرّب مدار مجانًا", callToAction: "MORE" })
    const writes = account.writes()
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: "PUT", path: `/adaccounts/${ACCOUNT}/creatives` })
    const sent = (writes[0].body?.creatives as Json[])[0]
    expect(sent).toMatchObject({
      id: "creative-1",
      headline: "جرّب مدار مجانًا",
      call_to_action: "MORE",
      brand_name: "مدار",
      top_snap_media_id: "media-1",
    })
    expect(sent).not.toHaveProperty("review_status")
    expect(sent).not.toHaveProperty("packaging_status")
  })

  it("copies an ad with a creative of its own, switched off, and lists it at once", async () => {
    const { service, account } = control()
    const made = await service.clone(actor, rowId("ad-1"), "ad", {
      name: "إعلان 1 - نسخة",
      headline: "عنوان آخر",
      url: "https://www.madar.my/pricing",
    })
    const [creative, ad] = account.writes()
    expect(creative).toMatchObject({ method: "POST", path: `/adaccounts/${ACCOUNT}/creatives` })
    const sentCreative = (creative.body?.creatives as Json[])[0]
    expect(sentCreative).toMatchObject({
      name: "إعلان 1 - نسخة",
      headline: "عنوان آخر",
      brand_name: "مدار",
      top_snap_media_id: "media-1",
      web_view_properties: { url: "https://www.madar.my/pricing" },
      profile_properties: { profile_id: "profile-1" },
    })
    expect(sentCreative).not.toHaveProperty("id")
    expect(ad).toMatchObject({ method: "POST", path: "/adsquads/squad-1/ads" })
    const sentAd = (ad.body?.ads as Json[])[0]
    expect(sentAd).toMatchObject({
      name: "إعلان 1 - نسخة",
      ad_squad_id: "squad-1",
      status: "PAUSED",
      type: "REMOTE_WEBPAGE",
    })
    expect(sentAd.creative_id).not.toBe("creative-1")
    expect(sentAd).not.toHaveProperty("review_status")
    // The original keeps its own text.
    expect(account.store.creatives.get("creative-1")?.headline).toBe("كاشير سريع")
    const listed = (await copies("ads")).find((row) => rowId(row.id) === made.id)
    expect(listed).toMatchObject({ name: "إعلان 1 - نسخة", status: "PAUSED" })
    await expect(
      service.clone(actor, rowId("ad-1"), "ad", { name: "نسخة", url: "http://not-secure.test" })
    ).rejects.toMatchObject({ code: "PUBLISH_INVALID_URL" })
  })

  it("copies an ad group with its ads into the same campaign, switched off", async () => {
    const { service, account } = control()
    const made = await service.clone(actor, rowId("squad-1"), "adGroup", {
      name: "نساء 25+",
      gender: "female",
      dailyBudget: 60,
    })
    const squad = (account.writes()[0].body?.adsquads as Json[])[0]
    expect(squad).toMatchObject({
      name: "نساء 25+",
      status: "PAUSED",
      campaign_id: "camp-1",
      daily_budget_micro: 60_000_000,
      targeting: { demographics: [{ min_age: "25", gender: "FEMALE", operation: "INCLUDE" }] },
    })
    expect(squad).not.toHaveProperty("id")
    // A start that has passed is not sent again as it was.
    expect(Date.parse(String(squad.start_time))).toBeGreaterThan(Date.parse("2026-01-01"))
    expect(account.store.ads.size).toBe(4)
    expect(account.store.creatives.size).toBe(4)
    expect((await copies("ad_squads")).map((row) => rowId(row.id))).toContain(made.id)
    // The new ad group's two ads are on the list too, each keeping its own switch.
    const ads = (await copies("ads")).filter((row) => row.ad_squad_id !== "squad-1")
    expect(ads.map((row) => row.status).sort()).toEqual(["ACTIVE", "PAUSED"])
  })

  it("copies a whole campaign switched off, without its past end", async () => {
    const { service, account } = control()
    const made = await service.clone(actor, rowId("camp-1"), "campaign", { name: "حملة - نسخة" })
    const campaign = (account.writes()[0].body?.campaigns as Json[])[0]
    expect(campaign).toMatchObject({
      name: "حملة - نسخة",
      status: "PAUSED",
      ad_account_id: ACCOUNT,
      objective_v2_properties: { objective_v2_type: "LEADS" },
    })
    expect(campaign).not.toHaveProperty("end_time")
    expect(campaign).not.toHaveProperty("delivery_status")
    expect(account.store.campaigns.size).toBe(2)
    expect(account.store.adsquads.size).toBe(2)
    expect(account.store.ads.size).toBe(4)
    const newSquad = [...account.store.adsquads.values()].find((item) => item.id !== "squad-1")
    expect(rowId(String(newSquad?.campaign_id))).toBe(made.id)
    expect((await copies("campaigns")).map((row) => rowId(row.id))).toContain(made.id)
    expect(await copies("ad_squads")).toHaveLength(2)
  })

  it("leaves nothing behind when a piece of the copy is refused", async () => {
    // The second ad's creative is refused: the new campaign is deleted with what was made.
    const { service, account } = control(snapchatAccount({ refuseCreativeNumber: 2 }))
    await expect(
      service.clone(actor, rowId("camp-1"), "campaign", { name: "حملة - نسخة" })
    ).rejects.toMatchObject({ code: "SNAPCHAT_REFUSED", message: "Headline is too long" })
    expect(account.store.campaigns.size).toBe(1)
    expect(account.calls.at(-1)).toMatchObject({ method: "DELETE" })
    expect(await copies("campaigns")).toHaveLength(1)
  })

  it("refuses another organization and a budget under the floor before asking Snapchat", async () => {
    const { service, account } = control()
    const stranger = { ...actor, organizationId: OTHER_ORG }
    for (const attempt of [
      () => service.settings(stranger, rowId("squad-1"), "adGroup"),
      () => service.edit(stranger, rowId("squad-1"), "adGroup", { name: "اسم" }),
      () => service.clone(stranger, rowId("camp-1"), "campaign", { name: "نسخة" }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
    }
    await expect(
      service.edit(actor, rowId("squad-1"), "adGroup", { dailyBudget: 5 })
    ).rejects.toMatchObject({ code: "PUBLISH_BUDGET_TOO_LOW" })
    await expect(
      service.edit(actor, rowId("squad-1"), "adGroup", { minAge: 40, maxAge: 30 })
    ).rejects.toMatchObject({ code: "PUBLISH_INVALID_AGES" })
    expect(account.calls).toEqual([])
  })
})
