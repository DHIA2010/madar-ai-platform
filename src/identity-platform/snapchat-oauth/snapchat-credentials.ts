import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface SnapchatOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface SnapchatOAuthCredentialsProvider {
  load(): Promise<SnapchatOAuthCredentials>
}

export const SNAPCHAT_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_SNAPCHAT_OAUTH_SECRET_ID?.trim() || "madar/stage/integrations/snapchat"

function readEnvSnapchatCredentials(): SnapchatOAuthCredentials | null {
  const clientId = process.env.SNAPCHAT_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.SNAPCHAT_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: SnapchatOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("SNAPCHAT_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("SNAPCHAT_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticSnapchatOAuthCredentialsProvider implements SnapchatOAuthCredentialsProvider {
  constructor(private readonly value: SnapchatOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsSnapchatOAuthCredentialsProvider implements SnapchatOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<SnapchatOAuthCredentials> | null = null

  constructor(
    private readonly secretId = SNAPCHAT_INTEGRATION_SECRET_ID,
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
      throw new Error("SNAPCHAT_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("SNAPCHAT_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? "").trim(),
      redirectUri: String(parsed.redirectUri ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstSnapchatOAuthCredentialsProvider
implements SnapchatOAuthCredentialsProvider {
  constructor(
    private readonly fallback: SnapchatOAuthCredentialsProvider =
      new AwsSecretsSnapchatOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvSnapchatCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
