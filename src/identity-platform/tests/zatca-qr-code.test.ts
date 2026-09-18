// Covers the ZATCA Phase 1 TLV QR payload builder (zatca-qr-code.ts).

import { describe, expect, it } from "vitest"

import { generateZatcaQrCode } from "../pos/zatca-qr-code"

// Decodes a Base64 ZATCA QR payload back into its 5 {tag, value} entries, so a test can assert
// the exact TLV byte structure without needing to hand-encode a full expected buffer.
function decodeTlv(base64: string): Array<{ tag: number; value: string }> {
  const buffer = Buffer.from(base64, "base64")
  const entries: Array<{ tag: number; value: string }> = []
  let offset = 0
  while (offset < buffer.length) {
    const tag = buffer[offset]
    const length = buffer[offset + 1]
    const value = buffer.subarray(offset + 2, offset + 2 + length).toString("utf8")
    entries.push({ tag, value })
    offset += 2 + length
  }
  return entries
}

const INPUT = {
  sellerName: "Al Salam Restaurant",
  vatRegistrationNumber: "399999999900003",
  timestamp: "2026-01-01T00:00:00.000Z",
  invoiceTotal: 100,
  vatTotal: 15,
}

describe("generateZatcaQrCode", () => {
  it("produces a Base64 string decodable back into exactly 5 tags, in ZATCA's tag order", () => {
    const qr = generateZatcaQrCode(INPUT)
    const decoded = decodeTlv(qr)

    expect(decoded).toEqual([
      { tag: 1, value: "Al Salam Restaurant" },
      { tag: 2, value: "399999999900003" },
      { tag: 3, value: "2026-01-01T00:00:00.000Z" },
      { tag: 4, value: "100.00" },
      { tag: 5, value: "15.00" },
    ])
  })

  it("formats the total and VAT amounts to exactly 2 decimal places regardless of input precision", () => {
    const decoded = decodeTlv(generateZatcaQrCode({ ...INPUT, invoiceTotal: 27.6, vatTotal: 3.6 }))
    expect(decoded[3]).toEqual({ tag: 4, value: "27.60" })
    expect(decoded[4]).toEqual({ tag: 5, value: "3.60" })
  })

  it("is deterministic -- the same input always produces the same payload", () => {
    expect(generateZatcaQrCode(INPUT)).toBe(generateZatcaQrCode({ ...INPUT }))
  })

  it("produces a different payload when any field differs", () => {
    const base = generateZatcaQrCode(INPUT)
    expect(generateZatcaQrCode({ ...INPUT, invoiceTotal: 101 })).not.toBe(base)
    expect(generateZatcaQrCode({ ...INPUT, sellerName: "Other Name" })).not.toBe(base)
  })

  it("correctly round-trips Arabic seller names through UTF-8 TLV encoding", () => {
    const decoded = decodeTlv(generateZatcaQrCode({ ...INPUT, sellerName: "مطعم السلام" }))
    expect(decoded[0]).toEqual({ tag: 1, value: "مطعم السلام" })
  })

  it("rejects a field whose UTF-8 byte length exceeds the 255-byte TLV limit", () => {
    expect(() => generateZatcaQrCode({ ...INPUT, sellerName: "x".repeat(256) })).toThrow()
  })

  it("still produces a valid, decodable QR with an empty VAT-number tag when none is on file", () => {
    const decoded = decodeTlv(generateZatcaQrCode({ ...INPUT, vatRegistrationNumber: "" }))
    expect(decoded[1]).toEqual({ tag: 2, value: "" })
    // Every other tag is still real -- an unset VAT number never blocks the rest of the QR.
    expect(decoded[0].value).toBe(INPUT.sellerName)
    expect(decoded[3].value).toBe("100.00")
  })
})
