import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export const TAX_RATE_TYPES = ["sales_tax", "exempt", "zero_rate", "custom"] as const
export type TaxRateType = (typeof TAX_RATE_TYPES)[number]

const TAX_ERRORS = {
  notFound: () => new IdentityError("TAX_RATE_NOT_FOUND", 404, "business", "Tax rate not found."),
  cannotDeleteDefault: () =>
    new IdentityError(
      "TAX_RATE_CANNOT_DELETE_DEFAULT",
      409,
      "business",
      "Make another rate the default before deleting this one."
    ),
  cannotDeactivateDefault: () =>
    new IdentityError(
      "TAX_RATE_CANNOT_DEACTIVATE_DEFAULT",
      409,
      "business",
      "The default tax rate cannot be turned off. Make another rate the default first."
    ),
  cannotUnsetDefault: () =>
    new IdentityError(
      "TAX_RATE_CANNOT_UNSET_DEFAULT",
      409,
      "business",
      "Make a different rate the default instead of unsetting this one."
    ),
  inUseByProduct: () =>
    new IdentityError(
      "TAX_RATE_IN_USE",
      409,
      "business",
      "One or more products are still assigned to this tax rate. Reassign them before deleting it."
    ),
  validation: (fields: Record<string, string>) =>
    new IdentityError("TAX_RATE_VALIDATION_FAILED", 422, "validation", "Tax rate is not valid.", {
      fields,
    }),
}

