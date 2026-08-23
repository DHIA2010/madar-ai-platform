// @vitest-environment node
import { describe, expect, it } from "vitest"

import { appendUtmToUrl, buildUtmQueryString, normalizeUtmValue } from "../tracking/utm"

describe("normalizeUtmValue", () => {
  it("lowercases and slugifies", () => {
    expect(normalizeUtmValue("Summer Sale 2026")).toBe("summer-sale-2026")
  })

  it("trims and collapses repeated separators", () => {
    expect(normalizeUtmValue("  spring   --  promo  ")).toBe("spring-promo")
  })

  it("preserves non-Latin scripts", () => {
    expect(normalizeUtmValue("حملة الصيف")).toBe("حملة-الصيف")
  })

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeUtmValue("   ")).toBe("")
  })

  it("truncates very long values", () => {
    const long = "a".repeat(200)
    expect(normalizeUtmValue(long).length).toBe(100)
  })
})

describe("buildUtmQueryString", () => {
  it("includes only defined params in a fixed order", () => {
    const query = buildUtmQueryString({
      utm_campaign: "summer-sale",
      utm_source: "tiktok",
      utm_medium: "cpc",
    })
    expect(query).toBe("utm_source=tiktok&utm_medium=cpc&utm_campaign=summer-sale")
  })

  it("omits empty/null/undefined values", () => {
    const query = buildUtmQueryString({
      utm_source: "tiktok",
      utm_content: null,
      utm_term: undefined,
    })
    expect(query).toBe("utm_source=tiktok")
  })

  it("returns an empty string when nothing is set", () => {
    expect(buildUtmQueryString({})).toBe("")
  })
})

describe("appendUtmToUrl", () => {
  it("appends with a leading question mark on a bare URL", () => {
    expect(appendUtmToUrl("https://example.com/landing", { utm_source: "tiktok" })).toBe(
      "https://example.com/landing?utm_source=tiktok"
    )
  })

  it("appends with an ampersand when the URL already has a query string", () => {
    expect(appendUtmToUrl("https://example.com/landing?ref=abc", { utm_source: "tiktok" })).toBe(
      "https://example.com/landing?ref=abc&utm_source=tiktok"
    )
  })

  it("returns the base URL unchanged when no params are set", () => {
    expect(appendUtmToUrl("https://example.com/landing", {})).toBe("https://example.com/landing")
  })
})
