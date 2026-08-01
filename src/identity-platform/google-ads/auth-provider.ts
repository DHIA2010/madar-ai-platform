import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  AwsSecretsGoogleIdentityCredentialsProvider,
  type GoogleIdentityCredentialsProvider,
} from "../google-oauth/google-identity-credentials"

import { GoogleAdsIntegrationError } from "./errors"

interface GoogleAdsTokenInfo {
  accessToken: string
  expiresAt: string | null
}

interface OAuthTokenRow extends Record<string, unknown> {
  oauth_connection_id: string
  oauth_account_id: string | null
  connection_status: string
  organization_id: string | null
  workspace_id: string | null
  project_id: string | null
  encrypted_access_token: string | null
  encrypted_refresh_token: string | null
  token_expires_at: string | null
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex")
  }

  try {
    const decoded = Buffer.from(trimmed, "base64")
    if (decoded.length === 32) {
      return decoded
    }
  } catch {
    // No-op
  }

  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8")
  }

  throw new GoogleAdsIntegrationError(
    "Google Ads encryption key is invalid.",
    "GOOGLE_ADS_TOKEN_UNAVAILABLE",
    false,
    500
  )
}

function decryptSecret(value: string, rawKey: string) {
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":")
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new GoogleAdsIntegrationError(
      "Google Ads token payload is invalid.",
      "GOOGLE_ADS_TOKEN_UNAVAILABLE",
      false,
      500
    )
  }

  const key = normalizeEncryptionKey(rawKey)
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"))
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

