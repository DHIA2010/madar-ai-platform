// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  appendRawFragment,
  buildPlatformMacroFragment,
  extractPlatformSignals,
} from "../tracking/platform-macros"

describe("buildPlatformMacroFragment", () => {
  it("returns an empty string when platform is null", () => {
    expect(buildPlatformMacroFragment(null)).toBe("")
  })

  it("builds Google Ads macros with literal, unescaped braces", () => {
    const fragment = buildPlatformMacroFragment("google_ads")
    expect(fragment).toContain("gclid={gclid}")
    expect(fragment).toContain("madar_ad_campaign_id={campaignid}")
    expect(fragment).toContain("madar_ad_adgroup_id={adgroupid}")
    expect(fragment).toContain("madar_ad_keyword={keyword}")
    expect(fragment).toContain("madar_ad_creative_id={creative}")
    // Regression guard for the encoding bug: nothing here should ever be percent-encoded.
    expect(fragment).not.toContain("%7B")
    expect(fragment).not.toContain("%7D")
  })

  it("builds Meta macros without an outbound click-id macro (fbclid is auto-appended by Meta)", () => {
    const fragment = buildPlatformMacroFragment("meta_ads")
    expect(fragment).not.toContain("fbclid")
    expect(fragment).toContain("madar_ad_campaign_id={{campaign.id}}")
    expect(fragment).toContain("madar_ad_adgroup_id={{adset.id}}")
    expect(fragment).toContain("madar_ad_creative_id={{ad.id}}")
    expect(fragment).not.toContain("madar_ad_keyword")
  })

  it("builds TikTok macros without an adgroup token (no TikTok equivalent exists)", () => {
    const fragment = buildPlatformMacroFragment("tiktok_ads")
    expect(fragment).not.toContain("ttclid")
    expect(fragment).toContain("madar_ad_campaign_id=__CAMPAIGN_ID__")
    expect(fragment).toContain("madar_ad_creative_id=__CID__")
    expect(fragment).not.toContain("madar_ad_adgroup_id")
    expect(fragment).not.toContain("madar_ad_keyword")
  })

  it("builds an empty Snapchat fragment (entity-ID macros unverified, click-id auto-appended)", () => {
    expect(buildPlatformMacroFragment("snapchat_ads")).toBe("")
  })
})

describe("appendRawFragment", () => {
  it("appends with a leading question mark on a bare URL", () => {
    expect(appendRawFragment("https://mdr.link/m/ABC123", "gclid={gclid}")).toBe(
      "https://mdr.link/m/ABC123?gclid={gclid}"
    )
  })

  it("appends with an ampersand when the URL already has a query string", () => {
    expect(appendRawFragment("https://example.com/landing?utm_source=x", "gclid={gclid}")).toBe(
      "https://example.com/landing?utm_source=x&gclid={gclid}"
    )
  })

  it("returns the base URL unchanged for an empty fragment", () => {
    expect(appendRawFragment("https://example.com/landing", "")).toBe("https://example.com/landing")
  })
})

describe("extractPlatformSignals", () => {
  it("extracts a Google click id and entity macros resolved on an incoming request", () => {
    const params = new URLSearchParams(
      "gclid=abc123&madar_ad_campaign_id=999&madar_ad_adgroup_id=888&madar_ad_keyword=running+shoes&madar_ad_creative_id=777"
    )
    expect(extractPlatformSignals(params)).toEqual({
      clickId: "abc123",
      clickIdPlatform: "google_ads",
      platformCampaignId: "999",
      platformAdgroupId: "888",
      platformKeyword: "running shoes",
      platformCreativeId: "777",
    })
  })

  it("extracts fbclid as a Meta click id", () => {
    const params = new URLSearchParams("fbclid=xyz789")
    const result = extractPlatformSignals(params)
    expect(result.clickId).toBe("xyz789")
    expect(result.clickIdPlatform).toBe("meta_ads")
  })

  it("extracts ttclid as a TikTok click id", () => {
    const params = new URLSearchParams("ttclid=tt456")
    const result = extractPlatformSignals(params)
    expect(result.clickId).toBe("tt456")
    expect(result.clickIdPlatform).toBe("tiktok_ads")
  })

  it("returns all-null when no known params are present", () => {
    expect(extractPlatformSignals(new URLSearchParams("foo=bar"))).toEqual({
      clickId: null,
      clickIdPlatform: null,
      platformCampaignId: null,
      platformAdgroupId: null,
      platformKeyword: null,
      platformCreativeId: null,
    })
  })

  it("treats an empty param value the same as absent", () => {
    const result = extractPlatformSignals(new URLSearchParams("gclid=&madar_ad_campaign_id="))
    expect(result.clickId).toBeNull()
    expect(result.platformCampaignId).toBeNull()
  })
})
