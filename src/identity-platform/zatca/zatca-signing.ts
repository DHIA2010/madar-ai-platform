// XAdES-B-B enveloped signing for a ZATCA Phase 2 UBL invoice -- canonicalization, hashing, and
// the XMLDSig/XAdES structure, following the exact element table in ZATCA's own "Security
// Features Implementation Standards" (v1.2, section 2.3.3), fetched and read directly this
// session.
//
// One deliberate, documented simplification: the spec's required XPath-Filtering transforms
// (`not(//ancestor-or-self::ext:UBLExtensions)`, etc.) are implemented here as removing those
// exact element subtrees from a cloned DOM before canonicalizing, rather than hand-rolling the
// generic W3C XPath-Filtering transform algorithm -- xml-crypto has no built-in implementation of
// that transform (checked directly in its source), and for this specific, fixed set of excluded
// elements, node removal produces byte-identical canonical output to the generic algorithm. This
// matches how other real-world ZATCA implementations (checked directly, not assumed) do the same
// thing.
//
// What this CANNOT be fully verified against without ZATCA's own tooling: whether every micro
// detail of the XAdES structure (SigningCertificateV2's cert-chain depth, and especially
// SignaturePolicyIdentifier's exact policy identifier/hash, which ZATCA publishes but wasn't
// available to fetch this session) exactly matches what ZATCA's Compliance Checks API expects.
// That is precisely what Compliance Checks exists to catch -- even experienced ZATCA integrators
// don't get this byte-perfect without that feedback loop. See zatca-devices-service.ts.
import { createHash, sign as cryptoSign } from "node:crypto"
import { DOMParser, XMLSerializer } from "@xmldom/xmldom"
import type { Node as XmldomNode } from "@xmldom/xmldom"
import { C14nCanonicalization } from "xml-crypto"
import * as xpath from "xpath"

// xmldom's own Document/Node/Element types don't structurally match TypeScript's ambient
// lib.dom.d.ts ones (which is what both xml-crypto's and xpath's own .d.ts files are written
// against) -- a well-known friction point mixing these three packages. Every xmldom
// parse/serialize call is cast at that one boundary rather than threading `any` through the rest
// of this file.
function asDomDocument(value: unknown): Document {
  return value as Document
}

const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#"
const C14N11_ALGORITHM = "http://www.w3.org/2006/12/xml-c14n11"
const ECDSA_SHA256_ALGORITHM = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"
const SHA256_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#sha256"
const SIGNED_PROPERTIES_ID = "xadesSignedProperties"

// The three XPath-Filtering transforms, written out once (used both inside the embedded
// ds:Reference and to document the equivalent node-removal step in stripUnsignedElements below).
const XPATH_TRANSFORMS_XML =
  `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
  `<ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform>` +
  `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
  `<ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform>` +
  `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
  `<ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath></ds:Transform>`

const c14n = new C14nCanonicalization()

function parseXml(xml: string): Document {
  return asDomDocument(new DOMParser().parseFromString(xml, "text/xml"))
}

function serialize(node: Node): string {
  return new XMLSerializer().serializeToString(node as unknown as XmldomNode)
}

function canonicalize(xml: string): string {
  return c14n.process(parseXml(xml).documentElement, {})
}

function base64(buffer: Buffer): string {
  return buffer.toString("base64")
}

function selectNodes(expression: string, node: Node): Node[] {
  return xpath.select(expression, node) as Node[]
}

function selectFirstNode(expression: string, node: Node): Node | undefined {
  return selectNodes(expression, node)[0]
}

// Removes the same three subtrees the signature's own References exclude via XPath-Filtering --
// see the module comment for why this is equivalent for this fixed, known set of elements.
function stripUnsignedElements(doc: Document): Document {
  const clone = doc.cloneNode(true) as Document
  const toRemove = [
    ...selectNodes('//*[local-name()="UBLExtensions"]', clone),
    ...selectNodes('//*[local-name()="Signature"][namespace-uri()!="' + XMLDSIG_NS + '"]', clone),
    ...selectNodes(
      '//*[local-name()="AdditionalDocumentReference"][*[local-name()="ID" and text()="QR"]]',
      clone
    ),
  ]
  for (const node of toRemove) {
    node.parentNode?.removeChild(node)
  }
  return clone
}

// The invoice hash -- QR tag 6, the `invoice_hash` DB column, and the first ds:Reference's
// digest are all this exact same value.
export function hashZatcaInvoiceXml(xml: string): Buffer {
  const filtered = stripUnsignedElements(parseXml(xml))
  const canonical = c14n.process(filtered.documentElement, {})
  return createHash("sha256").update(canonical, "utf8").digest()
}

// QR tag 7 -- a separate, simpler operation from the XAdES SignatureValue below: a raw ECDSA
// signature (IEEE P1363 r||s, not the DER SEQUENCE{r,s} X.509/CSR signatures use) directly over
// the invoice hash bytes.
export function signZatcaInvoiceHash(invoiceHash: Buffer, privateKeyPem: string): Buffer {
  return cryptoSign("sha256", invoiceHash, { key: privateKeyPem, dsaEncoding: "ieee-p1363" })
}

function buildSignedProperties(certDigest: Buffer, signingTimeIso: string): string {
  return (
    `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${XMLDSIG_NS}" Id="${SIGNED_PROPERTIES_ID}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTimeIso}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert><xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${SHA256_ALGORITHM}"/>` +
    `<ds:DigestValue>${base64(certDigest)}</ds:DigestValue>` +
    `</xades:CertDigest><xades:IssuerSerial/></xades:Cert></xades:SigningCertificate>` +
    // ZATCA publishes a specific signature-policy identifier/hash for this field that wasn't
    // obtainable this session (not part of the security-standards PDF this was built from) --
    // left as an explicit placeholder rather than a fabricated value. Must be filled in with
    // ZATCA's real published policy identifier before a real Compliance/Production submission;
    // Compliance Checks will report this precisely if it's wrong.
    `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId>` +
    `<xades:SigPolicyId><xades:Identifier>TODO-ZATCA-SIGNATURE-POLICY-ID</xades:Identifier></xades:SigPolicyId>` +
    `<xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA256_ALGORITHM}"/>` +
    `<ds:DigestValue>TODO-ZATCA-SIGNATURE-POLICY-HASH</ds:DigestValue></xades:SigPolicyHash>` +
    `</xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>` +
    `</xades:SignedSignatureProperties>` +
    `<xades:SignedDataObjectProperties>` +
    `<xades:DataObjectFormat ObjectReference="#invoiceSignedData">` +
    `<xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat>` +
    `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`
  )
}

