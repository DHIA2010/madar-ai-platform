// Covers ZATCA signing (zatca-signing.ts) and the UBL builder (zatca-ubl-invoice.ts) against
// the format ZATCA's sandbox accepts (see zatca-signing.ts's module comment): the invoice hash and
// what it excludes, the DER digital signature over that hash, the certificate details in
// SignedProperties, and the QR's tags 6-9. Uses a real self-signed secp256k1 certificate made with
// openssl, since the signer reads issuer, serial, public key and signature out of it.
import { execFileSync } from "node:child_process"
import { createVerify, X509Certificate } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { generateZatcaPhase2QrCode } from "../pos/zatca-qr-code"
import {
  embedZatcaQrCode,
  hashZatcaInvoiceXml,
  signZatcaInvoice,
  ZATCA_QR_PLACEHOLDER,
  ZATCA_SIGNATURE_PLACEHOLDER,
  zatcaCertificateInfo,
} from "../zatca/zatca-signing"
import {
  buildZatcaUblInvoiceXml,
  ZATCA_GENESIS_PIH_BASE64,
  type ZatcaUblInvoiceInput,
} from "../zatca/zatca-ubl-invoice"

// A device key and a certificate for it (self-signed: issuer = subject).
const dir = mkdtempSync(join(tmpdir(), "zatca-signing-"))
execFileSync("openssl", [
  "ecparam",
  "-name",
  "secp256k1",
  "-genkey",
  "-noout",
  "-out",
  join(dir, "key.pem"),
])
execFileSync("openssl", [
  "req",
  "-new",
  "-x509",
  "-key",
  join(dir, "key.pem"),
  "-out",
  join(dir, "cert.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=eInvoicing/DC=gov/DC=local",
])
const privateKeyPem = readFileSync(join(dir, "key.pem"), "utf8")
const certificatePem = readFileSync(join(dir, "cert.pem"), "utf8")
const certificateBase64 = certificatePem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")
const publicKey = new X509Certificate(certificatePem).publicKey

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

describe("hashZatcaInvoiceXml", () => {
  it("is deterministic and changes when the invoice changes", () => {
    const xml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    expect(hashZatcaInvoiceXml(xml).equals(hashZatcaInvoiceXml(xml))).toBe(true)
    const other = buildZatcaUblInvoiceXml(buildInvoiceInput({ totalAmount: 116 }))
    expect(hashZatcaInvoiceXml(other).equals(hashZatcaInvoiceXml(xml))).toBe(false)
  })

  it("ignores the signature block and the QR data (both filled in after hashing)", () => {
    const xml = buildZatcaUblInvoiceXml(buildInvoiceInput())
    const filled = xml
      .replace(ZATCA_SIGNATURE_PLACEHOLDER, "<ext:UBLExtension>anything</ext:UBLExtension>")
      .replace(ZATCA_QR_PLACEHOLDER, "QRDATA")
    expect(hashZatcaInvoiceXml(filled).equals(hashZatcaInvoiceXml(xml))).toBe(true)
  })
})

describe("signZatcaInvoice", () => {
  const unsignedXml = buildZatcaUblInvoiceXml(buildInvoiceInput())
  const result = signZatcaInvoice({
    unsignedXml,
    privateKeyPem,
    certificateBase64,
    signingTime: new Date("2026-01-01T10:00:00.000Z"),
  })

  it("signs the invoice hash (DER ECDSA-SHA256) with the device key", () => {
    expect(result.invoiceHash.equals(hashZatcaInvoiceXml(unsignedXml))).toBe(true)
    const verifier = createVerify("sha256")
    verifier.update(result.invoiceHash)
    expect(verifier.verify(publicKey, result.digitalSignature)).toBe(true)
    expect(result.digitalSignature[0]).toBe(0x30)
  })

  it("embeds the XAdES block ZATCA expects, with the certificate's details", () => {
    const info = zatcaCertificateInfo(certificateBase64)
    // Node lists the DN in the order given (CN, DC, DC); ZATCA wants it reversed.
    expect(info.issuer).toBe("DC=local, DC=gov, CN=eInvoicing")
    expect(result.signedXml).not.toContain(ZATCA_SIGNATURE_PLACEHOLDER)
    expect(result.signedXml).toContain(
      "<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>"
    )
    expect(result.signedXml).toContain(
      `<ds:DigestValue>${result.invoiceHash.toString("base64")}</ds:DigestValue>`
    )
    expect(result.signedXml).toContain(
      `<ds:SignatureValue>${result.digitalSignature.toString("base64")}</ds:SignatureValue>`
    )
    expect(result.signedXml).toContain(
      `<ds:X509Certificate>${certificateBase64}</ds:X509Certificate>`
    )
    expect(result.signedXml).toContain(
      `<ds:X509SerialNumber>${info.serialNumber}</ds:X509SerialNumber>`
    )
    // ZATCA's digests are base64 of a hex SHA-256 (64 hex characters).
    expect(Buffer.from(info.digest, "base64").toString("utf8")).toMatch(/^[0-9a-f]{64}$/)
  })

  it("leaves the invoice hash unchanged once signed and the QR is embedded", () => {
    const qr = generateZatcaPhase2QrCode(
      {
        sellerName: "Al Salam Restaurant",
        vatRegistrationNumber: "399999999900003",
        timestamp: "2026-01-01T10:00:00",
        invoiceTotal: 115,
        vatTotal: 15,
      },
      {
        invoiceHashBase64: result.invoiceHash.toString("base64"),
        digitalSignatureBase64: result.digitalSignature.toString("base64"),
        publicKeyDer: result.certificate.publicKeyDer,
        certificateSignature: result.certificate.signature,
      }
    )
    const finalXml = embedZatcaQrCode(result.signedXml, qr)
    expect(finalXml).not.toContain(ZATCA_QR_PLACEHOLDER)
    expect(hashZatcaInvoiceXml(finalXml).equals(result.invoiceHash)).toBe(true)
    // Tag 9 is the certificate's own signature (a DER ECDSA signature).
    expect(result.certificate.signature[0]).toBe(0x30)
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
