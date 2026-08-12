// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EnvironmentFirstMetaAdsCredentialsProvider,
  type MetaAdsCredentials,
  type MetaAdsCredentialsProvider,
} from "../meta-ads/credentials"

const ENV_ACCESS_TOKEN = "META_ACCESS_TOKEN"

const ENV_CREDENTIALS: MetaAdsCredentials = { accessToken: "env-supplied-token" }
const FALLBACK_CREDENTIALS: MetaAdsCredentials = { accessToken: "aws-secrets-token" }

const ORIGINAL_ENV = process.env[ENV_ACCESS_TOKEN]

function setEnvToken(value: string | undefined) {
  if (value === undefined) {
    delete process.env[ENV_ACCESS_TOKEN]
  } else {
    process.env[ENV_ACCESS_TOKEN] = value
  }
}

describe("environment-first meta ads credentials provider", () => {
  beforeEach(() => {
    setEnvToken(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setEnvToken(ORIGINAL_ENV)
  })

  it("uses the environment token when present", async () => {
    setEnvToken(ENV_CREDENTIALS.accessToken)

    const fallbackLoad = vi
      .fn<MetaAdsCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: MetaAdsCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstMetaAdsCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(ENV_CREDENTIALS)
    expect(fallbackLoad).not.toHaveBeenCalled()
  })

  it("falls back to the AWS secrets provider when no env token is set", async () => {
    setEnvToken(undefined)

    const fallbackLoad = vi
      .fn<MetaAdsCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: MetaAdsCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstMetaAdsCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })

  it("ignores a blank/whitespace-only env token and falls back", async () => {
    setEnvToken("   ")

    const fallbackLoad = vi
      .fn<MetaAdsCredentialsProvider["load"]>()
      .mockResolvedValue(FALLBACK_CREDENTIALS)
    const fallback: MetaAdsCredentialsProvider = { load: fallbackLoad }

    const provider = new EnvironmentFirstMetaAdsCredentialsProvider(fallback)
    const resolved = await provider.load()

    expect(resolved).toEqual(FALLBACK_CREDENTIALS)
    expect(fallbackLoad).toHaveBeenCalledTimes(1)
  })
})
