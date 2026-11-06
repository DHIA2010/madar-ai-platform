import { randomUUID, X509Certificate } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  decryptZatcaSecret,
  encryptZatcaSecret,
  environmentFromCsr,
  readZatcaCsr,
  type ZatcaCsrDetails,
  generateZatcaCsr,
  resolveZatcaEncryptionKey,
  type ZatcaCsrEnvironment,
} from "./zatca-crypto"
import {
  exchangeZatcaProductionCsid,
  submitZatcaComplianceCheck,
  submitZatcaComplianceCsid,
  ZatcaApiError,
  zatcaErrorMessage,
} from "./zatca-api-client"
import {
  buildZatcaUblInvoiceXml,
  ZATCA_GENESIS_PIH_BASE64,
  type ZatcaInvoiceAdjustment,
  type ZatcaUblAddress,
} from "./zatca-ubl-invoice"
import { certificateBase64FromToken, embedZatcaQrCode, signZatcaInvoice } from "./zatca-signing"
import { generateZatcaPhase2QrCode } from "../pos/zatca-qr-code"

const ZATCA_DEVICE_ERRORS = {
  notFound: () =>
    new IdentityError("ZATCA_DEVICE_NOT_FOUND", 404, "business", "ZATCA device not found."),
  wrongStatus: (expected: string, actual: string) =>
    new IdentityError(
      "ZATCA_DEVICE_WRONG_STATUS",
      409,
      "business",
      `This action requires the device to be "${expected}", but it is currently "${actual}".`
    ),
}

export type ZatcaDeviceStatus = "draft" | "compliance" | "production"

