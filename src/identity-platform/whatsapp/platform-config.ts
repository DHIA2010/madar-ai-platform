import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  debugToken,
  DEFAULT_GRAPH_API_VERSION,
  getTokenOwner,
  getTokenPermissions,
  getWhatsAppBusinessAccount,
  type GraphAuth,
  listPhoneNumbers,
  subscribeAppWebhook,
  subscribeWabaToApp,
  WhatsAppApiError,
  type WhatsAppPhoneNumber,
} from "./cloud-api"
import type { WhatsAppCredentialsSource } from "./credentials"

// Madar's own WhatsApp Business Platform setup (Madar Admin -> settings -> WhatsApp): the Meta
// app, the Embedded Signup configuration merchants connect their numbers through, Madar's own
// WhatsApp account and number, and the System User token Madar calls Meta's API with. Values in
// AWS Secrets Manager (credentials.ts) win over what's entered here; the app secret and token
// entered here are write-only -- stored encrypted, never returned.

export type WhatsAppConfigField =
  | "appId"
  | "appSecret"
  | "systemUserToken"
  | "madarWabaId"
  | "madarPhoneNumberId"
  | "apiVersion"

export interface WhatsAppPlatformConfigView {
  appId: string
  embeddedSignupConfigId: string
  madarWabaId: string
  madarPhoneNumberId: string
  apiVersion: string
  hasAppSecret: boolean
  hasSystemUserToken: boolean
  // The token's last 4 characters, so it can be told apart from another one.
  systemUserTokenHint: string | null
  // Which values come from AWS Secrets Manager (they can't be changed here).
  fromAws: WhatsAppConfigField[]
  // What to paste as "Verify token" in the app's WhatsApp webhook settings.
  webhookVerifyToken: string
  updatedAt: string | null
}

export interface WhatsAppPlatformConfigPatch {
  appId?: string
  embeddedSignupConfigId?: string
  madarWabaId?: string
  madarPhoneNumberId?: string
  // Empty string clears it.
  appSecret?: string
  systemUserToken?: string
}

export interface WhatsAppConnectionCheck {
  key: "token" | "tokenExpiry" | "permissions" | "account" | "phoneNumbers" | "configuredNumber"
  ok: boolean
  detail: string
}

interface ConfigRow {
  app_id: string
  embedded_signup_config_id: string
  madar_waba_id: string
  madar_phone_number_id: string
  app_secret_encrypted: string | null
  system_user_token_encrypted: string | null
  webhook_verify_token: string
  updated_at: Date | string | null
  [key: string]: unknown
}

export interface WhatsAppSendingContext {
  auth: GraphAuth
  phoneNumberId: string
  wabaId: string
  appId: string
}

// What Madar actually uses: AWS's values over Madar Admin's.
interface EffectiveConfig {
  appId: string
  appSecret: string | null
  token: string | null
  wabaId: string
  phoneNumberId: string
  apiVersion: string
  fromAws: WhatsAppConfigField[]
}

// Permissions a System User token needs for everything Madar does with WhatsApp.
const REQUIRED_PERMISSIONS = ["whatsapp_business_management", "whatsapp_business_messaging"]

function encryptionKey(): Buffer {
  const raw = (
    process.env.IDENTITY_PLATFORM_WHATSAPP_TOKEN_ENCRYPTION_KEY ??
    process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
    ""
  ).trim()
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex")
  const decoded = Buffer.from(raw, "base64")
  if (decoded.length === 32) return decoded
  if (raw.length === 32) return Buffer.from(raw, "utf8")
  throw new Error("WHATSAPP_CONFIGURATION_ERROR")
}

function encryptSecret(plainText: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`
}

function decryptSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":")
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("WHATSAPP_DECRYPTION_ERROR")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

const notConfigured = (what: string) =>
  new IdentityError(
    "WHATSAPP_NOT_CONFIGURED",
    409,
    "business",
    `WhatsApp isn't set up yet: ${what} is missing.`
  )

// Meta signs every webhook POST with the app secret: X-Hub-Signature-256 = "sha256=" + hex HMAC.
export function verifyWhatsAppSignature(
  rawBody: Buffer,
  header: string | string[] | undefined,
  appSecret: string
): boolean {
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith("sha256=")) return false
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"))
  const received = Buffer.from(value.slice("sha256=".length))
  return expected.length === received.length && timingSafeEqual(expected, received)
}

const errorText = (error: unknown) =>
  error instanceof WhatsAppApiError || error instanceof Error ? error.message : String(error)

