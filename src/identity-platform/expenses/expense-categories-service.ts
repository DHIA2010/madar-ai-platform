import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { ExpenseCategoriesRepository } from "./expense-categories-repository"
import type { ExpenseCategoryDto } from "./types"

export class ExpenseCategoriesService {
  private readonly repository: ExpenseCategoriesRepository

  constructor(db: PostgresDatabase) {
    this.repository = new ExpenseCategoriesRepository(db)
  }

  list(organizationId: string): Promise<ExpenseCategoryDto[]> {
    return this.repository.list(organizationId)
  }

  create(organizationId: string, name: string): Promise<ExpenseCategoryDto> {
    return this.repository.create(organizationId, name)
  }
}
