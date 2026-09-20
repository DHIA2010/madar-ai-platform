// Covers the ZATCA Phase 1 and Phase 2 TLV QR payload builders (zatca-qr-code.ts).

import { describe, expect, it } from "vitest"

import {
  appendZatcaStampTag,
  generateZatcaPhase2QrCode,
  generateZatcaQrCode,
} from "../pos/zatca-qr-code"

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

// Same TLV walk as decodeTlv above, but keeps each value as raw bytes -- tags 6-9 are binary
// (a hash/signature/public key), not UTF-8 text, so decoding them as text would corrupt them.
function decodeTlvBinary(base64: string): Array<{ tag: number; value: Buffer }> {
  const buffer = Buffer.from(base64, "base64")
  const entries: Array<{ tag: number; value: Buffer }> = []
  let offset = 0
  while (offset < buffer.length) {
    const tag = buffer[offset]
    const length = buffer[offset + 1]
    entries.push({ tag, value: buffer.subarray(offset + 2, offset + 2 + length) })
    offset += 2 + length
  }
  return entries
}

describe("generateZatcaPhase2QrCode", () => {
  const extras = {
    invoiceHash: Buffer.from("a".repeat(32)),
    digitalSignature: Buffer.from("b".repeat(64)),
    publicKey: Buffer.from("c".repeat(33)),
  }

  it("produces the same 5 Phase 1 tags plus tags 6-8, in order, with the extras as raw bytes", () => {
    const decoded = decodeTlvBinary(generateZatcaPhase2QrCode(INPUT, extras))
    expect(decoded.map((entry) => entry.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(decoded[5].value.equals(extras.invoiceHash)).toBe(true)
    expect(decoded[6].value.equals(extras.digitalSignature)).toBe(true)
    expect(decoded[7].value.equals(extras.publicKey)).toBe(true)
  })

  it("keeps the Phase 1 fields readable as text even though the QR now also carries binary tags", () => {
    const decoded = decodeTlvBinary(generateZatcaPhase2QrCode(INPUT, extras))
    expect(decoded[0].value.toString("utf8")).toBe(INPUT.sellerName)
  })
})

describe("appendZatcaStampTag", () => {
  it("appends tag 9 after the existing 8 tags without disturbing them", () => {
    const extras = {
      invoiceHash: Buffer.from("a".repeat(32)),
      digitalSignature: Buffer.from("b".repeat(64)),
      publicKey: Buffer.from("c".repeat(33)),
    }
    const base = generateZatcaPhase2QrCode(INPUT, extras)
    const stampSignature = Buffer.from("d".repeat(64))
    const decoded = decodeTlvBinary(appendZatcaStampTag(base, stampSignature))

    expect(decoded.map((entry) => entry.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(decoded[8].value.equals(stampSignature)).toBe(true)
    // Every earlier tag is untouched.
    expect(decoded[5].value.equals(extras.invoiceHash)).toBe(true)
  })
})
