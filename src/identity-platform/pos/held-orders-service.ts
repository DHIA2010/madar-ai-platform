import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { parseNoteLines, type NoteLine } from "./saved-notes-service"

const HELD_ORDER_ERRORS = {
  notFound: () =>
    new IdentityError("POS_HELD_ORDER_NOT_FOUND", 404, "business", "Held order not found."),
}

export interface HeldOrderItem {
  productId: string | null
  // Which specific combination of a "variable" product (size/color etc.) this line is -- see
  // PosInvoicesService.computeStockConsumption. Round-trips through the items jsonb blob as-is,
  // same as every other item field here.
  variantId?: string | null
  variantLabel?: string | null
  productName: string
  unitPrice: number
  quantity: number
  // Round-trips a line's own discount through a hold/resume cycle -- see
  // migration 071_pos_invoice_item_discount.sql. Stored as-is inside the items jsonb blob, same
  // as every other item field here.
  discountAmount?: number
}

export interface HoldOrderInput {
  organizationId: string
  workspaceId: string
  cashierUserId: string | null
  customerName: string | null
  customerPhone: string | null
  discountAmount: number
  notes: string | null
  // Same snapshot shape as CreateInvoiceInput.notesLines -- resuming a held order restores the
  // formatted note, not just its flattened plain-text mirror.
  notesLines: NoteLine[] | null
  items: HeldOrderItem[]
}

export interface HeldOrderView {
  id: string
  workspaceId: string
  cashierUserId: string | null
  customerName: string | null
  customerPhone: string | null
  discountAmount: number
  notes: string | null
  notesLines: NoteLine[] | null
  items: HeldOrderItem[]
  createdAt: string
}

interface HeldOrderRow {
  id: string
  workspace_id: string
  cashier_user_id: string | null
  customer_name: string | null
  customer_phone: string | null
  discount_amount: string | number
  notes: string | null
  notes_lines: unknown
  items: unknown
  created_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// null column (no note at all) stays null; a real value is parsed and defaulted by
// saved-notes-service.ts's shared parseNoteLines() -- same reader every notes_lines column uses.
function toNotesLines(value: unknown): NoteLine[] | null {
  if (value === null || value === undefined) return null
  return parseNoteLines(value)
}

function mapRow(row: HeldOrderRow): HeldOrderView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    cashierUserId: row.cashier_user_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    discountAmount: Number(row.discount_amount),
    notes: row.notes,
    notesLines: toNotesLines(row.notes_lines),
    items: row.items as HeldOrderItem[],
    createdAt: toIso(row.created_at),
  }
}

const HELD_ORDER_SELECT = `
  SELECT id, workspace_id, cashier_user_id, customer_name, customer_phone, discount_amount,
         notes, notes_lines, items, created_at
    FROM pos_held_orders
`

// Parked carts a cashier isn't ready to check out yet -- kept as a real row (not just in the
// browser tab) so a crash or refresh never silently loses a customer's in-progress order. Scoped
// to the cashier who parked it: a held cart is that cashier's own work in progress, the same way
// an open shift belongs to one cashier rather than the whole branch.
export class PosHeldOrdersService {
  constructor(private readonly database: PostgresDatabase) {}

  async list(
    organizationId: string,
    workspaceId: string,
    cashierUserId: string
  ): Promise<HeldOrderView[]> {
    const result = await this.database.query<HeldOrderRow>(
      `${HELD_ORDER_SELECT}
        WHERE organization_id = $1 AND workspace_id = $2 AND cashier_user_id = $3
        ORDER BY created_at DESC`,
      [organizationId, workspaceId, cashierUserId]
    )
    return result.rows.map(mapRow)
  }

  async hold(input: HoldOrderInput): Promise<HeldOrderView> {
    const id = randomUUID()
    await this.database.query(
      `INSERT INTO pos_held_orders
         (id, organization_id, workspace_id, cashier_user_id, customer_name, customer_phone,
          discount_amount, notes, notes_lines, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.cashierUserId,
        input.customerName,
        input.customerPhone,
        input.discountAmount,
        input.notes,
        input.notesLines ? JSON.stringify(input.notesLines) : null,
        JSON.stringify(input.items),
      ]
    )

    const created = await this.getById(input.organizationId, id)
    if (!created) throw HELD_ORDER_ERRORS.notFound()
    return created
  }

  async getById(organizationId: string, id: string): Promise<HeldOrderView | null> {
    const result = await this.database.query<HeldOrderRow>(
      `${HELD_ORDER_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }

  // One operation serves both "resume" (the cashier wants the cart back -- the caller uses the
  // returned data) and plain "discard" (the caller just ignores it): a held order isn't a
  // template to reuse, it is the one real in-progress cart, so reading it back always consumes
  // it rather than leaving a copy behind.
  async remove(organizationId: string, id: string): Promise<HeldOrderView> {
    const existing = await this.getById(organizationId, id)
    if (!existing) throw HELD_ORDER_ERRORS.notFound()

    await this.database.query(
      `DELETE FROM pos_held_orders WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    return existing
  }
}