export interface TaxRateView {
  id: string
  name: string
  type: TaxRateType
  ratePercent: number
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTaxRateInput {
  name: string
  type: TaxRateType
  ratePercent: number
  isDefault: boolean
  isActive: boolean
}

export interface UpdateTaxRateInput {
  name?: string
  type?: TaxRateType
  ratePercent?: number
  isDefault?: boolean
  isActive?: boolean
}

interface TaxRateRow {
  id: string
  name: string
  type: string
  rate_percent: string | number
  is_default: boolean
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapRow(row: TaxRateRow): TaxRateView {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TaxRateType,
    ratePercent: Number(row.rate_percent),
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

// Real Saudi VAT rate -- what every sale on this platform used before per-organization tax
// configuration existed (see invoices-service.ts's old VAT_RATE constant). Used only to lazily
// seed a brand-new organization's first tax rate, and as the last-resort fallback in
// getDefaultRatePercent() if that seed row was somehow deleted without a replacement default ever
// being set -- a sale must never be blocked by a missing tax configuration.
const FALLBACK_VAT_PERCENT = 15

const TAX_RATE_SELECT = `
  SELECT id, name, type, rate_percent, is_default, is_active, created_at, updated_at
    FROM tax_rates
`

export class TaxRatesService {
  constructor(private readonly database: PostgresDatabase) {}

  // Every organization sees a real default rate the first time it opens the Taxes settings page,
  // never an empty table -- lazily creating one on first read avoids a SQL-level UUID function
  // (pg-mem, this codebase's test harness, has none) and matches how this platform has always
  // actually behaved (every sale so far was really taxed at 15%).
  async list(organizationId: string): Promise<TaxRateView[]> {
    const existing = await this.database.query<TaxRateRow>(
      `${TAX_RATE_SELECT} WHERE organization_id = $1 ORDER BY created_at ASC`,
      [organizationId]
    )
    if (existing.rows.length > 0) {
      return existing.rows.map(mapRow)
    }

    try {
      const seeded = await this.create(organizationId, {
        name: "ضريبة القيمة المضافة",
        type: "sales_tax",
        ratePercent: FALLBACK_VAT_PERCENT,
        isDefault: true,
        isActive: true,
      })
      return [seeded]
    } catch (error) {
      // Two requests can both see an empty table and both try to seed the default row (the
      // dashboard opening Settings -> الضرائب from more than one place at once is the real case
      // this hit) -- the second seed hits the partial unique index
      // (uq_tax_rates_one_default_per_org) and should just read back what the first one already
      // created, not surface a 500 for what is really a successful concurrent seed.
      if ((error as { code?: string })?.code === "23505") {
        const seededByConcurrentRequest = await this.database.query<TaxRateRow>(
          `${TAX_RATE_SELECT} WHERE organization_id = $1 ORDER BY created_at ASC`,
          [organizationId]
        )
        if (seededByConcurrentRequest.rows.length > 0) {
          return seededByConcurrentRequest.rows.map(mapRow)
        }
      }
      throw error
    }
  }

  // What invoices-service.ts's create() actually charges -- a decimal fraction (0.15), not a
  // percentage, matching the old hardcoded VAT_RATE constant's own unit so the calculation code
  // downstream never had to change shape, only where the number comes from.
  async getDefaultRatePercent(organizationId: string): Promise<number> {
    const result = await this.database.query<{ rate_percent: string | number }>(
      `SELECT rate_percent FROM tax_rates
        WHERE organization_id = $1 AND is_default AND is_active
        LIMIT 1`,
      [organizationId]
    )
    const row = result.rows[0]
    return row ? Number(row.rate_percent) / 100 : FALLBACK_VAT_PERCENT / 100
  }

  // Resolves specific rate ids to their real percentage (as a decimal fraction, same unit as
  // getDefaultRatePercent) -- what a product's own tax_rate_id override actually charges. An id
  // that is missing, deleted, or has since been deactivated is simply absent from the returned
  // map rather than erroring: invoices-service.ts falls back to the organization's default rate
  // for any line item whose override can't be resolved, exactly like a product with no override
  // at all -- a sale must never be blocked by a stale reference on one product.
  async getRatePercentsByIds(organizationId: string, ids: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(ids)]
    const result = new Map<string, number>()
    if (unique.length === 0) return result

    const placeholders = unique.map((_, index) => `$${index + 2}`).join(", ")
    const rows = await this.database.query<{ id: string; rate_percent: string | number }>(
      `SELECT id, rate_percent FROM tax_rates
        WHERE organization_id = $1 AND is_active AND id IN (${placeholders})`,
      [organizationId, ...unique]
    )
    for (const row of rows.rows) {
      result.set(row.id, Number(row.rate_percent) / 100)
    }
    return result
  }

  async create(organizationId: string, input: CreateTaxRateInput): Promise<TaxRateView> {
    const fields = validate(input)
    if (Object.keys(fields).length > 0) throw TAX_ERRORS.validation(fields)

    const id = randomUUID()
    await this.database.withTransaction(async () => {
      if (input.isDefault) {
        await this.database.query(
          `UPDATE tax_rates SET is_default = false, updated_at = now() WHERE organization_id = $1`,
          [organizationId]
        )
      }
      await this.database.query(
        `INSERT INTO tax_rates (id, organization_id, name, type, rate_percent, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          organizationId,
          input.name.trim(),
          input.type,
          input.ratePercent,
          input.isDefault,
          input.isActive,
        ]
      )
    })

    const created = await this.findById(organizationId, id)
    if (!created) throw TAX_ERRORS.notFound()
    return created
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateTaxRateInput
  ): Promise<TaxRateView> {
    const existing = await this.findRow(organizationId, id)
    if (!existing) throw TAX_ERRORS.notFound()

    const next: CreateTaxRateInput = {
      name: input.name ?? existing.name,
      type: (input.type ?? existing.type) as TaxRateType,
      ratePercent: input.ratePercent ?? Number(existing.rate_percent),
      isDefault: input.isDefault ?? existing.is_default,
      isActive: input.isActive ?? existing.is_active,
    }

    // The only way a rate stops being default is a DIFFERENT rate becoming default instead (see
    // the transaction below, which unsets every other row when a new default is set) -- this
    // row's own update can never simply drop its own default status, or the organization would be
    // left with none at all.
    if (existing.is_default && !next.isDefault) {
      throw TAX_ERRORS.cannotUnsetDefault()
    }
    // A default rate is the one actually charged on a sale, so it can never be inactive.
    if (next.isDefault && !next.isActive) {
      throw TAX_ERRORS.cannotDeactivateDefault()
    }

    const fields = validate(next)
    if (Object.keys(fields).length > 0) throw TAX_ERRORS.validation(fields)

    await this.database.withTransaction(async () => {
      if (next.isDefault && !existing.is_default) {
        await this.database.query(
          `UPDATE tax_rates SET is_default = false, updated_at = now()
            WHERE organization_id = $1 AND id != $2`,
          [organizationId, id]
        )
      }
      await this.database.query(
        `UPDATE tax_rates
            SET name = $3, type = $4, rate_percent = $5, is_default = $6, is_active = $7,
                updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [
          organizationId,
          id,
          next.name.trim(),
          next.type,
          next.ratePercent,
          next.isDefault,
          next.isActive,
        ]
      )
    })

    const updated = await this.findById(organizationId, id)
    if (!updated) throw TAX_ERRORS.notFound()
    return updated
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const existing = await this.findRow(organizationId, id)
    if (!existing) throw TAX_ERRORS.notFound()
    if (existing.is_default) throw TAX_ERRORS.cannotDeleteDefault()

    // Checked here for a clear business error rather than letting products_tax_rate_id_fkey
    // surface as an opaque 500 -- a product keeps its tax_rate_id even after being (soft-)
    // deleted, so this also catches an archived product still pointing at the rate.
    const inUse = await this.database.query<{ id: string }>(
      `SELECT id FROM products WHERE organization_id = $1 AND tax_rate_id = $2 LIMIT 1`,
      [organizationId, id]
    )
    if (inUse.rows.length > 0) throw TAX_ERRORS.inUseByProduct()

    await this.database.query(`DELETE FROM tax_rates WHERE organization_id = $1 AND id = $2`, [
      organizationId,
      id,
    ])
  }

  private async findRow(organizationId: string, id: string): Promise<TaxRateRow | null> {
    const result = await this.database.query<TaxRateRow>(
      `${TAX_RATE_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    return result.rows[0] ?? null
  }

  private async findById(organizationId: string, id: string): Promise<TaxRateView | null> {
    const row = await this.findRow(organizationId, id)
    return row ? mapRow(row) : null
  }
}

function validate(input: CreateTaxRateInput): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!input.name.trim()) fields.name = "Name is required."
  if (!(TAX_RATE_TYPES as readonly string[]).includes(input.type)) {
    fields.type = "Unknown tax rate type."
  }
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0 || input.ratePercent > 100) {
    fields.ratePercent = "Rate must be between 0 and 100."
  }
  return fields
}
