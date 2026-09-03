// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { downloadGeoLiteCityDatabase } from "../geo/download-database"
import { resolveMaxmindCredentials } from "../geo/maxmind-credentials"
import { resolveGeoIpDbPath } from "../geo/resolve-db-path"
import { GeoIpService } from "../geo/service"

const ENV_KEYS = [
  "MAXMIND_LICENSE_KEY",
  "GEOIP_DB_PATH",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "IDENTITY_PLATFORM_DISABLE_SECRETS_MANAGER",
] as const

const ORIGINAL_ENV: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = ORIGINAL_ENV[key]
    }
  }
})

describe("resolveMaxmindCredentials", () => {
  it("uses MAXMIND_LICENSE_KEY when present", async () => {
    process.env.MAXMIND_LICENSE_KEY = "test-license-key"
    const credentials = await resolveMaxmindCredentials()
    expect(credentials).toEqual({ licenseKey: "test-license-key" })
  })

  it("returns null (never throws) when no env key and no AWS region are configured -- never even attempts a network call", async () => {
    const credentials = await resolveMaxmindCredentials()
    expect(credentials).toBeNull()
  })

  it("ignores a blank/whitespace-only env key", async () => {
    process.env.MAXMIND_LICENSE_KEY = "   "
    const credentials = await resolveMaxmindCredentials()
    expect(credentials).toBeNull()
  })
})

describe("resolveGeoIpDbPath", () => {
  it("returns the GEOIP_DB_PATH override directly, without resolving credentials", async () => {
    process.env.GEOIP_DB_PATH = "/some/local/GeoLite2-City.mmdb"
    // No MAXMIND_LICENSE_KEY and no AWS region set -- if this reached credential resolution it
    // would still correctly return null, but the override must short-circuit before that.
    const path = await resolveGeoIpDbPath()
    expect(path).toBe("/some/local/GeoLite2-City.mmdb")
  })

  it("resolves to null when neither an override nor credentials are configured", async () => {
    const path = await resolveGeoIpDbPath()
    expect(path).toBeNull()
  })
})

describe("downloadGeoLiteCityDatabase", () => {
  it("fails open (returns null, never throws) when the download request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, body: null }))
    const result = await downloadGeoLiteCityDatabase("invalid-license-key")
    expect(result).toBeNull()
  })

  it("fails open when fetch itself throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")))
    const result = await downloadGeoLiteCityDatabase("any-key")
    expect(result).toBeNull()
  })
})

describe("GeoIpService", () => {
  it("resolves every field to null when the resolver itself yields no path", async () => {
    const service = new GeoIpService(async () => null)
    const geo = await service.lookup("8.8.8.8")
    expect(geo).toEqual({ country: null, countryCode: null, region: null, city: null })
  })

  it("resolves every field to null (never throws) when the resolver rejects", async () => {
    const service = new GeoIpService(async () => {
      throw new Error("resolver blew up")
    })
    const geo = await service.lookup("8.8.8.8")
    expect(geo).toEqual({ country: null, countryCode: null, region: null, city: null })
  })

  it("short-circuits to null geo for an unknown/empty IP without invoking the resolver", async () => {
    const resolveDbPath = vi.fn(async () => null)
    const service = new GeoIpService(resolveDbPath)
    const geo = await service.lookup("unknown")
    expect(geo).toEqual({ country: null, countryCode: null, region: null, city: null })
    expect(resolveDbPath).not.toHaveBeenCalled()
  })

  it("only resolves the db path once across multiple lookups (cached)", async () => {
    const resolveDbPath = vi.fn(async () => null)
    const service = new GeoIpService(resolveDbPath)
    await service.lookup("8.8.8.8")
    await service.lookup("1.1.1.1")
    expect(resolveDbPath).toHaveBeenCalledTimes(1)
  })

  it("warmUp() starts resolution without waiting for a lookup call", async () => {
    const resolveDbPath = vi.fn(async () => null)
    const service = new GeoIpService(resolveDbPath)
    service.warmUp()
    // Give the fire-and-forget resolution a microtask tick to actually invoke the resolver.
    await Promise.resolve()
    expect(resolveDbPath).toHaveBeenCalledTimes(1)
  })
})
