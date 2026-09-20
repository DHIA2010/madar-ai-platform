// Covers the XAdES signing pipeline (zatca-signing.ts) and the UBL invoice builder
// (zatca-ubl-invoice.ts): that a signed invoice's ds:SignatureValue self-verifies against the
// device's own public key using nothing but an independent XML canonicalizer (not the module's
// own hashing/signing code), that the invoice hash is stable across the QR-embedding step that
// necessarily happens after hashing, and that the raw QR-tag-7 signature (over the hash alone)
// also self-verifies.
import { createHash, generateKeyPairSync, verify as cryptoVerify } from "node:crypto"
import { DOMParser } from "@xmldom/xmldom"
import { C14nCanonicalization } from "xml-crypto"
import * as xpath from "xpath"
import { describe, expect, it } from "vitest"

import { generateZatcaPhase2QrCode } from "../pos/zatca-qr-code"
import { hashZatcaInvoiceXml, signZatcaInvoice, signZatcaInvoiceHash } from "../zatca/zatca-signing"
import {
  buildZatcaUblInvoiceXml,
  embedZatcaQrCode,
  ZATCA_GENESIS_PIH_BASE64,
  type ZatcaUblInvoiceInput,
} from "../zatca/zatca-ubl-invoice"

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" })
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()

function buildInvoiceInput(overrides: Partial<ZatcaUblInvoiceInput> = {}): ZatcaUblInvoiceInput {
  return {
    invoiceNumber: "INV-000001",
    uuid: "11111111-1111-1111-1111-111111111111",
    issuedAt: new Date("2026-01-01T10:00:00.000Z"),
    invoiceTypeName: "0200000",
    icv: 1,
    previousInvoiceHashBase64: ZATCA_GENESIS_PIH_BASE64,
    sellerName: "Al Salam Restaurant",
    sellerVatNumber: "399999999900003",
    sellerAddress: {
      streetName: "Test Street",
      buildingNumber: "1234",
      plotIdentification: "5678",
      citySubdivisionName: "Al Olaya",
      cityName: "Riyadh",
      postalZone: "12345",
    },
    customerName: null,
    customerVatNumber: null,
    subtotalAmount: 100,
    discountAmount: 0,
    taxAmount: 15,
    totalAmount: 115,
    taxRatePercent: 15,
    lines: [
      {
        id: "1",
        productName: "Test Item",
        quantity: 1,
        unitPrice: 100,
        netAmount: 100,
        taxAmount: 15,
        taxRatePercent: 15,
      },
    ],
    notes: null,
    ...overrides,
  }
}

// A minimal placeholder "certificate" -- signZatcaInvoice only ever base64-embeds and hashes this
// buffer, it never parses it as real X.509, so any fixed bytes are enough to exercise the pipeline.
const FAKE_CERTIFICATE_DER = Buffer.from("fake-zatca-device-certificate-for-tests")

function canonicalizeNode(node: Node): string {
  return new C14nCanonicalization().process(node, {})
}

describe("hashZatcaInvoiceXml", () => {
  it("is deterministic for the same XML", () => {
    const xml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    expect(hashZatcaInvoiceXml(xml).equals(hashZatcaInvoiceXml(xml))).toBe(true)
  })

  it("changes when invoice content changes", () => {
    const base = hashZatcaInvoiceXml(buildZatcaUblInvoiceXml(buildInvoiceInput()))
    const changed = hashZatcaInvoiceXml(
      buildZatcaUblInvoiceXml(
        buildInvoiceInput({ totalAmount: 230, taxAmount: 30, subtotalAmount: 200 })
      )
    )
    expect(changed.equals(base)).toBe(false)
  })

  it("is unaffected by the QR AdditionalDocumentReference's own content (excluded by design)", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const withQrFilledIn = embedZatcaQrCode(unsignedXml, "some-fake-qr-payload-base64")
    expect(hashZatcaInvoiceXml(withQrFilledIn).equals(hashZatcaInvoiceXml(unsignedXml))).toBe(true)
  })
})

describe("signZatcaInvoiceHash", () => {
  it("produces a raw IEEE P1363 signature (r||s, 64 bytes for a 32-byte-order curve) that verifies", () => {
    const hash = createHash("sha256").update("some invoice bytes").digest()
    const signature = signZatcaInvoiceHash(hash, privateKeyPem)
    expect(signature.length).toBe(64)
    expect(
      cryptoVerify("sha256", hash, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature)
    ).toBe(true)
  })

  it("does not verify against a different hash", () => {
    const hash = createHash("sha256").update("invoice A").digest()
    const otherHash = createHash("sha256").update("invoice B").digest()
    const signature = signZatcaInvoiceHash(hash, privateKeyPem)
    expect(
      cryptoVerify("sha256", otherHash, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature)
    ).toBe(false)
  })
})

