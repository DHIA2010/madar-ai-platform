import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { canUseAwsSecretFallback } from "../configuration/provider-credential-resolution"

export interface MaxmindCredentials {
  licenseKey: string
}

export const MAXMIND_SECRET_ID =
  process.env.IDENTITY_PLATFORM_MAXMIND_SECRET_ID?.trim() || "madar/maxmind/production"

function readEnvMaxmindCredentials(): MaxmindCredentials | null {
  const licenseKey = process.env.MAXMIND_LICENSE_KEY?.trim() ?? ""
  return licenseKey ? { licenseKey } : null
}

class AwsSecretsMaxmindCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<MaxmindCredentials> | null = null

  constructor(
    private readonly secretId = MAXMIND_SECRET_ID,
    region?: string
  ) {
    this.client = new SecretsManagerClient({
      region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    })
  }

  async load() {
    if (!this.cached) {
      // Same "don't poison the cache on a transient failure" pattern as the other
      // *-credentials.ts providers -- a failed load must not permanently prevent geo from ever
      // working again once the underlying issue (network blip, IAM propagation) clears.
      this.cached = this.loadOnce().catch((error: unknown) => {
        this.cached = null
        throw error
      })
    }

    return this.cached
  }

  private async loadOnce(): Promise<MaxmindCredentials> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretId }))
    const secret = response.SecretString
    if (!secret) {
      throw new Error("MAXMIND_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("MAXMIND_CONFIGURATION_ERROR")
    }

    const licenseKey = String(parsed.license_key ?? parsed.licenseKey ?? "").trim()
    if (!licenseKey) {
      throw new Error("MAXMIND_CONFIGURATION_ERROR")
    }

    return { licenseKey }
  }
}

// Unlike every other *-credentials.ts resolver in this codebase, a missing MaxMind license key
// is never a hard failure -- GeoIP is optional/best-effort (tracking must fail silently per
// spec). Returns null instead of throwing so callers just skip the database download and run
// with no geo enrichment, rather than crashing server startup.
export async function resolveMaxmindCredentials(): Promise<MaxmindCredentials | null> {
  const envValue = readEnvMaxmindCredentials()
  if (envValue) {
    return envValue
  }

  if (!canUseAwsSecretFallback({ secretId: MAXMIND_SECRET_ID })) {
    return null
  }

  try {
    return await new AwsSecretsMaxmindCredentialsProvider().load()
  } catch (error) {
    console.error("maxmind.credentials_load_failed", error)
    return null
  }
}
