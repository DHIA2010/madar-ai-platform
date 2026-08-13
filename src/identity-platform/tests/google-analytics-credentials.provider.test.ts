// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider,
  type GoogleAnalyticsOAuthCredentials,
  type GoogleAnalyticsOAuthCredentialsProvider,
} from "../google-analytics-oauth/google-analytics-credentials"

const ENV_CLIENT_ID = "GOOGLE_ANALYTICS_CLIENT_ID"
const ENV_CLIENT_SECRET = "GOOGLE_ANALYTICS_CLIENT_SECRET"
const ENV_REDIRECT_URI = "GOOGLE_ANALYTICS_REDIRECT_URI"

const ENV_CREDENTIALS: GoogleAnalyticsOAuthCredentials = {
  clientId: "env-google-analytics-client-id",
  clientSecret: "env-google-analytics-client-secret",
  redirectUri: "http://localhost:4000/v1/integrations/google-analytics/oauth/callback",
}

const FALLBACK_CREDENTIALS: GoogleAnalyticsOAuthCredentials = {
  clientId: "aws-google-analytics-client-id",
  clientSecret: "aws-google-analytics-client-secret",
  redirectUri: "https://api.madar.my/v1/integrations/google-analytics/oauth/callback",
}

const ORIGINAL_ENV = {
  clientId: process.env[ENV_CLIENT_ID],
  clientSecret: process.env[ENV_CLIENT_SECRET],
  redirectUri: process.env[ENV_REDIRECT_URI],
}

function setEnvCredentials(value: Partial<GoogleAnalyticsOAuthCredentials>) {
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

  if (value.redirectUri === undefined) {
    delete process.env[ENV_REDIRECT_URI]
  } else {
    process.env[ENV_REDIRECT_URI] = value.redirectUri
  }
}

function restoreOriginalEnv() {
  setEnvCredentials(ORIGINAL_ENV as Partial<GoogleAnalyticsOAuthCredentials>)
}

describe("environment-first google analytics oauth credentials provider", () => {
  beforeEach(() => {
    setEnvCredentials({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreOriginalEnv()
  })

  it("uses environment credentials when configuration is complete", async () => {
    setEnvCredentials(ENV_CREDENTIALS)

    const fallbackLoad = vi
      .fn<GoogleAnalyticsOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleAnalyticsOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(ENV_CREDENTIALS)
    expect(fallbackLoad).not.toHaveBeenCalled()
  })

  it("ignores partial environment and uses fallback", async () => {
    setEnvCredentials({ clientId: undefined, clientSecret: undefined })

    const fallbackLoad = vi
      .fn<GoogleAnalyticsOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleAnalyticsOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })

  it("uses fallback (AWS Secrets Manager) when no environment variables are present", async () => {
    setEnvCredentials({})

    const fallbackLoad = vi
      .fn<GoogleAnalyticsOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: GoogleAnalyticsOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })
})
