import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Same pattern as pos/invoices-service.ts's pos_invoice_number_counters: a per-tenant counter row,
// incremented via a row-locking UPSERT INSIDE the caller's own transaction, so a rolled-back
// create() reverts the counter along with everything else and never burns/gaps a number -- unlike
// a bare Postgres SEQUENCE (see migration 067_pos_invoice_zatca.sql for why that was replaced).
// Must be called from inside a PostgresDatabase.withTransaction(...) callback.
export type ProcurementCodeType =
  | "supplier"
  | "purchase"
  | "return"
  | "voucher_receipt"
  | "voucher_payment"

export async function nextProcurementCode(
  database: PostgresDatabase,
  organizationId: string,
  codeType: ProcurementCodeType,
  prefix: string,
  pad: number
): Promise<string> {
  const result = await database.query<{ next_number: string }>(
    `INSERT INTO procurement_code_counters (organization_id, code_type, next_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (organization_id, code_type)
     DO UPDATE SET next_number = procurement_code_counters.next_number + 1
     RETURNING next_number`,
    [organizationId, codeType]
  )
  return `${prefix}-${String(result.rows[0].next_number).padStart(pad, "0")}`
}
