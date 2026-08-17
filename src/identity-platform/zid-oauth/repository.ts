import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type {
  ProviderAccountDiscoveryRepository,
  ProviderConnectionLifecycleRepository,
} from "../integrations/provider-repositories"

import type { ZidOAuthConnectionView, ZidStoreView } from "./types"

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function mapConnection(row: Record<string, unknown>): ZidOAuthConnectionView {
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
    status: String(row.status) as ZidOAuthConnectionView["status"],
    connectionReference: (row.connection_reference as string | null) ?? null,
    lastConnectedAt: toIso(row.last_connected_at),
    lastDisconnectedAt: toIso(row.last_disconnected_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function mapZidStore(row: Record<string, unknown>): ZidStoreView {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    customerId: String(row.account_id),
    displayName: (row.account_name as string | null) ?? null,
    currencyCode: (row.currency_code as string | null) ?? null,
    timeZone: (row.time_zone as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    organizationName: (row.organization_name as string | null) ?? null,
    status: String(row.status) as ZidStoreView["status"],
    isSelected: Boolean(row.is_selected),
    discoveredAt: toIso(row.discovered_at) ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

export class ZidOAuthRepository
  implements ProviderConnectionLifecycleRepository, ProviderAccountDiscoveryRepository
{
  constructor(private readonly db: PostgresDatabase) {}

  async withTransaction<T>(work: () => Promise<T>) {
    return this.db.withTransaction(work)
  }

  async resolveProject(input: {
    organizationId: string
    workspaceId: string | null
    projectId: string | null
  }) {
    const result = await this.db.query<{ id: string; workspace_id: string | null }>({
      name: "zid-oauth-resolve-project",
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
    })

    const row = result.rows[0]
    if (!row) {
      throw new Error("PROJECT_NOT_FOUND")
    }

    return {
      projectId: String(row.id),
      workspaceId: (row.workspace_id as string | null) ?? null,
    }
  }

  async savePendingState(input: {
    id: string
    state: string
    organizationId: string
    workspaceId: string | null
    projectId: string
    userId: string
    connectionId: string
    requestedScopes: string[]
    redirectUri: string
    expiresAt: string
  }) {
    await this.db.query({
      name: "zid-oauth-state-insert",
      text: `
        INSERT INTO zid_oauth_states (
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

  async findPendingStateByValue(state: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "zid-oauth-state-find",
      text: "SELECT * FROM zid_oauth_states WHERE state = $1 LIMIT 1",
      values: [state],
    })
    return result.rows[0] ?? null
  }

  async consumeStateOnce(stateId: string, consumedAt: string) {
    const result = await this.db.query({
      name: "zid-oauth-state-consume",
      text: `
        UPDATE zid_oauth_states
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

  async upsertConnection(input: {
    id: string
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
  }) {
    await this.db.query({
      name: "zid-oauth-connection-upsert",
      text: `
        INSERT INTO zid_oauth_connections (
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
      name: "zid-oauth-connection-find",
      text: "SELECT * FROM zid_oauth_connections WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      values: [connectionId],
    })

    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async findConnectionOwnershipById(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "zid-oauth-connection-find-ownership",
      text: `
        SELECT id, organization_id, workspace_id
        FROM zid_oauth_connections
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
      organizationId: String(row.organization_id),
      workspaceId: (row.workspace_id as string | null) ?? null,
    }
  }

  async findConnectionByProject(organizationId: string, projectId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "zid-oauth-connection-find-project",
      text: `
        SELECT *
        FROM zid_oauth_connections
        WHERE organization_id = $1
          AND project_id = $2
          AND provider = 'zid'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [organizationId, projectId],
    })

    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async saveEvent(connectionId: string, eventType: string, metadata: Record<string, unknown>) {
    await this.db.query({
      name: "zid-oauth-event-insert",
      text: `
        INSERT INTO zid_oauth_events (id, connection_id, event_type, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      values: [
        randomUUID(),
        connectionId,
        eventType,
        JSON.stringify(metadata),
        new Date().toISOString(),
      ],
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
      name: "zid-oauth-audit-insert",
      text: `
        INSERT INTO audit_logs (
          id, actor_user_id, organization_id, workspace_id, action, entity_type, entity_id, metadata, created_at
        ) VALUES ($1,$2,$3,$4,$5,'zid_oauth_connection',$6,$7,$8)
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
      name: "zid-oauth-outbox-insert",
      text: `
        INSERT INTO outbox_events (
          id, event_type, event_version, aggregate_type, aggregate_id,
          occurred_at, metadata, payload, status, attempts, created_at
        ) VALUES ($1,$2,1,'zid_oauth_connection',$3,$4,$5,$6,'pending',0,$4)
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

  async replaceAccessibleCustomerAccounts(input: {
    connectionId: string
    actorUserId: string
    selectedCustomerId: string | null
    accounts: Array<{
      customerId: string
      displayName: string | null
      currencyCode: string | null
      timeZone: string | null
      organizationId?: string | null
      organizationName?: string | null
      status?: "active" | "inactive"
    }>
  }) {
    const normalizedAccounts = Array.from(
      new Map(
        input.accounts
          .map((account) => ({
            customerId: account.customerId.trim(),
            displayName: account.displayName,
            currencyCode: account.currencyCode,
            timeZone: account.timeZone,
            organizationId: account.organizationId ?? null,
            organizationName: account.organizationName ?? null,
            status: account.status ?? "active",
          }))
          .filter((account) => account.customerId.length > 0)
          .map((account) => [account.customerId, account])
      ).values()
    )

    if (normalizedAccounts.length === 0) {
      throw new Error("ZID_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
    }

    const existingSelected = await this.db.query<{ account_id: string }>({
      name: "zid-store-selected",
      text: `
          SELECT account_id
          FROM zid_stores
          WHERE connection_id = $1
            AND is_selected = true
          LIMIT 1
        `,
      values: [input.connectionId],
    })

    const candidateSelected =
      input.selectedCustomerId &&
      normalizedAccounts.some((account) => account.customerId === input.selectedCustomerId)
        ? input.selectedCustomerId
        : (existingSelected.rows[0]?.account_id ?? normalizedAccounts[0].customerId)

    await this.db.query({
      name: "zid-store-deactivate-missing",
      text: `
        UPDATE zid_stores
        SET status = 'inactive',
            is_selected = false,
            updated_at = now()
        WHERE connection_id = $1
      `,
      values: [input.connectionId],
    })

    for (const account of normalizedAccounts) {
      await this.db.query({
        name: "zid-store-upsert",
        text: `
          INSERT INTO zid_stores (
            id, connection_id, account_id, account_name, currency_code, time_zone,
            organization_id, organization_name, status, is_selected, discovered_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, false, now(), now(), now()
          )
          ON CONFLICT (connection_id, account_id) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            currency_code = EXCLUDED.currency_code,
            time_zone = EXCLUDED.time_zone,
            organization_id = EXCLUDED.organization_id,
            organization_name = EXCLUDED.organization_name,
            status = EXCLUDED.status,
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
          account.organizationId,
          account.organizationName,
          account.status,
        ],
      })
    }

    await this.db.query({
      name: "zid-store-clear-selected",
      text: `
        UPDATE zid_stores
        SET is_selected = false,
            updated_at = now()
        WHERE connection_id = $1
      `,
      values: [input.connectionId],
    })

    await this.db.query({
      name: "zid-store-set-selected",
      text: `
        UPDATE zid_stores
        SET is_selected = true,
            updated_at = now()
        WHERE connection_id = $1
          AND account_id = $2
          AND status = 'active'
      `,
      values: [input.connectionId, candidateSelected],
    })
  }

  async listAccessibleCustomerAccounts(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "zid-store-list",
      text: `
        SELECT *
        FROM zid_stores
        WHERE connection_id = $1
          AND status = 'active'
        ORDER BY is_selected DESC, updated_at DESC
      `,
      values: [connectionId],
    })

    return result.rows.map(mapZidStore)
  }

  async selectCustomerAccount(connectionId: string, customerId: string) {
    return this.db.withTransaction(async () => {
      await this.db.query({
        name: "zid-store-select-clear",
        text: `
          UPDATE zid_stores
          SET is_selected = false,
              updated_at = now()
          WHERE connection_id = $1
        `,
        values: [connectionId],
      })

      const result = await this.db.query({
        name: "zid-store-select-set",
        text: `
          UPDATE zid_stores
          SET is_selected = true,
              updated_at = now()
          WHERE connection_id = $1
            AND account_id = $2
            AND status = 'active'
        `,
        values: [connectionId, customerId],
      })

      return result.rowCount > 0
    })
  }

  async findAccessibleCustomerAccount(connectionId: string, customerId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "zid-store-find",
      text: `
        SELECT *
        FROM zid_stores
        WHERE connection_id = $1
          AND account_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      values: [connectionId, customerId],
    })

    return result.rows[0] ? mapZidStore(result.rows[0]) : null
  }

  async deleteConnectionCascade(connectionId: string) {
    await this.db.query({
      name: "zid-oauth-delete-outbox-events",
      text: `
        DELETE FROM outbox_events
        WHERE aggregate_type = 'zid_oauth_connection'
          AND aggregate_id = $1
      `,
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-oauth-delete-audit-logs",
      text: `
        DELETE FROM audit_logs
        WHERE entity_type = 'zid_oauth_connection'
          AND entity_id = $1
      `,
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-store-delete",
      text: "DELETE FROM zid_stores WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-sync-delete-records",
      text: "DELETE FROM zid_records WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-sync-delete-runs",
      text: "DELETE FROM zid_sync_runs WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-oauth-delete-events",
      text: "DELETE FROM zid_oauth_events WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-oauth-delete-states",
      text: "DELETE FROM zid_oauth_states WHERE connection_id = $1",
      values: [connectionId],
    })

    await this.db.query({
      name: "zid-oauth-delete-connection",
      text: "DELETE FROM zid_oauth_connections WHERE id = $1",
      values: [connectionId],
    })
  }

  async getRawTokenMaterial(connectionId: string) {
    const result = await this.db.query<{
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      token_expires_at: Date | string | null
    }>({
      name: "zid-oauth-token-material-find",
      text: `
        SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at
        FROM zid_oauth_connections
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [connectionId],
    })

    return result.rows[0]
      ? {
          encryptedAccessToken: result.rows[0].encrypted_access_token,
          encryptedRefreshToken: result.rows[0].encrypted_refresh_token,
          tokenExpiresAt: toIso(result.rows[0].token_expires_at),
        }
      : null
  }

  async updateTokenMaterial(input: {
    connectionId: string
    encryptedAccessToken: string
    encryptedRefreshToken: string
    tokenExpiresAt: string | null
    scopes: string[]
  }) {
    await this.db.query({
      name: "zid-oauth-token-material-update",
      text: `
        UPDATE zid_oauth_connections
        SET encrypted_access_token = $2,
            encrypted_refresh_token = $3,
            token_expires_at = $4,
            scopes = $5,
            status = 'connected',
            updated_at = now()
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      values: [
        input.connectionId,
        input.encryptedAccessToken,
        input.encryptedRefreshToken,
        input.tokenExpiresAt,
        JSON.stringify(input.scopes),
      ],
    })
  }

  async setConnectionLifecycleStatus(input: {
    connectionId: string
    status: "connected" | "paused" | "disconnected"
    actorUserId: string
    occurredAt: string
  }) {
    await this.db.query({
      name: "zid-oauth-connection-lifecycle-update",
      text: `
        UPDATE zid_oauth_connections
        SET status = $2::varchar,
            last_connected_at = CASE WHEN $2::varchar = 'connected' THEN $3 ELSE last_connected_at END,
            last_disconnected_at = CASE
              WHEN $2::varchar = 'disconnected' THEN $3
              WHEN $2::varchar = 'connected' THEN NULL
              ELSE last_disconnected_at
            END,
            updated_by_user_id = $4,
            updated_at = $3
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      values: [input.connectionId, input.status, input.occurredAt, input.actorUserId],
    })
  }

  async listConnectionIdsByWorkspace(
    workspaceId: string,
    status: "connected" | "paused"
  ): Promise<string[]> {
    const result = await this.db.query<{ id: string }>({
      name: "zid-oauth-connections-list-by-workspace",
      text: `
        SELECT id
        FROM zid_oauth_connections
        WHERE workspace_id = $1
          AND deleted_at IS NULL
          AND status = $2
      `,
      values: [workspaceId, status],
    })
    return result.rows.map((row) => row.id)
  }

  async listRecentOutboxEvents(connectionId: string, limit: number) {
    const result = await this.db.query<{
      id: string
      eventType: string
      occurredAt: Date | string
      metadata: Record<string, unknown>
      payload: Record<string, unknown>
    }>({
      name: "zid-oauth-outbox-recent-list",
      text: `
        SELECT
          id,
          event_type AS "eventType",
          occurred_at AS "occurredAt",
          metadata,
          payload
        FROM outbox_events
        WHERE aggregate_type = 'zid_oauth_connection'
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
}
