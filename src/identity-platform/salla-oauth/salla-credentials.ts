import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface SallaOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface SallaOAuthCredentialsProvider {
  load(): Promise<SallaOAuthCredentials>
}

export const SALLA_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_SALLA_OAUTH_SECRET_ID?.trim() || "madar/salla/production"

function readEnvSallaCredentials(): SallaOAuthCredentials | null {
  const clientId = process.env.SALLA_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.SALLA_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.SALLA_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: SallaOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticSallaOAuthCredentialsProvider implements SallaOAuthCredentialsProvider {
  constructor(private readonly value: SallaOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsSallaOAuthCredentialsProvider implements SallaOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<SallaOAuthCredentials> | null = null

  constructor(
    private readonly secretId = SALLA_INTEGRATION_SECRET_ID,
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
      throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
    }

    // This secret was provisioned with snake_case keys (client_id/client_secret/
    // redirect_uri) rather than the clientId/clientSecret convention the other
    // connectors' secrets use -- read both shapes so it works regardless.
    return validateCredentials({
      clientId: String(parsed.client_id ?? parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.client_secret ?? parsed.clientSecret ?? "").trim(),
      redirectUri: String(parsed.redirect_uri ?? parsed.redirectUri ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstSallaOAuthCredentialsProvider implements SallaOAuthCredentialsProvider {
  constructor(
    private readonly fallback: SallaOAuthCredentialsProvider = new AwsSecretsSallaOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvSallaCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
