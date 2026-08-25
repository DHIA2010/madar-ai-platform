// @vitest-environment node
import { describe, expect, it } from "vitest"

import { loadIdentityPlatformConfig } from "../configuration"

describe("loadIdentityPlatformConfig shortLinkBaseUrl fallback", () => {
  it("falls back to appUrl when it's already https:// and no explicit override is set", () => {
    const config = loadIdentityPlatformConfig({ appUrl: "https://app.madar.my" })
    expect(config.shortLinkBaseUrl).toBe("https://app.madar.my")
  })

  it("does NOT fall back through a plain http:// appUrl (would violate short_url's https check constraint) -- keeps the hardcoded localhost default instead", () => {
    const config = loadIdentityPlatformConfig({ appUrl: "http://localhost:3000" })
    expect(config.shortLinkBaseUrl).toBe("https://localhost:3000")
  })

  it("an explicit shortLinkBaseUrl override always wins over the appUrl fallback", () => {
    const config = loadIdentityPlatformConfig({
      appUrl: "https://app.madar.my",
      shortLinkBaseUrl: "https://mdr.link",
    })
    expect(config.shortLinkBaseUrl).toBe("https://mdr.link")
  })
})
