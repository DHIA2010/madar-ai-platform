import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { ExpensesRepository } from "./expenses-repository"
import type { CreateExpenseInput, ExpenseDto } from "./types"

export class ExpensesService {
  private readonly repository: ExpensesRepository

  constructor(db: PostgresDatabase) {
    this.repository = new ExpensesRepository(db)
  }

  list(organizationId: string): Promise<ExpenseDto[]> {
    return this.repository.list(organizationId)
  }

  create(organizationId: string, input: CreateExpenseInput): Promise<ExpenseDto> {
    return this.repository.create(organizationId, input)
  }
}
