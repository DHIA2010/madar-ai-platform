import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { ExpenseCategoriesRepository } from "./expense-categories-repository"
import { requireExpensesEnabled } from "./guards"
import type { ExpenseCategoryDto } from "./types"

export class ExpenseCategoriesService {
  private readonly db: PostgresDatabase
  private readonly repository: ExpenseCategoriesRepository

  constructor(db: PostgresDatabase) {
    this.db = db
    this.repository = new ExpenseCategoriesRepository(db)
  }

  async list(organizationId: string): Promise<ExpenseCategoryDto[]> {
    await requireExpensesEnabled(this.db, organizationId)
    return this.repository.list(organizationId)
  }

  async create(organizationId: string, name: string): Promise<ExpenseCategoryDto> {
    await requireExpensesEnabled(this.db, organizationId)
    return this.repository.create(organizationId, name)
  }
}
