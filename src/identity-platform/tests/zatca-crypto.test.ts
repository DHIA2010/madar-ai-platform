// Covers ZATCA Phase 2 key/CSR generation and the at-rest secret envelope (zatca-crypto.ts). The
// CSR shape itself (secp256k1, the Subject/SAN fields, the ZATCA-Code-Signing attribute) was
// independently validated against `openssl req -verify` during development -- see the module's
// own comment; these tests cover what changes when inputs change and the encryption round-trip,
// not re-deriving cryptographic correctness openssl already confirmed.
import { execFileSync } from "node:child_process"
import { createPublicKey } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  compressEcPublicKey,
  decryptZatcaSecret,
  encryptZatcaSecret,
  generateZatcaCsr,
  generateZatcaKeyPair,
} from "../zatca/zatca-crypto"

// node-forge's high-level CSR parser (`certificationRequestFromPem`) is RSA-only -- it throws
// "Cannot read public key. OID is not RSA." on our EC CSRs, which is exactly why zatca-crypto.ts
// hand-builds the ASN.1 instead of using forge's high-level API. So these tests use `openssl`
// itself as the independent oracle, the same way the CSR shape was validated during development
// (`openssl req -verify`).
function opensslReq(csrPem: string, args: string[]): string {
  return execFileSync("openssl", ["req", "-in", "-", ...args], { input: csrPem }).toString("utf8")
}

const BASE_INPUT = {
  environment: "sandbox" as const,
  commonName: "EGS-TEST-DEVICE-1",
  vatNumber: "310000000000003",
  organizationUnit: "Test Branch",
  organizationName: "Test Org",
  countryCode: "SA",
  egsSerialNumber: "1-TestManufacturer|2-Model1|3-SN12345",
  invoiceTypeBitmask: "0100",
  location: "Riyadh, Test Street",
  industry: "Retail",
}

describe("generateZatcaKeyPair", () => {
  it("produces a real secp256k1 EC key pair as PKCS#8/SPKI PEM", () => {
    const { privateKeyPem, publicKeyPem } = generateZatcaKeyPair()
    expect(privateKeyPem).toContain("BEGIN PRIVATE KEY")
    expect(publicKeyPem).toContain("BEGIN PUBLIC KEY")
    // Real, parseable keys -- not just PEM-shaped strings.
    expect(() => createPublicKey(publicKeyPem)).not.toThrow()
  })

  it("generates a different key pair every call", () => {
    const first = generateZatcaKeyPair()
    const second = generateZatcaKeyPair()
    expect(first.privateKeyPem).not.toBe(second.privateKeyPem)
  })
})

describe("generateZatcaCsr", () => {
  it("self-verifies with openssl and carries the right Subject and SAN fields", () => {
    const { csrPem } = generateZatcaCsr(BASE_INPUT)

    expect(opensslReq(csrPem, ["-verify", "-noout"])).toContain(
      "Certificate request self-signature verify OK"
    )

    const text = opensslReq(csrPem, ["-noout", "-text", "-nameopt", "oid"])
    // Subject DN (CN, organizationIdentifier, OU, O, C).
    expect(text).toContain(`2.5.4.3=${BASE_INPUT.commonName}`)
    expect(text).toContain(`2.5.4.97=${BASE_INPUT.vatNumber}`)
    expect(text).toContain(`2.5.4.11=${BASE_INPUT.organizationUnit}`)
    expect(text).toContain(`2.5.4.10=${BASE_INPUT.organizationName}`)
    expect(text).toContain(`2.5.4.6=${BASE_INPUT.countryCode}`)
    // SAN dirName (EGS serial number, VAT/UID, invoice-type bitmask, address, industry).
    expect(text).toContain(`serialNumber=${BASE_INPUT.egsSerialNumber}`)
    expect(text).toContain(`UID=${BASE_INPUT.vatNumber}`)
    expect(text).toContain(`title=${BASE_INPUT.invoiceTypeBitmask}`)
    expect(text).toContain(`registeredAddress=${BASE_INPUT.location}`)
    expect(text).toContain(`businessCategory=${BASE_INPUT.industry}`)
    // Curve and the sandbox ZATCA-Code-Signing attribute.
    expect(text).toContain("ASN1 OID: secp256k1")
    expect(text).toContain("TESTZATCA-Code-Signing")
  })

  it("returns the matching key pair alongside the CSR", () => {
    const { csrPem, keyPair } = generateZatcaCsr(BASE_INPUT)
    const csrPublicKeyDer = execFileSync("openssl", ["req", "-in", "-", "-noout", "-pubkey"], {
      input: csrPem,
    }).toString("utf8")
    const keyPairPublicKeyDer = keyPair.publicKeyPem
    // openssl's `-pubkey` output is the same SPKI PEM the key pair itself carries.
    expect(csrPublicKeyDer.trim()).toBe(keyPairPublicKeyDer.trim())
  })

  it("embeds a different ZATCA-Code-Signing attribute literal per environment", () => {
    const sandboxText = opensslReq(
      generateZatcaCsr({ ...BASE_INPUT, environment: "sandbox" }).csrPem,
      ["-noout", "-text"]
    )
    const productionText = opensslReq(
      generateZatcaCsr({ ...BASE_INPUT, environment: "production" }).csrPem,
      ["-noout", "-text"]
    )
    expect(sandboxText).toContain("TESTZATCA-Code-Signing")
    expect(productionText).not.toContain("TESTZATCA-Code-Signing")
    expect(productionText).toContain("ZATCA-Code-Signing")
  })

  it("generates a fresh key pair (and therefore a different CSR) on every call", () => {
    const first = generateZatcaCsr(BASE_INPUT)
    const second = generateZatcaCsr(BASE_INPUT)
    expect(first.csrPem).not.toBe(second.csrPem)
  })
})

describe("compressEcPublicKey", () => {
  it("compresses an SPKI public key PEM down to the 33-byte SEC1 form", () => {
    const { publicKeyPem } = generateZatcaKeyPair()
    const compressed = compressEcPublicKey(publicKeyPem)
    expect(compressed.length).toBe(33)
    expect([0x02, 0x03]).toContain(compressed[0])
  })

  it("is deterministic for the same key", () => {
    const { publicKeyPem } = generateZatcaKeyPair()
    expect(compressEcPublicKey(publicKeyPem).equals(compressEcPublicKey(publicKeyPem))).toBe(true)
  })
})

describe("encryptZatcaSecret / decryptZatcaSecret", () => {
  const key = "a".repeat(32)

  it("round-trips a plaintext secret exactly", () => {
    const encrypted = encryptZatcaSecret("a real private key PEM", key)
    expect(decryptZatcaSecret(encrypted, key)).toBe("a real private key PEM")
  })

  it("never stores the plaintext inside the encrypted envelope", () => {
    const encrypted = encryptZatcaSecret("super-secret-value", key)
    expect(encrypted).not.toContain("super-secret-value")
  })

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    expect(encryptZatcaSecret("same value", key)).not.toBe(encryptZatcaSecret("same value", key))
  })

  it("rejects decryption with the wrong key", () => {
    const encrypted = encryptZatcaSecret("secret", key)
    expect(() => decryptZatcaSecret(encrypted, "b".repeat(32))).toThrow()
  })

  it("rejects a malformed envelope", () => {
    expect(() => decryptZatcaSecret("not-a-real-envelope", key)).toThrow()
  })
})
