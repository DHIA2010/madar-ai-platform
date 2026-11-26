import { createHash, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// What a media buyer changed in a campaign or an ad set, kept by Madar itself: the platforms
// keep no change history Madar can read for every account. Each pass reads the campaigns and
// ad sets as the last sync saved them, compares their settings with what the previous pass saw,
// and writes one row per changed setting. The check-up then reads those rows for the habits that
// cost money (see checkup.ts: editing during learning, budget jumps, bid churn, on/off).
//
// Only what was synced can be compared: a change made and undone between two syncs is not seen,
// and nothing before the first pass is known.

export type AdEntityLevel = "campaign" | "adset"

export type AdChangeField =
  | "status"
  | "dailyBudget"
  | "lifetimeBudget"
  | "bid"
  | "bidStrategy"
  | "optimization"
  | "targeting"

// The settings a change is looked for in. Null = the platform row carries no such setting.
export interface AdEntitySettings {
  status: "on" | "off" | null
  dailyBudget: number | null
  lifetimeBudget: number | null
  bid: number | null
  bidStrategy: string | null
  optimization: string | null
  // A fingerprint of the audience, not the audience itself: only "it changed" matters.
  targeting: string | null
}

const FIELDS: AdChangeField[] = [
  "status",
  "dailyBudget",
  "lifetimeBudget",
  "bid",
  "bidStrategy",
  "optimization",
  "targeting",
]

// The changes that restart a platform's learning phase (a status switch does not, by itself).
export const SIGNIFICANT_FIELDS = new Set<AdChangeField>([
  "dailyBudget",
  "lifetimeBudget",
  "bid",
  "bidStrategy",
  "optimization",
  "targeting",
])

export interface AdEntitySnapshot {
  organizationId: string
  workspaceId: string | null
  rowId: string
  campaignRowId: string
  level: AdEntityLevel
  name: string
  settings: AdEntitySettings
  learning: boolean | null
  createdAt: string | null
  updatedAt: string | null
}

export interface AdChange {
  id: string
  rowId: string
  campaignRowId: string
  level: AdEntityLevel
  name: string
  field: AdChangeField
  oldValue: string | null
  newValue: string | null
  duringLearning: boolean | null
  learningSource: "platform" | "estimate" | null
  changedAt: string
}

type Row = Record<string, unknown>

// How long a platform keeps an ad set learning after it starts or after a big edit, when the
// platform itself does not say.
const LEARNING_DAYS = 7
const DAY_MS = 86_400_000

const num = (value: unknown, divisor = 1): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Number((parsed / divisor).toFixed(2)) : null
}
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

// The same audience always gives the same fingerprint, whatever order its keys came in.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Row)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value ?? null)
}
export function fingerprint(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return createHash("sha1").update(stable(value)).digest("hex").slice(0, 16)
}

