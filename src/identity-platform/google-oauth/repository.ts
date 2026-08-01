import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type {
  ProviderAccountDiscoveryRepository,
  ProviderConnectionLifecycleRepository,
} from "../integrations/provider-repositories"

import type {
  GoogleAdsCustomerAccountView,
  GoogleOAuthConnectionView,
  GoogleOAuthRecentEventView,
} from "./types"

interface GoogleOAuthStateRecord {
  id: string
  state: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  userId: string
  connectionId: string
  oauthAccountId: string
  requestedScopes: string[]
  redirectUri: string
  expiresAt: string
}

interface ResolveProjectInput {
  organizationId: string
  workspaceId: string | null
  projectId: string | null
}

interface ResolveProjectResult {
  projectId: string
  workspaceId: string | null
}

interface UpsertConnectionInput {
  id: string
  oauthAccountId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  dataSourceId: string | null
  providerAccountId: string | null
  providerAccountName: string | null
  providerAccountEmail: string | null
  encryptedRefreshToken: string | null
  encryptedAccessToken: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  status: "pending" | "connected" | "paused" | "disconnected" | "error"
  connectionReference: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  actorUserId: string
  nowIso: string
}

interface UpsertIntegrationConnectionInput {
  id: string
  providerId: string
  providerFamily: string
  platform: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  oauthAccountId: string | null
  dataSourceId: string | null
  connectionReference: string | null
  status: "pending" | "connected" | "paused" | "disconnected" | "error"
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  actorUserId: string
  nowIso: string
}

interface UpsertOAuthAccountInput {
  id: string
  providerFamily: "google" | "snapchat"
  organizationId: string
  workspaceId: string | null
  providerSubjectId: string | null
  providerEmail: string | null
  providerDisplayName: string | null
  grantedScopes: string[]
  status: "pending" | "active" | "disabled" | "revoked"
  lastAuthenticatedAt: string | null
  actorUserId: string
  nowIso: string
}

interface UpsertOAuthTokenInput {
  oauthAccountId: string
  encryptedRefreshToken: string | null
  encryptedAccessToken: string | null
  tokenType: string | null
  tokenExpiresAt: string | null
  refreshTokenIssuedAt: string | null
  nowIso: string
}

interface ReplaceAccessibleCustomerAccountsInput {
  connectionId: string
  actorUserId: string
  selectedCustomerId: string | null
  accounts: Array<{
    customerId: string
    displayName: string | null
    currencyCode: string | null
    timeZone: string | null
  }>
}

interface ConnectionOwnershipRecord {
  id: string
  oauthAccountId: string | null
  organizationId: string
  workspaceId: string | null
}

interface ConnectionTokenRecord {
  encryptedRefreshToken: string | null
  encryptedAccessToken: string | null
}

interface RuntimeConnectionRecord {
  id: string
  providerId: string
  providerFamily: string
  platform: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  oauthAccountId: string | null
  dataSourceId: string | null
  connectionReference: string | null
}

interface RecentOutboxEventRecord extends Record<string, unknown> {
  id: string
  eventType: string
  occurredAt: string
  metadata: Record<string, unknown>
  payload: Record<string, unknown>
}

interface SyncRuntimeReconciliationResult {
  releasedLocks: number
  failedRuns: number
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapConnection(row: Record<string, unknown>): GoogleOAuthConnectionView {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    projectId: String(row.project_id),
    dataSourceId: (row.data_source_id as string | null) ?? null,
    providerAccountId: (row.provider_account_id as string | null) ?? null,
    providerAccountName: (row.provider_account_name as string | null) ?? null,
    providerAccountEmail: (row.provider_account_email as string | null) ?? null,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    tokenExpiresAt: toIso(row.token_expires_at),
    status: String(row.status) as GoogleOAuthConnectionView["status"],
    connectionReference: (row.connection_reference as string | null) ?? null,
    lastConnectedAt: toIso(row.last_connected_at),
    lastDisconnectedAt: toIso(row.last_disconnected_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry))
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry))
      }
    } catch {
      return []
    }
  }

  return []
}

