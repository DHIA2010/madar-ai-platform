import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

import { resolveEnvironmentThenAwsCredentials } from "../configuration/provider-credential-resolution"

// This provider intentionally only carries an access token (not client id/secret), because
// there is no Meta OAuth authorization-code flow wired into MADAR yet -- see the diagnostics
// report for why. The token is whatever the operator obtained from Meta's Graph API Explorer
// (or, once a real OAuth flow exists, from that exchange) and is never logged or echoed back.
export interface MetaAdsCredentials {
  accessToken: string
}

export interface MetaAdsCredentialsProvider {
  load(): Promise<MetaAdsCredentials>
}

export const META_ADS_INTEGRATION_SECRET_ID =
  process.env.IDENTITY_PLATFORM_META_OAUTH_SECRET_ID?.trim() || "madar/prod/connectors/meta"

function readEnvMetaCredentials(): MetaAdsCredentials | null {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim() ?? ""
  if (!accessToken) {
    return null
  }
  return { accessToken }
}

function validateCredentials(value: MetaAdsCredentials) {
  if (!value.accessToken.trim()) {
    throw new Error("META_ADS_CONFIGURATION_ERROR")
  }
  return value
}

export class StaticMetaAdsCredentialsProvider implements MetaAdsCredentialsProvider {
  constructor(private readonly value: MetaAdsCredentials) {}

  async load() {
    return validateCredentials(this.value)
  }
}

export class AwsSecretsMetaAdsCredentialsProvider implements MetaAdsCredentialsProvider {
  private readonly client: SecretsManagerClient
  private cached: Promise<MetaAdsCredentials> | null = null

  constructor(
    private readonly secretId = META_ADS_INTEGRATION_SECRET_ID,
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
      throw new Error("META_ADS_CONFIGURATION_ERROR")
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(secret) as Record<string, unknown>
    } catch {
      throw new Error("META_ADS_CONFIGURATION_ERROR")
    }

    return validateCredentials({
      accessToken: String(parsed.accessToken ?? "").trim(),
    })
  }
}

export class EnvironmentFirstMetaAdsCredentialsProvider implements MetaAdsCredentialsProvider {
  constructor(
    private readonly fallback: MetaAdsCredentialsProvider = new AwsSecretsMetaAdsCredentialsProvider()
  ) {}

  async load() {
    return resolveEnvironmentThenAwsCredentials({
      readEnv: readEnvMetaCredentials,
      validate: validateCredentials,
      loadFromAws: () => this.fallback.load(),
    })
  }
}
