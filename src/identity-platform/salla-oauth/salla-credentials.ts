import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

export interface SallaOAuthCredentials {
  clientId: string
  clientSecret: string
  redirectUri?: string
  // Optional, unlike clientId/clientSecret -- mirrors billing/moyasar/credentials.ts's own
  // webhookSecret: a webhook can't be verified until the route is deployed and the Partner
  // Portal's Webhook URL is pointed at it, so OAuth connect/token-refresh must keep working
  // without one. The webhook route itself (server.ts) 503s if this is null.
  webhookSecret?: string | null
  // Optional -- only startAuthorization's App Store install URL needs this (see service.ts);
  // every other OAuth flow (refresh, webhook, disconnect) works without it.
  appId?: string
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
  const webhookSecret = process.env.SALLA_WEBHOOK_SECRET?.trim() ?? ""
  const appId = process.env.SALLA_APP_ID?.trim() ?? ""

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || undefined,
    webhookSecret: webhookSecret || null,
    appId: appId || undefined,
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
    // redirect_url) rather than the clientId/clientSecret convention the other
    // connectors' secrets use -- read both shapes so it works regardless.
    const webhookSecret = String(parsed.webhook_secret ?? parsed.webhookSecret ?? "").trim()
    const appId = String(parsed.app_id ?? parsed.appId ?? "").trim()
    return validateCredentials({
      clientId: String(parsed.client_id ?? parsed.clientId ?? "").trim(),
      clientSecret: String(parsed.client_secret ?? parsed.clientSecret ?? "").trim(),
      redirectUri: String(parsed.redirect_url ?? parsed.redirectUrl ?? "").trim() || undefined,
      webhookSecret: webhookSecret || null,
      appId: appId || undefined,
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

// Reuses the exact same env-first/AWS-Secrets-Manager-fallback credential load every OAuth
// consumer already goes through (same madar/salla/production secret, same SALLA_WEBHOOK_SECRET
// env var read inside readEnvSallaCredentials above) -- the webhook route just needs the one
// field out of it, returning null (not throwing) when it isn't configured yet, matching Moyasar's
// "webhook secret is optional, the route itself 503s" convention.
export async function resolveSallaWebhookCredentials(): Promise<{ webhookSecret: string } | null> {
  try {
    const credentials = await new EnvironmentFirstSallaOAuthCredentialsProvider().load()
    return credentials.webhookSecret ? { webhookSecret: credentials.webhookSecret } : null
  } catch (error) {
    console.error("salla.webhook_credentials_load_failed", error)
    return null
  }
}
