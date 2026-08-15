import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface GoogleAnalyticsOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface GoogleAnalyticsOAuthCredentialsProvider {
  load(): Promise<GoogleAnalyticsOAuthCredentials>
}

// Deliberately separate from GOOGLE_INTEGRATION_SECRET_ID (google-oauth/google-identity-credentials.ts,
// the Google Ads OAuth client) -- Google Analytics uses its own OAuth Client in Google Cloud with its
// own scopes, so it gets its own secret rather than sharing Google Ads' credentials.
export const GOOGLE_ANALYTICS_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_GOOGLE_ANALYTICS_OAUTH_SECRET_ID?.trim() ||
  "madar/prod/oauth/google-analytics"

function readEnvGoogleAnalyticsCredentials(): GoogleAnalyticsOAuthCredentials | null {
  const clientId = process.env.GOOGLE_ANALYTICS_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.GOOGLE_ANALYTICS_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.GOOGLE_ANALYTICS_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: GoogleAnalyticsOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticGoogleAnalyticsOAuthCredentialsProvider implements GoogleAnalyticsOAuthCredentialsProvider {
  constructor(private readonly value: GoogleAnalyticsOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsGoogleAnalyticsOAuthCredentialsProvider implements GoogleAnalyticsOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<GoogleAnalyticsOAuthCredentials> | null = null

  constructor(
    private readonly secretId = GOOGLE_ANALYTICS_INTEGRATION_SECRET_ID,
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
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? "").trim(),
      // The secret stores this key as redirectUrl -- read both spellings defensively
      // (same fix applied to shopify-credentials.ts for the identical mismatch).
      redirectUri: String(parsed.redirectUrl ?? parsed.redirectUri ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider implements GoogleAnalyticsOAuthCredentialsProvider {
  constructor(
    private readonly fallback: GoogleAnalyticsOAuthCredentialsProvider = new AwsSecretsGoogleAnalyticsOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvGoogleAnalyticsCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