function buildSignedInfo(invoiceHash: Buffer, signedPropertiesDigest: Buffer): string {
  return (
    `<ds:SignedInfo xmlns:ds="${XMLDSIG_NS}" ` +
    `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<ds:CanonicalizationMethod Algorithm="${C14N11_ALGORITHM}"/>` +
    `<ds:SignatureMethod Algorithm="${ECDSA_SHA256_ALGORITHM}"/>` +
    `<ds:Reference URI=""><ds:Transforms>${XPATH_TRANSFORMS_XML}` +
    `<ds:Transform Algorithm="${C14N11_ALGORITHM}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256_ALGORITHM}"/>` +
    `<ds:DigestValue>${base64(invoiceHash)}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${SIGNED_PROPERTIES_ID}">` +
    `<ds:Transforms><ds:Transform Algorithm="${C14N11_ALGORITHM}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256_ALGORITHM}"/>` +
    `<ds:DigestValue>${base64(signedPropertiesDigest)}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo>`
  )
}

export interface ZatcaSignInput {
  unsignedXml: string
  privateKeyPem: string
  // The device's own X.509 certificate (DER) -- only ever available once the device has reached
  // `production` status; ZATCA returns it as part of the Production CSID exchange. This signer
  // has nothing to embed as X509Certificate before that.
  certificateDer: Buffer
  signingTime: Date
}

export interface ZatcaSignResult {
  invoiceHash: Buffer
  digitalSignature: Buffer
  signedXml: string
}

// Full pipeline: hash the unsigned invoice, sign it, build the XAdES block, and embed it (plus a
// matching cac:Signature reference) back into the XML -- the caller (zatca-ubl-invoice.ts /
// invoices-service.ts) still owns building the QR code from the returned invoiceHash/signature
// and embedding it into the AdditionalDocumentReference[QR] placeholder afterward, since the
// signature itself deliberately never covers that element.
export function signZatcaInvoice(input: ZatcaSignInput): ZatcaSignResult {
  const invoiceHash = hashZatcaInvoiceXml(input.unsignedXml)
  const digitalSignature = signZatcaInvoiceHash(invoiceHash, input.privateKeyPem)

  const signingTimeIso = input.signingTime.toISOString().replace(/\.\d{3}Z$/, "Z")
  const certDigest = createHash("sha256").update(input.certificateDer).digest()

  const signedPropertiesXml = buildSignedProperties(certDigest, signingTimeIso)
  const signedPropertiesDigest = createHash("sha256")
    .update(canonicalize(signedPropertiesXml), "utf8")
    .digest()

  const signedInfoXml = buildSignedInfo(invoiceHash, signedPropertiesDigest)
  const signatureValue = cryptoSign("sha256", Buffer.from(canonicalize(signedInfoXml), "utf8"), {
    key: input.privateKeyPem,
    dsaEncoding: "ieee-p1363",
  })

  const signatureXml =
    `<ds:Signature xmlns:ds="${XMLDSIG_NS}" Id="signature">` +
    signedInfoXml +
    `<ds:SignatureValue>${base64(signatureValue)}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${base64(input.certificateDer)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="signature">` +
    signedPropertiesXml +
    `</xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`

  const doc = parseXml(input.unsignedXml)
  const extensionContent = selectFirstNode('//*[local-name()="ExtensionContent"]', doc) as
    | Element
    | undefined
  if (!extensionContent) throw new Error("ZATCA_UBL_MISSING_EXTENSION_CONTENT_PLACEHOLDER")
  extensionContent.appendChild(doc.importNode(parseXml(signatureXml).documentElement, true))

  return { invoiceHash, digitalSignature, signedXml: serialize(doc) }
}
