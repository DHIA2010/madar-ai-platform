import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { ExpenseCategoryDto } from "./types"

// Shown to every new organization without needing a migration-time seed (which would re-run on
// every backend boot -- see migration-runner.ts's "replays every file" behavior). Inserted
// idempotently (ON CONFLICT DO NOTHING keyed by lower(name)) the first time an org's categories
// are listed, so it also naturally covers organizations created after this shipped.
const DEFAULT_CATEGORY_NAMES = [
  "مرافق",
  "رواتب",
  "إيجار",
  "تسويق",
  "صيانة",
  "نقل ومواصلات",
  "لوازم مكتبية",
  "ضيافة",
  "أخرى",
]

function mapCategory(row: Record<string, unknown>): ExpenseCategoryDto {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export class ExpenseCategoriesRepository {
  constructor(private readonly db: PostgresDatabase) {}

  private async ensureDefaultCategories(organizationId: string): Promise<void> {
    for (const name of DEFAULT_CATEGORY_NAMES) {
      await this.db.query(
        `INSERT INTO expense_categories (id, organization_id, name, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (organization_id, lower(name)) DO NOTHING`,
        [randomUUID(), organizationId, name]
      )
    }
  }

  async list(organizationId: string): Promise<ExpenseCategoryDto[]> {
    await this.ensureDefaultCategories(organizationId)
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM expense_categories WHERE organization_id = $1 ORDER BY created_at ASC`,
      [organizationId]
    )
    return result.rows.map(mapCategory)
  }

  async create(organizationId: string, name: string): Promise<ExpenseCategoryDto> {
    try {
      const result = await this.db.query<Record<string, unknown>>(
        `INSERT INTO expense_categories (id, organization_id, name, created_at)
         VALUES ($1, $2, $3, now())
         RETURNING *`,
        [randomUUID(), organizationId, name]
      )
      return mapCategory(result.rows[0])
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw ERRORS.validation({ name: `فئة "${name}" موجودة بالفعل.` })
      }
      throw error
    }
  }
}
