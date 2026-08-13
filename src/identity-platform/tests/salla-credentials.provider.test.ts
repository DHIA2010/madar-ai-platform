// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EnvironmentFirstSallaOAuthCredentialsProvider,
  type SallaOAuthCredentials,
  type SallaOAuthCredentialsProvider,
} from "../salla-oauth/salla-credentials"

const ENV_CLIENT_ID = "SALLA_CLIENT_ID"
const ENV_CLIENT_SECRET = "SALLA_CLIENT_SECRET"
const ENV_REDIRECT_URI = "SALLA_REDIRECT_URI"

const ENV_CREDENTIALS: SallaOAuthCredentials = {
  clientId: "env-salla-client-id",
  clientSecret: "env-salla-client-secret",
  redirectUri: "http://localhost:4000/v1/integrations/salla/oauth/callback",
}

const FALLBACK_CREDENTIALS: SallaOAuthCredentials = {
  clientId: "aws-salla-client-id",
  clientSecret: "aws-salla-client-secret",
  redirectUri: "https://api.madar.my/v1/integrations/salla/oauth/callback",
}

const ORIGINAL_ENV = {
  clientId: process.env[ENV_CLIENT_ID],
  clientSecret: process.env[ENV_CLIENT_SECRET],
  redirectUri: process.env[ENV_REDIRECT_URI],
}

function setEnvCredentials(value: Partial<SallaOAuthCredentials>) {
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
  setEnvCredentials(ORIGINAL_ENV as Partial<SallaOAuthCredentials>)
}

describe("environment-first salla oauth credentials provider", () => {
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
      .fn<SallaOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: SallaOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstSallaOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(ENV_CREDENTIALS)
    expect(fallbackLoad).not.toHaveBeenCalled()
  })

  it("ignores partial environment and uses fallback", async () => {
    setEnvCredentials({ clientId: undefined, clientSecret: undefined })

    const fallbackLoad = vi
      .fn<SallaOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: SallaOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstSallaOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })

  it("uses fallback when no environment variables are present", async () => {
    setEnvCredentials({})

    const fallbackLoad = vi
      .fn<SallaOAuthCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: SallaOAuthCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstSallaOAuthCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })
})
