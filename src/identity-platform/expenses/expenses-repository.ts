import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { CreateExpenseInput, ExpenseDto } from "./types"

function mapExpense(row: Record<string, unknown>): ExpenseDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: String(row.workspace_id),
    workspaceName: String(row.workspace_name),
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    name: String(row.name),
    amount: Number(row.amount),
    paymentMethod: row.payment_method as ExpenseDto["paymentMethod"],
    taxInclusive: Boolean(row.tax_inclusive),
    expenseDate: new Date(row.expense_date as string).toISOString().slice(0, 10),
    referenceNumber: (row.reference_number as string | null) ?? "",
    notes: (row.notes as string | null) ?? "",
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

// workspaces is a real table with real names, unlike purchases' warehouse_id (a plain varchar,
// never a real FK -- see migration 094_procurement.sql's own comment) -- so workspaceName is
// resolved here via a real JOIN instead of the client-side localStorage lookup purchases needs.
const SELECT_WITH_JOINS = `
  SELECT e.*, c.name AS category_name, w.name AS workspace_name
  FROM expenses e
  JOIN expense_categories c ON c.id = e.category_id
  JOIN workspaces w ON w.id = e.workspace_id
`

export class ExpensesRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<ExpenseDto[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `${SELECT_WITH_JOINS}
       WHERE e.organization_id = $1 AND e.deleted_at IS NULL
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      [organizationId]
    )
    return result.rows.map(mapExpense)
  }

  async create(organizationId: string, input: CreateExpenseInput): Promise<ExpenseDto> {
    const category = await this.db.query<{ id: string }>(
      `SELECT id FROM expense_categories WHERE id = $1 AND organization_id = $2`,
      [input.categoryId, organizationId]
    )
    if (category.rows.length === 0) throw ERRORS.notFound("Expense category")

    const workspace = await this.db.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2`,
      [input.workspaceId, organizationId]
    )
    if (workspace.rows.length === 0) throw ERRORS.notFound("Workspace")

    const id = randomUUID()
    await this.db.query(
      `INSERT INTO expenses (
         id, organization_id, workspace_id, category_id, name, amount, payment_method,
         tax_inclusive, expense_date, reference_number, notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), now())`,
      [
        id,
        organizationId,
        input.workspaceId,
        input.categoryId,
        input.name,
        input.amount,
        input.paymentMethod,
        input.taxInclusive,
        input.expenseDate,
        input.referenceNumber,
        input.notes,
      ]
    )

    const result = await this.db.query<Record<string, unknown>>(
      `${SELECT_WITH_JOINS} WHERE e.id = $1`,
      [id]
    )
    return mapExpense(result.rows[0])
  }
}
