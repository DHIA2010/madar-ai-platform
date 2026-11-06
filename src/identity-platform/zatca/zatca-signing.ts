// ZATCA Phase 2 signing for a simplified (B2C) UBL invoice: the invoice hash, the digital
// signature, and the XAdES block ZATCA expects inside ext:UBLExtensions.
//
// ZATCA's validator follows its own rules rather than textbook XMLDSig, so this mirrors exactly
// what its Compliance Checks API accepts (verified against the live developer-portal sandbox:
// PASS / REPORTED, no warnings):
//   - Invoice hash: SHA-256 over the C14N of the invoice without ext:UBLExtensions, cac:Signature
//     and the QR AdditionalDocumentReference (the XPath-filter transforms the signature names).
//   - Digital signature (SignatureValue, QR tag 7): ECDSA-SHA256, DER-encoded, over the 32 invoice
//     hash bytes -- not over SignedInfo.
//   - Certificate: the base64 body ZATCA returns (binarySecurityToken, base64-decoded once). Its
//     digest is base64 of the *hex* SHA-256 of that base64 text; issuer is its DN in reverse order
//     ("CN=..., DC=..."), serial in decimal.
//   - SignedProperties digest: base64 of the hex SHA-256 of the element as ZATCA canonicalizes it --
//     no whitespace, xmlns:xades on the element and xmlns:ds on each ds element. (Hashing an
//     indented rendering passes the developer sandbox's compliance certificate but is refused as
//     "signed-properties-hashing" by real certificates, e.g. simulation's; verified live.)
import { createHash, createSign, X509Certificate } from "node:crypto"
import { DOMParser } from "@xmldom/xmldom"
import forge from "node-forge"
import { C14nCanonicalization } from "xml-crypto"

// The placeholders zatca-ubl-invoice.ts leaves for the signature block and the QR data.
export const ZATCA_SIGNATURE_PLACEHOLDER = "__ZATCA_SIGNATURE__"
export const ZATCA_QR_PLACEHOLDER = "__ZATCA_QR__"

const c14n = new C14nCanonicalization()

// The invoice without the three parts the signature excludes (all built by zatca-ubl-invoice.ts
// with no surrounding whitespace, so plain removal is exact).
function stripUnsignedElements(xml: string): string {
  return xml
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, "")
    .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, "")
    .replace(
      /<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/,
      ""
    )
}

// The invoice hash -- QR tag 6, the PIH of the next invoice, and the first Reference's digest.
export function hashZatcaInvoiceXml(xml: string): Buffer {
  const doc = new DOMParser().parseFromString(stripUnsignedElements(xml), "text/xml")
  const canonical = c14n.process(doc.documentElement as unknown as Node, {})
  return createHash("sha256").update(canonical, "utf8").digest()
}

// ECDSA-SHA256 (DER) over the invoice hash bytes.
export function signZatcaInvoiceHash(invoiceHash: Buffer, privateKeyPem: string): Buffer {
  const signer = createSign("sha256")
  signer.update(invoiceHash)
  return signer.sign(privateKeyPem)
}

export interface ZatcaCertificateInfo {
  // The base64 certificate body, as embedded in X509Certificate.
  base64: string
  // base64(hex(sha256(base64 body))) -- ZATCA's CertDigest.
  digest: string
  issuer: string
  serialNumber: string
  // QR tag 8: the certificate's public key (SubjectPublicKeyInfo DER).
  publicKeyDer: Buffer
  // QR tag 9: the certificate's own signature (by ZATCA's CA).
  signature: Buffer
}

// What ZATCA returns as binarySecurityToken: base64 of the certificate's base64 body.
export function certificateBase64FromToken(binarySecurityToken: string): string {
  return Buffer.from(binarySecurityToken, "base64")
    .toString("utf8")
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "")
}

