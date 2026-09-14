import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosInvoicesService } from "./invoices-service"
import type { PaymentKind, PosPaymentMethodsService } from "./payment-methods-service"

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
  notOpen: () =>
    new IdentityError(
      "POS_SHIFT_NOT_OPEN",
      409,
      "business",
      "Cash can only be moved on an open shift."
    ),
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

export type CashMovementType = "withdrawal" | "deposit"

export interface RecordCashMovementInput {
  organizationId: string
  shiftId: string
  type: CashMovementType
  amount: number
  note: string | null
  createdBy: string | null
}

export interface CashMovementView {
  id: string
  shiftId: string
  type: CashMovementType
  amount: number
  note: string | null
  createdBy: string | null
  createdAt: string
}

export interface ShiftView {
  id: string
  shiftNumber: number | null
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

export interface PaymentBreakdownEntry {
  code: string
  name: string
  kind: PaymentKind | null
  amount: number
  percentage: number
}

export interface ShiftCashSummary {
  openingCashAmount: number
  cashSales: number
  otherSales: number
  cashReturns: number
  withdrawals: number
  deposits: number
  expectedCashAmount: number
}

export type ShiftActivityType = "open" | "close" | "withdrawal" | "deposit" | "sale" | "return"

export interface ShiftActivityEntry {
  type: ShiftActivityType
  amount: number
  note: string | null
  occurredAt: string
  // A real, checkable identifier for the row -- the invoice number for a sale/return, or a fixed
  // word for the shift-level events that have no invoice of their own.
  reference: string
}

export interface ShiftDetailView {
  shift: ShiftView
  totalSales: number
  invoiceCount: number
  paymentBreakdown: PaymentBreakdownEntry[]
  cashSummary: ShiftCashSummary
  activity: ShiftActivityEntry[]
}

interface ShiftRow {
  id: string
  shift_number: string | number | null
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

interface CashMovementRow {
  id: string
  shift_id: string
  type: string
  amount: string | number
  note: string | null
  created_by: string | null
  created_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapCashMovement(row: CashMovementRow): CashMovementView {
  return {
    id: row.id,
    shiftId: row.shift_id,
    type: row.type as CashMovementType,
    amount: Number(row.amount),
    note: row.note,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  }
}

function mapShift(row: ShiftRow): ShiftView {
  return {
    id: row.id,
    shiftNumber: row.shift_number === null ? null : Number(row.shift_number),
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
  SELECT id, shift_number, workspace_id, cashier_user_id, status, opening_cash_amount,
         opening_notes, opened_at, opened_by, closing_cash_amount, closing_notes, closed_at,
         closed_by
    FROM pos_shifts
`

export class PosShiftsService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly invoicesService: PosInvoicesService,
    private readonly paymentMethodsService: PosPaymentMethodsService
  ) {}

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
    const numberResult = await this.database.query<{ nextval: string }>(
      `SELECT nextval('pos_shift_number_seq')`
    )
    const shiftNumber = Number(numberResult.rows[0].nextval)

    await this.database.query(
      `INSERT INTO pos_shifts
         (id, shift_number, organization_id, workspace_id, cashier_user_id, status,
          opening_cash_amount, opening_notes, opened_by)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)`,
      [
        id,
        shiftNumber,
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

  // A manual cash-drawer adjustment mid-shift -- a manager pulling change out or topping the
  // float up -- distinct from a sale or a return (pos_invoices already covers those). Only
  // allowed on an open shift: once closed, the drawer it refers to is no longer this shift's.
  async recordCashMovement(input: RecordCashMovementInput): Promise<CashMovementView> {
    const shift = await this.findById(input.organizationId, input.shiftId)
    if (!shift) throw SHIFT_ERRORS.notFound()
    if (shift.status !== "open") throw SHIFT_ERRORS.notOpen()

    const id = randomUUID()
    await this.database.query(
      `INSERT INTO pos_cash_movements (id, shift_id, type, amount, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.shiftId, input.type, input.amount, input.note, input.createdBy]
    )

    const result = await this.database.query<CashMovementRow>(
      `SELECT id, shift_id, type, amount, note, created_by, created_at
         FROM pos_cash_movements WHERE id = $1`,
      [id]
    )
    return mapCashMovement(result.rows[0])
  }

  async listCashMovements(organizationId: string, shiftId: string): Promise<CashMovementView[]> {
    const shift = await this.findById(organizationId, shiftId)
    if (!shift) throw SHIFT_ERRORS.notFound()

    const result = await this.database.query<CashMovementRow>(
      `SELECT id, shift_id, type, amount, note, created_by, created_at
         FROM pos_cash_movements
        WHERE shift_id = $1
        ORDER BY created_at`,
      [shiftId]
    )
    return result.rows.map(mapCashMovement)
  }

  async getById(organizationId: string, id: string): Promise<ShiftView> {
    const shift = await this.findById(organizationId, id)
    if (!shift) throw SHIFT_ERRORS.notFound()
    return shift
  }

