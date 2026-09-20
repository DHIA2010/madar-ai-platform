// ZATCA QR payload for a Simplified Tax Invoice, Base64-encoded TLV (Tag-Length-Value). This is
// NOT a generic URL/JSON QR: it is the specific binary TLV structure ZATCA's technical spec
// defines, so any reader built against that spec (including ZATCA's own verification apps) can
// decode it.
//
// generateZatcaQrCode() produces the original 5-tag Phase 1 (Generation Phase) payload.
// generateZatcaPhase2QrCode() adds tags 6-8 (invoice hash, ECDSA signature, public key) once a
// production device has actually signed the invoice -- see invoices-service.ts and
// zatca-signing.ts. Tag 9 (ZATCA's own cryptographic stamp signature, returned only after a
// successful Reporting call) is appended separately via appendZatcaStampTag() once/if it comes
// back, since it can never be known at the moment the customer-facing QR is first printed.
//
// Per-tag encoding: 1 byte tag number, 1 byte value length, then the raw value bytes -- no
// separators. Tags 1-5's value is the UTF-8 encoding of a text field (so capped at 255 UTF-8
// bytes); tags 6-9's value is already raw binary (a 32-byte SHA-256 hash, a 64-byte raw r||s
// ECDSA signature, a 33-byte compressed EC public key -- see zatca-crypto.ts's
// compressEcPublicKey), never UTF-8 encoded.
const ZATCA_QR_TAGS = {
  sellerName: 1,
  vatRegistrationNumber: 2,
  timestamp: 3,
  invoiceTotal: 4,
  vatTotal: 5,
  invoiceHash: 6,
  digitalSignature: 7,
  publicKey: 8,
  stampSignature: 9,
} as const

export interface ZatcaQrInput {
  sellerName: string
  vatRegistrationNumber: string
  // ISO-8601, e.g. "2026-09-17T10:15:00.000Z" -- the invoice's real issuance timestamp.
  timestamp: string
  invoiceTotal: number
  vatTotal: number
}

// The three Phase 2 fields produced by actually signing the invoice (zatca-signing.ts) -- see the
// module comment above for each field's exact shape.
export interface ZatcaPhase2QrExtras {
  invoiceHash: Buffer
  digitalSignature: Buffer
  publicKey: Buffer
}

function encodeTextTlv(tag: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, "utf8")
  if (valueBuffer.length > 255) {
    throw new Error(`ZATCA QR field (tag ${tag}) exceeds the 255-byte TLV length limit.`)
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBuffer.length]), valueBuffer])
}

function encodeBinaryTlv(tag: number, value: Buffer): Buffer {
  if (value.length > 255) {
    throw new Error(`ZATCA QR field (tag ${tag}) exceeds the 255-byte TLV length limit.`)
  }
  return Buffer.concat([Buffer.from([tag]), Buffer.from([value.length]), value])
}

function buildPhase1Buffer(input: ZatcaQrInput): Buffer {
  return Buffer.concat([
    encodeTextTlv(ZATCA_QR_TAGS.sellerName, input.sellerName),
    encodeTextTlv(ZATCA_QR_TAGS.vatRegistrationNumber, input.vatRegistrationNumber),
    encodeTextTlv(ZATCA_QR_TAGS.timestamp, input.timestamp),
    encodeTextTlv(ZATCA_QR_TAGS.invoiceTotal, input.invoiceTotal.toFixed(2)),
    encodeTextTlv(ZATCA_QR_TAGS.vatTotal, input.vatTotal.toFixed(2)),
  ])
}

// Returns null (never a QR built from a fabricated VAT number) when the seller's VAT registration
// number isn't known -- see invoices-service.ts's loadSellerSnapshot for why that can happen.
export function generateZatcaQrCode(input: ZatcaQrInput): string {
  return buildPhase1Buffer(input).toString("base64")
}

// Tags 1-8 -- what a production-signed simplified invoice's QR actually is at the moment of sale
// (tag 9 isn't known yet; see appendZatcaStampTag below).
export function generateZatcaPhase2QrCode(
  input: ZatcaQrInput,
  extras: ZatcaPhase2QrExtras
): string {
  const buffer = Buffer.concat([
    buildPhase1Buffer(input),
    encodeBinaryTlv(ZATCA_QR_TAGS.invoiceHash, extras.invoiceHash),
    encodeBinaryTlv(ZATCA_QR_TAGS.digitalSignature, extras.digitalSignature),
    encodeBinaryTlv(ZATCA_QR_TAGS.publicKey, extras.publicKey),
  ])
  return buffer.toString("base64")
}

// Appends tag 9 (ZATCA's own cryptographic stamp signature) to an already-built Phase 2 QR, once
// a Reporting call actually returns one -- see invoices-service.ts's reportToZatca().
export function appendZatcaStampTag(existingQrCode: string, stampSignature: Buffer): string {
  const existing = Buffer.from(existingQrCode, "base64")
  return Buffer.concat([
    existing,
    encodeBinaryTlv(ZATCA_QR_TAGS.stampSignature, stampSignature),
  ]).toString("base64")
}