export function zatcaCertificateInfo(certificateBase64: string): ZatcaCertificateInfo {
  const pem = `-----BEGIN CERTIFICATE-----\n${certificateBase64}\n-----END CERTIFICATE-----`
  const certificate = new X509Certificate(pem)
  // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING }
  const asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(Buffer.from(certificateBase64, "base64").toString("binary"))
  )
  // forge decodes a BIT STRING that looks like DER (an ECDSA signature does) into its parts, but
  // keeps the original bytes in bitStringContents.
  const signatureNode = (asn1.value as forge.asn1.Asn1[])[2] as forge.asn1.Asn1 & {
    bitStringContents?: string
  }
  const signatureBits =
    signatureNode.bitStringContents ??
    (typeof signatureNode.value === "string" ? signatureNode.value : "")
  return {
    base64: certificateBase64,
    digest: Buffer.from(createHash("sha256").update(certificateBase64).digest("hex")).toString(
      "base64"
    ),
    issuer: certificate.issuer.split("\n").reverse().join(", "),
    serialNumber: BigInt(`0x${certificate.serialNumber}`).toString(10),
    publicKeyDer: certificate.publicKey.export({ type: "spki", format: "der" }),
    // Drop the BIT STRING's leading "unused bits" byte.
    signature: Buffer.from(signatureBits, "binary").subarray(1),
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// SignedProperties as ZATCA canonicalizes it for its digest (see the module comment): written
// indented here for reading, hashed with the whitespace between elements removed.
function signedPropertiesForHash(time: string, certificate: ZatcaCertificateInfo): string {
  return `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
                                    <xades:SignedSignatureProperties>
                                        <xades:SigningTime>${time}</xades:SigningTime>
                                        <xades:SigningCertificate>
                                            <xades:Cert>
                                                <xades:CertDigest>
                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificate.digest}</ds:DigestValue>
                                                </xades:CertDigest>
                                                <xades:IssuerSerial>
                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${escapeXml(certificate.issuer)}</ds:X509IssuerName>
                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificate.serialNumber}</ds:X509SerialNumber>
                                                </xades:IssuerSerial>
                                            </xades:Cert>
                                        </xades:SigningCertificate>
                                    </xades:SignedSignatureProperties>
                                </xades:SignedProperties>`.replace(/>\s+</g, "><")
}

function signedPropertiesEmbedded(time: string, certificate: ZatcaCertificateInfo): string {
  return (
    `<xades:SignedProperties Id="xadesSignedProperties"><xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${time}</xades:SigningTime><xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
    `<ds:DigestValue>${certificate.digest}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName>${escapeXml(certificate.issuer)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${certificate.serialNumber}</ds:X509SerialNumber></xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`
  )
}

const XPATH_TRANSFORM = (expression: string) =>
  `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>${expression}</ds:XPath></ds:Transform>`

function signatureExtension(input: {
  invoiceHashBase64: string
  signedPropertiesDigest: string
  signatureBase64: string
  certificate: ZatcaCertificateInfo
  signedProperties: string
}): string {
  return (
    `<ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
    `<ext:ExtensionContent><sig:UBLDocumentSignatures ` +
    `xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" ` +
    `xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" ` +
    `xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">` +
    `<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature"><ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>` +
    `<ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>` +
    XPATH_TRANSFORM("not(//ancestor-or-self::ext:UBLExtensions)") +
    XPATH_TRANSFORM("not(//ancestor-or-self::cac:Signature)") +
    XPATH_TRANSFORM("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])") +
    `<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${input.invoiceHashBase64}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${input.signedPropertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>` +
    `<ds:SignatureValue>${input.signatureBase64}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${input.certificate.base64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">` +
    input.signedProperties +
    `</xades:QualifyingProperties></ds:Object></ds:Signature>` +
    `</sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension>`
  )
}

export interface ZatcaSignInput {
  // From zatca-ubl-invoice.ts: carries the signature and QR placeholders.
  unsignedXml: string
  privateKeyPem: string
  // The device's certificate body (see certificateBase64FromToken).
  certificateBase64: string
  signingTime: Date
}

export interface ZatcaSignResult {
  invoiceHash: Buffer
  digitalSignature: Buffer
  certificate: ZatcaCertificateInfo
  // Signed, with the QR placeholder still in place (the QR needs this result).
  signedXml: string
}

export function signZatcaInvoice(input: ZatcaSignInput): ZatcaSignResult {
  const invoiceHash = hashZatcaInvoiceXml(input.unsignedXml)
  const digitalSignature = signZatcaInvoiceHash(invoiceHash, input.privateKeyPem)
  const certificate = zatcaCertificateInfo(input.certificateBase64)
  const time = input.signingTime.toISOString().slice(0, 19) + "Z"
  const signedPropertiesDigest = Buffer.from(
    createHash("sha256").update(signedPropertiesForHash(time, certificate)).digest("hex")
  ).toString("base64")
  const extension = signatureExtension({
    invoiceHashBase64: invoiceHash.toString("base64"),
    signedPropertiesDigest,
    signatureBase64: digitalSignature.toString("base64"),
    certificate,
    signedProperties: signedPropertiesEmbedded(time, certificate),
  })
  if (!input.unsignedXml.includes(ZATCA_SIGNATURE_PLACEHOLDER)) {
    throw new Error("ZATCA_UBL_MISSING_EXTENSION_CONTENT_PLACEHOLDER")
  }
  return {
    invoiceHash,
    digitalSignature,
    certificate,
    signedXml: input.unsignedXml.replace(ZATCA_SIGNATURE_PLACEHOLDER, extension),
  }
}

// Puts the QR data in its placeholder (outside what the signature covers).
export function embedZatcaQrCode(signedXml: string, qrCodeBase64: string): string {
  if (!signedXml.includes(ZATCA_QR_PLACEHOLDER)) throw new Error("ZATCA_UBL_MISSING_QR_PLACEHOLDER")
  return signedXml.replace(ZATCA_QR_PLACEHOLDER, qrCodeBase64)
}
