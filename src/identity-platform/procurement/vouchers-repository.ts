import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { nextProcurementCode } from "./code-counter"
import type { CreateSupplierVoucherInput, SupplierVoucherDto } from "./types"

function mapVoucher(row: Record<string, unknown>): SupplierVoucherDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    reference: String(row.reference),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    supplierImageUrl: (row.supplier_image_url as string | null) ?? null,
    purchaseId: (row.purchase_id as string | null) ?? null,
    purchaseCode: (row.purchase_code as string | null) ?? null,
    type: row.type as SupplierVoucherDto["type"],
    amount: Number(row.amount),
    taxInclusive: Boolean(row.tax_inclusive),
    taxAmount: Number(row.tax_amount),
    paymentMethod: row.payment_method as SupplierVoucherDto["paymentMethod"],
    notes: (row.notes as string | null) ?? "",
    transactionDate: new Date(row.transaction_date as string).toISOString().slice(0, 10),
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export class VouchersRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<SupplierVoucherDto[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT v.*, s.name AS supplier_name, s.image_url AS supplier_image_url, p.code AS purchase_code
       FROM supplier_vouchers v
       JOIN suppliers s ON s.id = v.supplier_id
       LEFT JOIN purchases p ON p.id = v.purchase_id
       WHERE v.organization_id = $1 AND v.deleted_at IS NULL
       ORDER BY v.created_at DESC`,
      [organizationId]
    )
    return result.rows.map(mapVoucher)
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    input: CreateSupplierVoucherInput
  ): Promise<SupplierVoucherDto> {
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      const supplierResult = await this.db.query<{ id: string }>(
        `SELECT id FROM suppliers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [input.supplierId, organizationId]
      )
      if (supplierResult.rows.length === 0) throw ERRORS.notFound("Supplier")

      if (input.purchaseId) {
        const purchaseResult = await this.db.query<{ id: string }>(
          `SELECT id FROM purchases WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [input.purchaseId, organizationId]
        )
        if (purchaseResult.rows.length === 0) throw ERRORS.notFound("Purchase")
      }

      const codeType = input.type === "receipt" ? "voucher_receipt" : "voucher_payment"
      const prefix = input.type === "receipt" ? "RV" : "PV"
      const reference = await nextProcurementCode(this.db, organizationId, codeType, prefix, 4)

      await this.db.query(
        `INSERT INTO supplier_vouchers (
           id, organization_id, workspace_id, reference, supplier_id, purchase_id, type, amount,
           tax_inclusive, tax_amount, payment_method, notes, transaction_date, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())`,
        [
          id,
          organizationId,
          workspaceId,
          reference,
          input.supplierId,
          input.purchaseId,
          input.type,
          input.amount,
          input.taxInclusive,
          input.taxAmount,
          input.paymentMethod,
          input.notes,
          input.transactionDate,
        ]
      )
    })

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT v.*, s.name AS supplier_name, s.image_url AS supplier_image_url, p.code AS purchase_code
       FROM supplier_vouchers v
       JOIN suppliers s ON s.id = v.supplier_id
       LEFT JOIN purchases p ON p.id = v.purchase_id
       WHERE v.id = $1`,
      [id]
    )
    return mapVoucher(result.rows[0])
  }
}