export class WhatsAppPlatformService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly credentialsSource: WhatsAppCredentialsSource | null = null
  ) {}

  // The row, created (with a fresh verify token) the first time it's needed.
  private async row(): Promise<ConfigRow> {
    const existing = await this.database.query<ConfigRow>(
      "SELECT * FROM whatsapp_platform_config WHERE id = 1"
    )
    if (existing.rows[0]?.webhook_verify_token) return existing.rows[0]
    const verifyToken = randomBytes(24).toString("hex")
    if (existing.rows[0]) {
      await this.database.query(
        "UPDATE whatsapp_platform_config SET webhook_verify_token = $1 WHERE id = 1",
        [verifyToken]
      )
    } else {
      await this.database.query(
        "INSERT INTO whatsapp_platform_config (id, webhook_verify_token) VALUES (1, $1)",
        [verifyToken]
      )
    }
    return (
      await this.database.query<ConfigRow>("SELECT * FROM whatsapp_platform_config WHERE id = 1")
    ).rows[0]
  }

  private async effective(row: ConfigRow): Promise<EffectiveConfig> {
    const aws = (await this.credentialsSource?.load()) ?? {}
    const fromAws: WhatsAppConfigField[] = []
    const pick = (field: WhatsAppConfigField, awsValue: string | undefined, own: string) => {
      if (awsValue) {
        fromAws.push(field)
        return awsValue
      }
      return own
    }
    const decrypt = (value: string | null) => (value ? decryptSecret(value) : "")
    return {
      appId: pick("appId", aws.appId, row.app_id),
      appSecret: pick("appSecret", aws.appSecret, decrypt(row.app_secret_encrypted)) || null,
      token:
        pick("systemUserToken", aws.accessToken, decrypt(row.system_user_token_encrypted)) || null,
      wabaId: pick("madarWabaId", aws.wabaId, row.madar_waba_id),
      phoneNumberId: pick("madarPhoneNumberId", aws.phoneNumberId, row.madar_phone_number_id),
      apiVersion: pick("apiVersion", aws.apiVersion, DEFAULT_GRAPH_API_VERSION),
      fromAws,
    }
  }

  async get(): Promise<WhatsAppPlatformConfigView> {
    const row = await this.row()
    const config = await this.effective(row)
    return {
      appId: config.appId,
      embeddedSignupConfigId: row.embedded_signup_config_id,
      madarWabaId: config.wabaId,
      madarPhoneNumberId: config.phoneNumberId,
      apiVersion: config.apiVersion,
      hasAppSecret: Boolean(config.appSecret),
      hasSystemUserToken: Boolean(config.token),
      systemUserTokenHint: config.token ? config.token.slice(-4) : null,
      fromAws: config.fromAws,
      webhookVerifyToken: row.webhook_verify_token,
      updatedAt: row.updated_at
        ? (row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at)).toISOString()
        : null,
    }
  }

  async update(
    patch: WhatsAppPlatformConfigPatch,
    actorUserId: string
  ): Promise<WhatsAppPlatformConfigView> {
    const current = await this.row()
    const secret = (value: string | undefined, existing: string | null) =>
      value === undefined ? existing : value.trim() ? encryptSecret(value.trim()) : null
    await this.database.query(
      `UPDATE whatsapp_platform_config
          SET app_id = $1, embedded_signup_config_id = $2, madar_waba_id = $3,
              madar_phone_number_id = $4, app_secret_encrypted = $5,
              system_user_token_encrypted = $6, updated_at = now(), updated_by = $7
        WHERE id = 1`,
      [
        patch.appId?.trim() ?? current.app_id,
        patch.embeddedSignupConfigId?.trim() ?? current.embedded_signup_config_id,
        patch.madarWabaId?.trim() ?? current.madar_waba_id,
        patch.madarPhoneNumberId?.trim() ?? current.madar_phone_number_id,
        secret(patch.appSecret, current.app_secret_encrypted),
        secret(patch.systemUserToken, current.system_user_token_encrypted),
        actorUserId,
      ]
    )
    return this.get()
  }

  // What sending a message needs: the token, Madar's number and account, the app.
  async sendingContext(): Promise<WhatsAppSendingContext> {
    const config = await this.effective(await this.row())
    if (!config.token) throw notConfigured("the System User token")
    if (!config.phoneNumberId) throw notConfigured("Madar's phone number ID")
    if (!config.wabaId) throw notConfigured("Madar's WhatsApp Business Account ID")
    return {
      auth: { token: config.token, version: config.apiVersion },
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
      appId: config.appId,
    }
  }

  // The app secret in use -- for verifying webhook signatures. Null when not set.
  async appSecret(): Promise<string | null> {
    return (await this.effective(await this.row())).appSecret
  }

  async verifyToken(): Promise<string> {
    return (await this.row()).webhook_verify_token
  }

  // Checks the setup against Meta, one line per part, so it's clear what's left to do.
  async testConnection(): Promise<{
    checks: WhatsAppConnectionCheck[]
    phoneNumbers: WhatsAppPhoneNumber[]
  }> {
    const config = await this.effective(await this.row())
    const checks: WhatsAppConnectionCheck[] = []
    let phoneNumbers: WhatsAppPhoneNumber[] = []
    if (!config.token) {
      checks.push({ key: "token", ok: false, detail: "No System User token saved yet." })
      return { checks, phoneNumbers }
    }
    const token = config.token
    const auth: GraphAuth = { token, version: config.apiVersion }
    // Meta repeats a malformed token in its error -- never show it.
    const redact = (text: string) => text.split(token).join(`…${token.slice(-4)}`)
    const run = async (key: WhatsAppConnectionCheck["key"], fn: () => Promise<string>) => {
      try {
        checks.push({ key, ok: true, detail: await fn() })
        return true
      } catch (error) {
        checks.push({ key, ok: false, detail: redact(errorText(error)) })
        return false
      }
    }

    const tokenOk = await run("token", async () => {
      const owner = await getTokenOwner(auth)
      return owner.name ? `${owner.name} (${owner.id})` : owner.id
    })
    if (!tokenOk) return { checks, phoneNumbers }

    if (config.appId && config.appSecret) {
      await run("tokenExpiry", async () => {
        const { data } = await debugToken({
          appId: config.appId,
          appSecret: config.appSecret!,
          token,
          version: config.apiVersion,
        })
        if (data.is_valid === false) throw new Error("Meta says this token is no longer valid.")
        if (data.expires_at && data.expires_at > 0) {
          throw new Error(
            `${data.type ?? "Token"} expires ${new Date(data.expires_at * 1000).toISOString()} -- use a System User token that never expires.`
          )
        }
        return `${data.type ?? "Token"} -- never expires`
      })
    }

    await run("permissions", async () => {
      const granted = new Set(
        (await getTokenPermissions(auth)).data
          .filter((entry) => entry.status === "granted")
          .map((entry) => entry.permission)
      )
      const missing = REQUIRED_PERMISSIONS.filter((permission) => !granted.has(permission))
      if (missing.length > 0) throw new Error(`Missing: ${missing.join(", ")}`)
      return REQUIRED_PERMISSIONS.join(", ")
    })

    if (!config.wabaId) {
      checks.push({
        key: "account",
        ok: false,
        detail: "Madar's WhatsApp Business Account ID isn't saved yet.",
      })
      return { checks, phoneNumbers }
    }
    await run("account", async () => {
      const account = await getWhatsAppBusinessAccount(config.wabaId, auth)
      return [account.name ?? account.id, account.account_review_status]
        .filter(Boolean)
        .join(" -- ")
    })
    const numbersOk = await run("phoneNumbers", async () => {
      phoneNumbers = (await listPhoneNumbers(config.wabaId, auth)).data
      if (phoneNumbers.length === 0) throw new Error("No phone number on this account yet.")
      return phoneNumbers
        .map(
          (number) =>
            `${number.display_phone_number ?? "—"} (${number.verified_name ?? "—"}, ID ${number.id})`
        )
        .join(", ")
    })
    if (numbersOk) {
      const configured = phoneNumbers.find((number) => number.id === config.phoneNumberId)
      checks.push(
        configured
          ? {
              key: "configuredNumber",
              ok: true,
              detail: `Madar sends from ${configured.display_phone_number ?? configured.id} (${configured.verified_name ?? "—"})`,
            }
          : {
              key: "configuredNumber",
              ok: false,
              detail: config.phoneNumberId
                ? `Phone number ID ${config.phoneNumberId} isn't on this account -- use one of the IDs above.`
                : "No phone number ID saved -- use one of the IDs above.",
            }
      )
    }
    return { checks, phoneNumbers }
  }

  // Points the Meta app's WhatsApp webhook at Madar and subscribes Madar's own account to it.
  async activateWebhook(
    callbackUrl: string
  ): Promise<{ appSubscribed: boolean; accountSubscribed: boolean }> {
    const row = await this.row()
    const config = await this.effective(row)
    if (!config.appId) throw notConfigured("the App ID")
    if (!config.appSecret) throw notConfigured("the App Secret")
    const toError = (error: unknown) =>
      error instanceof WhatsAppApiError
        ? new IdentityError("WHATSAPP_REJECTED", 422, "business", error.message, {
            status: error.status,
          })
        : error
    await subscribeAppWebhook({
      appId: config.appId,
      appSecret: config.appSecret,
      callbackUrl,
      verifyToken: row.webhook_verify_token,
      version: config.apiVersion,
    }).catch((error: unknown) => {
      throw toError(error)
    })
    let accountSubscribed = false
    if (config.wabaId && config.token) {
      await subscribeWabaToApp(config.wabaId, {
        token: config.token,
        version: config.apiVersion,
      }).catch((error: unknown) => {
        throw toError(error)
      })
      accountSubscribed = true
    }
    return { appSubscribed: true, accountSubscribed }
  }

  async recordWebhookEvent(payload: unknown): Promise<void> {
    await this.database.query(
      "INSERT INTO whatsapp_webhook_events (id, payload) VALUES ($1, $2::jsonb)",
      [randomUUID(), JSON.stringify(payload)]
    )
  }
}
