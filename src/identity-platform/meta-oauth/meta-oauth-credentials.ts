import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

// This is the Meta App's OAuth client identity (App ID / App Secret from Meta Developer
// Console) -- deliberately a separate secret from madar/prod/connectors/meta, which only ever
// held a single diagnostic access token and must not be reused as the production customer
// authentication mechanism.
export interface MetaOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface MetaOAuthCredentialsProvider {
  load(): Promise<MetaOAuthCredentials>
}

export const META_OAUTH_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_META_OAUTH_SECRET_ID?.trim() || "madar/prod/oauth/meta"

function readEnvMetaOAuthCredentials(): MetaOAuthCredentials | null {
  const clientId = process.env.META_OAUTH_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.META_OAUTH_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: MetaOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("META_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticMetaOAuthCredentialsProvider implements MetaOAuthCredentialsProvider {
  constructor(private readonly value: MetaOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsMetaOAuthCredentialsProvider implements MetaOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<MetaOAuthCredentials> | null = null

  constructor(
    private readonly secretId = META_OAUTH_INTEGRATION_SECRET_ID,
    region?: string
  ) {
    this.client = new SecretsManagerClient({
      region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    })
  }

  async load() {
    if (!this.cached) {
      this.cached = this.loadOnce()
    }

    return this.cached
  }

  private async loadOnce() {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretId }))
    const secret = response.SecretString

    if (!secret) {
      throw new Error("META_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("META_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? "").trim(),
      redirectUri: String(parsed.redirectUri ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstMetaOAuthCredentialsProvider implements MetaOAuthCredentialsProvider {
  constructor(
    private readonly fallback: MetaOAuthCredentialsProvider = new AwsSecretsMetaOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvMetaOAuthCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
