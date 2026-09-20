import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  compressEcPublicKey,
  decryptZatcaSecret,
  encryptZatcaSecret,
  generateZatcaCsr,
  resolveZatcaEncryptionKey,
  type ZatcaCsrEnvironment,
} from "./zatca-crypto"
import {
  exchangeZatcaProductionCsid,
  submitZatcaComplianceCheck,
  submitZatcaComplianceCsid,
} from "./zatca-api-client"
import {
  buildZatcaUblInvoiceXml,
  embedZatcaQrCode,
  ZATCA_GENESIS_PIH_BASE64,
  type ZatcaUblAddress,
} from "./zatca-ubl-invoice"
import { signZatcaInvoice } from "./zatca-signing"
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
  lastIcv: number
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
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapDevice(row: ZatcaDeviceRow): ZatcaDeviceView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    commonName: row.common_name,
    csr: row.csr,
    status: row.status as ZatcaDeviceStatus,
    lastIcv: Number(row.last_icv) || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const DEVICE_SELECT = `
  SELECT id, organization_id, workspace_id, common_name, csr, private_key_encrypted,
         public_key_pem, status, compliance_request_id, compliance_csid_encrypted,
         compliance_secret_encrypted, production_csid_encrypted, production_secret_encrypted,
         last_icv, last_invoice_hash, created_at, updated_at
    FROM zatca_devices
`

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
    return result.rows.map(mapDevice)
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
          public_key_pem, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
      [
        id,
        organizationId,
        input.workspaceId,
        input.commonName,
        csrPem,
        encryptZatcaSecret(keyPair.privateKeyPem, key),
        keyPair.publicKeyPem,
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

    const result = await submitZatcaComplianceCsid(row.csr, otp)
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
      // When true (compliance-check sampling), the device's own persisted ICV/PIH chain is left
      // untouched -- a compliance test invoice never really happened, so it must never occupy a
      // real chain position.
      advanceChain: boolean
    }
  ): Promise<ZatcaSignedInvoicePackage> {
    const row = await this.getRow(organizationId, deviceId)
    const key = this.encryptionKey()
    const privateKeyPem = decryptZatcaSecret(row.private_key_encrypted, key)

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
      sellerName: input.sellerName,
      sellerVatNumber: input.sellerVatNumber,
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
    })

    // The device's own certificate -- ZATCA returns it as the binarySecurityToken from the
    // Compliance/Production CSID exchange. Prefers production once available.
    const certificateSource = row.production_csid_encrypted ?? row.compliance_csid_encrypted
    if (!certificateSource)
      throw ZATCA_DEVICE_ERRORS.wrongStatus("compliance or production", row.status)
    const certificatePem = decryptZatcaSecret(certificateSource, key)
    const certificateDer = Buffer.from(
      certificatePem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
      "base64"
    )

    const signResult = signZatcaInvoice({
      unsignedXml,
      privateKeyPem,
      certificateDer,
      signingTime: input.issuedAt,
    })

    const qrCodeBase64 = generateZatcaPhase2QrCode(
      {
        sellerName: input.sellerName,
        vatRegistrationNumber: input.sellerVatNumber,
        timestamp: input.issuedAt.toISOString(),
        invoiceTotal: input.totalAmount,
        vatTotal: input.taxAmount,
      },
      {
        invoiceHash: signResult.invoiceHash,
        digitalSignature: signResult.digitalSignature,
        publicKey: compressEcPublicKey(row.public_key_pem),
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

  // Step 3 -- a small built-in set of representative Simplified Tax Invoice scenarios (a plain
  // sale, and one with a discount) submitted to Compliance Checks. This is a reasonable default,
  // not a guarantee of ZATCA's exact required test set -- ZATCA's own developer portal names the
  // specific mandatory cases per device/environment, which weren't available to confirm this
  // session; adjust this list against whatever Compliance Checks itself reports as missing.
  async runComplianceChecks(
    organizationId: string,
    deviceId: string
  ): Promise<Array<{ scenario: string; status: string }>> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "compliance") throw ZATCA_DEVICE_ERRORS.wrongStatus("compliance", row.status)
    const key = this.encryptionKey()
    const credentials = {
      binarySecurityToken: decryptZatcaSecret(row.compliance_csid_encrypted ?? "", key),
      secret: decryptZatcaSecret(row.compliance_secret_encrypted ?? "", key),
    }

    const scenarios: Array<{
      name: string
      subtotal: number
      discount: number
    }> = [
      { name: "sale-no-discount", subtotal: 100, discount: 0 },
      { name: "sale-with-discount", subtotal: 100, discount: 10 },
    ]

    const results: Array<{ scenario: string; status: string }> = []
    for (const scenario of scenarios) {
      const taxAmount = Math.round((scenario.subtotal - scenario.discount) * 0.15 * 100) / 100
      const totalAmount = scenario.subtotal - scenario.discount + taxAmount
      const signed = await this.signInvoice(organizationId, deviceId, {
        invoiceNumber: `COMPLIANCE-${scenario.name}`,
        issuedAt: new Date(),
        sellerName: row.common_name,
        sellerVatNumber: "",
        sellerAddress: null,
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
        advanceChain: false,
      })
      const checkResult = await submitZatcaComplianceCheck(
        signed.invoiceHash.toString("base64"),
        signed.uuid,
        signed.signedXmlBase64,
        credentials
      )
      results.push({ scenario: scenario.name, status: checkResult.status })
    }
    return results
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
    const result = await exchangeZatcaProductionCsid(row.compliance_request_id ?? "", credentials)
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
  ): Promise<{ binarySecurityToken: string; secret: string }> {
    const row = await this.getRow(organizationId, deviceId)
    if (row.status !== "production") throw ZATCA_DEVICE_ERRORS.wrongStatus("production", row.status)
    const key = this.encryptionKey()
    return {
      binarySecurityToken: decryptZatcaSecret(row.production_csid_encrypted ?? "", key),
      secret: decryptZatcaSecret(row.production_secret_encrypted ?? "", key),
    }
  }
}
