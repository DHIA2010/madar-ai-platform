import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface ShopifyOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface ShopifyOAuthCredentialsProvider {
  load(): Promise<ShopifyOAuthCredentials>
}

export const SHOPIFY_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_SHOPIFY_OAUTH_SECRET_ID?.trim() || "madar/prod/oauth/shopify"

function readEnvShopifyCredentials(): ShopifyOAuthCredentials | null {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim() ?? ""
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() ?? ""
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
  }
}

function validateCredentials(value: ShopifyOAuthCredentials) {
  if (!value.clientId.trim() || !value.clientSecret.trim()) {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
  }

  if (value.redirectUri) {
    try {
      const parsed = new URL(value.redirectUri)
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid protocol")
      }
    } catch {
      throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
    }
  }

  return value
}

export class StaticShopifyOAuthCredentialsProvider implements ShopifyOAuthCredentialsProvider {
  constructor(private readonly value: ShopifyOAuthCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsShopifyOAuthCredentialsProvider implements ShopifyOAuthCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<ShopifyOAuthCredentials> | null = null

  constructor(
    private readonly secretId = SHOPIFY_INTEGRATION_SECRET_ID,
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
      throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      clientId: String(parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.clientSecret ?? "").trim(),
      // The secret currently stores this key as redirectUrl -- read both spellings
      // defensively so this keeps working if it's ever renamed back to redirectUri
      // (the spelling every other connector's secret uses).
      redirectUri: String(parsed.redirectUrl ?? parsed.redirectUri ?? "").trim() || undefined,
    })
  }
}

export class EnvironmentFirstShopifyOAuthCredentialsProvider implements ShopifyOAuthCredentialsProvider {
  constructor(
    private readonly fallback: ShopifyOAuthCredentialsProvider = new AwsSecretsShopifyOAuthCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvShopifyCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
