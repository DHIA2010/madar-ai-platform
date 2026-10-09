import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { nextProcurementCode } from "./code-counter"
import type { SaveSupplierInput, SupplierDto, SupplierStatus } from "./types"

function mapSupplier(row: Record<string, unknown>): SupplierDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    imageUrl: (row.image_url as string | null) ?? null,
    name: String(row.name),
    email: (row.email as string | null) ?? "",
    phone: (row.phone as string | null) ?? "",
    kind: row.kind as SupplierDto["kind"],
    country: (row.country as string | null) ?? "",
    city: (row.city as string | null) ?? "",
    paymentTerms: (row.payment_terms as SupplierDto["paymentTerms"]) ?? null,
    address: (row.address as string | null) ?? "",
    status: row.status as SupplierStatus,
    bankDetails: row.bank_details as SupplierDto["bankDetails"],
    companyDetails: row.company_details as SupplierDto["companyDetails"],
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export class SuppliersRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<SupplierDto[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM suppliers WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [organizationId]
    )
    return result.rows.map(mapSupplier)
  }

  async findById(organizationId: string, id: string): Promise<SupplierDto | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM suppliers WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    const row = result.rows[0]
    return row ? mapSupplier(row) : null
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    input: SaveSupplierInput
  ): Promise<SupplierDto> {
    const id = randomUUID()
    return this.db.withTransaction(async () => {
      const code = await nextProcurementCode(this.db, organizationId, "supplier", "#SUP", 4)
      const result = await this.db.query<Record<string, unknown>>(
        `INSERT INTO suppliers (
           id, organization_id, workspace_id, code, name, email, phone, kind, country, city,
           payment_terms, address, status, image_url, bank_details, company_details,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13, $14::jsonb, $15::jsonb,
           now(), now()
         ) RETURNING *`,
        [
          id,
          organizationId,
          workspaceId,
          code,
          input.name,
          input.email,
          input.phone,
          input.kind,
          input.country,
          input.city,
          input.paymentTerms,
          input.address,
          input.imageUrl,
          JSON.stringify(input.bankDetails),
          JSON.stringify(input.companyDetails),
        ]
      )
      return mapSupplier(result.rows[0])
    })
  }

  // Full replace, same convention as products' own update(): the edit form always submits the
  // whole SupplierFormValues shape, so there is nothing to diff against.
  async update(
    organizationId: string,
    id: string,
    input: SaveSupplierInput
  ): Promise<SupplierDto | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `UPDATE suppliers SET
         name = $3, email = $4, phone = $5, kind = $6, country = $7, city = $8,
         payment_terms = $9, address = $10, image_url = $11, bank_details = $12::jsonb,
         company_details = $13::jsonb, updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [
        organizationId,
        id,
        input.name,
        input.email,
        input.phone,
        input.kind,
        input.country,
        input.city,
        input.paymentTerms,
        input.address,
        input.imageUrl,
        JSON.stringify(input.bankDetails),
        JSON.stringify(input.companyDetails),
      ]
    )
    const row = result.rows[0]
    return row ? mapSupplier(row) : null
  }

  async setStatus(organizationId: string, ids: string[], status: SupplierStatus): Promise<number> {
    // An explicit IN list rather than "= ANY($2::uuid[])" -- see purchases-repository.ts's
    // identical comment for why (silently unsupported under pg-mem, this codebase's test harness).
    const placeholders = ids.map((_, index) => `$${index + 3}`).join(", ")
    const result = await this.db.query(
      `UPDATE suppliers SET status = $2, updated_at = now()
       WHERE organization_id = $1 AND deleted_at IS NULL AND id IN (${placeholders})`,
      [organizationId, status, ...ids]
    )
    return result.rowCount
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    await this.db.query(
      `UPDATE suppliers SET deleted_at = now() WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
  }
}
