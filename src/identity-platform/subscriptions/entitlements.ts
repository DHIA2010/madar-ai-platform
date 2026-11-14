import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { parseEntitlements } from "../pricing/service"
import type { PackageEntitlements } from "../pricing/types"
import { effectiveSubscriptionStatus } from "./lifecycle"
import type { StoredSubscriptionStatus } from "./types"

// Features that come with certain plans rather than being apps of their own (platform_packages
// .entitlements, edited in Madar Admin). Read from the package of every running subscription the
// organization has, so a package edited in Madar Admin applies to everyone on it right away.
//
//   - A switch is on when any running plan turns it on.
//   - A limit comes from the plan of the app it belongs to (ad platforms from the Ads plan,
//     stores from the E-commerce plan, or Madar Complete); the most generous one wins, and no
//     such plan means no limit here (the app itself is off then).
//   - A free trial has no package yet: it unlocks everything that app's plans can include (a POS
//     trial unlocks the POS features, an Ads trial doesn't), so the customer sees the full app.

export type EntitlementSwitch =
  | "invoiceReader"
  | "shiftCash"
  | "customRoles"
  | "procurement"
  | "customReports"
  | "invoicing"

export interface OrganizationEntitlements {
  invoiceReader: boolean
  shiftCash: boolean
  customRoles: boolean
  procurement: boolean
  customReports: boolean
  invoicing: boolean
  // null = no limit.
  maxAdPlatforms: number | null
  maxStores: number | null
}

const SWITCHES: EntitlementSwitch[] = [
  "invoiceReader",
  "shiftCash",
  "customRoles",
  "procurement",
  "customReports",
  "invoicing",
]
const LIVE = new Set(["active", "trial", "overdue"])
// What a trial of each app unlocks: everything its own plans can include.
const TRIAL_GRANTS: Record<string, EntitlementSwitch[]> = {
  pos: ["invoiceReader", "shiftCash", "customRoles", "procurement", "customReports", "invoicing"],
  madarComplete: [
    "invoiceReader",
    "shiftCash",
    "customRoles",
    "procurement",
    "customReports",
    "invoicing",
  ],
  advertising: ["customRoles", "customReports"],
  ecommerce: ["customRoles", "customReports"],
}
const LIMIT_SOURCES: Record<"maxAdPlatforms" | "maxStores", string[]> = {
  maxAdPlatforms: ["advertising", "madarComplete"],
  maxStores: ["ecommerce", "madarComplete"],
}

const toIso = (value: unknown) =>
  value === null || value === undefined
    ? null
    : (value instanceof Date ? value : new Date(String(value))).toISOString()

// Plain-db (no pricing service), so the per-app guards can use it too.
export async function loadOrganizationEntitlements(
  db: PostgresDatabase,
  organizationId: string
): Promise<OrganizationEntitlements> {
  const result = await db.query<{
    application: string
    status: StoredSubscriptionStatus
    trial_ends_at: unknown
    current_period_end: unknown
    package_id: string | null
    entitlements: unknown
  }>(
    `SELECT s.application, s.status, s.trial_ends_at, s.current_period_end, s.package_id,
            p.entitlements
       FROM organization_subscriptions s
       LEFT JOIN platform_packages p ON p.id = s.package_id
      WHERE s.organization_id = $1`,
    [organizationId]
  )
  const now = new Date().toISOString()
  const merged: OrganizationEntitlements = {
    invoiceReader: false,
    shiftCash: false,
    customRoles: false,
    procurement: false,
    customReports: false,
    invoicing: false,
    maxAdPlatforms: null,
    maxStores: null,
  }
  const limits: Record<"maxAdPlatforms" | "maxStores", number[]> = {
    maxAdPlatforms: [],
    maxStores: [],
  }
  for (const row of result.rows) {
    const status = effectiveSubscriptionStatus(
      {
        status: row.status,
        trialEndsAt: toIso(row.trial_ends_at),
        currentPeriodEnd: toIso(row.current_period_end),
      },
      now
    )
    if (!LIVE.has(status)) continue
    // A trial (no package bought yet) unlocks what that app's plans can include.
    const onTrial = status === "trial" && !row.package_id
    const entitlements: PackageEntitlements = onTrial ? {} : parseEntitlements(row.entitlements)
    const trialGrants = onTrial ? (TRIAL_GRANTS[row.application] ?? []) : []
    for (const key of SWITCHES) {
      if (trialGrants.includes(key) || entitlements[key]) merged[key] = true
    }
    for (const key of ["maxAdPlatforms", "maxStores"] as const) {
      if (!LIMIT_SOURCES[key].includes(row.application)) continue
      limits[key].push(onTrial ? Infinity : (entitlements[key] ?? Infinity))
    }
  }
  for (const key of ["maxAdPlatforms", "maxStores"] as const) {
    const best = limits[key].length > 0 ? Math.max(...limits[key]) : Infinity
    merged[key] = Number.isFinite(best) ? best : null
  }
  return merged
}

// What each switch is called in errors -- the frontend shows its own wording per code.
const SWITCH_LABEL: Record<EntitlementSwitch, string> = {
  invoiceReader: "the purchase-invoice reader",
  shiftCash: "cash movements and shift reports",
  customRoles: "custom roles and permissions",
  procurement: "suppliers, purchases and expenses",
  customReports: "custom reports",
  invoicing: "invoicing and quotations",
}

