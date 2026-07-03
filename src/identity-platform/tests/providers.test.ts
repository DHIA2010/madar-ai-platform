import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { loadIdentityPlatformConfig } from "../configuration"
import { EnvironmentConfigurationProvider } from "../infrastructure/configuration/environment-configuration-provider"
import { SmtpEmailGateway } from "../infrastructure/email/smtp-email-gateway"
import { EnvironmentFeatureFlagProvider } from "../infrastructure/feature-flags/environment-feature-flag-provider"
import { LocalStorageProvider } from "../infrastructure/storage/local-storage-provider"

describe("provider foundation", () => {
  it("supports feature flags and configuration provider", async () => {
    const config = loadIdentityPlatformConfig({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
      featureFlags: { foundation_outbox: true },
    })

    const flags = new EnvironmentFeatureFlagProvider(config)
    const env = new EnvironmentConfigurationProvider({ TEST_VALUE: "ok" })

    expect(await flags.isEnabled({ key: "foundation_outbox" })).toBe(true)
    expect(env.require("TEST_VALUE")).toBe("ok")
  })

  it("supports local storage and smtp transport fallback", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "madar-identity-"))
    const config = loadIdentityPlatformConfig({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath,
      emailFrom: "identity@test.local",
    })

    const storage = new LocalStorageProvider(config)
    await storage.putObject({ key: "events/outbox.json", body: "hello" })
    expect((await storage.getObject("events/outbox.json"))?.toString("utf8")).toBe("hello")

    const email = new SmtpEmailGateway(config)
    await expect(
      email.sendVerificationEmail({ email: "owner@test.local", token: "token-1" })
    ).resolves.toBeUndefined()
  })
})
