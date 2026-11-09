import { randomInt } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  exchangeSignupCode,
  getPhoneNumber,
  type GraphAuth,
  registerPhoneNumber,
  subscribeWabaToApp,
  WhatsAppApiError,
} from "./cloud-api"
import { submitTemplate } from "./messaging"
import {
  decryptSecret,
  encryptSecret,
  type WhatsAppPlatformService,
  type WhatsAppSendingContext,
} from "./platform-config"
import { POS_INVOICE_TEMPLATE, sampleDocument } from "./templates"

// How an organization sends WhatsApp messages to its customers:
// - "web": Madar opens the customer's chat in the merchant's own WhatsApp Web (or the app, on a
//   phone) with the message ready, and the merchant presses send. Nothing to set up, nothing paid
//   to Meta -- the default.
// - "business": Madar sends the messages itself, from the merchant's own business number,
//   connected once through Meta's Embedded Signup. Meta bills the merchant's own WhatsApp account
//   for them.

export type WhatsAppSendMode = "web" | "business"

export interface WhatsAppConnectionView {
  sendMode: WhatsAppSendMode
  connection: {
    status: "connected" | "disconnected"
    wabaId: string | null
    phoneNumberId: string | null
    displayPhoneNumber: string | null
    verifiedName: string | null
    qualityRating: string | null
    lastError: string | null
    connectedAt: string | null
  } | null
  // Whether Meta's signup can be opened yet, and with what (both public values) -- null until
  // Madar's Meta app is set up for it (Madar Admin -> settings -> WhatsApp).
  embeddedSignup: { appId: string; configId: string; apiVersion: string } | null
}

interface ConnectionRow {
  send_mode: WhatsAppSendMode
  status: "none" | "connected" | "disconnected"
  waba_id: string | null
  phone_number_id: string | null
  display_phone_number: string | null
  verified_name: string | null
  quality_rating: string | null
  business_token_encrypted: string | null
  last_error: string | null
  connected_at: Date | string | null
  [key: string]: unknown
}

const toIso = (value: Date | string | null) =>
  value ? (value instanceof Date ? value : new Date(value)).toISOString() : null

const ERRORS = {
  notConnected: () =>
    new IdentityError(
      "WHATSAPP_NOT_CONNECTED",
      409,
      "business",
      "Connect your business number first -- automatic sending needs it."
    ),
  signupUnavailable: () =>
    new IdentityError(
      "WHATSAPP_SIGNUP_UNAVAILABLE",
      409,
      "business",
      "Connecting a business number isn't available yet."
    ),
  rejected: (message: string) =>
    new IdentityError("WHATSAPP_SIGNUP_FAILED", 422, "business", message),
}