describe("signZatcaInvoice", () => {
  it("returns an invoiceHash matching hashZatcaInvoiceXml of the original unsigned XML", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const result = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer: FAKE_CERTIFICATE_DER,
      signingTime: new Date("2026-01-01T10:00:00.000Z"),
    })
    expect(result.invoiceHash.equals(hashZatcaInvoiceXml(unsignedXml))).toBe(true)
  })

  it("returns a digitalSignature (QR tag 7) that self-verifies against the invoice hash", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const result = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer: FAKE_CERTIFICATE_DER,
      signingTime: new Date("2026-01-01T10:00:00.000Z"),
    })
    expect(
      cryptoVerify(
        "sha256",
        result.invoiceHash,
        { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
        result.digitalSignature
      )
    ).toBe(true)
  })

  it("embeds a ds:Signature whose SignatureValue self-verifies against the canonicalized SignedInfo", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const result = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer: FAKE_CERTIFICATE_DER,
      signingTime: new Date("2026-01-01T10:00:00.000Z"),
    })

    const doc = new DOMParser().parseFromString(result.signedXml, "text/xml") as unknown as Node
    const signedInfoNodes = xpath.select('//*[local-name()="SignedInfo"]', doc) as Node[]
    const signatureValueNodes = xpath.select('//*[local-name()="SignatureValue"]', doc) as Node[]
    expect(signedInfoNodes).toHaveLength(1)
    expect(signatureValueNodes).toHaveLength(1)

    const canonicalSignedInfo = canonicalizeNode(signedInfoNodes[0])
    const signatureValue = Buffer.from(signatureValueNodes[0].textContent ?? "", "base64")

    expect(
      cryptoVerify(
        "sha256",
        Buffer.from(canonicalSignedInfo, "utf8"),
        { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
        signatureValue
      )
    ).toBe(true)
  })

  it("still self-verifies after the QR code is embedded into the signed XML (QR excluded from what was signed)", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const result = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer: FAKE_CERTIFICATE_DER,
      signingTime: new Date("2026-01-01T10:00:00.000Z"),
    })
    const finalXml = embedZatcaQrCode(result.signedXml, "final-qr-payload-base64")

    const doc = new DOMParser().parseFromString(finalXml, "text/xml") as unknown as Node
    const signedInfoNodes = xpath.select('//*[local-name()="SignedInfo"]', doc) as Node[]
    const signatureValueNodes = xpath.select('//*[local-name()="SignatureValue"]', doc) as Node[]
    const canonicalSignedInfo = canonicalizeNode(signedInfoNodes[0])
    const signatureValue = Buffer.from(signatureValueNodes[0].textContent ?? "", "base64")

    expect(
      cryptoVerify(
        "sha256",
        Buffer.from(canonicalSignedInfo, "utf8"),
        { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
        signatureValue
      )
    ).toBe(true)
  })
})

describe("QR round-trip through the full signing pipeline", () => {
  it("decodes tags 6-8 out of a Phase 2 QR back to the exact bytes signZatcaInvoice produced", () => {
    const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const result = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer: FAKE_CERTIFICATE_DER,
      signingTime: new Date("2026-01-01T10:00:00.000Z"),
    })
    const qr = generateZatcaPhase2QrCode(
      {
        sellerName: "Al Salam Restaurant",
        vatRegistrationNumber: "399999999900003",
        timestamp: "2026-01-01T10:00:00.000Z",
        invoiceTotal: 115,
        vatTotal: 15,
      },
      {
        invoiceHash: result.invoiceHash,
        digitalSignature: result.digitalSignature,
        publicKey: Buffer.from("c".repeat(33)),
      }
    )

    const buffer = Buffer.from(qr, "base64")
    let offset = 0
    const tags: Array<{ tag: number; value: Buffer }> = []
    while (offset < buffer.length) {
      const tag = buffer[offset]
      const length = buffer[offset + 1]
      tags.push({ tag, value: buffer.subarray(offset + 2, offset + 2 + length) })
      offset += 2 + length
    }
    expect(tags[5].value.equals(result.invoiceHash)).toBe(true)
    expect(tags[6].value.equals(result.digitalSignature)).toBe(true)
  })
})

describe("PIH/ICV chaining at the UBL-XML level", () => {
  it("embeds the genesis PIH for the first invoice and a real prior hash for the second", () => {
    const firstXml = buildZatcaUblInvoiceXml(buildInvoiceInput({ icv: 1 }))
    const firstHash = hashZatcaInvoiceXml(firstXml)

    const secondXml = buildZatcaUblInvoiceXml(
      buildInvoiceInput({ icv: 2, previousInvoiceHashBase64: firstHash.toString("base64") })
    )

    expect(firstXml).toContain(ZATCA_GENESIS_PIH_BASE64)
    expect(secondXml).toContain(firstHash.toString("base64"))
    expect(secondXml).not.toContain(ZATCA_GENESIS_PIH_BASE64)
  })
})

describe("seller PostalAddress in the UBL XML", () => {
  it("emits every structured national-address field ZATCA's PostalAddress schema expects", () => {
    const xml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    expect(xml).toContain("<cbc:StreetName>Test Street</cbc:StreetName>")
    expect(xml).toContain("<cbc:BuildingNumber>1234</cbc:BuildingNumber>")
    expect(xml).toContain("<cbc:PlotIdentification>5678</cbc:PlotIdentification>")
    expect(xml).toContain("<cbc:CitySubdivisionName>Al Olaya</cbc:CitySubdivisionName>")
    expect(xml).toContain("<cbc:CityName>Riyadh</cbc:CityName>")
    expect(xml).toContain("<cbc:PostalZone>12345</cbc:PostalZone>")
    expect(xml).toContain(
      "<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>"
    )
  })

  it("omits missing address sub-fields but still emits the Country when only some are known", () => {
    const xml = buildZatcaUblInvoiceXml(
      buildInvoiceInput({
        sellerAddress: {
          streetName: null,
          buildingNumber: null,
          plotIdentification: null,
          citySubdivisionName: null,
          cityName: "Jeddah",
          postalZone: null,
        },
      })
    )
    expect(xml).not.toContain("<cbc:StreetName>")
    expect(xml).toContain("<cbc:CityName>Jeddah</cbc:CityName>")
    expect(xml).toContain(
      "<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>"
    )
  })

  it("omits the whole PostalAddress block when the organization has no address on file at all", () => {
    const xml = buildZatcaUblInvoiceXml(buildInvoiceInput({ sellerAddress: null }))
    expect(xml).not.toContain("<cac:PostalAddress>")
  })
})
