import { GOOGLE_INTEGRATION_SECRET_ID } from "../google-oauth/google-identity-credentials"
import { SNAPCHAT_INTEGRATION_SECRET_ID } from "../snapchat-oauth/snapchat-credentials"
import {
  canUseAwsSecretFallback,
  hasAwsRegionConfigured,
  isSecretsManagerEnabled,
} from "./provider-credential-resolution"

function hasGoogleEnvCredentials() {
  return [
    process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID,
    process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN,
    process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI,
  ].every((value) => (value ?? "").trim().length > 0)
}

function hasSnapchatEnvCredentials() {
  return [
    process.env.SNAPCHAT_CLIENT_ID,
    process.env.SNAPCHAT_CLIENT_SECRET,
  ].every((value) => (value ?? "").trim().length > 0)
}

function assertEncryptionKeyConfigured() {
  const key =
    process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY?.trim()
    || process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET?.trim()
    || ""

  const forbiddenDefaults = new Set([
    "",
    "dev_identity_token_hash_change_me",
    "dev_identity_secret_change_me",
  ])

  if (forbiddenDefaults.has(key)) {
    throw new Error("IDENTITY_PLATFORM_PRODUCTION_SECRET_VALIDATION_FAILED")
  }
}

function assertProviderCredentialsSource(input: {
  provider: string
  hasEnvCredentials: boolean
  awsSecretId: string
}) {
  if (input.hasEnvCredentials) {
    return
  }

  if (
    canUseAwsSecretFallback({
      secretId: input.awsSecretId,
      disableSecretsManagerEnvVar: "IDENTITY_PLATFORM_DISABLE_SECRETS_MANAGER",
    })
  ) {
    return
  }

  throw new Error(
    `IDENTITY_PLATFORM_PRODUCTION_SECRET_VALIDATION_FAILED:${input.provider.toUpperCase()}_CREDENTIAL_SOURCE_MISSING`
  )
}

export function validateProductionIntegrationConfiguration() {
  if (process.env.NODE_ENV !== "production") {
    return
  }

  assertEncryptionKeyConfigured()

  const googleEnvCredentials = hasGoogleEnvCredentials()
  const snapchatEnvCredentials = hasSnapchatEnvCredentials()

  assertProviderCredentialsSource({
    provider: "google",
    hasEnvCredentials: googleEnvCredentials,
    awsSecretId: GOOGLE_INTEGRATION_SECRET_ID,
  })

  assertProviderCredentialsSource({
    provider: "snapchat",
    hasEnvCredentials: snapchatEnvCredentials,
    awsSecretId: SNAPCHAT_INTEGRATION_SECRET_ID,
  })

  if (!googleEnvCredentials || !snapchatEnvCredentials) {
    if (isSecretsManagerEnabled("IDENTITY_PLATFORM_DISABLE_SECRETS_MANAGER") && !hasAwsRegionConfigured()) {
      throw new Error("IDENTITY_PLATFORM_PRODUCTION_SECRET_VALIDATION_FAILED:AWS_REGION_MISSING")
    }
  }
}
