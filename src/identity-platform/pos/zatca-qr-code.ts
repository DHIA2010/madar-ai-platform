// ZATCA Phase 1 (Generation Phase) QR payload for a Simplified Tax Invoice -- exactly 5
// Tag-Length-Value fields, Base64-encoded. This is NOT a generic URL/JSON QR: it is the specific
// binary TLV structure ZATCA's technical spec defines, so any reader built against that spec
// (including ZATCA's own verification apps) can decode it. Tags 6-9 (cryptographic stamp, public
// key, signature, hash) are Phase 2 (Integration Phase) only and are deliberately not produced
// here -- see invoices-service.ts and the migration's zatca_status/invoice_hash columns.
//
// Per-tag encoding: 1 byte tag number, 1 byte value length (in UTF-8 bytes, so max 255), then the
// UTF-8 bytes of the value themselves -- no separators. The 5 TLV triplets are concatenated in
// tag order, then the whole byte string is Base64-encoded.
const ZATCA_QR_TAGS = {
  sellerName: 1,
  vatRegistrationNumber: 2,
  timestamp: 3,
  invoiceTotal: 4,
  vatTotal: 5,
} as const

export interface ZatcaQrInput {
  sellerName: string
  vatRegistrationNumber: string
  // ISO-8601, e.g. "2026-09-17T10:15:00.000Z" -- the invoice's real issuance timestamp.
  timestamp: string
  invoiceTotal: number
  vatTotal: number
}

function encodeTlv(tag: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, "utf8")
  if (valueBuffer.length > 255) {
    throw new Error(`ZATCA QR field (tag ${tag}) exceeds the 255-byte TLV length limit.`)
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBuffer.length]), valueBuffer])
}

// Returns null (never a QR built from a fabricated VAT number) when the seller's VAT registration
// number isn't known -- see invoices-service.ts's loadSellerSnapshot for why that can happen.
export function generateZatcaQrCode(input: ZatcaQrInput): string {
  const buffer = Buffer.concat([
    encodeTlv(ZATCA_QR_TAGS.sellerName, input.sellerName),
    encodeTlv(ZATCA_QR_TAGS.vatRegistrationNumber, input.vatRegistrationNumber),
    encodeTlv(ZATCA_QR_TAGS.timestamp, input.timestamp),
    encodeTlv(ZATCA_QR_TAGS.invoiceTotal, input.invoiceTotal.toFixed(2)),
    encodeTlv(ZATCA_QR_TAGS.vatTotal, input.vatTotal.toFixed(2)),
  ])
  return buffer.toString("base64")
}
