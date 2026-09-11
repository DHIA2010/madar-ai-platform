import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SHIFT_ERRORS = {
  notFound: () => new IdentityError("POS_SHIFT_NOT_FOUND", 404, "business", "Shift not found."),
  alreadyOpen: () =>
    new IdentityError(
      "POS_SHIFT_ALREADY_OPEN",
      409,
      "business",
      "This cashier already has an open shift."
    ),
  alreadyClosed: () =>
    new IdentityError("POS_SHIFT_ALREADY_CLOSED", 409, "business", "This shift is already closed."),
}

export type ShiftStatus = "open" | "closed"

export interface OpenShiftInput {
  organizationId: string
  workspaceId: string
  cashierUserId: string
  openedBy: string | null
  openingCashAmount: number
  openingNotes: string | null
}

export interface CloseShiftInput {
  organizationId: string
  id: string
  closedBy: string | null
  closingCashAmount: number
  closingNotes: string | null
}

export interface ShiftView {
  id: string
  workspaceId: string
  cashierUserId: string
  status: ShiftStatus
  openingCashAmount: number
  openingNotes: string | null
  openedAt: string
  openedBy: string | null
  closingCashAmount: number | null
  closingNotes: string | null
  closedAt: string | null
  closedBy: string | null
}

interface ShiftRow {
  id: string
  workspace_id: string
  cashier_user_id: string
  status: string
  opening_cash_amount: string | number
  opening_notes: string | null
  opened_at: Date | string
  opened_by: string | null
  closing_cash_amount: string | number | null
  closing_notes: string | null
  closed_at: Date | string | null
  closed_by: string | null
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapShift(row: ShiftRow): ShiftView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    cashierUserId: row.cashier_user_id,
    status: row.status as ShiftStatus,
    openingCashAmount: Number(row.opening_cash_amount),
    openingNotes: row.opening_notes,
    openedAt: toIso(row.opened_at),
    openedBy: row.opened_by,
    closingCashAmount: row.closing_cash_amount === null ? null : Number(row.closing_cash_amount),
    closingNotes: row.closing_notes,
    closedAt: row.closed_at === null ? null : toIso(row.closed_at),
    closedBy: row.closed_by,
  }
}

const SHIFT_SELECT = `
  SELECT id, workspace_id, cashier_user_id, status, opening_cash_amount, opening_notes,
         opened_at, opened_by, closing_cash_amount, closing_notes, closed_at, closed_by
    FROM pos_shifts
`

export class PosShiftsService {
  constructor(private readonly database: PostgresDatabase) {}

  // Every shift in the organization, most recent first -- a manager reviewing history needs every
  // branch, not only the workspace they happen to be signed into right now.
  async list(organizationId: string, workspaceId: string | null): Promise<ShiftView[]> {
    const result = await this.database.query<ShiftRow>(
      `${SHIFT_SELECT}
        WHERE organization_id = $1 AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
        ORDER BY opened_at DESC`,
      [organizationId, workspaceId]
    )
    return result.rows.map(mapShift)
  }

  async open(input: OpenShiftInput): Promise<ShiftView> {
    const existing = await this.database.query(
      `SELECT id FROM pos_shifts WHERE cashier_user_id = $1 AND status = 'open'`,
      [input.cashierUserId]
    )
    if (existing.rows[0]) throw SHIFT_ERRORS.alreadyOpen()

    const id = randomUUID()
    await this.database.query(
      `INSERT INTO pos_shifts
         (id, organization_id, workspace_id, cashier_user_id, status, opening_cash_amount,
          opening_notes, opened_by)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, $7)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.cashierUserId,
        input.openingCashAmount,
        input.openingNotes,
        input.openedBy,
      ]
    )

    const created = await this.findById(input.organizationId, id)
    if (!created) throw SHIFT_ERRORS.notFound()
    return created
  }

  async close(input: CloseShiftInput): Promise<ShiftView> {
    if (!UUID_PATTERN.test(input.id)) throw SHIFT_ERRORS.notFound()

    const current = await this.findById(input.organizationId, input.id)
    if (!current) throw SHIFT_ERRORS.notFound()
    if (current.status === "closed") throw SHIFT_ERRORS.alreadyClosed()

    await this.database.query(
      `UPDATE pos_shifts
          SET status = 'closed', closing_cash_amount = $3, closing_notes = $4,
              closed_at = now(), closed_by = $5, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [input.organizationId, input.id, input.closingCashAmount, input.closingNotes, input.closedBy]
    )

    const closed = await this.findById(input.organizationId, input.id)
    if (!closed) throw SHIFT_ERRORS.notFound()
    return closed
  }

  private async findById(organizationId: string, id: string): Promise<ShiftView | null> {
    const result = await this.database.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    return result.rows[0] ? mapShift(result.rows[0]) : null
  }
}
