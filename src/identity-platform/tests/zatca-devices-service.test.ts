// Covers ZatcaDevicesService's device lifecycle and, in particular, the ICV/PIH chain invariants
// named in the ZATCA Phase 2 plan's verification checklist: ICV strictly increases and is never
// reused, PIH of invoice N+1 matches the hash of invoice N, and a compliance-check-only signing
// (advanceChain: false) never moves the device's persisted chain position. Runs against pg-mem
// directly (no HTTP layer) since these are service-level invariants, not endpoint contracts.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { encryptZatcaSecret, resolveZatcaEncryptionKey } from "../zatca/zatca-crypto"
import { ZatcaDevicesService } from "../zatca/zatca-devices-service"

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
  const fakeCertificate = Buffer.from("fake-compliance-certificate-der-bytes").toString("base64")
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
    expect(signed.previousInvoiceHashBase64).toBe(Buffer.alloc(32).toString("base64"))
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
    expect(realInvoice.previousInvoiceHashBase64).toBe(Buffer.alloc(32).toString("base64"))
  })

  it("produces a qrCodeBase64 whose tags 6-7 match the returned invoiceHash/digitalSignature", async () => {
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
    expect(tags[5].value.equals(signed.invoiceHash)).toBe(true)
    expect(tags[6].value.equals(signed.digitalSignature)).toBe(true)
  })
})
