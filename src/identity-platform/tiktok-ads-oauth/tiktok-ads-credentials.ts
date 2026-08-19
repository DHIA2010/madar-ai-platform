import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface TikTokAdsOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface TikTokAdsOAuthCredentialsProvider {
  load(): Promise<TikTokAdsOAuthCredentials>
}

export const TIKTOK_ADS_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_TIKTOK_ADS_OAUTH_SECRET_ID?.trim() || "madar/prod/oauth/tiktok"

function readEnvTikTokAdsCredentials(): TikTokAdsOAuthCredentials | null {
  const clientId = process.env.TIKTOK_ADS_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.TIKTOK_ADS_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.TIKTOK_ADS_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: TikTokAdsOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("TIKTOK_ADS_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("TIKTOK_ADS_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticTikTokAdsOAuthCredentialsProvider implements TikTokAdsOAuthCredentialsProvider {
  constructor(private readonly value: TikTokAdsOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsTikTokAdsOAuthCredentialsProvider implements TikTokAdsOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<TikTokAdsOAuthCredentials> | null = null

  constructor(
    private readonly secretId = TIKTOK_ADS_INTEGRATION_SECRET_ID,
    region?: string
  ) {
    this.client = new SecretsManagerClient({
      region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    })
  }

  async load() {
    if (!this.cached) {
      // A failed load (e.g. a transient IAM/network error) must not poison this
      // singleton forever -- clear the cache on rejection so the next call retries
      // instead of replaying the same stale error until the process restarts.
      this.cached = this.loadOnce().catch((error: unknown) => {
        this.cached = null
        throw error
      })
    }

    return this.cached
  }

  private async loadOnce() {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretId }))
    const secret = response.SecretString

    if (!secret) {
      throw new Error("TIKTOK_ADS_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("TIKTOK_ADS_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? parsed.client_id ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? parsed.client_secret ?? "").trim(),
      redirectUri: String(parsed.redirectUrl ?? parsed.redirect_url ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstTikTokAdsOAuthCredentialsProvider implements TikTokAdsOAuthCredentialsProvider {
  constructor(
    private readonly fallback: TikTokAdsOAuthCredentialsProvider = new AwsSecretsTikTokAdsOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvTikTokAdsCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
