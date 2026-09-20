// ZATCA Phase 2 (Integration Phase) device cryptography -- key generation, CSR generation, and
// the AES-GCM envelope used to store the resulting private key/CSIDs at rest.
//
// The curve and CSR shape here were validated two ways before being trusted: (1) ZATCA's own
// published "Security Features Implementation Standards" (v1.2) names the certificate profile
// and Subject/SAN field table, and (2) a real, working open-source ZATCA CSR generator
// (github.com/bilaljmal/zatca_csr_generator) was read directly for the mechanical details that
// document's prose doesn't fully pin down (exact curve, SAN encoding, the vendor-specific
// certificate-type attribute). Where the two disagreed -- the doc's prose says "P-256", but every
// real generator (that one, and this session's own web research) uses secp256k1 -- the working
// generator was trusted, since it's what ZATCA's actual deployed CA accepts, not what a generic
// security-standards paragraph describes. Every CSR built here was round-tripped through
// `openssl req -verify` during development to confirm it parses and self-verifies correctly.
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto"
import forge from "node-forge"

const asn1 = forge.asn1

// secp256k1 -- see the module comment above for why this, not the "P-256" ZATCA's own prose
// names, is the curve real ZATCA onboarding actually accepts.
const ZATCA_CURVE = "secp256k1"

// OIDs used throughout -- named here once so the ASN.1-building code below reads as field names,
// not magic dotted strings.
const OID = {
  commonName: "2.5.4.3",
  organizationIdentifier: "2.5.4.97", // VAT registration number
  organizationalUnitName: "2.5.4.11",
  organizationName: "2.5.4.10",
  countryName: "2.5.4.6",
  serialNumber: "2.5.4.5", // EGS serial number, inside the SAN dirName
  userId: "0.9.2342.19200300.100.1.1", // UID, inside the SAN dirName
  title: "2.5.4.12", // invoice-type support bitmask, inside the SAN dirName
  registeredAddress: "2.5.4.26",
  businessCategory: "2.5.4.15", // industry, inside the SAN dirName
  subjectAltName: "2.5.29.17",
  extensionRequest: "1.2.840.113549.1.9.14",
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  // Microsoft's certificateTemplateName OID, repurposed by ZATCA to name which environment this
  // CSR targets -- the literal string value (not the OID) is what differs per environment.
  certificateTemplateName: "1.3.6.1.4.1.311.20.2",
} as const

export type ZatcaCsrEnvironment = "sandbox" | "simulation" | "production"

const CERT_TEMPLATE_VALUE: Record<ZatcaCsrEnvironment, string> = {
  sandbox: "TESTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  production: "ZATCA-Code-Signing",
}

export interface ZatcaKeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

// PKCS#8/SPKI PEM -- the standard, algorithm-agnostic containers Node's own crypto APIs (used
// throughout the rest of the signing pipeline) expect.
export function generateZatcaKeyPair(): ZatcaKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: ZATCA_CURVE })
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  }
}

// The 33-byte SEC1 compressed point (0x02/0x03 prefix + X) -- what ZATCA's QR tag 8 actually
// wants, not the 65-byte uncompressed point (0x04 + X + Y) a plain SPKI key naturally decodes to.
// Real ZATCA generators export the public key this way specifically for QR compactness.
export function compressEcPublicKey(publicKeyPem: string): Buffer {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" })
  const point = der.subarray(der.length - 65)
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("ZATCA_UNEXPECTED_PUBLIC_KEY_FORMAT")
  }
  const x = point.subarray(1, 33)
  const y = point.subarray(33, 65)
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03
  return Buffer.concat([Buffer.from([prefix]), x])
}

export interface ZatcaCsrInput {
  environment: ZatcaCsrEnvironment
  // CN -- the device's own name/asset tag (taxpayer-assigned, free text).
  commonName: string
  // organizationIdentifier -- VAT registration number, 15 digits, begins and ends with 3.
  vatNumber: string
  // OU -- branch name, or the 10-digit TIN of the individual group member for a VAT group.
  organizationUnit: string
  // O -- the taxpayer's own registered name.
  organizationName: string
  // C -- ISO 3166 alpha-2, "SA" for every real taxpayer on this platform.
  countryCode: string
  // SAN: "1-Manufacturer or Solution Provider Name|2-Model or Version|3-SerialNumber".
  egsSerialNumber: string
  // SAN: 4-digit 0/1 bitmask mapped to "TSCZ" (Standard/Simplified/future/future).
  invoiceTypeBitmask: string
  // SAN registeredAddress -- the branch/device's own short address.
  location: string
  // SAN businessCategory -- industry/sector, free text.
  industry: string
}

export interface ZatcaCsr {
  csrPem: string
  keyPair: ZatcaKeyPair
}

function subjectDnAsn1(input: ZatcaCsrInput) {
  return forge.pki.distinguishedNameToAsn1({
    attributes: [
      { type: OID.commonName, value: input.commonName },
      { type: OID.organizationIdentifier, value: input.vatNumber },
      { type: OID.organizationalUnitName, value: input.organizationUnit },
      { type: OID.organizationName, value: input.organizationName },
      { type: OID.countryName, value: input.countryCode },
    ],
  })
}

