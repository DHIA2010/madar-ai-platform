import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface GoogleIdentityCredentials {
  clientId: string
  clientSecret: string
  developerToken: string
  redirectUri: string
}

export interface GoogleIdentityCredentialsProvider {
  load(): Promise<GoogleIdentityCredentials>
}

export const GOOGLE_INTEGRATION_SECRET_ID = "madar/stage/integrations/google"

function readEnvGoogleIdentityCredentials(): GoogleIdentityCredentials | null {
  const clientId = process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? ""
  const developerToken = process.env.IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? ""
  const redirectUri = process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI?.trim() ?? ""

  // Environment is selected only when the full credential set exists.
  if (!clientId || !clientSecret || !developerToken || !redirectUri) {
    return null
  }

  return {
    clientId,
    clientSecret,
    developerToken,
    redirectUri,
  }
}

function validateCredentials(value: GoogleIdentityCredentials) {
  if (!value.clientId.trim()) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }
  if (!value.clientSecret.trim()) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }
  if (!value.developerToken.trim()) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }
  if (!value.redirectUri.trim()) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  try {
    const parsed = new URL(value.redirectUri)
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("invalid protocol")
    }
  } catch {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  return value
}

export class StaticGoogleIdentityCredentialsProvider implements GoogleIdentityCredentialsProvider {
  constructor(private readonly value: GoogleIdentityCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsGoogleIdentityCredentialsProvider implements GoogleIdentityCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<GoogleIdentityCredentials> | null = null

  constructor(
    private readonly secretId = GOOGLE_INTEGRATION_SECRET_ID,
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
      throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? "").trim(),
      developerToken: String(parsed.developerToken ?? "").trim(),
      redirectUri: String(parsed.redirectUri ?? "").trim(),
    })
  }
}

export class EnvironmentFirstGoogleIdentityCredentialsProvider implements GoogleIdentityCredentialsProvider {
  constructor(
    private readonly fallback: GoogleIdentityCredentialsProvider = new AwsSecretsGoogleIdentityCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvGoogleIdentityCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
