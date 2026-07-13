// @vitest-environment node

import { describe, expect, it } from "vitest"

import { IntegrationProviderRegistry } from "../integrations/provider-registry"

describe("integration provider registry", () => {
  it("registers multiple providers without cross leakage", () => {
    const registry = new IntegrationProviderRegistry()
    registry.register({ providerId: "google-ads", displayName: "Google Ads" })
    registry.register({ providerId: "meta-ads", displayName: "Meta Ads" })

    expect(registry.find("google-ads")?.displayName).toBe("Google Ads")
    expect(registry.find("meta-ads")?.displayName).toBe("Meta Ads")
    expect(registry.list()).toHaveLength(2)
  })
})