// SAN as a single GeneralName of type [4] directoryName -- itself a full RDN sequence, per the
// real generator this was validated against (not an `otherName`, which earlier research
// mistakenly assumed before that generator's config file was actually read).
function subjectAltNameExtensionAsn1(input: ZatcaCsrInput) {
  const dirName = forge.pki.distinguishedNameToAsn1({
    attributes: [
      { type: OID.serialNumber, value: input.egsSerialNumber },
      { type: OID.userId, value: input.vatNumber },
      { type: OID.title, value: input.invoiceTypeBitmask },
      { type: OID.registeredAddress, value: input.location },
      { type: OID.businessCategory, value: input.industry },
    ],
  })
  // GeneralName ::= CHOICE { ... directoryName [4] Name ... } -- Name is itself a CHOICE, so the
  // context tag must be EXPLICIT (wraps the RDNSequence rather than replacing its own tag).
  const generalName = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [dirName])
  const generalNames = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [generalName])
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(OID.subjectAltName).getBytes()
    ),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      asn1.toDer(generalNames).getBytes()
    ),
  ])
}

function certificateTemplateExtensionAsn1(environment: ZatcaCsrEnvironment) {
  const value = CERT_TEMPLATE_VALUE[environment]
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(OID.certificateTemplateName).getBytes()
    ),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      asn1
        .toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.PRINTABLESTRING, false, value))
        .getBytes()
    ),
  ])
}

// Builds and self-signs a PKCS#10 CSR matching ZATCA's exact expected shape. Hand-built at the
// ASN.1 level (via node-forge's low-level `asn1` primitives, not its RSA-oriented high-level CSR
// API) because node-forge has no EC/ECDSA support at all -- see the module comment for how this
// was validated.
export function generateZatcaCsr(input: ZatcaCsrInput): ZatcaCsr {
  const keyPair = generateZatcaKeyPair()
  const publicKeyDer = createPublicKey(keyPair.publicKeyPem).export({ type: "spki", format: "der" })

  const version = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    String.fromCharCode(0)
  )
  const subjectPublicKeyInfo = asn1.fromDer(
    forge.util.createBuffer(publicKeyDer.toString("binary"))
  )
  const extensionRequestAttr = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(OID.extensionRequest).getBytes()
    ),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        subjectAltNameExtensionAsn1(input),
        certificateTemplateExtensionAsn1(input.environment),
      ]),
    ]),
  ])
  const attributes = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [extensionRequestAttr])

  const certificationRequestInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    version,
    subjectDnAsn1(input),
    subjectPublicKeyInfo,
    attributes,
  ])

  const tbsDer = Buffer.from(asn1.toDer(certificationRequestInfo).getBytes(), "binary")
  const privateKey = createPrivateKey(keyPair.privateKeyPem)
  // Node's default EC signature output IS the DER SEQUENCE{r,s} form X.509/PKCS#10 expects --
  // only XMLDSig (see zatca-signing.ts) needs the raw-r||s "ieee-p1363" form instead.
  const signature = cryptoSign("sha256", tbsDer, privateKey)

  const signatureAlgorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(OID.ecdsaWithSha256).getBytes()
    ),
  ])
  const signatureBitString = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.BITSTRING,
    false,
    "\x00" + signature.toString("binary")
  )

  const csrAsn1 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    certificationRequestInfo,
    signatureAlgorithm,
    signatureBitString,
  ])

  const csrDer = Buffer.from(asn1.toDer(csrAsn1).getBytes(), "binary")
  const csrLines = csrDer.toString("base64").match(/.{1,64}/g) ?? []
  const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${csrLines.join("\n")}\n-----END CERTIFICATE REQUEST-----\n`

  return { csrPem, keyPair }
}

// Same AES-256-GCM `v1:iv:tag:ciphertext` envelope already used for every other integration's
// stored secrets (shopify-oauth/service.ts, meta-oauth/service.ts, etc.) -- reusing it here keeps
// ZATCA's private key/CSIDs under the same at-rest protection convention as everything else,
// keyed by the same IDENTITY_PLATFORM_TOKEN_HASH_SECRET fallback chain, so no new secret needs
// provisioning.
function normalizeEncryptionKey(input: string): Buffer {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("ZATCA_ENCRYPTION_CONFIGURATION_ERROR")
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex")
  }
  try {
    const decoded = Buffer.from(trimmed, "base64")
    if (decoded.length === 32) return decoded
  } catch {
    // fall through
  }
  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8")
  }
  throw new Error("ZATCA_ENCRYPTION_CONFIGURATION_ERROR")
}

export function encryptZatcaSecret(plainText: string, rawKey: string): string {
  const key = normalizeEncryptionKey(rawKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

export function decryptZatcaSecret(value: string, rawKey: string): string {
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":")
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("ZATCA_DECRYPTION_ERROR")
  }
  const key = normalizeEncryptionKey(rawKey)
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"))
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

export function resolveZatcaEncryptionKey(): string {
  return (
    process.env.IDENTITY_PLATFORM_ZATCA_TOKEN_ENCRYPTION_KEY ??
    process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
    ""
  )
}
