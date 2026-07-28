import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type {
  ProviderAccountDiscoveryRepository,
  ProviderConnectionLifecycleRepository,
} from "../integrations/provider-repositories"

import type { GoogleAdsCustomerAccountView, GoogleOAuthConnectionView } from "./types"

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
  status: "pending" | "connected" | "disconnected" | "error"
  connectionReference: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  actorUserId: string
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
        INSERT INTO oauth_states (
          id, state, provider_family, provider_product,
          organization_id, workspace_id, project_id, user_id, oauth_account_id,
          requested_scopes, redirect_uri, status, expires_at, created_at, updated_at
        ) VALUES (
          $1,$2,'google','ads',$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$11
        )
      `,
      values: [
        input.id,
        input.state,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.userId,
        input.oauthAccountId,
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
      text: "SELECT * FROM oauth_states WHERE state = $1 AND provider_family = 'google' LIMIT 1",
      values: [state],
    })
    return result.rows[0] ?? null
  }

  async consumeStateOnce(stateId: string, consumedAt: string) {
    const result = await this.db.query({
      name: "google-oauth-state-consume",
      text: `
        UPDATE oauth_states
        SET status = 'consumed', consumed_at = $2, updated_at = $2
        WHERE id = $1
          AND provider_family = 'google'
          AND status = 'pending'
          AND consumed_at IS NULL
          AND expires_at > $2::timestamptz
      `,
      values: [stateId, consumedAt],
    })

    return result.rowCount > 0
  }

  async upsertConnection(input: UpsertConnectionInput) {
    await this.db.query({
      name: "google-oauth-account-upsert",
      text: `
        INSERT INTO oauth_accounts (
          id, provider_family, organization_id, workspace_id,
          provider_subject_id, provider_email, provider_display_name,
          granted_scopes, status, last_authenticated_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at
        ) VALUES (
          $1, 'google', $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $10, $11, $11, null
        )
        ON CONFLICT (id) DO UPDATE SET
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
          deleted_at = null
      `,
      values: [
        input.oauthAccountId,
        input.organizationId,
        input.workspaceId,
        input.providerAccountId,
        input.providerAccountEmail,
        input.providerAccountName,
        JSON.stringify(input.scopes),
        input.status,
        input.lastConnectedAt,
        input.actorUserId,
        input.nowIso,
      ],
    })

    if (input.encryptedAccessToken || input.encryptedRefreshToken || input.tokenExpiresAt) {
      await this.db.query({
        name: "google-oauth-tokens-revoke-active",
        text: `
          UPDATE oauth_tokens
          SET status = 'revoked', revoked_at = $2, updated_at = $2
          WHERE oauth_account_id = $1
            AND status = 'active'
        `,
        values: [input.oauthAccountId, input.nowIso],
      })

      await this.db.query({
        name: "google-oauth-token-insert",
        text: `
          INSERT INTO oauth_tokens (
            id, oauth_account_id, encrypted_refresh_token, encrypted_access_token,
            token_type, token_expires_at, refresh_token_issued_at,
            status, created_at, updated_at, revoked_at
          ) VALUES (
            $1, $2, $3, $4,
            'Bearer', $5, $6,
            'active', $6, $6, null
          )
        `,
        values: [
          randomUUID(),
          input.oauthAccountId,
          input.encryptedRefreshToken,
          input.encryptedAccessToken,
          input.tokenExpiresAt,
          input.nowIso,
        ],
      })
    }

    await this.db.query({
      name: "google-oauth-integration-connection-upsert",
      text: `
        INSERT INTO integration_connections (
          id, provider_id, provider_family, platform,
          organization_id, workspace_id, project_id, oauth_account_id, data_source_id,
          connection_reference, configuration, status,
          last_connected_at, last_disconnected_at, last_synced_at,
          created_by_user_id, updated_by_user_id, created_at, updated_at, deleted_at
        ) VALUES (
          $1, 'google-ads', 'google', 'marketing',
          $2, $3, $4, $5, $6,
          $7, '{}'::jsonb, $8,
          $9, $10, null,
          $11, $11, $12, $12, null
        )
        ON CONFLICT (id) DO UPDATE SET
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

    // Keep legacy table in sync for backward compatibility with existing Google Ads tables.
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

  async findConnectionById(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find",
      text: `
        SELECT
          c.id,
          c.oauth_account_id,
          c.organization_id,
          c.workspace_id,
          c.project_id,
          c.data_source_id,
          a.provider_subject_id AS provider_account_id,
          a.provider_display_name AS provider_account_name,
          a.provider_email AS provider_account_email,
          a.granted_scopes AS scopes,
          c.status,
          c.connection_reference,
          c.last_connected_at,
          c.last_disconnected_at,
          c.created_at,
          c.updated_at
        FROM integration_connections c
        LEFT JOIN oauth_accounts a ON a.id = c.oauth_account_id
        WHERE c.id = $1
          AND c.provider_id = 'google-ads'
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      values: [connectionId],
    })

    if (!result.rows[0]) {
      const legacyResult = await this.db.query<Record<string, unknown>>({
        name: "google-oauth-connection-find-legacy",
        text: "SELECT * FROM google_oauth_connections WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
        values: [connectionId],
      })

      const legacyRow = legacyResult.rows[0]
      if (!legacyRow) {
        return null
      }

      return mapConnection({
        ...legacyRow,
        scopes: mapLegacyScopes(legacyRow.scopes),
      })
    }

    const row = result.rows[0]
    const tokenExpiresAt = row.oauth_account_id
      ? await this.findActiveTokenExpiresAt(String(row.oauth_account_id))
      : null

    return mapConnection({
      ...row,
      token_expires_at: tokenExpiresAt,
      scopes: parseJsonArray(row.scopes),
    })
  }

  async findConnectionOwnershipById(connectionId: string): Promise<ConnectionOwnershipRecord | null> {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-ownership",
      text: `
        SELECT id, oauth_account_id, organization_id, workspace_id
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
      const legacyResult = await this.db.query<Record<string, unknown>>({
        name: "google-oauth-connection-find-ownership-legacy",
        text: `
          SELECT id, organization_id, workspace_id
          FROM google_oauth_connections
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        values: [connectionId],
      })

      const legacyRow = legacyResult.rows[0]
      if (!legacyRow) {
        return null
      }

      return {
        id: String(legacyRow.id),
        oauthAccountId: null,
        organizationId: String(legacyRow.organization_id),
        workspaceId: (legacyRow.workspace_id as string | null) ?? null,
      }
    }

    return {
      id: String(row.id),
      oauthAccountId: (row.oauth_account_id as string | null) ?? null,
      organizationId: String(row.organization_id),
      workspaceId: (row.workspace_id as string | null) ?? null,
    }
  }

  async findConnectionByProject(organizationId: string, projectId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-project",
      text: `
        SELECT
          c.id,
          c.oauth_account_id,
          c.organization_id,
          c.workspace_id,
          c.project_id,
          c.data_source_id,
          a.provider_subject_id AS provider_account_id,
          a.provider_display_name AS provider_account_name,
          a.provider_email AS provider_account_email,
          a.granted_scopes AS scopes,
          c.status,
          c.connection_reference,
          c.last_connected_at,
          c.last_disconnected_at,
          c.created_at,
          c.updated_at
        FROM integration_connections c
        LEFT JOIN oauth_accounts a ON a.id = c.oauth_account_id
        WHERE c.organization_id = $1
          AND c.project_id = $2
          AND c.provider_id = 'google-ads'
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      values: [organizationId, projectId],
    })

    if (!result.rows[0]) {
      const legacyResult = await this.db.query<Record<string, unknown>>({
        name: "google-oauth-connection-find-project-legacy",
        text: `
          SELECT *
          FROM google_oauth_connections
          WHERE organization_id = $1
            AND project_id = $2
            AND provider = 'google_ads'
            AND deleted_at IS NULL
          LIMIT 1
        `,
        values: [organizationId, projectId],
      })

      const legacyRow = legacyResult.rows[0]
      if (!legacyRow) {
        return null
      }

      return mapConnection({
        ...legacyRow,
        scopes: mapLegacyScopes(legacyRow.scopes),
      })
    }

    const row = result.rows[0]
    const tokenExpiresAt = row.oauth_account_id
      ? await this.findActiveTokenExpiresAt(String(row.oauth_account_id))
      : null

    return mapConnection({
      ...row,
      token_expires_at: tokenExpiresAt,
      scopes: parseJsonArray(row.scopes),
    })
  }

  async findConnectionByOAuthAccountId(oauthAccountId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "google-oauth-connection-find-oauth-account",
      text: `
        SELECT
          c.id,
          c.oauth_account_id,
          c.organization_id,
          c.workspace_id,
          c.project_id,
          c.data_source_id,
          a.provider_subject_id AS provider_account_id,
          a.provider_display_name AS provider_account_name,
          a.provider_email AS provider_account_email,
          a.granted_scopes AS scopes,
          c.status,
          c.connection_reference,
          c.last_connected_at,
          c.last_disconnected_at,
          c.created_at,
          c.updated_at
        FROM integration_connections c
        LEFT JOIN oauth_accounts a ON a.id = c.oauth_account_id
        WHERE c.oauth_account_id = $1
          AND c.provider_id = 'google-ads'
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      values: [oauthAccountId],
    })

    if (!result.rows[0]) {
      return null
    }

    const row = result.rows[0]
    const tokenExpiresAt = row.oauth_account_id
      ? await this.findActiveTokenExpiresAt(String(row.oauth_account_id))
      : null

    return mapConnection({
      ...row,
      token_expires_at: tokenExpiresAt,
      scopes: parseJsonArray(row.scopes),
    })
  }

  private async findActiveTokenExpiresAt(oauthAccountId: string) {
    const tokenResult = await this.db.query<{ token_expires_at: string | null }>(
      {
        name: "google-oauth-token-expires-active",
        text: `
          SELECT token_expires_at
          FROM oauth_tokens
          WHERE oauth_account_id = $1
            AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        values: [oauthAccountId],
      }
    )

    return tokenResult.rows[0]?.token_expires_at ?? null
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

    await this.db.query({
      name: "google-ads-connection-touch-selected",
      text: `
        UPDATE integration_connections
        SET status = 'connected',
            updated_at = now()
        WHERE id = $1
          AND provider_id = 'google-ads'
      `,
      values: [input.connectionId],
    })

    return this.findSelectedAccessibleCustomerAccount(input.connectionId)
  }

  async deleteConnectionCascade(connectionId: string) {
    const ownership = await this.findConnectionOwnershipById(connectionId)

    await this.db.query({
      name: "google-oauth-delete-outbox-events",
      text: `
        DELETE FROM outbox_events
        WHERE aggregate_type = 'google_oauth_connection'
          AND aggregate_id = $1
      `,
      values: [connectionId],
    })

    await this.db.query({
      name: "google-oauth-delete-token-refresh-history",
      text: `
        DELETE FROM token_refresh_history
        WHERE integration_connection_id = $1
      `,
      values: [connectionId],
    })

    await this.db.query({
      name: "google-oauth-delete-integration-connection",
      text: "DELETE FROM integration_connections WHERE id = $1 AND provider_id = 'google-ads'",
      values: [connectionId],
    })

    if (ownership?.oauthAccountId) {
      await this.db.query({
        name: "google-oauth-delete-oauth-states",
        text: "DELETE FROM oauth_states WHERE oauth_account_id = $1 AND provider_family = 'google'",
        values: [ownership.oauthAccountId],
      })

      await this.db.query({
        name: "google-oauth-delete-oauth-tokens",
        text: "DELETE FROM oauth_tokens WHERE oauth_account_id = $1",
        values: [ownership.oauthAccountId],
      })

      await this.db.query({
        name: "google-oauth-delete-oauth-account-if-unused",
        text: `
          DELETE FROM oauth_accounts
          WHERE id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM integration_connections c
              WHERE c.oauth_account_id = $1
                AND c.deleted_at IS NULL
            )
        `,
        values: [ownership.oauthAccountId],
      })
    }

    await this.db.query({
      name: "google-oauth-delete-audit-logs",
      text: `
        DELETE FROM audit_logs
        WHERE entity_type = 'google_oauth_connection'
          AND entity_id = $1
      `,
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-sync-cursors",
      text: "DELETE FROM google_ads_sync_cursors WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-sync-checkpoints",
      text: "DELETE FROM google_ads_sync_checkpoints WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-sync-locks",
      text: "DELETE FROM google_ads_sync_locks WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-domain-records",
      text: "DELETE FROM google_ads_domain_records WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-sync-runs",
      text: "DELETE FROM google_ads_sync_runs WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-ads-delete-customer-accounts",
      text: "DELETE FROM google_ads_customer_accounts WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-oauth-delete-events",
      text: "DELETE FROM google_oauth_events WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-oauth-delete-states",
      text: "DELETE FROM google_oauth_states WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "google-oauth-delete-connection",
      text: "DELETE FROM google_oauth_connections WHERE id = $1",
      values: [connectionId],
    })
  }

}