function encryptSecret(plainText: string, rawKey: string) {
  const key = normalizeEncryptionKey(rawKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

export class GoogleAdsAuthProvider {
  private cachedAccessTokens = new Map<string, GoogleAdsTokenInfo>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly config: {
      tokenEndpoint: string
      encryptionKey: string
    },
    private readonly credentialsProvider: GoogleIdentityCredentialsProvider = new AwsSecretsGoogleIdentityCredentialsProvider()
  ) {}

  async getAccessToken(connectionId: string): Promise<string> {
    const cached = this.cachedAccessTokens.get(connectionId)
    if (cached && cached.expiresAt && new Date(cached.expiresAt).getTime() > Date.now() + 30_000) {
      return cached.accessToken
    }

    const row = await this.db.query<OAuthTokenRow>(
      {
        name: "google-ads-auth-oauth-token",
        text: `
          WITH target_runtime AS (
            SELECT
              ic.project_id,
              ic.organization_id,
              ic.workspace_id,
              ic.oauth_account_id,
              ic.status
            FROM integration_connections ic
            WHERE ic.provider_id = 'google-ads'
              AND ic.deleted_at IS NULL
              AND (ic.id = $1 OR ic.oauth_account_id = $1)
            LIMIT 1
          ), latest_oauth_token AS (
            SELECT t.*
            FROM oauth_tokens t
            JOIN target_runtime tr
              ON tr.oauth_account_id = t.oauth_account_id
            WHERE t.status = 'active'
            ORDER BY t.updated_at DESC
            LIMIT 1
          ), legacy_connection AS (
            SELECT g.*
            FROM google_oauth_connections g
            LEFT JOIN target_runtime tr
              ON tr.project_id = g.project_id
            WHERE g.deleted_at IS NULL
              AND g.provider = 'google_ads'
              AND (g.id = $1 OR tr.project_id IS NOT NULL)
            ORDER BY
              CASE WHEN g.id = $1 THEN 0 ELSE 1 END,
              g.updated_at DESC
            LIMIT 1
          ), candidate_tokens AS (
            SELECT
              lc.id AS oauth_connection_id,
              tr.oauth_account_id,
              coalesce(tr.status, lc.status) AS connection_status,
              coalesce(tr.organization_id, lc.organization_id) AS organization_id,
              coalesce(tr.workspace_id, lc.workspace_id) AS workspace_id,
              coalesce(tr.project_id, lc.project_id) AS project_id,
              coalesce(t.encrypted_access_token, lc.encrypted_access_token) AS encrypted_access_token,
              coalesce(t.encrypted_refresh_token, lc.encrypted_refresh_token) AS encrypted_refresh_token,
              coalesce(t.token_expires_at, lc.token_expires_at) AS token_expires_at,
              CASE WHEN tr.oauth_account_id IS NULL THEN 1 ELSE 0 END AS sort_priority
            FROM legacy_connection lc
            LEFT JOIN target_runtime tr ON true
            LEFT JOIN latest_oauth_token t ON true
          )
          SELECT
            oauth_connection_id,
            oauth_account_id,
            connection_status,
            organization_id,
            workspace_id,
            project_id,
            encrypted_access_token,
            encrypted_refresh_token,
            token_expires_at
          FROM candidate_tokens
          ORDER BY
            sort_priority ASC,
            token_expires_at DESC NULLS LAST
          LIMIT 1
        `,
        values: [connectionId],
      }
    )

    let connection = row.rows[0] ?? null

    if (!connection || connection.connection_status !== "connected") {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection is not connected.",
        "GOOGLE_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const activeToken = {
      encrypted_access_token: connection.encrypted_access_token,
      encrypted_refresh_token: connection.encrypted_refresh_token,
      token_expires_at: connection.token_expires_at,
    }

    if (activeToken.encrypted_access_token && activeToken.token_expires_at) {
      const expiresAtMs = new Date(activeToken.token_expires_at ?? "").getTime()
      if (!Number.isNaN(expiresAtMs) && expiresAtMs > Date.now() + 30_000) {
        const token = decryptSecret(String(activeToken.encrypted_access_token), this.config.encryptionKey)
        this.cachedAccessTokens.set(connectionId, {
          accessToken: token,
          expiresAt: activeToken.token_expires_at,
        })
        return token
      }
    }

    if (!activeToken.encrypted_refresh_token) {
      throw new GoogleAdsIntegrationError(
        "Google Ads refresh token is unavailable.",
        "GOOGLE_ADS_TOKEN_UNAVAILABLE",
        false,
        409
      )
    }

    const refreshToken = decryptSecret(String(activeToken.encrypted_refresh_token), this.config.encryptionKey)
    const refreshed = await this.refreshAccessToken(refreshToken)

    const encryptedAccessToken = encryptSecret(refreshed.accessToken, this.config.encryptionKey)
    const encryptedRefreshToken = refreshed.refreshToken
      ? encryptSecret(refreshed.refreshToken, this.config.encryptionKey)
      : String(activeToken.encrypted_refresh_token)

    await this.db.query({
      name: "google-ads-auth-connection-update",
      text: `
        UPDATE google_oauth_connections
        SET encrypted_access_token = $2,
            encrypted_refresh_token = $3,
            token_expires_at = $4,
            updated_at = now()
        WHERE id = $1
      `,
      values: [String(connection.oauth_connection_id), encryptedAccessToken, encryptedRefreshToken, refreshed.expiresAt],
    })

    if (connection.oauth_account_id) {
      await this.db.query({
        name: "google-ads-auth-oauth-token-refresh",
        text: `
          UPDATE oauth_tokens
          SET status = 'revoked',
              revoked_at = now(),
              updated_at = now()
          WHERE oauth_account_id = $1
            AND status = 'active'
        `,
        values: [connection.oauth_account_id],
      })

      await this.db.query({
        name: "google-ads-auth-oauth-token-insert",
        text: `
          INSERT INTO oauth_tokens (
            id, oauth_account_id,
            encrypted_refresh_token, encrypted_access_token,
            token_type, token_expires_at, refresh_token_issued_at,
            status, created_at, updated_at, revoked_at
          ) VALUES (
            $1,$2,
            $3,$4,
            'Bearer',$5,now(),
            'active',now(),now(),NULL
          )
        `,
        values: [randomUUID(), connection.oauth_account_id, encryptedRefreshToken, encryptedAccessToken, refreshed.expiresAt],
      })
    }

    this.cachedAccessTokens.set(connectionId, {
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    })

    await this.recordTokenRefreshedEvent({
      connectionId: String(connection.oauth_connection_id),
      organizationId: connection.organization_id,
      workspaceId: connection.workspace_id,
      projectId: connection.project_id,
      expiresAt: refreshed.expiresAt,
    })

    return refreshed.accessToken
  }

  private async recordTokenRefreshedEvent(input: {
    connectionId: string
    organizationId: string | null
    workspaceId: string | null
    projectId: string | null
    expiresAt: string | null
  }) {
    const occurredAt = new Date().toISOString()

    await this.db.query({
      name: "google-ads-auth-event-token-refreshed",
      text: `
        INSERT INTO google_oauth_events (id, connection_id, event_type, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      values: [
        randomUUID(),
        input.connectionId,
        "google.oauth.token.refreshed",
        JSON.stringify({
          tokenExpiresAt: input.expiresAt,
          message: "Access token refreshed.",
        }),
        occurredAt,
      ],
    })

    await this.db.query({
      name: "google-ads-auth-outbox-token-refreshed",
      text: `
        INSERT INTO outbox_events (
          id, event_type, event_version, aggregate_type, aggregate_id,
          occurred_at, metadata, payload, status, attempts, created_at
        ) VALUES ($1,$2,1,'google_oauth_connection',$3,$4,$5,$6,'pending',0,$4)
      `,
      values: [
        randomUUID(),
        "google.oauth.token.refreshed",
        input.connectionId,
        occurredAt,
        JSON.stringify({
          actorUserId: null,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        }),
        JSON.stringify({
          tokenExpiresAt: input.expiresAt,
          message: "Access token refreshed.",
        }),
      ],
    })
  }

  private async refreshAccessToken(refreshToken: string) {
    const credentials = await this.credentialsProvider.load()

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    })

    if (!response.ok) {
      throw new GoogleAdsIntegrationError(
        "Unable to refresh Google Ads access token.",
        "GOOGLE_ADS_TOKEN_UNAVAILABLE",
        response.status >= 500,
        502
      )
    }

    const body = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }

    if (!body.access_token) {
      throw new GoogleAdsIntegrationError(
        "Google Ads access token refresh returned an invalid payload.",
        "GOOGLE_ADS_TOKEN_UNAVAILABLE",
        false,
        502
      )
    }

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : null,
    }
  }
}