// A platform timestamp as ISO. TikTok sends "YYYY-MM-DD HH:mm:ss" in UTC.
function instant(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const onOff = (value: unknown, on: string[], off: string[]): "on" | "off" | null => {
  const status = String(value ?? "").toUpperCase()
  if (on.includes(status)) return "on"
  if (off.includes(status)) return "off"
  return null
}

const parsePayload = (value: unknown): Row =>
  (typeof value === "string" ? JSON.parse(value) : (value ?? {})) as Row

// -- What each platform's saved rows say -------------------------------------------------------

export function snapchatSnapshot(row: Row): AdEntitySnapshot | null {
  const payload = parsePayload(row.payload)
  const level: AdEntityLevel | null =
    row.entity_type === "campaigns" ? "campaign" : row.entity_type === "ad_squads" ? "adset" : null
  if (!level) return null
  const prefix = `snapchat_ads:${row.connection_id}:${row.customer_id}`
  const id = String(row.entity_id)
  const campaignId = level === "campaign" ? id : String(payload.campaign_id ?? "")
  if (!campaignId) return null
  const delivery = Array.isArray(payload.delivery_status) ? payload.delivery_status.map(String) : []
  const status = onOff(payload.status, ["ACTIVE"], ["PAUSED"])
  return {
    organizationId: String(row.organization_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    rowId: `${prefix}:${id}`,
    campaignRowId: `${prefix}:${campaignId}`,
    level,
    name: String(payload.name ?? id),
    settings: {
      status,
      dailyBudget: num(payload.daily_budget_micro, 1_000_000),
      lifetimeBudget: num(
        level === "campaign" ? payload.lifetime_spend_cap_micro : payload.lifetime_budget_micro,
        1_000_000
      ),
      bid: level === "adset" ? num(payload.bid_micro, 1_000_000) : null,
      bidStrategy: level === "adset" ? text(payload.bid_strategy) : null,
      optimization: level === "adset" ? text(payload.optimization_goal) : null,
      targeting: level === "adset" ? fingerprint(payload.targeting) : null,
    },
    // Snapchat lists LEARNING_PHASE among a running ad set's delivery states.
    learning: level === "adset" && status === "on" ? delivery.includes("LEARNING_PHASE") : null,
    createdAt: instant(payload.created_at),
    updatedAt: instant(payload.updated_at),
  }
}

const TIKTOK_TARGETING_KEYS = [
  "age_groups",
  "gender",
  "location_ids",
  "languages",
  "interest_category_ids",
  "interest_keyword_ids",
  "actions",
  "audience_ids",
  "excluded_audience_ids",
  "operating_systems",
  "placements",
  "placement_type",
  "device_price_ranges",
  "network_types",
  "spending_power",
  "household_income",
]

function tiktokBudget(payload: Row): { daily: number | null; lifetime: number | null } {
  const mode = String(payload.budget_mode ?? "")
  const amount = num(payload.budget)
  if (mode.includes("TOTAL")) return { daily: null, lifetime: amount }
  if (mode.includes("INFINITE")) return { daily: null, lifetime: null }
  return { daily: amount, lifetime: null }
}

export function tiktokSnapshot(row: Row): AdEntitySnapshot | null {
  const payload = parsePayload(row.payload)
  const level: AdEntityLevel | null =
    row.entity_type === "campaigns" ? "campaign" : row.entity_type === "adgroups" ? "adset" : null
  if (!level) return null
  const prefix = `tiktok_ads:${row.connection_id}:${row.customer_id}`
  const id = String(row.entity_id)
  const campaignId = level === "campaign" ? id : String(payload.campaign_id ?? "")
  if (!campaignId) return null
  const budget = tiktokBudget(payload)
  const targeting: Row = {}
  for (const key of TIKTOK_TARGETING_KEYS) targeting[key] = payload[key] ?? null
  const secondary = String(payload.secondary_status ?? "").toUpperCase()
  return {
    organizationId: String(row.organization_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    rowId: `${prefix}:${id}`,
    campaignRowId: `${prefix}:${campaignId}`,
    level,
    name: String((level === "campaign" ? payload.campaign_name : payload.adgroup_name) ?? id),
    settings: {
      status: onOff(payload.operation_status, ["ENABLE"], ["DISABLE"]),
      dailyBudget: budget.daily,
      lifetimeBudget: budget.lifetime,
      bid:
        level === "adset"
          ? (num(payload.bid_price) ??
            num(payload.conversion_bid_price) ??
            num(payload.deep_cpa_bid))
          : null,
      bidStrategy: level === "adset" ? text(payload.bid_type) : null,
      optimization:
        level === "adset"
          ? [text(payload.optimization_goal), text(payload.optimization_event)]
              .filter(Boolean)
              .join(" / ") || null
          : null,
      targeting: level === "adset" ? fingerprint(targeting) : null,
    },
    // TikTok names the learning phase in an ad group's secondary status when it reports it.
    learning: level === "adset" && secondary.includes("LEARN") ? true : null,
    createdAt: instant(payload.create_time),
    updatedAt: instant(payload.modify_time),
  }
}

export function metaSnapshot(row: Row): AdEntitySnapshot | null {
  const payload = parsePayload(row.payload)
  const level: AdEntityLevel | null =
    row.entity_type === "campaigns" ? "campaign" : row.entity_type === "adsets" ? "adset" : null
  if (!level) return null
  const prefix = `meta_ads:${row.connection_id}:${row.customer_id}`
  const id = String(row.entity_id)
  const campaignId = level === "campaign" ? id : String(payload.campaign_id ?? "")
  if (!campaignId) return null
  const learningStage = (payload.learning_stage_info ?? null) as Row | null
  const stage = String(learningStage?.status ?? "").toUpperCase()
  // Meta sends budgets and bids in the account currency's smallest unit (halalas, cents).
  return {
    organizationId: String(row.organization_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    rowId: `${prefix}:${id}`,
    campaignRowId: `${prefix}:${campaignId}`,
    level,
    name: String(payload.name ?? id),
    settings: {
      status: onOff(payload.status, ["ACTIVE"], ["PAUSED", "ARCHIVED", "DELETED"]),
      dailyBudget: num(payload.daily_budget, 100),
      lifetimeBudget: num(payload.lifetime_budget, 100),
      bid: level === "adset" ? num(payload.bid_amount, 100) : null,
      bidStrategy: text(payload.bid_strategy),
      optimization: level === "adset" ? text(payload.optimization_goal) : null,
      targeting: level === "adset" ? fingerprint(payload.targeting) : null,
    },
    learning: stage === "LEARNING" ? true : stage === "SUCCESS" || stage === "FAIL" ? false : null,
    createdAt: instant(payload.created_time),
    updatedAt: instant(payload.updated_time),
  }
}

export function googleSnapshot(row: Row): AdEntitySnapshot | null {
  const level: AdEntityLevel = row.level === "adset" ? "adset" : "campaign"
  const prefix = `google_ads:${row.connection_id}:${row.customer_id}`
  const id = String(row.entity_id)
  const campaignId = String(row.campaign_id ?? id)
  return {
    organizationId: String(row.organization_id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    rowId: `${prefix}:${id}`,
    campaignRowId: `${prefix}:${campaignId}`,
    level,
    name: String(row.name ?? id),
    settings: {
      status: onOff(row.status, ["ENABLED"], ["PAUSED", "REMOVED"]),
      dailyBudget: level === "campaign" ? num(row.budget_micros, 1_000_000) : null,
      lifetimeBudget: null,
      bid: null,
      bidStrategy: level === "campaign" ? text(row.bidding_strategy_type) : null,
      optimization: null,
      targeting: null,
    },
    learning: null,
    createdAt: null,
    updatedAt: null,
  }
}

const settingsKey = (settings: AdEntitySettings) => stable(settings)

const valueText = (value: AdEntitySettings[AdChangeField]): string | null =>
  value === null || value === undefined ? null : String(value)

// The settings that differ between two passes.
export function diffSettings(
  before: AdEntitySettings,
  after: AdEntitySettings
): Array<{ field: AdChangeField; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: AdChangeField; oldValue: string | null; newValue: string | null }> =
    []
  for (const field of FIELDS) {
    const oldValue = valueText(before[field])
    const newValue = valueText(after[field])
    // A setting the platform stopped (or started) sending is not a change someone made.
    if (oldValue === null || newValue === null) continue
    if (oldValue !== newValue) changes.push({ field, oldValue, newValue })
  }
  return changes
}

export class AdChangeTracker {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date()
  ) {}

  // Every campaign and ad set the syncs saved, for one organization or for all of them.
  async snapshots(organizationId: string | null): Promise<AdEntitySnapshot[]> {
    const orgFilter = organizationId ? "AND conn.organization_id = $1" : ""
    const values = organizationId ? [organizationId] : []
    const live = "conn.deleted_at IS NULL AND conn.status = 'connected'"
    const read = (sql: string) =>
      this.db
        .query<Row>(sql, values)
        .then((result) => result.rows)
        .catch((error: unknown) => {
          console.error("ad_changes.read_failed", error)
          return [] as Row[]
        })
    const [snapchat, tiktok, meta, googleCampaigns, googleAdGroups] = await Promise.all([
      read(`SELECT r.connection_id, r.customer_id, r.entity_type, r.entity_id, r.payload,
                   conn.organization_id, conn.workspace_id
              FROM snapchat_records r
              JOIN snapchat_oauth_connections conn ON conn.id = r.connection_id
             WHERE r.entity_type IN ('campaigns', 'ad_squads') AND ${live} ${orgFilter}`),
      read(`SELECT r.connection_id, r.customer_id, r.entity_type, r.entity_id, r.payload,
                   conn.organization_id, conn.workspace_id
              FROM tiktok_ads_records r
              JOIN tiktok_ads_oauth_connections conn ON conn.id = r.connection_id
             WHERE r.entity_type IN ('campaigns', 'adgroups') AND ${live} ${orgFilter}`),
      read(`SELECT r.connection_id, r.customer_id, r.entity_type, r.entity_id, r.payload,
                   conn.organization_id, conn.workspace_id
              FROM meta_records r
              JOIN meta_oauth_connections conn ON conn.id = r.connection_id
             WHERE r.entity_type IN ('campaigns', 'adsets') AND ${live} ${orgFilter}`),
      read(`SELECT c.connection_id, c.customer_id, c.campaign_id AS entity_id, c.campaign_id,
                   c.name, c.status, c.bidding_strategy_type, c.budget_micros,
                   conn.organization_id, conn.workspace_id, 'campaign' AS level
              FROM google_ads_campaigns c
              JOIN integration_connections conn ON conn.id = c.connection_id
             WHERE conn.provider_id = 'google-ads' ${orgFilter}`),
      read(`SELECT g.connection_id, g.customer_id, g.ad_group_id AS entity_id, g.campaign_id,
                   g.name, g.status, conn.organization_id, conn.workspace_id, 'adset' AS level
              FROM google_ads_ad_groups g
              JOIN integration_connections conn ON conn.id = g.connection_id
             WHERE conn.provider_id = 'google-ads' ${orgFilter}`),
    ])
    return [
      ...snapchat.map(snapchatSnapshot),
      ...tiktok.map(tiktokSnapshot),
      ...meta.map(metaSnapshot),
      ...googleCampaigns.map(googleSnapshot),
      ...googleAdGroups.map(googleSnapshot),
    ].filter((snapshot): snapshot is AdEntitySnapshot => snapshot !== null)
  }

  // One pass: compare, record what changed, remember what was seen. Safe from several tasks at
  // once -- a state row is only moved on from the exact settings this pass compared against, so
  // a change is written by one pass only.
  async capture(
    organizationId: string | null = null
  ): Promise<{ checked: number; changes: number }> {
    const snapshots = await this.snapshots(organizationId)
    if (snapshots.length === 0) return { checked: 0, changes: 0 }
    const stateRows = await this.db.query<Row>(
      organizationId
        ? `SELECT * FROM ad_entity_states WHERE organization_id = $1`
        : `SELECT * FROM ad_entity_states`,
      organizationId ? [organizationId] : []
    )
    const states = new Map(stateRows.rows.map((row) => [String(row.row_id), row]))
    const nowDate = this.now()
    let changes = 0

    for (const snapshot of snapshots) {
      const key = settingsKey(snapshot.settings)
      const state = states.get(snapshot.rowId)
      if (!state) {
        await this.db.query(
          `INSERT INTO ad_entity_states
             (row_id, organization_id, workspace_id, campaign_row_id, level, name, settings,
              settings_key, learning, created_on_platform_at, first_seen_at, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $11)
           ON CONFLICT (row_id) DO NOTHING`,
          [
            snapshot.rowId,
            snapshot.organizationId,
            snapshot.workspaceId,
            snapshot.campaignRowId,
            snapshot.level,
            snapshot.name,
            JSON.stringify(snapshot.settings),
            key,
            snapshot.learning,
            snapshot.createdAt,
            nowDate.toISOString(),
          ]
        )
        continue
      }
      if (String(state.settings_key) === key) {
        // Nothing changed: keep the learning flag and the name current.
        if (state.learning !== snapshot.learning || String(state.name) !== snapshot.name) {
          await this.db.query(
            `UPDATE ad_entity_states SET learning = $2, name = $3, captured_at = $4
              WHERE row_id = $1`,
            [snapshot.rowId, snapshot.learning, snapshot.name, nowDate.toISOString()]
          )
        }
        continue
      }

      const previous = parsePayload(state.settings) as unknown as AdEntitySettings
      const moved = await this.db.query<Row>(
        `UPDATE ad_entity_states
            SET settings = $2::jsonb, settings_key = $3, learning = $4, name = $5, captured_at = $6
          WHERE row_id = $1 AND settings_key = $7
          RETURNING row_id`,
        [
          snapshot.rowId,
          JSON.stringify(snapshot.settings),
          key,
          snapshot.learning,
          snapshot.name,
          nowDate.toISOString(),
          String(state.settings_key),
        ]
      )
      if (moved.rows.length === 0) continue

      const diffs = diffSettings(previous, snapshot.settings)
      if (diffs.length === 0) continue
      // When it happened: the platform's own "last edited" time when it falls after the previous
      // pass, else now (the change happened at some point between the two passes).
      const lastPass = new Date(String(state.captured_at)).getTime()
      const platformTime = snapshot.updatedAt ? new Date(snapshot.updatedAt).getTime() : NaN
      const changedAt =
        Number.isFinite(platformTime) &&
        platformTime > lastPass &&
        platformTime <= nowDate.getTime()
          ? new Date(platformTime)
          : nowDate
      const learning = await this.learningAt(snapshot, state, changedAt)

      for (const diff of diffs) {
        await this.db.query(
          `INSERT INTO ad_entity_changes
             (id, organization_id, workspace_id, row_id, campaign_row_id, level, name, field,
              old_value, new_value, during_learning, learning_source, changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            randomUUID(),
            snapshot.organizationId,
            snapshot.workspaceId,
            snapshot.rowId,
            snapshot.campaignRowId,
            snapshot.level,
            snapshot.name,
            diff.field,
            diff.oldValue,
            diff.newValue,
            SIGNIFICANT_FIELDS.has(diff.field) ? learning.during : null,
            SIGNIFICANT_FIELDS.has(diff.field) ? learning.source : null,
            changedAt.toISOString(),
          ]
        )
        changes += 1
      }
    }
    return { checked: snapshots.length, changes }
  }

  // Whether the ad set was learning when it was changed: what the platform said on the pass
  // before, else an estimate -- it started, or was last changed in a way that restarts
  // learning, within the last 7 days.
  private async learningAt(
    snapshot: AdEntitySnapshot,
    state: Row,
    changedAt: Date
  ): Promise<{ during: boolean | null; source: "platform" | "estimate" | null }> {
    if (snapshot.level !== "adset") return { during: null, source: null }
    if (typeof state.learning === "boolean") return { during: state.learning, source: "platform" }
    const since = changedAt.getTime() - LEARNING_DAYS * DAY_MS
    const created = state.created_on_platform_at
      ? new Date(String(state.created_on_platform_at)).getTime()
      : NaN
    if (Number.isFinite(created) && created >= since) return { during: true, source: "estimate" }
    const recent = await this.db.query<Row>(
      `SELECT field FROM ad_entity_changes
        WHERE row_id = $1 AND changed_at >= $2 AND changed_at < $3`,
      [snapshot.rowId, new Date(since).toISOString(), changedAt.toISOString()]
    )
    const editedLately = recent.rows.some((row) =>
      SIGNIFICANT_FIELDS.has(String(row.field) as AdChangeField)
    )
    return { during: editedLately, source: "estimate" }
  }

  // The changes made in a period, newest first.
  async list(actor: AuthenticatedActor, from: Date, to: Date): Promise<AdChange[]> {
    const values: unknown[] = [actor.organizationId, from.toISOString(), to.toISOString()]
    let workspace = ""
    if (actor.workspaceId) {
      values.push(actor.workspaceId)
      workspace = `AND (workspace_id = $${values.length} OR workspace_id IS NULL)`
    }
    const result = await this.db.query<Row>(
      `SELECT * FROM ad_entity_changes
        WHERE organization_id = $1 AND changed_at >= $2 AND changed_at <= $3 ${workspace}
        ORDER BY changed_at DESC
        LIMIT 500`,
      values
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      rowId: String(row.row_id),
      campaignRowId: String(row.campaign_row_id),
      level: String(row.level) as AdEntityLevel,
      name: String(row.name),
      field: String(row.field) as AdChangeField,
      oldValue: row.old_value === null ? null : String(row.old_value),
      newValue: row.new_value === null ? null : String(row.new_value),
      duringLearning: typeof row.during_learning === "boolean" ? row.during_learning : null,
      learningSource: row.learning_source
        ? (String(row.learning_source) as "platform" | "estimate")
        : null,
      changedAt: new Date(String(row.changed_at)).toISOString(),
    }))
  }
}

let registered: AdChangeTracker | null = null
export const registerAdChangeTracker = (tracker: AdChangeTracker | null) => {
  registered = tracker
}
export const registeredAdChangeTracker = () => registered
