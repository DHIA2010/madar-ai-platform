import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"

import type {
  MoyasarApplication,
  MoyasarPaymentRecord,
  MoyasarPaymentStatus,
  MoyasarSelfServePlanTier,
} from "./types"

function mapPayment(row: Record<string, unknown>): MoyasarPaymentRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    requestedByUserId: String(row.requested_by_user_id),
    application: row.application as MoyasarApplication,
    planTier: row.plan_tier as MoyasarSelfServePlanTier,
    amount: Number(row.amount),
    currency: String(row.currency),
    moyasarPaymentId: (row.moyasar_payment_id as string | null) ?? null,
    status: row.status as MoyasarPaymentStatus,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

export class MoyasarBillingRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async createCheckout(input: {
    organizationId: string
    requestedByUserId: string
    application: MoyasarApplication
    planTier: MoyasarSelfServePlanTier
    amount: number
    currency: string
  }): Promise<MoyasarPaymentRecord> {
    const id = randomUUID()
    const result = await this.db.query(
      `INSERT INTO billing_moyasar_payments (
         id, organization_id, requested_by_user_id, application, plan_tier, amount, currency
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        input.organizationId,
        input.requestedByUserId,
        input.application,
        input.planTier,
        input.amount,
        input.currency,
      ]
    )
    return mapPayment(result.rows[0])
  }

  async findById(id: string): Promise<MoyasarPaymentRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM billing_moyasar_payments WHERE id = $1 LIMIT 1",
      [id]
    )
    return result.rows[0] ? mapPayment(result.rows[0]) : null
  }

  async findByMoyasarPaymentId(moyasarPaymentId: string): Promise<MoyasarPaymentRecord | null> {
    const result = await this.db.query(
      "SELECT * FROM billing_moyasar_payments WHERE moyasar_payment_id = $1 LIMIT 1",
      [moyasarPaymentId]
    )
    return result.rows[0] ? mapPayment(result.rows[0]) : null
  }

  async markResolved(input: {
    id: string
    moyasarPaymentId: string
    status: "paid" | "failed"
    rawPayload: unknown
  }): Promise<MoyasarPaymentRecord> {
    const result = await this.db.query(
      `UPDATE billing_moyasar_payments
       SET moyasar_payment_id = $2, status = $3, raw_payload = $4, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.id, input.moyasarPaymentId, input.status, JSON.stringify(input.rawPayload)]
    )
    return mapPayment(result.rows[0])
  }

  // Read-then-write top-level merge -- the SQL equivalent of OrganizationEntity.update's
  // `{ ...this.state.settings, ...payload.settings }` (see domain/entities/index.ts), done in JS
  // rather than via jsonb's `||` operator since that path isn't reliably supported by pg-mem (this
  // module's test harness -- see tests/billing-moyasar.test.ts) even though it's valid real
  // Postgres. Used instead of going through IdentityCommandHandlers because that handler requires
  // an interactive actor issuing a command, and a Moyasar webhook has none (see
  // zid-oauth/auto-provision-service.ts for the established precedent of a standalone module
  // writing organizations.settings directly).
  async applySettingsPatch(organizationId: string, patch: Record<string, unknown>): Promise<void> {
    // FOR UPDATE: this always runs inside resolvePayment's withTransaction -- locks the row so a
    // webhook and a concurrent synchronous confirm racing on the same organization can't
    // interleave their read-merge-write and silently drop one side's patch.
    const existing = await this.db.query<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM organizations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [organizationId]
    )
    const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
    await this.db.query(
      "UPDATE organizations SET settings = $2::jsonb, updated_at = now() WHERE id = $1",
      [organizationId, JSON.stringify(merged)]
    )
  }
}