  // Everything the shift detail page shows in one call: real sales for this cashier in this
  // branch during the shift's own window (open to close, or open to now if still open), broken
  // down by the real payment method used, plus the same cash-drawer summary the close dialog
  // computes, plus a chronological log of open/close/withdrawal/deposit -- the only real
  // cash-affecting events, not a full sales ledger (that already exists on الفواتير).
  async getDetail(organizationId: string, id: string): Promise<ShiftDetailView> {
    const shift = await this.getById(organizationId, id)

    const [invoices, methods, movements] = await Promise.all([
      this.invoicesService.list(organizationId, {
        workspaceId: shift.workspaceId,
        status: null,
        paymentMethodCode: null,
        from: shift.openedAt,
        to: shift.closedAt,
        search: null,
      }),
      this.paymentMethodsService.list(organizationId, shift.workspaceId),
      this.listCashMovements(organizationId, id),
    ])

    const mine = invoices.filter((invoice) => invoice.cashierUserId === shift.cashierUserId)
    const completed = mine.filter((invoice) => invoice.status === "completed")
    const totalSales = completed.reduce((total, invoice) => total + invoice.totalAmount, 0)

    const methodByCode = new Map(methods.map((method) => [method.code, method]))
    const cashCodes = new Set(
      methods.filter((method) => method.kind === "cash").map((method) => method.code)
    )

    // Grouped by the real per-method payment lines, not the invoice's own single
    // payment_method_code column (which reads "split" for a multi-method sale) -- this is what
    // keeps a half-cash/half-card sale correctly split between both methods here, instead of
    // landing entirely under one bucket or being invisible to the cash-drawer reconciliation.
    const amountByCode = new Map<string, number>()
    for (const invoice of completed) {
      for (const payment of invoice.payments) {
        amountByCode.set(
          payment.paymentMethodCode,
          (amountByCode.get(payment.paymentMethodCode) ?? 0) + payment.amount
        )
      }
    }
    const paymentBreakdown: PaymentBreakdownEntry[] = Array.from(amountByCode.entries())
      .map(([code, amount]) => ({
        code,
        name: methodByCode.get(code)?.name ?? code,
        kind: methodByCode.get(code)?.kind ?? null,
        amount,
        percentage: totalSales > 0 ? Math.round((amount / totalSales) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    const cashSales = completed.reduce(
      (total, invoice) =>
        total +
        invoice.payments
          .filter((payment) => cashCodes.has(payment.paymentMethodCode))
          .reduce((sum, payment) => sum + payment.amount, 0),
      0
    )
    const otherSales = totalSales - cashSales
    const cashReturns = mine
      .filter((invoice) => invoice.status === "returned")
      .reduce(
        (total, invoice) =>
          total +
          invoice.payments
            .filter((payment) => cashCodes.has(payment.paymentMethodCode))
            .reduce((sum, payment) => sum + payment.amount, 0),
        0
      )
    const withdrawals = movements
      .filter((movement) => movement.type === "withdrawal")
      .reduce((total, movement) => total + movement.amount, 0)
    const deposits = movements
      .filter((movement) => movement.type === "deposit")
      .reduce((total, movement) => total + movement.amount, 0)

    const returned = mine.filter((invoice) => invoice.status === "returned")

    const activity: ShiftActivityEntry[] = [
      {
        type: "open" as const,
        amount: shift.openingCashAmount,
        note: shift.openingNotes,
        occurredAt: shift.openedAt,
        reference: "OPEN",
      },
      ...movements.map((movement) => ({
        type: movement.type as ShiftActivityType,
        amount: movement.amount,
        note: movement.note,
        occurredAt: movement.createdAt,
        reference: movement.type.toUpperCase(),
      })),
      ...completed.map((invoice) => ({
        type: "sale" as const,
        amount: invoice.totalAmount,
        note: null,
        occurredAt: invoice.createdAt,
        reference: invoice.invoiceNumber,
      })),
      ...returned.map((invoice) => ({
        type: "return" as const,
        amount: invoice.totalAmount,
        note: null,
        occurredAt: invoice.createdAt,
        reference: invoice.invoiceNumber,
      })),
      ...(shift.closedAt
        ? [
            {
              type: "close" as const,
              amount: shift.closingCashAmount ?? 0,
              note: shift.closingNotes,
              occurredAt: shift.closedAt,
              reference: "CLOSE",
            },
          ]
        : []),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

    return {
      shift,
      totalSales,
      invoiceCount: mine.length,
      paymentBreakdown,
      cashSummary: {
        openingCashAmount: shift.openingCashAmount,
        cashSales,
        otherSales,
        cashReturns,
        withdrawals,
        deposits,
        expectedCashAmount:
          shift.openingCashAmount + cashSales - cashReturns - withdrawals + deposits,
      },
      activity,
    }
  }

  private async findById(organizationId: string, id: string): Promise<ShiftView | null> {
    const result = await this.database.query<ShiftRow>(
      `${SHIFT_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    return result.rows[0] ? mapShift(result.rows[0]) : null
  }
}
