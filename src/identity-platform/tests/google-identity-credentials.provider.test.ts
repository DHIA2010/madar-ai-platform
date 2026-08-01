// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EnvironmentFirstGoogleIdentityCredentialsProvider,
  type GoogleIdentityCredentials,
  type GoogleIdentityCredentialsProvider,
} from "../google-oauth/google-identity-credentials"

const ENV_CLIENT_ID = "IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID"
const ENV_CLIENT_SECRET = "IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET"
const ENV_DEVELOPER_TOKEN = "IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN"
const ENV_REDIRECT_URI = "IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI"

const COMPLETE_ENV_CREDENTIALS: GoogleIdentityCredentials = {
  clientId: "env-client-id.apps.googleusercontent.com",
  clientSecret: "env-client-secret",
  developerToken: "env-developer-token",
  redirectUri: "http://localhost:4000/v1/integrations/google/oauth/callback",
}

const FALLBACK_CREDENTIALS: GoogleIdentityCredentials = {
  clientId: "aws-client-id.apps.googleusercontent.com",
  clientSecret: "aws-client-secret",
  developerToken: "aws-developer-token",
  redirectUri: "http://localhost:4000/v1/integrations/google/oauth/callback",
}

const ORIGINAL_ENV = {
  clientId: process.env[ENV_CLIENT_ID],
  clientSecret: process.env[ENV_CLIENT_SECRET],
  developerToken: process.env[ENV_DEVELOPER_TOKEN],
  redirectUri: process.env[ENV_REDIRECT_URI],
}

function setEnvCredentials(value: Partial<GoogleIdentityCredentials>) {
  if (value.clientId === undefined) {
    delete process.env[ENV_CLIENT_ID]
  } else {
    process.env[ENV_CLIENT_ID] = value.clientId
  }

  if (value.clientSecret === undefined) {
    delete process.env[ENV_CLIENT_SECRET]
  } else {
    process.env[ENV_CLIENT_SECRET] = value.clientSecret
  }

  if (value.developerToken === undefined) {
    delete process.env[ENV_DEVELOPER_TOKEN]
  } else {
    process.env[ENV_DEVELOPER_TOKEN] = value.developerToken
  }

  if (value.redirectUri === undefined) {
    delete process.env[ENV_REDIRECT_URI]
  } else {
    process.env[ENV_REDIRECT_URI] = value.redirectUri
  }
}

function restoreOriginalEnv() {
  if (ORIGINAL_ENV.clientId === undefined) {
    delete process.env[ENV_CLIENT_ID]
  } else {
    process.env[ENV_CLIENT_ID] = ORIGINAL_ENV.clientId
  }

  if (ORIGINAL_ENV.clientSecret === undefined) {
    delete process.env[ENV_CLIENT_SECRET]
  } else {
    process.env[ENV_CLIENT_SECRET] = ORIGINAL_ENV.clientSecret
  }

  if (ORIGINAL_ENV.developerToken === undefined) {
    delete process.env[ENV_DEVELOPER_TOKEN]
  } else {
    process.env[ENV_DEVELOPER_TOKEN] = ORIGINAL_ENV.developerToken
  }

  if (ORIGINAL_ENV.redirectUri === undefined) {
    delete process.env[ENV_REDIRECT_URI]
  } else {
    process.env[ENV_REDIRECT_URI] = ORIGINAL_ENV.redirectUri
  }
}

describe("environment-first google identity credentials provider", () => {
  beforeEach(() => {
    setEnvCredentials({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreOriginalEnv()
  })

  it("uses environment credentials when configuration is complete", async () => {
    setEnvCredentials(COMPLETE_ENV_CREDENTIALS)

    const fallbackLoad = vi.fn<GoogleIdentityCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleIdentityCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleIdentityCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(COMPLETE_ENV_CREDENTIALS)
    expect(fallbackLoad).not.toHaveBeenCalled()
  })

  it("ignores partial environment and uses fallback", async () => {
    setEnvCredentials({
      clientId: undefined,
      clientSecret: undefined,
      developerToken: COMPLETE_ENV_CREDENTIALS.developerToken,
      redirectUri: COMPLETE_ENV_CREDENTIALS.redirectUri,
    })

    const fallbackLoad = vi.fn<GoogleIdentityCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleIdentityCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleIdentityCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })

  it("uses fallback when no environment variables are present", async () => {
    setEnvCredentials({})

    const fallbackLoad = vi.fn<GoogleIdentityCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleIdentityCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleIdentityCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })

  it("keeps environment precedence over fallback when env is complete", async () => {
    setEnvCredentials(COMPLETE_ENV_CREDENTIALS)

    const fallbackLoad = vi.fn<GoogleIdentityCredentialsProvider["load"]>()
      .mockRejectedValue(new Error("fallback should not be used"))
    const fallback: GoogleIdentityCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleIdentityCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(COMPLETE_ENV_CREDENTIALS)
    expect(fallbackLoad).not.toHaveBeenCalled()
  })
})
