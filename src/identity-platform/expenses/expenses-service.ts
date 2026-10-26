import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { ExpensesRepository } from "./expenses-repository"
import { requireExpensesEnabled } from "./guards"
import type { CreateExpenseInput, ExpenseDto } from "./types"

export class ExpensesService {
  private readonly db: PostgresDatabase
  private readonly repository: ExpensesRepository

  constructor(db: PostgresDatabase) {
    this.db = db
    this.repository = new ExpensesRepository(db)
  }

  async list(organizationId: string): Promise<ExpenseDto[]> {
    await requireExpensesEnabled(this.db, organizationId)
    return this.repository.list(organizationId)
  }

  async create(organizationId: string, input: CreateExpenseInput): Promise<ExpenseDto> {
    await requireExpensesEnabled(this.db, organizationId)
    return this.repository.create(organizationId, input)
  }

  async cancel(organizationId: string, expenseId: string): Promise<ExpenseDto> {
    await requireExpensesEnabled(this.db, organizationId)
    return this.repository.cancel(organizationId, expenseId)
  }
}
