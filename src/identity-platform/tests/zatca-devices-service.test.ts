// Covers ZatcaDevicesService's device lifecycle and, in particular, the ICV/PIH chain invariants
// named in the ZATCA Phase 2 plan's verification checklist: ICV strictly increases and is never
// reused, PIH of invoice N+1 matches the hash of invoice N, and a compliance-check-only signing
// (advanceChain: false) never moves the device's persisted chain position. Runs against pg-mem
// directly (no HTTP layer) since these are service-level invariants, not endpoint contracts.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { encryptZatcaSecret, resolveZatcaEncryptionKey } from "../zatca/zatca-crypto"
import { ZatcaDevicesService } from "../zatca/zatca-devices-service"
import { ZATCA_GENESIS_PIH_BASE64 } from "../zatca/zatca-ubl-invoice"

// The signer reads issuer, serial, key and signature out of the certificate, so it must be real.
const certificateDir = mkdtempSync(join(tmpdir(), "zatca-devices-"))
execFileSync("openssl", [
  "ecparam",
  "-name",
  "secp256k1",
  "-genkey",
  "-noout",
  "-out",
  join(certificateDir, "key.pem"),
])
execFileSync("openssl", [
  "req",
  "-new",
  "-x509",
  "-key",
  join(certificateDir, "key.pem"),
  "-out",
  join(certificateDir, "cert.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=eInvoicing",
])
const TEST_CERTIFICATE_BASE64 = readFileSync(join(certificateDir, "cert.pem"), "utf8")
  .replace(/-----[^-]+-----/g, "")
  .replace(/\s/g, "")

let database: PostgresDatabase
let organizationId: string

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  const userId = "10000000-0000-0000-0000-000000000001"
  organizationId = "20000000-0000-0000-0000-000000000001"
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'zatca-device-test@example.com', 'hash', 'Test Owner', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id) values ($1, 'Test Org', $2)`,
    [organizationId, userId]
  )
})

afterEach(async () => {
  await database.end()
})

// Puts a device straight into "compliance" status with a fake but well-formed-enough certificate,
// bypassing the one live, OTP-gated ZATCA call (submitCompliance) that signInvoice's own
// certificate lookup requires -- exactly the scope boundary the plan describes.
async function createComplianceReadyDevice(service: ZatcaDevicesService) {
  const device = await service.createDevice(organizationId, {
    workspaceId: null,
    commonName: "EGS-TEST-1",
    environment: "sandbox",
    vatNumber: "310000000000003",
    organizationName: "Test Org",
    organizationUnit: "Main Branch",
    egsSerialNumber: "1-TestMfr|2-Model1|3-SN1",
    invoiceTypeBitmask: "0100",
    location: "Riyadh",
    industry: "Retail",
  })
  const key = resolveZatcaEncryptionKey()
  // A real (self-signed) certificate, stored the way ZATCA returns it: base64 of its base64 body.
  const fakeCertificate = Buffer.from(TEST_CERTIFICATE_BASE64).toString("base64")
  await database.query(
    `update zatca_devices set status = 'compliance', compliance_csid_encrypted = $2 where id = $1`,
    [device.id, encryptZatcaSecret(fakeCertificate, key)]
  )
  return device
}

function invoiceInput(overrides: { invoiceNumber: string }) {
  return {
    invoiceNumber: overrides.invoiceNumber,
    issuedAt: new Date("2026-01-01T10:00:00.000Z"),
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
  }
}

describe("ZatcaDevicesService.createDevice", () => {
  it("creates a draft device with a real CSR and public key, independent of any live ZATCA call", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await service.createDevice(organizationId, {
      workspaceId: null,
      commonName: "EGS-TEST-DRAFT",
      environment: "sandbox",
      vatNumber: "310000000000003",
      organizationName: "Test Org",
      organizationUnit: "Main Branch",
      egsSerialNumber: "1-TestMfr|2-Model1|3-SN1",
      invoiceTypeBitmask: "0100",
      location: "Riyadh",
      industry: "Retail",
    })
    expect(device.status).toBe("draft")
    expect(device.csr).toContain("BEGIN CERTIFICATE REQUEST")
    expect(device.lastIcv).toBe(0)
  })
})

describe("ZatcaDevicesService.signInvoice -- ICV/PIH chain", () => {
  it("starts the first invoice on a fresh device at ICV 1 with the genesis PIH", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)

    const signed = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-1" }),
      advanceChain: true,
    })

    expect(signed.icv).toBe(1)
    expect(signed.previousInvoiceHashBase64).toBe(ZATCA_GENESIS_PIH_BASE64)
  })

  it("strictly increases ICV and chains PIH to the previous invoice's hash across advanced calls", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)

    const first = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-1" }),
      advanceChain: true,
    })
    const second = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-2" }),
      advanceChain: true,
    })
    const third = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-3" }),
      advanceChain: true,
    })

    expect([first.icv, second.icv, third.icv]).toEqual([1, 2, 3])
    expect(second.previousInvoiceHashBase64).toBe(first.invoiceHash.toString("base64"))
    expect(third.previousInvoiceHashBase64).toBe(second.invoiceHash.toString("base64"))
  })

  it("never advances the persisted chain for a compliance-check-only signing (advanceChain: false)", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)

    await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "COMPLIANCE-SAMPLE-1" }),
      advanceChain: false,
    })
    await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "COMPLIANCE-SAMPLE-2" }),
      advanceChain: false,
    })

    const row = await database.query<{ last_icv: number; last_invoice_hash: string | null }>(
      `select last_icv, last_invoice_hash from zatca_devices where id = $1`,
      [device.id]
    )
    expect(Number(row.rows[0].last_icv)).toBe(0)
    expect(row.rows[0].last_invoice_hash).toBeNull()

    // The very next real (advancing) invoice still starts the chain at ICV 1 with the genesis
    // PIH -- proof the sample signings never occupied a real chain position.
    const realInvoice = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-1" }),
      advanceChain: true,
    })
    expect(realInvoice.icv).toBe(1)
    expect(realInvoice.previousInvoiceHashBase64).toBe(ZATCA_GENESIS_PIH_BASE64)
  })

  it("produces a qrCodeBase64 whose tags 6-7 carry the returned invoiceHash/digitalSignature", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)

    const signed = await service.signInvoice(organizationId, device.id, {
      ...invoiceInput({ invoiceNumber: "INV-1" }),
      advanceChain: true,
    })

    const buffer = Buffer.from(signed.qrCodeBase64, "base64")
    let offset = 0
    const tags: Array<{ tag: number; value: Buffer }> = []
    while (offset < buffer.length) {
      const tag = buffer[offset]
      const length = buffer[offset + 1]
      tags.push({ tag, value: buffer.subarray(offset + 2, offset + 2 + length) })
      offset += 2 + length
    }
    // Tags 6 and 7 carry the base64 text of the hash and the signature; 9 is present too.
    expect(tags[5].value.toString("utf8")).toBe(signed.invoiceHash.toString("base64"))
    expect(tags[6].value.toString("utf8")).toBe(signed.digitalSignature.toString("base64"))
    expect(tags.map((entry) => entry.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe("ZatcaDevicesService.runComplianceChecks", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends an invoice, a credit note and a debit note, and counts 'Submitted before' as passed", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)
    await database.query(
      `update zatca_devices set compliance_secret_encrypted = $2 where id = $1`,
      [device.id, encryptZatcaSecret("secret", resolveZatcaEncryptionKey()!)]
    )
    const answers = [
      { status: 200, body: { reportingStatus: "REPORTED" } },
      {
        status: 406,
        body: {
          validationResults: {
            errorMessages: [
              {
                code: "Submitted before",
                message: "Compliance check already completed for SIMPLIFIED.",
              },
            ],
          },
        },
      },
      {
        status: 400,
        body: {
          validationResults: { errorMessages: [{ code: "BR-KSA-37", message: "Building number" }] },
        },
      },
      // The same credit note asked again in Arabic.
      {
        status: 400,
        body: {
          validationResults: { errorMessages: [{ code: "BR-KSA-37", message: "رقم المبنى" }] },
        },
      },
      { status: 200, body: { reportingStatus: "REPORTED" } },
    ]
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(Buffer.from(JSON.parse(String(init?.body)).invoice, "base64").toString("utf8"))
        const answer = answers.shift()!
        return new Response(JSON.stringify(answer.body), { status: answer.status })
      })
    )

    expect(await service.runComplianceChecks(organizationId, device.id)).toEqual([
      { scenario: "sale-no-discount", status: "REPORTED", reason: null, reasonAr: null },
      { scenario: "sale-with-discount", status: "PASSED_BEFORE", reason: null, reasonAr: null },
      {
        scenario: "credit-note",
        status: "NOT_REPORTED",
        reason: "Building number",
        reasonAr: "رقم المبنى",
      },
      { scenario: "debit-note", status: "REPORTED", reason: null, reasonAr: null },
    ])
    expect(bodies[2]).toContain(">381</cbc:InvoiceTypeCode>")
    expect(bodies[4]).toContain(">383</cbc:InvoiceTypeCode>")
  })
})

describe("ZatcaDevicesService certificate expiry", () => {
  it("shows when the device's certificate expires, read from the certificate itself", async () => {
    const service = new ZatcaDevicesService(database)
    const draft = await service.createDevice(organizationId, {
      workspaceId: null,
      commonName: "EGS-EXPIRY",
      environment: "sandbox",
      vatNumber: "310000000000003",
      organizationName: "Test Org",
      organizationUnit: "Main Branch",
      egsSerialNumber: "1-TestMfr|2-Model1|3-SN9",
      invoiceTypeBitmask: "0100",
      location: "Riyadh",
      industry: "Retail",
    })
    expect(draft.certificateExpiresAt).toBeNull()

    const device = await createComplianceReadyDevice(service)
    const [listed] = (await service.list(organizationId)).filter((item) => item.id === device.id)
    // The test certificate is made valid for one day.
    const expiresIn = new Date(listed.certificateExpiresAt!).getTime() - Date.now()
    expect(expiresIn).toBeGreaterThan(0)
    expect(expiresIn).toBeLessThanOrEqual(86_400_000 + 60_000)
  })
})

describe("ZatcaDevicesService.removeDevice", () => {
  it("deletes a device that never signed an invoice", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)
    expect(await service.removeDevice(organizationId, device.id)).toEqual({ result: "deleted" })
    expect(await service.list(organizationId)).toEqual([])
  })

  it("stops, rather than deletes, a device whose invoices must be kept", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)
    await database.query(`update zatca_devices set status = 'production' where id = $1`, [
      device.id,
    ])
    const workspaceId = "30000000-0000-0000-0000-000000000001"
    await database.query(
      `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
      [workspaceId, organizationId]
    )
    await database.query(
      `insert into pos_invoices
         (id, organization_id, workspace_id, invoice_number, payment_method_code, subtotal_amount,
          tax_amount, total_amount, zatca_device_id)
       values ('40000000-0000-0000-0000-000000000001', $1, $2, 'INV-1', 'cash', 100, 15, 115, $3)`,
      [organizationId, workspaceId, device.id]
    )
    expect((await service.findProductionDevice(organizationId, workspaceId))?.id).toBe(device.id)

    expect(await service.removeDevice(organizationId, device.id)).toEqual({ result: "deactivated" })
    const [listed] = await service.list(organizationId)
    expect(listed.deactivatedAt).not.toBeNull()
    expect(listed.signedDocuments).toBe(1)
    // A stopped device signs no new sales.
    expect(await service.findProductionDevice(organizationId, workspaceId)).toBeNull()
  })

  it("shows what the device's CSR registered", async () => {
    const service = new ZatcaDevicesService(database)
    const device = await createComplianceReadyDevice(service)
    expect(device.details).toMatchObject({
      commonName: "EGS-TEST-1",
      vatNumber: "310000000000003",
      organizationUnit: "Main Branch",
      egsSerialNumber: "1-TestMfr|2-Model1|3-SN1",
      location: "Riyadh",
      industry: "Retail",
    })
  })
})
