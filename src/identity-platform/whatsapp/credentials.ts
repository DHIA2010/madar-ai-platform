import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { canUseAwsSecretFallback } from "../configuration/provider-credential-resolution"

// Madar's WhatsApp Business Platform credentials as kept in AWS Secrets Manager
// (madar/Whatsapp/production). Whatever is there wins over what was entered in Madar Admin
// (whatsapp/platform-config.ts), so rotating a value only means updating the secret -- it's
// re-read every few minutes.
export interface WhatsAppCredentials {
  appId: string
  appSecret: string
  accessToken: string
  wabaId: string
  phoneNumberId: string
  apiVersion: string
}

export interface WhatsAppCredentialsSource {
  // Only the values the source has; null when it can't be read at all.
  load(): Promise<Partial<WhatsAppCredentials> | null>
}

export const WHATSAPP_SECRET_ID =
  process.env.IDENTITY_PLATFORM_WHATSAPP_SECRET_ID?.trim() || "madar/Whatsapp/production"

// The secret's key for each value (as created in the AWS console).
const SECRET_KEYS: Record<keyof WhatsAppCredentials, string[]> = {
  appId: ["App_ID", "APP_ID", "WHATSAPP_APP_ID"],
  appSecret: ["App_Secret", "APP_SECRET", "WHATSAPP_APP_SECRET"],
  accessToken: ["WHATSAPP_ACCESS_TOKEN"],
  wabaId: ["WHATSAPP_BUSINESS_ACCOUNT_ID"],
  phoneNumberId: ["WHATSAPP_PHONE_NUMBER_ID"],
  apiVersion: ["WHATSAPP_API_VERSION"],
}

const CACHE_MS = 5 * 60_000

export function credentialsFromSecret(
  parsed: Record<string, unknown>
): Partial<WhatsAppCredentials> {
  const values: Partial<WhatsAppCredentials> = {}
  for (const [field, keys] of Object.entries(SECRET_KEYS) as Array<
    [keyof WhatsAppCredentials, string[]]
  >) {
    const key = keys.find((candidate) => String(parsed[candidate] ?? "").trim())
    if (key) values[field] = String(parsed[key]).trim()
  }
  return values
}

export class AwsSecretsWhatsAppCredentialsSource implements WhatsAppCredentialsSource {
  private readonly client: SecretsManagerClient
  private cached: { at: number; value: Partial<WhatsAppCredentials> | null } | null = null

  constructor(private readonly secretId = WHATSAPP_SECRET_ID) {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    })
  }

  async load(): Promise<Partial<WhatsAppCredentials> | null> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value
    let value: Partial<WhatsAppCredentials> | null = null
    if (canUseAwsSecretFallback({ secretId: this.secretId })) {
      try {
        const response = await this.client.send(
          new GetSecretValueCommand({ SecretId: this.secretId })
        )
        value = response.SecretString
          ? credentialsFromSecret(JSON.parse(response.SecretString) as Record<string, unknown>)
          : null
      } catch (error) {
        // Not readable (no secret, no permission): Madar Admin's values are used instead.
        console.error("whatsapp.credentials_unavailable", {
          secretId: this.secretId,
          error: error instanceof Error ? error.name : String(error),
        })
      }
    }
    this.cached = { at: Date.now(), value }
    return value
  }
}
