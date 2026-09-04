import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Every real third-party connector in this codebase, keyed by which table its connection status
// actually lives in. Google Ads is the one exception: its per-org connection status is read from
// the shared integration_connections registry (provider_id = 'google-ads'), not
// google_oauth_connections directly -- mirrors the exact query
// channels/channels-service.ts's fetchGoogleConnectionState already uses for the same reason.
// Every other provider owns its status on its own *_oauth_connections table (confirmed real
// columns: organization_id, workspace_id, status, deleted_at).
const OWN_TABLE_PROVIDERS = [
  "meta_oauth_connections",
  "tiktok_ads_oauth_connections",
  "snapchat_oauth_connections",
  "salla_oauth_connections",
  "shopify_oauth_connections",
  "zid_oauth_connections",
  "google_analytics_oauth_connections",
] as const

export const TOTAL_CONNECTABLE_PLATFORMS = OWN_TABLE_PROVIDERS.length + 1

async function isConnectedInOwnTable(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null,
  table: string
): Promise<boolean> {
  const result = await db.query<{ status: string }>(
    `
    SELECT status
    FROM ${table}
    WHERE organization_id = $1
      AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [organizationId, workspaceId]
  )
  return result.rows[0]?.status === "connected"
}

async function isGoogleAdsConnected(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null
): Promise<boolean> {
  const result = await db.query<{ status: string }>(
    `
    SELECT status
    FROM integration_connections
    WHERE provider_id = 'google-ads' AND organization_id = $1
      AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [organizationId, workspaceId]
  )
  return result.rows[0]?.status === "connected"
}

export interface ConnectedPlatformsCount {
  connected: number
  total: number
}

// Callers must verify the actor actually has membership in organizationId before calling this
// (e.g. via container.queries.getOrganization(actor, organizationId), which already throws
// forbidden/not-found appropriately) -- this function itself does no authorization, it only
// aggregates.
export async function countConnectedPlatforms(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null
): Promise<ConnectedPlatformsCount> {
  const results = await Promise.all([
    isGoogleAdsConnected(db, organizationId, workspaceId),
    ...OWN_TABLE_PROVIDERS.map((table) =>
      isConnectedInOwnTable(db, organizationId, workspaceId, table)
    ),
  ])

  return {
    connected: results.filter(Boolean).length,
    total: TOTAL_CONNECTABLE_PLATFORMS,
  }
}
