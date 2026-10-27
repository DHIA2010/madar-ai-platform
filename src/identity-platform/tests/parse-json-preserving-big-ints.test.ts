// @vitest-environment node

import { describe, expect, it } from "vitest"

import { parseJsonPreservingBigInts } from "../salla-oauth/parse-json-preserving-big-ints"

describe("parseJsonPreservingBigInts", () => {
  it("keeps an id beyond Number.MAX_SAFE_INTEGER exact, as a string", () => {
    // The shape of a real Salla order id plain JSON.parse rounded to ...7400 (404 on re-fetch).
    const parsed = parseJsonPreservingBigInts(
      '{"event":"order.created","merchant":915108816,"data":{"id":3444675684372967423}}'
    ) as { merchant: number; data: { id: unknown } }
    expect(parsed.data.id).toBe("3444675684372967423")
    expect(parsed.merchant).toBe(915108816)
  })

  it("leaves safe integers, decimals, negatives and exponents as numbers", () => {
    expect(parseJsonPreservingBigInts("[605314023, -12, 1.5, 2e3, 0]")).toEqual([
      605314023, -12, 1.5, 2000, 0,
    ])
  })

  it("never touches digits inside strings, including escaped quotes", () => {
    const parsed = parseJsonPreservingBigInts(
      '{"note":"ref: 3444675684372967423, \\"quoted\\" 99999999999999999999","n":1}'
    )
    expect(parsed).toEqual({
      note: 'ref: 3444675684372967423, "quoted" 99999999999999999999',
      n: 1,
    })
  })

  it("still rejects invalid JSON", () => {
    expect(() => parseJsonPreservingBigInts("{not json")).toThrow()
  })
})
