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
  connection_status: string
  oauth_account_id: string | null
  encrypted_access_token: string | null
  encrypted_refresh_token: string | null
  token_expires_at: string | null
}

interface LegacyTokenRow extends Record<string, unknown> {
  status: string
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
          SELECT
            c.status AS connection_status,
            c.oauth_account_id
          FROM integration_connections c
          WHERE c.id = $1
            AND c.provider_id = 'google-ads'
            AND c.deleted_at IS NULL
          LIMIT 1
        `,
        values: [connectionId],
      }
    )

    let connection = row.rows[0] ?? null
    let activeToken: {
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      token_expires_at: string | null
    } = {
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expires_at: null,
    }
    let isLegacyConnection = false

    if (!connection) {
      const legacy = await this.db.query<LegacyTokenRow>({
        name: "google-ads-auth-legacy-token",
        text: `
          SELECT status, encrypted_access_token, encrypted_refresh_token, token_expires_at
          FROM google_oauth_connections
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        values: [connectionId],
      })

      const legacyRow = legacy.rows[0]
      if (legacyRow) {
        connection = {
          connection_status: String(legacyRow.status),
          oauth_account_id: null,
          encrypted_access_token: legacyRow.encrypted_access_token,
          encrypted_refresh_token: legacyRow.encrypted_refresh_token,
          token_expires_at: legacyRow.token_expires_at,
        }
        activeToken = {
          encrypted_access_token: legacyRow.encrypted_access_token,
          encrypted_refresh_token: legacyRow.encrypted_refresh_token,
          token_expires_at: legacyRow.token_expires_at,
        }
        isLegacyConnection = true
      }
    }

    if (!connection || connection.connection_status !== "connected") {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection is not connected.",
        "GOOGLE_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    if (!isLegacyConnection && !connection.oauth_account_id) {
      throw new GoogleAdsIntegrationError(
        "Google Ads OAuth account is unavailable.",
        "GOOGLE_ADS_TOKEN_UNAVAILABLE",
        false,
        409
      )
    }

    if (!isLegacyConnection) {
      const tokenRow = await this.db.query<Pick<OAuthTokenRow, "encrypted_access_token" | "encrypted_refresh_token" | "token_expires_at">>(
        {
          name: "google-ads-auth-oauth-token-active",
          text: `
            SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at
            FROM oauth_tokens
            WHERE oauth_account_id = $1
              AND status = 'active'
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          values: [connection.oauth_account_id],
        }
      )

      activeToken = tokenRow.rows[0] ?? activeToken
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

    if (!isLegacyConnection && connection.oauth_account_id) {
      await this.db.query(
        {
          name: "google-ads-auth-revoke-active-token",
          text: `
            UPDATE oauth_tokens
            SET status = 'revoked', revoked_at = now(), updated_at = now()
            WHERE oauth_account_id = $1
              AND status = 'active'
          `,
          values: [connection.oauth_account_id],
        }
      )

      await this.db.query(
        {
          name: "google-ads-auth-insert-refreshed-token",
          text: `
            INSERT INTO oauth_tokens (
              id, oauth_account_id, encrypted_refresh_token, encrypted_access_token,
              token_type, token_expires_at, refresh_token_issued_at,
              status, created_at, updated_at, revoked_at
            ) VALUES (
              $1, $2, $3, $4,
              'Bearer', $5, now(),
              'active', now(), now(), null
            )
          `,
          values: [
            randomUUID(),
            connection.oauth_account_id,
            encryptedRefreshToken,
            encryptedAccessToken,
            refreshed.expiresAt,
          ],
        }
      )
    }

    await this.db.query({
      name: "google-ads-auth-bridge-update",
      text: `
        UPDATE google_oauth_connections
        SET encrypted_access_token = $2,
            encrypted_refresh_token = $3,
            token_expires_at = $4,
            updated_at = now()
        WHERE id = $1
      `,
      values: [connectionId, encryptedAccessToken, encryptedRefreshToken, refreshed.expiresAt],
    })

    if (!isLegacyConnection && connection.oauth_account_id) {
      await this.db.query({
        name: "google-ads-auth-refresh-history",
        text: `
          INSERT INTO token_refresh_history (
            id, oauth_account_id, integration_connection_id,
            status, error_code, error_message, http_status,
            previous_expires_at, new_expires_at, attempted_at, created_at
          ) VALUES (
            $1, $2, $3,
            'success', null, null, 200,
            $4, $5, now(), now()
          )
        `,
        values: [randomUUID(), connection.oauth_account_id, connectionId, activeToken.token_expires_at, refreshed.expiresAt],
      })
    }

    this.cachedAccessTokens.set(connectionId, {
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    })

    return refreshed.accessToken
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
