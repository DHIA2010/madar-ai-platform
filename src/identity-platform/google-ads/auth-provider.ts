import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { GoogleAdsIntegrationError } from "./errors"

interface GoogleAdsTokenInfo {
  accessToken: string
  expiresAt: string | null
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
      clientId: string
      clientSecret: string
      tokenEndpoint: string
      encryptionKey: string
    }
  ) {}

  async getAccessToken(connectionId: string): Promise<string> {
    const cached = this.cachedAccessTokens.get(connectionId)
    if (cached && cached.expiresAt && new Date(cached.expiresAt).getTime() > Date.now() + 30_000) {
      return cached.accessToken
    }

    const row = await this.db.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      token_expires_at: string | null
    }>(
      `
      select status, encrypted_access_token, encrypted_refresh_token, token_expires_at
      from google_oauth_connections
      where id = $1 and deleted_at is null
      limit 1
      `,
      [connectionId]
    )

    const connection = row.rows[0]
    if (!connection || connection.status !== "connected") {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection is not connected.",
        "GOOGLE_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    if (connection.encrypted_access_token && connection.token_expires_at) {
      const expiresAtMs = new Date(connection.token_expires_at).getTime()
      if (!Number.isNaN(expiresAtMs) && expiresAtMs > Date.now() + 30_000) {
        const token = decryptSecret(connection.encrypted_access_token, this.config.encryptionKey)
        this.cachedAccessTokens.set(connectionId, {
          accessToken: token,
          expiresAt: connection.token_expires_at,
        })
        return token
      }
    }

    if (!connection.encrypted_refresh_token) {
      throw new GoogleAdsIntegrationError(
        "Google Ads refresh token is unavailable.",
        "GOOGLE_ADS_TOKEN_UNAVAILABLE",
        false,
        409
      )
    }

    const refreshToken = decryptSecret(
      connection.encrypted_refresh_token,
      this.config.encryptionKey
    )
    const refreshed = await this.refreshAccessToken(refreshToken)

    const encryptedAccessToken = encryptSecret(refreshed.accessToken, this.config.encryptionKey)
    const encryptedRefreshToken = refreshed.refreshToken
      ? encryptSecret(refreshed.refreshToken, this.config.encryptionKey)
      : connection.encrypted_refresh_token

    await this.db.query(
      `
      update google_oauth_connections
      set encrypted_access_token = $2,
          encrypted_refresh_token = $3,
          token_expires_at = $4,
          updated_at = now()
      where id = $1
      `,
      [connectionId, encryptedAccessToken, encryptedRefreshToken, refreshed.expiresAt]
    )

    this.cachedAccessTokens.set(connectionId, {
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    })

    return refreshed.accessToken
  }

  private async refreshAccessToken(refreshToken: string) {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
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