export function planFeatureNotIncluded(feature: string, message: string): IdentityError {
  return new IdentityError("PLAN_FEATURE_NOT_INCLUDED", 403, "business", message, { feature })
}

export class PackageEntitlementsService {
  constructor(private readonly db: PostgresDatabase) {}

  get(organizationId: string): Promise<OrganizationEntitlements> {
    return loadOrganizationEntitlements(this.db, organizationId)
  }

  async has(organizationId: string, feature: EntitlementSwitch): Promise<boolean> {
    return (await this.get(organizationId))[feature]
  }

  // Refuses a feature the organization's plans don't include.
  async require(organizationId: string, feature: EntitlementSwitch): Promise<void> {
    if (await this.has(organizationId, feature)) return
    if (feature === "invoiceReader") {
      // Kept for the purchases screen, which already shows its own message for this code.
      throw new IdentityError(
        "INVOICE_READER_NOT_INCLUDED",
        403,
        "business",
        "The purchase-invoice reader comes with the Growth and Pro packages."
      )
    }
    throw planFeatureNotIncluded(feature, `Your plan doesn't include ${SWITCH_LABEL[feature]}.`)
  }

  // Refuses connecting one more ad platform or store past the plan's limit. Reconnecting one that's
  // already connected is always allowed. Other providers (e.g. Google Analytics) aren't limited.
  async requireRoomToConnect(
    organizationId: string,
    providerId: string,
    workspaceId: string | null
  ): Promise<void> {
    const kind = AD_PROVIDER_TABLES[providerId]
      ? "maxAdPlatforms"
      : STORE_PROVIDER_TABLES[providerId]
        ? "maxStores"
        : null
    if (!kind) return
    const max = (await this.get(organizationId))[kind]
    if (max === null) return
    if (kind === "maxAdPlatforms") {
      // Counted per platform: Meta, Google Ads, TikTok and Snapchat, connected anywhere in the account.
      const connected = await connectedProviders(this.db, organizationId, AD_PROVIDER_TABLES)
      if (connected.has(providerId)) return
      return this.refuse(kind, max, connected.size)
    }
    // Counted per store: every connected Salla / Zid / Shopify store in the account.
    const stores = await connectedStores(this.db, organizationId)
    if (
      stores.some((store) => store.providerId === providerId && store.workspaceId === workspaceId)
    ) {
      return
    }
    return this.refuse(kind, max, stores.length)
  }

  private refuse(limit: "maxAdPlatforms" | "maxStores", max: number, connected: number) {
    if (connected >= max) {
      throw planFeatureNotIncluded(
        limit,
        limit === "maxAdPlatforms"
          ? `Your plan connects up to ${max} ad platforms -- upgrade to connect more.`
          : `Your plan connects up to ${max} store(s) -- upgrade to connect more.`
      )
    }
  }
}

// Where each ad platform's and store's connections live. Google Ads keeps its status in the
// shared integration_connections registry (see organizations/connected-platforms.ts).
const AD_PROVIDER_TABLES: Record<string, string> = {
  "meta-ads": "meta_oauth_connections",
  "tiktok-ads": "tiktok_ads_oauth_connections",
  "snapchat-ads": "snapchat_oauth_connections",
  "google-ads": "integration_connections",
}
const STORE_PROVIDER_TABLES: Record<string, string> = {
  salla: "salla_oauth_connections",
  zid: "zid_oauth_connections",
  shopify: "shopify_oauth_connections",
}

async function connectedRows(
  db: PostgresDatabase,
  organizationId: string,
  providerId: string,
  table: string
): Promise<Array<{ workspace_id: string | null }>> {
  const result = await db.query<{ workspace_id: string | null }>(
    table === "integration_connections"
      ? `SELECT workspace_id FROM integration_connections
          WHERE organization_id = $1 AND provider_id = $2 AND status = 'connected'
            AND deleted_at IS NULL`
      : `SELECT workspace_id FROM ${table}
          WHERE organization_id = $1 AND status = 'connected' AND deleted_at IS NULL`,
    table === "integration_connections" ? [organizationId, providerId] : [organizationId]
  )
  return result.rows
}

async function connectedProviders(
  db: PostgresDatabase,
  organizationId: string,
  tables: Record<string, string>
): Promise<Set<string>> {
  const connected = new Set<string>()
  for (const [providerId, table] of Object.entries(tables)) {
    if ((await connectedRows(db, organizationId, providerId, table)).length > 0) {
      connected.add(providerId)
    }
  }
  return connected
}

async function connectedStores(
  db: PostgresDatabase,
  organizationId: string
): Promise<Array<{ providerId: string; workspaceId: string | null }>> {
  const stores: Array<{ providerId: string; workspaceId: string | null }> = []
  for (const [providerId, table] of Object.entries(STORE_PROVIDER_TABLES)) {
    for (const row of await connectedRows(db, organizationId, providerId, table)) {
      stores.push({ providerId, workspaceId: row.workspace_id })
    }
  }
  return stores
}