export class WhatsAppMerchantConnectionService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService
  ) {}

  private async row(organizationId: string): Promise<ConnectionRow | null> {
    const result = await this.database.query<ConnectionRow>(
      `SELECT send_mode, status, waba_id, phone_number_id, display_phone_number, verified_name,
              quality_rating, business_token_encrypted, last_error, connected_at
         FROM whatsapp_merchant_connections WHERE organization_id = $1`,
      [organizationId]
    )
    return result.rows[0] ?? null
  }

  async get(organizationId: string): Promise<WhatsAppConnectionView> {
    const [row, embeddedSignup] = await Promise.all([
      this.row(organizationId),
      this.platform.embeddedSignup().catch(() => null),
    ])
    return {
      sendMode: row?.send_mode ?? "web",
      connection:
        row && row.status !== "none"
          ? {
              status: row.status,
              wabaId: row.waba_id,
              phoneNumberId: row.phone_number_id,
              displayPhoneNumber: row.display_phone_number,
              verifiedName: row.verified_name,
              qualityRating: row.quality_rating,
              lastError: row.last_error,
              connectedAt: toIso(row.connected_at),
            }
          : null,
      embeddedSignup,
    }
  }

  async setMode(
    organizationId: string,
    sendMode: WhatsAppSendMode
  ): Promise<WhatsAppConnectionView> {
    if (sendMode === "business" && (await this.row(organizationId))?.status !== "connected") {
      throw ERRORS.notConnected()
    }
    await this.database.query(
      `INSERT INTO whatsapp_merchant_connections (organization_id, send_mode)
       VALUES ($1, $2)
       ON CONFLICT (organization_id) DO UPDATE SET send_mode = $2, updated_at = now()`,
      [organizationId, sendMode]
    )
    return this.get(organizationId)
  }

  // Embedded Signup's last step: the browser hands over the code Meta gave it and the account and
  // number the merchant picked. Madar swaps the code for the business token, has the account send
  // its events to Madar's webhook, turns the number on for the Cloud API, and submits the invoice
  // template to the merchant's account (each merchant's templates are approved on their own
  // account). A step after the token can fail without losing the connection -- it's kept, with
  // what's left to fix in last_error.
  async completeEmbeddedSignup(input: {
    organizationId: string
    actorUserId: string
    code: string
    wabaId: string
    phoneNumberId: string
  }): Promise<WhatsAppConnectionView> {
    if (!(await this.platform.embeddedSignup())) throw ERRORS.signupUnavailable()
    const app = await this.platform.appCredentials()

    let token: string
    try {
      token = (
        await exchangeSignupCode({
          appId: app.appId,
          appSecret: app.appSecret,
          code: input.code,
          version: app.apiVersion,
        })
      ).access_token
    } catch (error) {
      throw ERRORS.rejected(
        error instanceof WhatsAppApiError ? error.message : "Meta didn't accept the signup."
      )
    }
    const auth: GraphAuth = { token, version: app.apiVersion }
    const problems: string[] = []

    try {
      await subscribeWabaToApp(input.wabaId, auth)
    } catch (error) {
      problems.push(`webhook: ${errorText(error)}`)
    }

    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0")
    try {
      await registerPhoneNumber(input.phoneNumberId, pin, auth)
    } catch (error) {
      problems.push(`number registration: ${errorText(error)}`)
    }

    const number = await getPhoneNumber(input.phoneNumberId, auth).catch(() => null)

    try {
      await submitTemplate(auth, {
        wabaId: input.wabaId,
        appId: app.appId,
        template: POS_INVOICE_TEMPLATE,
        sampleDocument: sampleDocument(POS_INVOICE_TEMPLATE),
      })
    } catch (error) {
      // Already submitted on this account (a reconnect) is fine.
      if (!/already exists|duplicate/i.test(errorText(error))) {
        problems.push(`invoice template: ${errorText(error)}`)
      }
    }

    await this.database.query(
      `INSERT INTO whatsapp_merchant_connections (
         organization_id, send_mode, status, waba_id, phone_number_id, display_phone_number,
         verified_name, quality_rating, business_token_encrypted, registration_pin_encrypted,
         last_error, connected_at, connected_by, updated_at)
       VALUES ($1, 'business', 'connected', $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, now())
       ON CONFLICT (organization_id) DO UPDATE SET
         send_mode = 'business', status = 'connected', waba_id = $2, phone_number_id = $3,
         display_phone_number = $4, verified_name = $5, quality_rating = $6,
         business_token_encrypted = $7, registration_pin_encrypted = $8, last_error = $9,
         connected_at = now(), connected_by = $10, updated_at = now()`,
      [
        input.organizationId,
        input.wabaId,
        input.phoneNumberId,
        number?.display_phone_number ?? null,
        number?.verified_name ?? null,
        number?.quality_rating ?? null,
        encryptSecret(token),
        encryptSecret(pin),
        problems.length > 0 ? problems.join(" · ") : null,
        input.actorUserId,
      ]
    )
    console.log("whatsapp.merchant_connected", {
      organizationId: input.organizationId,
      wabaId: input.wabaId,
      problems: problems.length,
    })
    return this.get(input.organizationId)
  }

  // Back to WhatsApp Web; the token is dropped. The number stays the merchant's, on their own
  // account -- reconnecting runs the signup again.
  async disconnect(organizationId: string): Promise<WhatsAppConnectionView> {
    await this.database.query(
      `UPDATE whatsapp_merchant_connections
          SET send_mode = 'web', status = 'disconnected', business_token_encrypted = NULL,
              registration_pin_encrypted = NULL, updated_at = now()
        WHERE organization_id = $1`,
      [organizationId]
    )
    return this.get(organizationId)
  }

  // What sending from the merchant's own number needs -- null when the organization sends through
  // WhatsApp Web (or isn't connected), so the caller falls back to its own path.
  async sendingContext(organizationId: string): Promise<WhatsAppSendingContext | null> {
    const row = await this.row(organizationId)
    if (
      row?.send_mode !== "business" ||
      row.status !== "connected" ||
      !row.business_token_encrypted ||
      !row.waba_id ||
      !row.phone_number_id
    ) {
      return null
    }
    const app = await this.platform.appCredentials()
    return {
      auth: { token: decryptSecret(row.business_token_encrypted), version: app.apiVersion },
      phoneNumberId: row.phone_number_id,
      wabaId: row.waba_id,
      appId: app.appId,
    }
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