export interface ZatcaDeviceView {
  id: string
  organizationId: string
  workspaceId: string | null
  commonName: string
  csr: string
  status: ZatcaDeviceStatus
  // The ZATCA environment it was onboarded for (null: an old device whose CSR doesn't say).
  environment: ZatcaCsrEnvironment | null
  lastIcv: number
  // When the device's certificate from ZATCA stops being valid -- the production one once issued,
  // else the compliance one; null before onboarding. After this date the device can't sign or
  // report until its certificate is renewed in the Fatoora portal.
  certificateExpiresAt: string | null
  // The certificate ZATCA issued (production once issued, else compliance); null before onboarding.
  certificate: { validFrom: string; validTo: string; serialNumber: string; issuer: string } | null
  // What the device's CSR registered with ZATCA.
  details: ZatcaCsrDetails
  // Sales and returns this device signed.
  signedDocuments: number
  // Set once the device was stopped (removed while it had signed invoices) -- it signs nothing new.
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ZatcaDeviceRow {
  id: string
  organization_id: string
  workspace_id: string | null
  common_name: string
  csr: string
  private_key_encrypted: string
  public_key_pem: string
  status: string
  compliance_request_id: string | null
  compliance_csid_encrypted: string | null
  compliance_secret_encrypted: string | null
  production_csid_encrypted: string | null
  production_secret_encrypted: string | null
  last_icv: string | number
  last_invoice_hash: string | null
  environment: string | null
  vat_number: string | null
  organization_name: string | null
  deactivated_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// A device's ZATCA environment: stored since migration 146, else read from its CSR.
function deviceEnvironment(row: ZatcaDeviceRow): ZatcaCsrEnvironment | null {
  if (row.environment === "sandbox" || row.environment === "simulation") return row.environment
  if (row.environment === "production") return "production"
  return environmentFromCsr(row.csr)
}

function requireEnvironment(row: ZatcaDeviceRow): ZatcaCsrEnvironment {
  const environment = deviceEnvironment(row)
  if (!environment) {
    throw new IdentityError(
      "ZATCA_DEVICE_ENVIRONMENT_UNKNOWN",
      409,
      "business",
      "This device's ZATCA environment is unknown -- add it again."
    )
  }
  return environment
}

// ZATCA refused a request: its own reason, for the user (not a generic failure).
function zatcaRejected(error: unknown): never {
  if (error instanceof ZatcaApiError) {
    throw new IdentityError(
      "ZATCA_REJECTED",
      422,
      "business",
      zatcaErrorMessage(error.body) ?? `ZATCA refused the request (${error.status}).`,
      { status: error.status }
    )
  }
  throw error
}

function isSubmittedBefore(error: unknown): boolean {
  if (!(error instanceof ZatcaApiError) || error.status !== 406) return false
  const messages =
    (error.body as { validationResults?: { errorMessages?: Array<{ code?: string }> } } | null)
      ?.validationResults?.errorMessages ?? []
  return messages.some((message) => message.code === "Submitted before")
}

// The VAT number the device's certificate carries: stored since migration 147, else the 15-digit
// number (starting and ending with 3) inside its CSR.
function sellerVatNumber(row: ZatcaDeviceRow): string {
  if (row.vat_number) return row.vat_number
  const der = Buffer.from(row.csr.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64")
  return der.toString("latin1").match(/3\d{13}3/)?.[0] ?? ""
}

function deviceCertificate(row: ZatcaDeviceRow): ZatcaDeviceView["certificate"] {
  const source = row.production_csid_encrypted ?? row.compliance_csid_encrypted
  const key = resolveZatcaEncryptionKey()
  if (!source || !key) return null
  try {
    const body = certificateBase64FromToken(decryptZatcaSecret(source, key))
    const certificate = new X509Certificate(
      `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`
    )
    return {
      validFrom: new Date(certificate.validFrom).toISOString(),
      validTo: new Date(certificate.validTo).toISOString(),
      serialNumber: BigInt(`0x${certificate.serialNumber}`).toString(10),
      issuer: certificate.issuer.split("\n").reverse().join(", "),
    }
  } catch {
    return null
  }
}

function mapDevice(row: ZatcaDeviceRow, signedDocuments = 0): ZatcaDeviceView {
  const certificate = deviceCertificate(row)
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    commonName: row.common_name,
    csr: row.csr,
    status: row.status as ZatcaDeviceStatus,
    environment: deviceEnvironment(row),
    lastIcv: Number(row.last_icv) || 0,
    certificateExpiresAt: certificate?.validTo ?? null,
    certificate,
    details: readZatcaCsr(row.csr),
    signedDocuments,
    deactivatedAt: row.deactivated_at ? toIso(row.deactivated_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const DEVICE_SELECT = `
  SELECT id, organization_id, workspace_id, common_name, csr, private_key_encrypted,
         public_key_pem, status, compliance_request_id, compliance_csid_encrypted,
         compliance_secret_encrypted, production_csid_encrypted, production_secret_encrypted,
         last_icv, last_invoice_hash, environment, vat_number, organization_name,
         deactivated_at, created_at, updated_at
    FROM zatca_devices
`

// One compliance sample's verdict: REPORTED (passed), or NOT_REPORTED with ZATCA's reason.
export interface ZatcaComplianceCheckView {
  scenario: string
  status: string
  reason: string | null
  reasonAr: string | null
}

export interface CreateZatcaDeviceInput {
  workspaceId: string | null
  commonName: string
  environment: ZatcaCsrEnvironment
  vatNumber: string
  organizationName: string
  organizationUnit: string
  egsSerialNumber: string
  // "TSCZ" bitmask -- always "0100" (Simplified only) for this app today, kept as an input rather
  // than hardcoded so a future Standard/Clearance device isn't a schema change.
  invoiceTypeBitmask: string
  location: string
  industry: string
}

// A signed invoice ready to hand to ZATCA's Compliance Checks / Reporting APIs -- everything a
// caller needs, in one place, so PosInvoicesService (and the compliance-check flow below) build
// this the same way.
export interface ZatcaSignedInvoicePackage {
  invoiceHash: Buffer
  digitalSignature: Buffer
  // The final signed XML, with the real QR (tags 1-8) already embedded -- base64-encoded, exactly
  // the form Compliance Checks/Reporting expect as their own `invoice` field.
  signedXmlBase64: string
  // Same QR, on its own -- what pos_invoices.qr_code / the printed receipt actually shows.
  qrCodeBase64: string
  uuid: string
  icv: number
  // What this invoice's own PIH was built from -- the previous invoice's hash on this device's
  // chain, or ZATCA_GENESIS_PIH_BASE64 for the very first invoice. Base64, same form stored on
  // both zatca_devices.last_invoice_hash and pos_invoices.previous_invoice_hash.
  previousInvoiceHashBase64: string
}

// Onboarding + real invoice signing for ZATCA Phase 2 devices (EGS units). See
// zatca-crypto.ts/zatca-signing.ts/zatca-ubl-invoice.ts for the cryptography and XML this
// orchestrates, and the plan doc (identity-platform Phase 2 plan) for why each step here is
// scoped the way it is -- in particular, everything except submitCompliance() runs with no live
// ZATCA dependency at all.
export class ZatcaDevicesService {
  constructor(private readonly database: PostgresDatabase) {}

  private encryptionKey(): string {
    const key = resolveZatcaEncryptionKey()
    if (!key) throw new Error("ZATCA_ENCRYPTION_CONFIGURATION_ERROR")
    return key
  }

  async list(organizationId: string): Promise<ZatcaDeviceView[]> {
    const result = await this.database.query<ZatcaDeviceRow>(
      `${DEVICE_SELECT} WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    )
    const counts = await this.signedDocumentCounts(organizationId)
    return result.rows.map((row) => mapDevice(row, counts.get(row.id) ?? 0))
  }

  // Sales and returns each device of this organization signed.
  private async signedDocumentCounts(organizationId: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    for (const table of ["pos_invoices", "pos_invoice_returns"]) {
      const result = await this.database.query<{ zatca_device_id: string; count: string | number }>(
        `SELECT zatca_device_id, COUNT(*) AS count FROM ${table}
          WHERE organization_id = $1 AND zatca_device_id IS NOT NULL
          GROUP BY zatca_device_id`,
        [organizationId]
      )
      for (const row of result.rows) {
        counts.set(row.zatca_device_id, (counts.get(row.zatca_device_id) ?? 0) + Number(row.count))
      }
    }
    return counts
  }

  // Removes a device. One that never signed an invoice is deleted outright (whatever its status --
  // if it was linked with an OTP, its certificate can also be revoked in the Fatoora portal). One
  // that did is stopped instead: its invoices reference it and must be kept, and any of them not
  // yet reported still need its certificate to be sent.
  async removeDevice(
    organizationId: string,
    deviceId: string
  ): Promise<{ result: "deleted" | "deactivated" }> {
    await this.getRow(organizationId, deviceId)
    const signed = (await this.signedDocumentCounts(organizationId)).get(deviceId) ?? 0
    if (signed === 0) {
      await this.database.query(
        "DELETE FROM zatca_devices WHERE id = $1 AND organization_id = $2",
        [deviceId, organizationId]
      )
      return { result: "deleted" }
    }
    await this.database.query(
      `UPDATE zatca_devices SET deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [deviceId, organizationId]
    )
    return { result: "deactivated" }
  }

  private async getRow(organizationId: string, deviceId: string): Promise<ZatcaDeviceRow> {
    const result = await this.database.query<ZatcaDeviceRow>(
      `${DEVICE_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, deviceId]
    )
    const row = result.rows[0]
    if (!row) throw ZATCA_DEVICE_ERRORS.notFound()
    return row
  }

  // Step 1 -- no ZATCA dependency at all. Generates a real key pair + CSR and stores the private
  // key encrypted at rest (see zatca-crypto.ts's encryptZatcaSecret).
  async createDevice(
    organizationId: string,
    input: CreateZatcaDeviceInput
  ): Promise<ZatcaDeviceView> {
    const { csrPem, keyPair } = generateZatcaCsr({
      environment: input.environment,
      commonName: input.commonName,
      vatNumber: input.vatNumber,
      organizationUnit: input.organizationUnit,
      organizationName: input.organizationName,
      countryCode: "SA",
      egsSerialNumber: input.egsSerialNumber,
      invoiceTypeBitmask: input.invoiceTypeBitmask,
      location: input.location,
      industry: input.industry,
    })

    const id = randomUUID()
    const key = this.encryptionKey()
    await this.database.query(
      `INSERT INTO zatca_devices
         (id, organization_id, workspace_id, common_name, csr, private_key_encrypted,
          public_key_pem, status, environment, vat_number, organization_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10)`,
      [
        id,
        organizationId,
        input.workspaceId,
        input.commonName,
        csrPem,
        encryptZatcaSecret(keyPair.privateKeyPem, key),
        keyPair.publicKeyPem,
        input.environment,
        input.vatNumber,
        input.organizationName,
      ]
    )
    return mapDevice(await this.getRow(organizationId, id))
  }

  // Step 2 -- the one call gated on a real Fatoora-portal OTP the taxpayer supplies.
  async submitCompliance(
    organizationId: string,
    deviceId: string,
    otp: string
  ): Promise<ZatcaDeviceView> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "draft") throw ZATCA_DEVICE_ERRORS.wrongStatus("draft", row.status)

    const result = await submitZatcaComplianceCsid(requireEnvironment(row), row.csr, otp).catch(
      zatcaRejected
    )
    const key = this.encryptionKey()
    await this.database.query(
      `UPDATE zatca_devices
          SET status = 'compliance', compliance_request_id = $2,
              compliance_csid_encrypted = $3, compliance_secret_encrypted = $4, updated_at = now()
        WHERE id = $1`,
      [
        deviceId,
        result.requestId,
        encryptZatcaSecret(result.binarySecurityToken, key),
        encryptZatcaSecret(result.secret, key),
      ]
    )
    return mapDevice(await this.getRow(organizationId, deviceId))
  }

  // Builds and signs a representative Simplified Tax Invoice against THIS device's own key --
  // used both by Compliance Checks (step 3 below) and, once a device is `production`, by
  // PosInvoicesService for a real sale. Advances (and persists) this device's own ICV/PIH chain
  // in the same call, inside the same transaction as the caller's own invoice insert when called
  // from PosInvoicesService -- callers doing a compliance-check-only signing (no real invoice
  // behind it) should NOT persist the resulting chain state; see signSampleInvoiceForCompliance
  // below, which deliberately does not advance the stored chain.
  async signInvoice(
    organizationId: string,
    deviceId: string,
    input: {
      invoiceNumber: string
      issuedAt: Date
      sellerName: string
      sellerVatNumber: string
      sellerAddress: ZatcaUblAddress | null
      customerName: string | null
      customerVatNumber: string | null
      subtotalAmount: number
      discountAmount: number
      taxAmount: number
      totalAmount: number
      taxRatePercent: number
      lines: Array<{
        id: string
        productName: string
        quantity: number
        unitPrice: number
        netAmount: number
        taxAmount: number
        taxRatePercent: number
      }>
      notes: string | null
      // Set when signing a credit/debit note instead of an invoice -- see zatca-ubl-invoice.ts.
      adjustment?: ZatcaInvoiceAdjustment | null
      // When true (compliance-check sampling), the device's own persisted ICV/PIH chain is left
      // untouched -- a compliance test invoice never really happened, so it must never occupy a
      // real chain position.
      advanceChain: boolean
    }
  ): Promise<ZatcaSignedInvoicePackage> {
    const row = await this.getRow(organizationId, deviceId)
    const key = this.encryptionKey()
    const privateKeyPem = decryptZatcaSecret(row.private_key_encrypted, key)
    // ZATCA checks the seller's VAT number against the device's certificate, so the certificate's
    // wins over whatever the organization's tax settings say (or don't, when never filled in).
    const vatNumber = sellerVatNumber(row) || input.sellerVatNumber
    const sellerName = input.sellerName || (await this.sellerName(row))

    const icv = Number(row.last_icv) + 1
    const previousInvoiceHashBase64 = row.last_invoice_hash ?? ZATCA_GENESIS_PIH_BASE64
    const uuid = randomUUID()

    const unsignedXml = buildZatcaUblInvoiceXml({
      invoiceNumber: input.invoiceNumber,
      uuid,
      issuedAt: input.issuedAt,
      invoiceTypeName: "0200000",
      icv,
      previousInvoiceHashBase64,
      sellerName,
      sellerVatNumber: vatNumber,
      sellerAddress: input.sellerAddress,
      customerName: input.customerName,
      customerVatNumber: input.customerVatNumber,
      subtotalAmount: input.subtotalAmount,
      discountAmount: input.discountAmount,
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      taxRatePercent: input.taxRatePercent,
      lines: input.lines,
      notes: input.notes,
      adjustment: input.adjustment ?? null,
    })

    // The device's own certificate -- ZATCA returns it as the binarySecurityToken from the
    // Compliance/Production CSID exchange. Prefers production once available.
    const certificateSource = row.production_csid_encrypted ?? row.compliance_csid_encrypted
    if (!certificateSource)
      throw ZATCA_DEVICE_ERRORS.wrongStatus("compliance or production", row.status)
    // Stored as ZATCA returned it (binarySecurityToken: base64 of the certificate's base64 body).
    const certificateBase64 = certificateBase64FromToken(decryptZatcaSecret(certificateSource, key))

    const signResult = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateBase64,
      signingTime: input.issuedAt,
    })

    const qrCodeBase64 = generateZatcaPhase2QrCode(
      {
        sellerName,
        vatRegistrationNumber: vatNumber,
        timestamp: input.issuedAt.toISOString().slice(0, 19),
        invoiceTotal: input.totalAmount,
        vatTotal: input.taxAmount,
      },
      {
        invoiceHashBase64: signResult.invoiceHash.toString("base64"),
        digitalSignatureBase64: signResult.digitalSignature.toString("base64"),
        publicKeyDer: signResult.certificate.publicKeyDer,
        certificateSignature: signResult.certificate.signature,
      }
    )
    const finalXml = embedZatcaQrCode(signResult.signedXml, qrCodeBase64)

    if (input.advanceChain) {
      await this.database.query(
        `UPDATE zatca_devices SET last_icv = $2, last_invoice_hash = $3, updated_at = now()
          WHERE id = $1`,
        [deviceId, icv, signResult.invoiceHash.toString("base64")]
      )
    }

    return {
      invoiceHash: signResult.invoiceHash,
      digitalSignature: signResult.digitalSignature,
      signedXmlBase64: Buffer.from(finalXml, "utf8").toString("base64"),
      qrCodeBase64,
      uuid,
      icv,
      previousInvoiceHashBase64,
    }
  }

  // The registered name the device's certificate was issued for (stored since migration 147; for
  // older devices, the organization's own name).
  private async sellerName(row: ZatcaDeviceRow): Promise<string> {
    if (row.organization_name) return row.organization_name
    const organization = await this.database.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id = $1",
      [row.organization_id]
    )
    return organization.rows[0]?.name ?? row.common_name
  }

  // Step 3 -- a small built-in set of representative Simplified Tax Invoice scenarios (a plain
  // sale, one with a discount, and a credit note) submitted to Compliance Checks. This is a reasonable default,
  // not a guarantee of ZATCA's exact required test set -- ZATCA's own developer portal names the
  // specific mandatory cases per device/environment, which weren't available to confirm this
  // session; adjust this list against whatever Compliance Checks itself reports as missing.
  async runComplianceChecks(
    organizationId: string,
    deviceId: string
  ): Promise<ZatcaComplianceCheckView[]> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "compliance") throw ZATCA_DEVICE_ERRORS.wrongStatus("compliance", row.status)
    const key = this.encryptionKey()
    const credentials = {
      binarySecurityToken: decryptZatcaSecret(row.compliance_csid_encrypted ?? "", key),
      secret: decryptZatcaSecret(row.compliance_secret_encrypted ?? "", key),
    }

    // ZATCA's simulation and production refuse to issue the production certificate until a
    // simplified invoice, a credit note and a debit note have each passed.
    const scenarios: Array<{
      name: string
      subtotal: number
      discount: number
      adjustment?: ZatcaInvoiceAdjustment
    }> = [
      { name: "sale-no-discount", subtotal: 100, discount: 0 },
      { name: "sale-with-discount", subtotal: 100, discount: 10 },
      {
        name: "credit-note",
        subtotal: 100,
        discount: 0,
        adjustment: {
          type: "credit",
          originalInvoiceNumber: "COMPLIANCE-sale-no-discount",
          reason: "Goods returned",
        },
      },
      {
        name: "debit-note",
        subtotal: 20,
        discount: 0,
        adjustment: {
          type: "debit",
          originalInvoiceNumber: "COMPLIANCE-sale-no-discount",
          reason: "Price adjustment",
        },
      },
    ]

    const sellerName = await this.sellerName(row)
    const sellerAddress = await this.organizationAddress(organizationId)
    const environment = requireEnvironment(row)
    // Every sample is sent even when one is refused, so ZATCA's reasons for all of them show at once.
    const results: ZatcaComplianceCheckView[] = []
    for (const scenario of scenarios) {
      const taxAmount = Math.round((scenario.subtotal - scenario.discount) * 0.15 * 100) / 100
      const totalAmount = scenario.subtotal - scenario.discount + taxAmount
      const signed = await this.signInvoice(organizationId, deviceId, {
        invoiceNumber: `COMPLIANCE-${scenario.name}`,
        issuedAt: new Date(),
        sellerName,
        sellerVatNumber: sellerVatNumber(row),
        sellerAddress,
        customerName: null,
        customerVatNumber: null,
        subtotalAmount: scenario.subtotal,
        discountAmount: scenario.discount,
        taxAmount,
        totalAmount,
        taxRatePercent: 15,
        lines: [
          {
            id: "1",
            productName: "Compliance test item",
            quantity: 1,
            unitPrice: scenario.subtotal,
            netAmount: scenario.subtotal - scenario.discount,
            taxAmount,
            taxRatePercent: 15,
          },
        ],
        notes: null,
        adjustment: scenario.adjustment ?? null,
        advanceChain: false,
      })
      const submit = (language: "en" | "ar") =>
        submitZatcaComplianceCheck(
          environment,
          signed.invoiceHash.toString("base64"),
          signed.uuid,
          signed.signedXmlBase64,
          credentials,
          language
        )
      try {
        const checkResult = await submit("en")
        results.push({
          scenario: scenario.name,
          status: checkResult.status,
          reason: null,
          reasonAr: null,
        })
      } catch (error) {
        // ZATCA counts each document type once: a type that already passed (e.g. the second
        // simplified-invoice sample, or a re-run) answers 406 "Submitted before" -- passed.
        if (isSubmittedBefore(error)) {
          results.push({
            scenario: scenario.name,
            status: "PASSED_BEFORE",
            reason: null,
            reasonAr: null,
          })
          continue
        }
        if (!(error instanceof ZatcaApiError) || error.status !== 400) throw zatcaRejected(error)
        // Asked again in Arabic for ZATCA's Arabic wording of the same reason.
        const reasonAr = await submit("ar").then(
          () => null,
          (arabic: unknown) =>
            arabic instanceof ZatcaApiError ? zatcaErrorMessage(arabic.body, "ar") : null
        )
        results.push({
          scenario: scenario.name,
          status: "NOT_REPORTED",
          reason: zatcaErrorMessage(error.body) ?? `ZATCA refused it (${error.status}).`,
          reasonAr,
        })
      }
    }
    return results
  }

  // The organization's national address (Settings -> الإعدادات العامة), for the compliance samples
  // -- ZATCA checks the seller address on every invoice. Null when none of it is filled in.
  private async organizationAddress(organizationId: string): Promise<ZatcaUblAddress | null> {
    const result = await this.database.query<{ settings: Record<string, unknown> | null }>(
      "SELECT settings FROM organizations WHERE id = $1",
      [organizationId]
    )
    const settings = result.rows[0]?.settings ?? {}
    const field = (key: string) =>
      typeof settings[key] === "string" && (settings[key] as string).trim()
        ? (settings[key] as string).trim()
        : null
    const address: ZatcaUblAddress = {
      streetName: field("street"),
      buildingNumber: field("buildingNumber"),
      plotIdentification: field("secondaryNumber"),
      citySubdivisionName: field("district"),
      cityName: field("city"),
      postalZone: field("postalCode"),
    }
    return Object.values(address).some(Boolean) ? address : null
  }

  // Step 4 -- exchange compliance credentials for real production ones.
  async exchangeProduction(organizationId: string, deviceId: string): Promise<ZatcaDeviceView> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "compliance") throw ZATCA_DEVICE_ERRORS.wrongStatus("compliance", row.status)
    const key = this.encryptionKey()
    const credentials = {
      binarySecurityToken: decryptZatcaSecret(row.compliance_csid_encrypted ?? "", key),
      secret: decryptZatcaSecret(row.compliance_secret_encrypted ?? "", key),
    }
    const result = await exchangeZatcaProductionCsid(
      requireEnvironment(row),
      row.compliance_request_id ?? "",
      credentials
    ).catch(zatcaRejected)
    await this.database.query(
      `UPDATE zatca_devices
          SET status = 'production', production_csid_encrypted = $2,
              production_secret_encrypted = $3, updated_at = now()
        WHERE id = $1`,
      [
        deviceId,
        encryptZatcaSecret(result.binarySecurityToken, key),
        encryptZatcaSecret(result.secret, key),
      ]
    )
    return mapDevice(await this.getRow(organizationId, deviceId))
  }

  // The one production device this organization should sign real sales with, if any -- used by
  // PosInvoicesService.create(). Deliberately picks the most recently onboarded one when more
  // than one exists rather than erroring; multi-device routing (e.g. one per branch) is out of
  // scope for this first increment.
  async findProductionDevice(
    organizationId: string,
    workspaceId: string | null
  ): Promise<ZatcaDeviceView | null> {
    const result = await this.database.query<ZatcaDeviceRow>(
      `${DEVICE_SELECT} WHERE organization_id = $1 AND status = 'production'
         AND deactivated_at IS NULL
         AND (workspace_id IS NULL OR workspace_id = $2)
        ORDER BY workspace_id NULLS LAST, created_at DESC
        LIMIT 1`,
      [organizationId, workspaceId]
    )
    const row = result.rows[0]
    return row ? mapDevice(row) : null
  }

  // Production credentials for the Reporting API -- decrypted only at the point of use.
  async getProductionCredentials(
    organizationId: string,
    deviceId: string
  ): Promise<{
    binarySecurityToken: string
    secret: string
    environment: ZatcaCsrEnvironment
  }> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "production") throw ZATCA_DEVICE_ERRORS.wrongStatus("production", row.status)
    const key = this.encryptionKey()
    return {
      environment: requireEnvironment(row),
      binarySecurityToken: decryptZatcaSecret(row.production_csid_encrypted ?? "", key),
      secret: decryptZatcaSecret(row.production_secret_encrypted ?? "", key),
    }
  }
}