function mapAdsCustomerAccount(row: Record<string, unknown>): GoogleAdsCustomerAccountView {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    customerId: String(row.customer_id),
    displayName: (row.display_name as string | null) ?? null,
    currencyCode: (row.currency_code as string | null) ?? null,
    timeZone: (row.time_zone as string | null) ?? null,
    status: String(row.status) as GoogleAdsCustomerAccountView["status"],
    isSelected: Boolean(row.is_selected),
    discoveredAt: toIso(row.discovered_at) ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function mapLegacyScopes(value: unknown): string[] {
  return parseJsonArray(value)
}

export class GoogleOAuthRepository
implements ProviderConnectionLifecycleRepository, ProviderAccountDiscoveryRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async withTransaction<T>(work: () => Promise<T>) {
    return this.db.withTransaction(work)
  }

  async resolveProject(input: ResolveProjectInput): Promise<ResolveProjectResult> {
    const result = await this.db.query<{ id: string; workspace_id: string | null }>(
      {
        name: "google-oauth-resolve-project",
        text: `
          SELECT p.id, p.workspace_id
          FROM projects p
          WHERE p.organization_id = $1
            AND p.deleted_at IS NULL
            AND p.status = 'active'
            AND ($2::uuid IS NULL OR p.workspace_id = $2::uuid)
            AND ($3::uuid IS NULL OR p.id = $3::uuid)
          ORDER BY p.created_at DESC
          LIMIT 1
        `,
        values: [input.organizationId, input.workspaceId, input.projectId],
      }
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error("PROJECT_NOT_FOUND")
    }

    return {
      projectId: String(row.id),
      workspaceId: (row.workspace_id as string | null) ?? null,
    }
  }

  async savePendingState(input: GoogleOAuthStateRecord) {
    await this.db.query({
      name: "google-oauth-state-insert",
      text: `
        INSERT INTO google_oauth_states (
          id, state, organization_id, workspace_id, project_id, user_id, connection_id,
          requested_scopes, redirect_uri, status, expires_at, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$11
        )
      `,
      values: [
        input.id,
        input.state,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.userId,
        input.connectionId,
        JSON.stringify(input.requestedScopes),
        input.redirectUri,
        input.expiresAt,
        new Date().toISOString(),
      ],
    })
  }

  async saveUnifiedPendingState(input: GoogleOAuthStateRecord) {
    await this.db.query({
      name: "google-oauth-unified-state-insert",
      text: `
        INSERT INTO oauth_states (
          id, state, provider_family, provider_product,
          organization_id, workspace_id, project_id, user_id,
          oauth_account_id, connection_id,
          requested_scopes, redirect_uri,
          status, expires_at, consumed_at, created_at, updated_at
        ) VALUES (
          $1,$2,'google','ads',
          $3,$4,$5,$6,
          $7,$8,
          $9,$10,
          'pending',$11,NULL,$12,$12
        )
        ON CONFLICT (state) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          project_id = EXCLUDED.project_id,
          user_id = EXCLUDED.user_id,
          oauth_account_id = EXCLUDED.oauth_account_id,
          connection_id = EXCLUDED.connection_id,
          requested_scopes = EXCLUDED.requested_scopes,
          redirect_uri = EXCLUDED.redirect_uri,
          status = 'pending',
          expires_at = EXCLUDED.expires_at,
          consumed_at = NULL,
          updated_at = EXCLUDED.updated_at
      `,
      values: [
        input.id,
        input.state,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.userId,
        input.oauthAccountId,
        input.connectionId,
        JSON.stringify(input.requestedScopes),
        input.redirectUri,
        input.expiresAt,
        new Date().toISOString(),
      ],
    })
  }

  async findPendingStateByValue(state: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-state-find",
      text: "SELECT * FROM google_oauth_states WHERE state = $1 LIMIT 1",
      values: [state],
    })
    return result.rows[0] ?? null
  }

  async consumeStateOnce(stateId: string, consumedAt: string) {
    const result = await this.db.query({
      name: "google-oauth-state-consume",
      text: `
        UPDATE google_oauth_states
        SET status = 'consumed', consumed_at = $2, updated_at = $2
        WHERE id = $1
          AND status = 'pending'
          AND consumed_at IS NULL
          AND expires_at > $2::timestamptz
      `,
      values: [stateId, consumedAt],
    })

    return result.rowCount > 0
  }

  async consumeUnifiedStateByValue(state: string, consumedAt: string) {
    await this.db.query({
      name: "google-oauth-unified-state-consume",
      text: `
        UPDATE oauth_states
        SET status = 'consumed', consumed_at = $2, updated_at = $2
        WHERE state = $1
          AND status = 'pending'
          AND consumed_at IS NULL
          AND expires_at > $2::timestamptz
      `,
      values: [state, consumedAt],
    })
  }

  async upsertOAuthAccount(input: UpsertOAuthAccountInput) {
    await this.db.query({
      name: "google-oauth-unified-account-upsert",
      text: `
        INSERT INTO oauth_accounts (
          id, provider_family, organization_id, workspace_id,
          provider_subject_id, provider_email, provider_display_name,
          granted_scopes, status, last_authenticated_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,
          $8,$9,$10,
          $11,$11,$12,$12,NULL
        )
        ON CONFLICT (id) DO UPDATE SET
          provider_family = EXCLUDED.provider_family,
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          provider_subject_id = EXCLUDED.provider_subject_id,
          provider_email = EXCLUDED.provider_email,
          provider_display_name = EXCLUDED.provider_display_name,
          granted_scopes = EXCLUDED.granted_scopes,
          status = EXCLUDED.status,
          last_authenticated_at = EXCLUDED.last_authenticated_at,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      values: [
        input.id,
        input.providerFamily,
        input.organizationId,
        input.workspaceId,
        input.providerSubjectId,
        input.providerEmail,
        input.providerDisplayName,
        JSON.stringify(input.grantedScopes),
        input.status,
        input.lastAuthenticatedAt,
        input.actorUserId,
        input.nowIso,
      ],
    })
  }

  async upsertOAuthToken(input: UpsertOAuthTokenInput) {
    await this.db.query({
      name: "google-oauth-unified-token-revoke-active",
      text: `
        UPDATE oauth_tokens
        SET status = 'revoked',
            revoked_at = $2,
            updated_at = $2
        WHERE oauth_account_id = $1
          AND status = 'active'
      `,
      values: [input.oauthAccountId, input.nowIso],
    })

    await this.db.query({
      name: "google-oauth-unified-token-insert",
      text: `
        INSERT INTO oauth_tokens (
          id, oauth_account_id,
          encrypted_refresh_token, encrypted_access_token,
          token_type, token_expires_at, refresh_token_issued_at,
          status, created_at, updated_at, revoked_at
        ) VALUES (
          $1,$2,
          $3,$4,
          $5,$6,$7,
          'active',$8,$8,NULL
        )
      `,
      values: [
        randomUUID(),
        input.oauthAccountId,
        input.encryptedRefreshToken,
        input.encryptedAccessToken,
        input.tokenType,
        input.tokenExpiresAt,
        input.refreshTokenIssuedAt,
        input.nowIso,
      ],
    })
  }

  async upsertConnection(input: UpsertConnectionInput) {
    await this.db.query({
      name: "google-oauth-connection-upsert",
      text: `
        INSERT INTO google_oauth_connections (
          id, organization_id, workspace_id, project_id, data_source_id,
          provider_account_id, provider_account_name, provider_account_email,
          encrypted_refresh_token, encrypted_access_token, scopes, token_expires_at,
          status, connection_reference, last_connected_at, last_disconnected_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$18
        )
        ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          project_id = EXCLUDED.project_id,
          data_source_id = EXCLUDED.data_source_id,
          provider_account_id = EXCLUDED.provider_account_id,
          provider_account_name = EXCLUDED.provider_account_name,
          provider_account_email = EXCLUDED.provider_account_email,
          encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
          encrypted_access_token = EXCLUDED.encrypted_access_token,
          scopes = EXCLUDED.scopes,
          token_expires_at = EXCLUDED.token_expires_at,
          status = EXCLUDED.status,
          connection_reference = EXCLUDED.connection_reference,
          last_connected_at = EXCLUDED.last_connected_at,
          last_disconnected_at = EXCLUDED.last_disconnected_at,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      values: [
        input.id,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.dataSourceId,
        input.providerAccountId,
        input.providerAccountName,
        input.providerAccountEmail,
        input.encryptedRefreshToken,
        input.encryptedAccessToken,
        JSON.stringify(input.scopes),
        input.tokenExpiresAt,
        input.status,
        input.connectionReference,
        input.lastConnectedAt,
        input.lastDisconnectedAt,
        input.actorUserId,
        input.nowIso,
      ],
    })
  }

  async upsertIntegrationConnection(input: UpsertIntegrationConnectionInput) {
    await this.db.query({
      name: "google-oauth-unified-connection-upsert",
      text: `
        INSERT INTO integration_connections (
          id, provider_id, provider_family, platform,
          organization_id, workspace_id, project_id, oauth_account_id, data_source_id,
          connection_reference, configuration, status,
          last_connected_at, last_disconnected_at, last_synced_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,$8,$9,
          $10,'{}'::jsonb,$11,
          $12,$13,null,
          $14,$14,$15,$15,null
        )
        ON CONFLICT (id) DO UPDATE SET
          provider_id = EXCLUDED.provider_id,
          provider_family = EXCLUDED.provider_family,
          platform = EXCLUDED.platform,
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          project_id = EXCLUDED.project_id,
          oauth_account_id = EXCLUDED.oauth_account_id,
          data_source_id = EXCLUDED.data_source_id,
          connection_reference = EXCLUDED.connection_reference,
          status = EXCLUDED.status,
          last_connected_at = EXCLUDED.last_connected_at,
          last_disconnected_at = EXCLUDED.last_disconnected_at,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at,
          deleted_at = null
      `,
      values: [
        input.id,
        input.providerId,
        input.providerFamily,
        input.platform,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.oauthAccountId,
        input.dataSourceId,
        input.connectionReference,
        input.status,
        input.lastConnectedAt,
        input.lastDisconnectedAt,
        input.actorUserId,
        input.nowIso,
      ],
    })
  }

  async findConnectionById(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find",
      text: `
        SELECT
          ic.id,
          ic.organization_id,
          ic.workspace_id,
          ic.project_id,
          ic.data_source_id,
          g.provider_account_id,
          g.provider_account_name,
          g.provider_account_email,
          coalesce(g.scopes, '[]'::jsonb) AS scopes,
          g.token_expires_at,
          ic.status AS status,
          coalesce(ic.connection_reference, g.connection_reference) AS connection_reference,
          coalesce(ic.last_connected_at, g.last_connected_at) AS last_connected_at,
          coalesce(ic.last_disconnected_at, g.last_disconnected_at) AS last_disconnected_at,
          coalesce(ic.created_at, g.created_at) AS created_at,
          coalesce(ic.updated_at, g.updated_at) AS updated_at
        FROM integration_connections ic
        LEFT JOIN google_oauth_connections g
          ON g.deleted_at IS NULL
         AND g.provider = 'google_ads'
         AND (g.id = ic.id OR g.project_id = ic.project_id)
        WHERE ic.provider_id = 'google-ads'
          AND ic.deleted_at IS NULL
          AND (ic.id = $1 OR ic.oauth_account_id = $1)
        ORDER BY
          CASE WHEN g.id = ic.id THEN 0 ELSE 1 END,
          g.updated_at DESC NULLS LAST
        LIMIT 1
      `,
      values: [connectionId],
    })

    const row = result.rows[0]
    if (row) {
      return mapConnection({
        ...row,
        scopes: parseJsonArray(row.scopes),
      })
    }

    const fallbackResult = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-fallback",
      text: `
        SELECT *
        FROM google_oauth_connections
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [connectionId],
    })

    const fallbackRow = fallbackResult.rows[0]
    if (!fallbackRow) {
      return null
    }

    return mapConnection({
      ...fallbackRow,
      scopes: parseJsonArray(fallbackRow.scopes),
    })
  }

  async findConnectionTokensById(connectionId: string): Promise<ConnectionTokenRecord | null> {
    const unifiedResult = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-tokens-unified",
      text: `
        WITH target_runtime AS (
          SELECT ic.oauth_account_id
          FROM integration_connections ic
          WHERE ic.provider_id = 'google-ads'
            AND ic.deleted_at IS NULL
            AND (ic.id = $1 OR ic.oauth_account_id = $1)
          LIMIT 1
        )
        SELECT t.encrypted_refresh_token, t.encrypted_access_token
        FROM oauth_tokens t
        JOIN target_runtime tr
          ON tr.oauth_account_id = t.oauth_account_id
        WHERE t.status = 'active'
        ORDER BY
          t.updated_at DESC
        LIMIT 1
      `,
      values: [connectionId],
    })

    const unifiedRow = unifiedResult.rows[0]
    if (unifiedRow) {
      return {
        encryptedRefreshToken: (unifiedRow.encrypted_refresh_token as string | null) ?? null,
        encryptedAccessToken: (unifiedRow.encrypted_access_token as string | null) ?? null,
      }
    }

    const legacyResult = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-tokens-legacy",
      text: `
        WITH target_runtime AS (
          SELECT ic.project_id
          FROM integration_connections ic
          WHERE ic.provider_id = 'google-ads'
            AND ic.deleted_at IS NULL
            AND (ic.id = $1 OR ic.oauth_account_id = $1)
          LIMIT 1
        )
        SELECT g.encrypted_refresh_token, g.encrypted_access_token
        FROM google_oauth_connections g
        LEFT JOIN target_runtime tr
          ON tr.project_id = g.project_id
        WHERE g.deleted_at IS NULL
          AND g.provider = 'google_ads'
          AND (
            g.id = $1
            OR tr.project_id IS NOT NULL
          )
        ORDER BY
          CASE WHEN g.id = $1 THEN 0 ELSE 1 END,
          g.updated_at DESC
        LIMIT 1
      `,
      values: [connectionId],
    })

    const legacyRow = legacyResult.rows[0]
    if (!legacyRow) {
      return null
    }

    return {
      encryptedRefreshToken: (legacyRow.encrypted_refresh_token as string | null) ?? null,
      encryptedAccessToken: (legacyRow.encrypted_access_token as string | null) ?? null,
    }
  }

  async findConnectionOwnershipById(connectionId: string): Promise<ConnectionOwnershipRecord | null> {
    const integrationResult = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-ownership",
      text: `
        SELECT id, oauth_account_id, organization_id, workspace_id
        FROM integration_connections
        WHERE provider_id = 'google-ads'
          AND deleted_at IS NULL
          AND (id = $1 OR oauth_account_id = $1)
        LIMIT 1
      `,
      values: [connectionId],
    })

    const integrationRow = integrationResult.rows[0]
    if (integrationRow) {
      return {
        id: String(integrationRow.id),
        oauthAccountId: (integrationRow.oauth_account_id as string | null) ?? null,
        organizationId: String(integrationRow.organization_id),
        workspaceId: (integrationRow.workspace_id as string | null) ?? null,
      }
    }

    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-ownership-fallback",
      text: `
        SELECT id, organization_id, workspace_id
        FROM google_oauth_connections
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [connectionId],
    })

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      oauthAccountId: null,
      organizationId: String(row.organization_id),
      workspaceId: (row.workspace_id as string | null) ?? null,
    }
  }

  async findConnectionByProject(organizationId: string, projectId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-project",
      text: `
        SELECT
          ic.id,
          ic.organization_id,
          ic.workspace_id,
          ic.project_id,
          ic.data_source_id,
          g.provider_account_id,
          g.provider_account_name,
          g.provider_account_email,
          coalesce(g.scopes, '[]'::jsonb) AS scopes,
          g.token_expires_at,
          ic.status AS status,
          coalesce(ic.connection_reference, g.connection_reference) AS connection_reference,
          coalesce(ic.last_connected_at, g.last_connected_at) AS last_connected_at,
          coalesce(ic.last_disconnected_at, g.last_disconnected_at) AS last_disconnected_at,
          coalesce(ic.created_at, g.created_at) AS created_at,
          coalesce(ic.updated_at, g.updated_at) AS updated_at
        FROM integration_connections ic
        LEFT JOIN google_oauth_connections g
          ON g.deleted_at IS NULL
         AND g.provider = 'google_ads'
         AND (g.id = ic.id OR g.project_id = ic.project_id)
        WHERE ic.organization_id = $1
          AND ic.project_id = $2
          AND ic.provider_id = 'google-ads'
          AND ic.deleted_at IS NULL
        ORDER BY
          CASE WHEN g.id = ic.id THEN 0 ELSE 1 END,
          g.updated_at DESC NULLS LAST
        LIMIT 1
      `,
      values: [organizationId, projectId],
    })

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return mapConnection({
      ...row,
      scopes: parseJsonArray(row.scopes),
    })
  }

  async findRuntimeConnectionByProject(organizationId: string, projectId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-runtime-connection-find-project",
      text: `
        SELECT
          id,
          organization_id,
          workspace_id,
          project_id,
          data_source_id,
          status,
          connection_reference,
          last_connected_at,
          last_disconnected_at,
          last_synced_at,
          created_at,
          updated_at
        FROM integration_connections
        WHERE organization_id = $1
          AND project_id = $2
          AND provider_id = 'google-ads'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [organizationId, projectId],
    })

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      workspaceId: (row.workspace_id as string | null) ?? null,
      projectId: String(row.project_id),
      dataSourceId: (row.data_source_id as string | null) ?? null,
      status: String(row.status),
      connectionReference: (row.connection_reference as string | null) ?? null,
      lastConnectedAt: toIso(row.last_connected_at),
      lastDisconnectedAt: toIso(row.last_disconnected_at),
      lastSyncedAt: toIso(row.last_synced_at),
      createdAt: toIso(row.created_at) ?? "",
      updatedAt: toIso(row.updated_at) ?? "",
    }
  }

  async findRuntimeConnectionById(connectionId: string): Promise<RuntimeConnectionRecord | null> {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-runtime-connection-find-id",
      text: `
        SELECT
          id,
          provider_id,
          provider_family,
          platform,
          organization_id,
          workspace_id,
          project_id,
          oauth_account_id,
          data_source_id,
          connection_reference
        FROM integration_connections
        WHERE id = $1
          AND provider_id = 'google-ads'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [connectionId],
    })

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      providerId: String(row.provider_id),
      providerFamily: String(row.provider_family),
      platform: String(row.platform),
      organizationId: String(row.organization_id),
      workspaceId: (row.workspace_id as string | null) ?? null,
      projectId: String(row.project_id),
      oauthAccountId: (row.oauth_account_id as string | null) ?? null,
      dataSourceId: (row.data_source_id as string | null) ?? null,
      connectionReference: (row.connection_reference as string | null) ?? null,
    }
  }

  async setConnectionLifecycleStatus(input: {
    connectionId: string
    status: "connected" | "paused" | "disconnected"
    actorUserId: string
    occurredAt: string
  }) {
    const runtimeConnection = await this.findRuntimeConnectionById(input.connectionId)
    if (!runtimeConnection) {
      return null
    }

    const connection = await this.findConnectionById(input.connectionId)
    if (!connection) {
      return null
    }

    const nextLastConnectedAt =
      input.status === "connected" ? input.occurredAt : connection.lastConnectedAt
    const nextLastDisconnectedAt =
      input.status === "disconnected"
        ? input.occurredAt
        : input.status === "connected"
          ? null
          : connection.lastDisconnectedAt

    await this.db.query({
      name: "google-oauth-runtime-connection-lifecycle-update",
      text: `
        UPDATE integration_connections
        SET status = $2,
            last_connected_at = $3,
            last_disconnected_at = $4,
            updated_by_user_id = $5,
            updated_at = $6
        WHERE id = $1
          AND provider_id = 'google-ads'
          AND deleted_at IS NULL
      `,
      values: [
        runtimeConnection.id,
        input.status,
        nextLastConnectedAt,
        nextLastDisconnectedAt,
        input.actorUserId,
        input.occurredAt,
      ],
    })

    return this.findConnectionById(connection.id)
  }

  async reconcileGoogleAdsSyncRuntimeState(input: {
    connectionId: string
    actorUserId: string
    occurredAt: string
    reason: string
  }): Promise<SyncRuntimeReconciliationResult> {
    const failedRuns = await this.db.query<{ id: string }>({
      name: "google-ads-sync-runs-mark-failed-on-lifecycle",
      text: `
        UPDATE google_ads_sync_runs
        SET status = 'failed',
            error_code = 'GOOGLE_ADS_SYNC_ABORTED',
            error_message = $4,
            completed_at = COALESCE(completed_at, $2),
            updated_by_user_id = $3,
            updated_at = $2
        WHERE connection_id = $1
          AND status IN ('pending', 'running')
        RETURNING id
      `,
      values: [
        input.connectionId,
        input.occurredAt,
        input.actorUserId,
        `Sync interrupted: ${input.reason}`.slice(0, 240),
      ],
    })

    const releasedLocks = await this.db.query<{ id: string }>({
      name: "google-ads-sync-locks-release-on-lifecycle",
      text: `
        DELETE FROM google_ads_sync_locks
        WHERE connection_id = $1
        RETURNING id
      `,
      values: [input.connectionId],
    })

    return {
      releasedLocks: releasedLocks.rows.length,
      failedRuns: failedRuns.rows.length,
    }
  }

  async isGoogleAdsSyncRunRunning(syncRunId: string) {
    const result = await this.db.query<{ status: string }>({
      name: "google-ads-sync-run-status",
      text: `
        SELECT status
        FROM google_ads_sync_runs
        WHERE id = $1
        LIMIT 1
      `,
      values: [syncRunId],
    })

    return result.rows[0]?.status === "running"
  }

  async findConnectionByOAuthAccountId(oauthAccountId: string) {
    void oauthAccountId
    return null
  }

  async saveEvent(connectionId: string, eventType: string, metadata: Record<string, unknown>) {
    await this.db.query({
      name: "google-oauth-event-insert",
      text: `
        INSERT INTO google_oauth_events (id, connection_id, event_type, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      values: [randomUUID(), connectionId, eventType, JSON.stringify(metadata), new Date().toISOString()],
    })
  }

  async appendAuditLog(input: {
    actorUserId: string
    organizationId: string
    workspaceId: string | null
    action: string
    entityId: string
    metadata: Record<string, unknown>
    createdAt: string
  }) {
    await this.db.query({
      name: "google-oauth-audit-insert",
      text: `
        INSERT INTO audit_logs (
          id, actor_user_id, organization_id, workspace_id, action, entity_type, entity_id, metadata, created_at
        ) VALUES ($1,$2,$3,$4,$5,'google_oauth_connection',$6,$7,$8)
      `,
      values: [
        randomUUID(),
        input.actorUserId,
        input.organizationId,
        input.workspaceId,
        input.action,
        input.entityId,
        JSON.stringify(input.metadata),
        input.createdAt,
      ],
    })
  }

  async appendOutboxEvent(input: {
    eventType: string
    aggregateId: string
    occurredAt: string
    metadata: Record<string, unknown>
    payload: Record<string, unknown>
  }) {
    await this.db.query({
      name: "google-oauth-outbox-insert",
      text: `
        INSERT INTO outbox_events (
          id, event_type, event_version, aggregate_type, aggregate_id,
          occurred_at, metadata, payload, status, attempts, created_at
        ) VALUES ($1,$2,1,'google_oauth_connection',$3,$4,$5,$6,'pending',0,$4)
      `,
      values: [
        randomUUID(),
        input.eventType,
        input.aggregateId,
        input.occurredAt,
        JSON.stringify(input.metadata),
        JSON.stringify(input.payload),
      ],
    })
  }

  async listRecentOutboxEvents(connectionId: string, limit: number): Promise<GoogleOAuthRecentEventView[]> {
    const result = await this.db.query<RecentOutboxEventRecord>({
      name: "google-oauth-outbox-recent-list",
      text: `
        SELECT
          id,
          event_type AS "eventType",
          occurred_at AS "occurredAt",
          metadata,
          payload
        FROM outbox_events
        WHERE aggregate_type = 'google_oauth_connection'
          AND aggregate_id = $1
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT $2
      `,
      values: [connectionId, Math.max(1, Math.min(limit, 100))],
    })

    return result.rows.map((row) => ({
      id: String(row.id),
      eventType: String(row.eventType),
      occurredAt: toIso(row.occurredAt) ?? new Date().toISOString(),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      payload: (row.payload as Record<string, unknown>) ?? {},
    }))
  }

  async replaceAccessibleCustomerAccounts(input: ReplaceAccessibleCustomerAccountsInput) {
    const normalizedAccounts = Array.from(
      new Map(
        input.accounts
          .map((account) => ({
            customerId: account.customerId.trim(),
            displayName: account.displayName,
            currencyCode: account.currencyCode,
            timeZone: account.timeZone,
          }))
          .filter((account) => account.customerId.length > 0)
          .map((account) => [account.customerId, account])
      ).values()
    )

    if (normalizedAccounts.length === 0) {
      throw new Error("GOOGLE_ADS_CUSTOMER_DISCOVERY_EMPTY")
    }

    const existingSelected = await this.db.query<{ customer_id: string }>(
      {
        name: "google-ads-customer-account-selected",
        text: `
          SELECT customer_id
          FROM google_ads_customer_accounts
          WHERE connection_id = $1
            AND is_selected = true
          LIMIT 1
        `,
        values: [input.connectionId],
      }
    )

    const candidateSelected = input.selectedCustomerId && normalizedAccounts.some((account) => account.customerId === input.selectedCustomerId)
      ? input.selectedCustomerId
      : existingSelected.rows[0]?.customer_id ?? normalizedAccounts[0].customerId

    await this.db.query({
      name: "google-ads-customer-account-deactivate-missing",
      text: `
        UPDATE google_ads_customer_accounts
        SET status = 'inactive',
            is_selected = false,
            updated_at = now()
        WHERE connection_id = $1
      `,
      values: [input.connectionId],
    })

    for (const account of normalizedAccounts) {
      await this.db.query({
        name: "google-ads-customer-account-upsert",
        text: `
          INSERT INTO google_ads_customer_accounts (
            id, connection_id, customer_id, display_name, currency_code, time_zone,
            status, is_selected, discovered_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'active', false, now(), now(), now()
          )
          ON CONFLICT (connection_id, customer_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            currency_code = EXCLUDED.currency_code,
            time_zone = EXCLUDED.time_zone,
            status = 'active',
            discovered_at = now(),
            updated_at = now()
        `,
        values: [
          randomUUID(),
          input.connectionId,
          account.customerId,
          account.displayName,
          account.currencyCode,
          account.timeZone,
        ],
      })
    }

    await this.db.query({
      name: "google-ads-customer-account-clear-selected",
      text: `
        UPDATE google_ads_customer_accounts
        SET is_selected = false,
            updated_at = now()
        WHERE connection_id = $1
      `,
      values: [input.connectionId],
    })

    await this.db.query({
      name: "google-ads-customer-account-set-selected",
      text: `
        UPDATE google_ads_customer_accounts
        SET is_selected = true,
            updated_at = now()
        WHERE connection_id = $1
          AND customer_id = $2
          AND status = 'active'
      `,
      values: [input.connectionId, candidateSelected],
    })
  }

  async listAccessibleCustomerAccounts(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-ads-customer-account-list",
      text: `
        SELECT *
        FROM google_ads_customer_accounts
        WHERE connection_id = $1
          AND status = 'active'
        ORDER BY is_selected DESC, updated_at DESC
      `,
      values: [connectionId],
    })

    return result.rows.map(mapAdsCustomerAccount)
  }

  async findAccessibleCustomerAccount(connectionId: string, customerId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-ads-customer-account-find",
      text: `
        SELECT *
        FROM google_ads_customer_accounts
        WHERE connection_id = $1
          AND customer_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      values: [connectionId, customerId],
    })

    return result.rows[0] ? mapAdsCustomerAccount(result.rows[0]) : null
  }

  async findSelectedAccessibleCustomerAccount(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-ads-customer-account-find-selected",
      text: `
        SELECT *
        FROM google_ads_customer_accounts
        WHERE connection_id = $1
          AND is_selected = true
          AND status = 'active'
        LIMIT 1
      `,
      values: [connectionId],
    })

    return result.rows[0] ? mapAdsCustomerAccount(result.rows[0]) : null
  }

  async selectAccessibleCustomerAccount(input: {
    connectionId: string
    customerId: string
  }) {
    const target = await this.findAccessibleCustomerAccount(input.connectionId, input.customerId)
    if (!target) {
      return null
    }

    await this.db.query({
      name: "google-ads-customer-account-select-clear",
      text: `
        UPDATE google_ads_customer_accounts
        SET is_selected = false,
            updated_at = now()
        WHERE connection_id = $1
      `,
      values: [input.connectionId],
    })

    await this.db.query({
      name: "google-ads-customer-account-select-set",
      text: `
        UPDATE google_ads_customer_accounts
        SET is_selected = true,
            updated_at = now()
        WHERE connection_id = $1
          AND customer_id = $2
          AND status = 'active'
      `,
      values: [input.connectionId, input.customerId],
    })

    return this.findSelectedAccessibleCustomerAccount(input.connectionId)
  }

  async deleteConnectionCascade(connectionId: string) {
    const integrationConnections = await this.db.query<{
      id: string
      oauth_account_id: string | null
      organization_id: string
      project_id: string
    }>({
      name: "google-oauth-delete-integration-connections-find",
      text: `
        SELECT id, oauth_account_id, organization_id, project_id
        FROM integration_connections
        WHERE id = $1
           OR oauth_account_id = $1
      `,
      values: [connectionId],
    })

    const integrationConnectionIds = Array.from(
      new Set([
        connectionId,
        ...integrationConnections.rows.map((row) => String(row.id)),
      ])
    )

    const oauthAccountIds = Array.from(
      new Set([
        connectionId,
        ...integrationConnections.rows
          .map((row) => row.oauth_account_id)
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value)),
      ])
    )

    const legacyOauthConnections = integrationConnections.rows.length > 0
      ? await this.db.query<{ id: string }>({
        name: "google-oauth-delete-legacy-connections-find",
        text: `
          SELECT DISTINCT g.id
          FROM google_oauth_connections g
          LEFT JOIN integration_connections ic
            ON ic.provider_id = 'google-ads'
           AND ic.organization_id = g.organization_id
           AND ic.project_id = g.project_id
          WHERE g.provider = 'google_ads'
            AND (
              g.id = ANY($1::uuid[])
              OR ic.id = ANY($2::uuid[])
            )
        `,
        values: [oauthAccountIds, integrationConnectionIds],
      })
      : { rows: [] }

    const allConnectionIds = Array.from(
      new Set([
        ...integrationConnectionIds,
        ...oauthAccountIds,
        ...legacyOauthConnections.rows.map((row) => String(row.id)),
      ])
    )

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_ads_sync_cursors WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_ads_sync_checkpoints WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_ads_sync_locks WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_ads_domain_records WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    await this.db.query({
      name: "google-ads-delete-marketing-campaigns",
      text: `
        DELETE FROM marketing_campaigns
        WHERE integration_connection_id = ANY($1::uuid[])
      `,
      values: [integrationConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-daily-metrics",
      text: "DELETE FROM google_ads_daily_metrics WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-campaigns",
      text: "DELETE FROM google_ads_campaigns WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-ad-groups",
      text: "DELETE FROM google_ads_ad_groups WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-ads",
      text: "DELETE FROM google_ads_ads WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-keywords",
      text: "DELETE FROM google_ads_keywords WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    await this.db.query({
      name: "google-ads-delete-conversion-actions",
      text: "DELETE FROM google_ads_conversion_actions WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_ads_sync_runs WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    await this.db.query({
      name: "google-ads-delete-customer-accounts",
      text: "DELETE FROM google_ads_customer_accounts WHERE connection_id = ANY($1::uuid[])",
      values: [allConnectionIds],
    })

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_oauth_states WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    for (const targetConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_oauth_events WHERE connection_id = $1",
        [targetConnectionId]
      )
    }

    for (const runtimeConnectionId of integrationConnectionIds) {
      await this.db.query(
        "DELETE FROM oauth_states WHERE connection_id = $1",
        [runtimeConnectionId]
      )
    }

    for (const runtimeOauthAccountId of oauthAccountIds) {
      await this.db.query(
        "DELETE FROM oauth_states WHERE oauth_account_id = $1",
        [runtimeOauthAccountId]
      )
    }

    for (const runtimeConnectionId of integrationConnectionIds) {
      await this.db.query(
        "DELETE FROM integration_connections WHERE id = $1",
        [runtimeConnectionId]
      )
    }

    await this.db.query({
      name: "google-unified-delete-oauth-accounts",
      text: `
        DELETE FROM oauth_accounts
        WHERE id = ANY($1::uuid[])
          AND id NOT IN (
            SELECT ic.oauth_account_id
            FROM integration_connections ic
            WHERE ic.oauth_account_id IS NOT NULL
          )
      `,
      values: [oauthAccountIds],
    })

    for (const legacyConnectionId of allConnectionIds) {
      await this.db.query(
        "DELETE FROM google_oauth_connections WHERE id = $1",
        [legacyConnectionId]
      )
    }
  }

}
