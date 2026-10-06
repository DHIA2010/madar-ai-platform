import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { canUseAwsSecretFallback } from "../../configuration/provider-credential-resolution"

export interface MoyasarCredentials {
  publishableKey: string
  secretKey: string
  // Optional, unlike publishableKey/secretKey -- a webhook isn't created in the Moyasar dashboard
  // until there's a deployed callback URL for it to point at, so checkout/confirm must work
  // without one. The webhook route itself (server.ts) 503s if this is null, since verifying a
  // webhook with no configured secret would mean accepting unverified requests.
  webhookSecret: string | null
}

export const MOYASAR_SECRET_ID =
  process.env.IDENTITY_PLATFORM_MOYASAR_SECRET_ID?.trim() || "madar/moyasar/production"

function readEnvMoyasarCredentials(): MoyasarCredentials | null {
  const publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY?.trim() ?? ""
  const secretKey = process.env.MOYASAR_SECRET_KEY?.trim() ?? ""
  const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET?.trim() ?? ""
  return publishableKey && secretKey
    ? { publishableKey, secretKey, webhookSecret: webhookSecret || null }
    : null
}

class AwsSecretsMoyasarCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<MoyasarCredentials> | null = null

  constructor(
    private readonly secretId = MOYASAR_SECRET_ID,
    region?: string
  ) {
    this.client = new SecretsManagerClient({
      region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    })
  }

  async load() {
    if (!this.cached) {
      // Same "don't poison the cache on a transient failure" pattern as the other
      // *-credentials.ts providers (see maxmind-credentials.ts) -- a failed load must not
      // permanently prevent billing from ever working again once the underlying issue clears.
      this.cached = this.loadOnce().catch((error: unknown) => {
        this.cached = null
        throw error
      })
    }

    return this.cached
  }

  private async loadOnce(): Promise<MoyasarCredentials> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretId }))
    const secret = response.SecretString
    if (!secret) {
      throw new Error("MOYASAR_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("MOYASAR_CONFIGURATION_ERROR")
    }

    // Also accepts the "Publishable key" / "Secret key" / "Webhook secret" labels the AWS
    // console's plaintext key/value secret editor produces by default, alongside the
    // snake_case/camelCase convention every other *-credentials.ts provider in this codebase uses.
    const publishableKey = String(
      parsed.publishable_key ?? parsed.publishableKey ?? parsed["Publishable key"] ?? ""
    ).trim()
    const secretKey = String(
      parsed.secret_key ?? parsed.secretKey ?? parsed["Secret key"] ?? ""
    ).trim()
    const webhookSecret = String(
      parsed.webhook_secret ?? parsed.webhookSecret ?? parsed["Webhook secret"] ?? ""
    ).trim()
    if (!publishableKey || !secretKey) {
      throw new Error("MOYASAR_CONFIGURATION_ERROR")
    }

    return { publishableKey, secretKey, webhookSecret: webhookSecret || null }
  }
}

// Unlike maxmind (which degrades to null/best-effort), a missing Moyasar credential is a hard
// failure -- this is real payment processing, not an optional enrichment, so server.ts null-gates
// the whole billing module on this resolving rather than letting routes half-function.
export async function resolveMoyasarCredentials(): Promise<MoyasarCredentials | null> {
  const envValue = readEnvMoyasarCredentials()
  if (envValue) {
    return envValue
  }

  if (!canUseAwsSecretFallback({ secretId: MOYASAR_SECRET_ID })) {
    return null
  }

  try {
    return await new AwsSecretsMoyasarCredentialsProvider().load()
  } catch (error) {
    console.error("moyasar.credentials_load_failed", error)
    return null
  }
}
