// Covers PosZatcaReporting: how each ZATCA answer is recorded (reported / refused / failed), that a
// reported document is never sent again, that the background pass skips refused documents while
// "report all" retries them, and the credit-note XML a return is signed with. ZATCA's gateway is
// replaced by a stubbed fetch.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PosZatcaReporting } from "../pos/zatca-reporting"
import { encryptZatcaSecret, resolveZatcaEncryptionKey } from "../zatca/zatca-crypto"
import { ZatcaDevicesService } from "../zatca/zatca-devices-service"
import { buildZatcaUblInvoiceXml, ZATCA_GENESIS_PIH_BASE64 } from "../zatca/zatca-ubl-invoice"

const certificateDir = mkdtempSync(join(tmpdir(), "zatca-reporting-"))
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

const organizationId = "20000000-0000-0000-0000-000000000001"
const workspaceId = "30000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let devices: ZatcaDevicesService
let reporting: PosZatcaReporting
let deviceId: string
let invoiceCounter = 0

function stubZatca(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())

  const userId = "10000000-0000-0000-0000-000000000001"
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'zatca-reporting@example.com', 'hash', 'Owner', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id) values ($1, 'Test Org', $2)`,
    [organizationId, userId]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [workspaceId, organizationId]
  )

  devices = new ZatcaDevicesService(database)
  reporting = new PosZatcaReporting(database, devices)
  const device = await devices.createDevice(organizationId, {
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
  deviceId = device.id
  const key = resolveZatcaEncryptionKey()!
  const token = Buffer.from(TEST_CERTIFICATE_BASE64).toString("base64")
  await database.query(
    `update zatca_devices
        set status = 'production', compliance_csid_encrypted = $2,
            production_csid_encrypted = $2, production_secret_encrypted = $3
      where id = $1`,
    [deviceId, encryptZatcaSecret(token, key), encryptZatcaSecret("secret", key)]
  )
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await database.end()
})

// A signed sale, stored the way PosInvoicesService.create() stores one.
async function insertSignedInvoice(): Promise<string> {
  invoiceCounter += 1
  const invoiceNumber = `INV-${invoiceCounter}`
  const signed = await devices.signInvoice(organizationId, deviceId, {
    invoiceNumber,
    issuedAt: new Date(),
    sellerName: "Test Org",
    sellerVatNumber: "310000000000003",
    sellerAddress: null,
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
        productName: "Item",
        quantity: 1,
        unitPrice: 100,
        netAmount: 100,
        taxAmount: 15,
        taxRatePercent: 15,
      },
    ],
    notes: null,
    advanceChain: true,
  })
  const id = `40000000-0000-0000-0000-00000000000${invoiceCounter}`
  await database.query(
    `insert into pos_invoices
       (id, organization_id, workspace_id, invoice_number, payment_method_code, subtotal_amount,
        tax_amount, total_amount, zatca_device_id, invoice_hash, zatca_uuid, zatca_signed_xml)
     values ($1, $2, $3, $4, 'cash', 100, 15, 115, $5, $6, $7, $8)`,
    [
      id,
      organizationId,
      workspaceId,
      invoiceNumber,
      deviceId,
      signed.invoiceHash.toString("base64"),
      signed.uuid,
      Buffer.from(signed.signedXmlBase64, "base64").toString("utf8"),
    ]
  )
  return id
}

async function invoiceRow(id: string) {
  const result = await database.query<{
    zatca_status: string | null
    zatca_reported_at: Date | null
    zatca_attempts: number
    zatca_last_error: string | null
  }>(
    `select zatca_status, zatca_reported_at, zatca_attempts, zatca_last_error
       from pos_invoices where id = $1`,
    [id]
  )
  return result.rows[0]
}

describe("PosZatcaReporting.report", () => {
  it("records an accepted invoice as reported and never sends it again", async () => {
    const id = await insertSignedInvoice()
    const fetchMock = stubZatca(200, { reportingStatus: "REPORTED" })

    expect(await reporting.report("invoice", id)).toEqual({
      result: "reported",
      status: "REPORTED",
    })
    const row = await invoiceRow(id)
    expect(row.zatca_status).toBe("REPORTED")
    expect(row.zatca_reported_at).not.toBeNull()
    expect(Number(row.zatca_attempts)).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain("/developer-portal/invoices/reporting/single")

    expect(await reporting.report("invoice", id)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await reporting.listUnreported(organizationId)).toEqual([])
  })

  it("keeps ZATCA's reason for a refused invoice; the timer skips it, report-all retries it", async () => {
    const id = await insertSignedInvoice()
    stubZatca(400, {
      reportingStatus: "NOT_REPORTED",
      validationResults: { errorMessages: [{ message: "Invalid invoice hash" }] },
    })
    expect(await reporting.report("invoice", id)).toEqual({
      result: "rejected",
      status: "NOT_REPORTED",
      error: "Invalid invoice hash",
    })

    const [listed] = await reporting.listUnreported(organizationId)
    expect(listed).toMatchObject({
      kind: "invoice",
      id,
      number: expect.stringMatching(/^INV-\d+$/),
      zatcaStatus: "NOT_REPORTED",
      lastError: "Invalid invoice hash",
      attempts: 1,
    })

    const timerFetch = stubZatca(200, { reportingStatus: "REPORTED" })
    expect(await reporting.reportPending()).toEqual({ reported: 0, rejected: 0, failed: 0 })
    expect(timerFetch).not.toHaveBeenCalled()

    // Past the claim window, a person can send it again.
    await database.query(
      `update pos_invoices set zatca_last_attempt_at = now() - interval '5 minutes' where id = $1`,
      [id]
    )
    expect(await reporting.reportAll(organizationId)).toEqual({
      reported: 1,
      rejected: 0,
      failed: 0,
      skipped: 0,
    })
    expect((await invoiceRow(id)).zatca_last_error).toBeNull()
  })

  it("leaves a failed attempt for the background pass to retry", async () => {
    const id = await insertSignedInvoice()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      })
    )
    expect(await reporting.report("invoice", id)).toEqual({
      result: "failed",
      status: null,
      error: "network down",
    })
    expect((await invoiceRow(id)).zatca_reported_at).toBeNull()

    // Claimed for a minute: an immediate pass doesn't send it twice.
    stubZatca(200, { reportingStatus: "REPORTED" })
    expect(await reporting.reportPending()).toEqual({ reported: 0, rejected: 0, failed: 0 })

    await database.query(
      `update pos_invoices set zatca_last_attempt_at = now() - interval '5 minutes' where id = $1`,
      [id]
    )
    expect(await reporting.reportPending()).toEqual({ reported: 1, rejected: 0, failed: 0 })
    expect(Number((await invoiceRow(id)).zatca_attempts)).toBe(2)
  })

  it("counts ZATCA's 409 (already has it) as reported", async () => {
    const id = await insertSignedInvoice()
    stubZatca(409, { message: "Invoice already reported" })
    expect(await reporting.report("invoice", id)).toEqual({
      result: "reported",
      status: "REPORTED",
    })
  })

  it("refuses a manual report with ZATCA's reason", async () => {
    const id = await insertSignedInvoice()
    stubZatca(400, { validationResults: { errorMessages: [{ message: "Bad VAT" }] } })
    await expect(reporting.reportNow("invoice", organizationId, id)).rejects.toMatchObject({
      code: "ZATCA_REJECTED",
      message: "Bad VAT",
    })
  })
})

describe("credit note XML", () => {
  it("is a 381 document referencing the original invoice, with the reason", () => {
    const xml = buildZatcaUblInvoiceXml({
      invoiceNumber: "RTN-000001",
      uuid: "00000000-0000-0000-0000-000000000001",
      issuedAt: new Date("2026-01-01T10:00:00Z"),
      invoiceTypeName: "0200000",
      icv: 2,
      previousInvoiceHashBase64: ZATCA_GENESIS_PIH_BASE64,
      sellerName: "Test Org",
      sellerVatNumber: "310000000000003",
      sellerAddress: null,
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
          productName: "Item",
          quantity: 1,
          unitPrice: 100,
          netAmount: 100,
          taxAmount: 15,
          taxRatePercent: 15,
        },
      ],
      notes: null,
      creditNote: { originalInvoiceNumber: "INV-000007", reason: "Damaged" },
    })
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>')
    expect(xml).toContain(
      "<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-000007</cbc:ID>"
    )
    expect(xml).toContain("<cbc:InstructionNote>Damaged</cbc:InstructionNote>")
  })
})
