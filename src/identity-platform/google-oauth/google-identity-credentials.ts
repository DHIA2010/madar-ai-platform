import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

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
    this.client = new SecretsManagerClient({ region: region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION })
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
