import { describe, expect, it } from "vitest"

import { convertToOrgCurrency, isSupportedOrgCurrency, USD_TO_SAR_PEG } from "../shared/currency"

describe("convertToOrgCurrency", () => {
  it("is a no-op when the source currency already matches the target", () => {
    expect(convertToOrgCurrency(100, "SAR", "SAR")).toEqual({ amount: 100, converted: false })
    expect(convertToOrgCurrency(100, "usd", "USD")).toEqual({ amount: 100, converted: false })
  })

  it("passes through unchanged when the source currency is unknown (null)", () => {
    expect(convertToOrgCurrency(50, null, "SAR")).toEqual({ amount: 50, converted: false })
  })

  it("converts USD -> SAR at the real fixed peg", () => {
    const result = convertToOrgCurrency(10, "USD", "SAR")
    expect(result).toEqual({ amount: 10 * USD_TO_SAR_PEG, converted: true })
    expect(result?.amount).toBe(37.5)
  })

  it("converts SAR -> USD at the real fixed peg (inverse)", () => {
    const result = convertToOrgCurrency(37.5, "SAR", "USD")
    expect(result).toEqual({ amount: 37.5 / USD_TO_SAR_PEG, converted: true })
    expect(result?.amount).toBe(10)
  })

  it("returns null for a real currency we have no rate for -- never fabricates a rate", () => {
    expect(convertToOrgCurrency(100, "AED", "SAR")).toBeNull()
    expect(convertToOrgCurrency(100, "EGP", "USD")).toBeNull()
    expect(convertToOrgCurrency(100, "KWD", "SAR")).toBeNull()
  })

  it("is case-insensitive on the source currency code", () => {
    expect(convertToOrgCurrency(10, "usd", "SAR")?.amount).toBe(37.5)
  })
})

describe("isSupportedOrgCurrency", () => {
  it("accepts only USD and SAR", () => {
    expect(isSupportedOrgCurrency("USD")).toBe(true)
    expect(isSupportedOrgCurrency("SAR")).toBe(true)
    expect(isSupportedOrgCurrency("AED")).toBe(false)
    expect(isSupportedOrgCurrency("")).toBe(false)
  })
})
