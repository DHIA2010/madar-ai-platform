import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePromotionsEnabled } from "./guards"

// The Promotions app: automatic discounts the cashier applies by itself (see
// src/features/promotions/engine.ts, which decides which promotion a cart line gets -- on the
// device, so it keeps working offline). The best matching promotion wins per line; it stacks with
// the cashier's own line discount. This service stores the promotions and reports how each did.

export type PromotionDiscountType = "percent" | "fixed"
export type PromotionScope = "all" | "products" | "categories"

export interface PromotionInput {
  name: string
  discountType: PromotionDiscountType
  discountValue: number
  maxDiscountPerUnit: number | null
  amountIncludesTax: boolean
  scope: PromotionScope
  productIds: string[]
  categories: string[]
  excludedProductIds: string[]
  workspaceIds: string[]
  startsAt: string | null
  endsAt: string | null
  daysOfWeek: number[]
  startTime: string | null
  endTime: string | null
  licenceNumber: string | null
  isPaused: boolean
}

export interface PromotionView extends PromotionInput {
  id: string
  createdAt: string
  updatedAt: string
  // How it has done so far: sales it discounted, units, and the discount given (net, before VAT).
  stats: { invoiceCount: number; unitCount: number; discountTotal: number }
}

interface PromotionRow {
  id: string
  name: string
  discount_type: PromotionDiscountType
  discount_value: string | number
  max_discount_per_unit: string | number | null
  amount_includes_tax: boolean
  scope: PromotionScope
  product_ids: unknown
  categories: unknown
  excluded_product_ids: unknown
  workspace_ids: unknown
  starts_at: Date | string | null
  ends_at: Date | string | null
  days_of_week: unknown
  start_time: string | null
  end_time: string | null
  licence_number: string | null
  is_paused: boolean
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

const PROMOTION_COLUMNS = `id, name, discount_type, discount_value, max_discount_per_unit,
  amount_includes_tax, scope,
  product_ids, categories, excluded_product_ids, workspace_ids, starts_at, ends_at, days_of_week,
  start_time, end_time, licence_number, is_paused, created_at, updated_at`

const toIso = (value: Date | string) =>
  (value instanceof Date ? value : new Date(value)).toISOString()

function jsonList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function mapPromotion(row: PromotionRow, stats?: PromotionView["stats"]): PromotionView {
  return {
    id: row.id,
    name: row.name,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxDiscountPerUnit:
      row.max_discount_per_unit === null ? null : Number(row.max_discount_per_unit),
    amountIncludesTax: row.amount_includes_tax,
    scope: row.scope,
    productIds: jsonList<string>(row.product_ids),
    categories: jsonList<string>(row.categories),
    excludedProductIds: jsonList<string>(row.excluded_product_ids),
    workspaceIds: jsonList<string>(row.workspace_ids),
    startsAt: row.starts_at ? toIso(row.starts_at) : null,
    endsAt: row.ends_at ? toIso(row.ends_at) : null,
    daysOfWeek: jsonList<number>(row.days_of_week),
    startTime: row.start_time,
    endTime: row.end_time,
    licenceNumber: row.licence_number,
    isPaused: row.is_paused,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    stats: stats ?? { invoiceCount: 0, unitCount: 0, discountTotal: 0 },
  }
}

const PROMOTION_ERRORS = {
  notFound: () => new IdentityError("PROMOTION_NOT_FOUND", 404, "business", "Promotion not found."),
  invalid: (message: string) => new IdentityError("PROMOTION_INVALID", 400, "validation", message),
}

function validate(input: PromotionInput): void {
  if (input.discountType === "percent" && input.discountValue > 100) {
    throw PROMOTION_ERRORS.invalid("A percentage discount can't be more than 100%.")
  }
  if (input.scope === "products" && input.productIds.length === 0) {
    throw PROMOTION_ERRORS.invalid("Choose at least one product.")
  }
  if (input.scope === "categories" && input.categories.length === 0) {
    throw PROMOTION_ERRORS.invalid("Choose at least one category.")
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw PROMOTION_ERRORS.invalid("The end must be after the start.")
  }
  if (Boolean(input.startTime) !== Boolean(input.endTime)) {
    throw PROMOTION_ERRORS.invalid("Set both the start and end hour, or neither.")
  }
}

export class PromotionsService {
  constructor(private readonly database: PostgresDatabase) {}

  private async stats(organizationId: string): Promise<Map<string, PromotionView["stats"]>> {
    const result = await this.database.query<{
      promotion_id: string
      invoice_count: string | number
      unit_count: string | number | null
      discount_total: string | number | null
    }>(
      `SELECT pii.promotion_id,
              COUNT(DISTINCT pii.invoice_id) AS invoice_count,
              SUM(pii.quantity) AS unit_count,
              SUM(pii.promotion_discount_amount) AS discount_total
         FROM pos_invoice_items pii
         JOIN pos_invoices pi ON pi.id = pii.invoice_id
        WHERE pi.organization_id = $1 AND pii.promotion_id IS NOT NULL
        GROUP BY pii.promotion_id`,
      [organizationId]
    )
    return new Map(
      result.rows.map((row) => [
        row.promotion_id,
        {
          invoiceCount: Number(row.invoice_count),
          unitCount: Number(row.unit_count ?? 0),
          discountTotal: Math.round(Number(row.discount_total ?? 0) * 100) / 100,
        },
      ])
    )
  }

  async list(organizationId: string): Promise<PromotionView[]> {
    await requirePromotionsEnabled(this.database, organizationId)
    const [rows, stats] = await Promise.all([
      this.database.query<PromotionRow>(
        `SELECT ${PROMOTION_COLUMNS} FROM promotions
          WHERE organization_id = $1 AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        [organizationId]
      ),
      this.stats(organizationId),
    ])
    return rows.rows.map((row) => mapPromotion(row, stats.get(row.id)))
  }

  // What the cashier caches and applies: every promotion that isn't paused, deleted or over, for
  // this branch. Dates, weekdays and hours are checked on the device at the moment of sale (it may
  // be offline for a while), so promotions that start later are included too.
  async listForCashier(
    organizationId: string,
    workspaceId: string | null
  ): Promise<PromotionView[]> {
    await requirePromotionsEnabled(this.database, organizationId)
    const rows = await this.database.query<PromotionRow>(
      `SELECT ${PROMOTION_COLUMNS} FROM promotions
        WHERE organization_id = $1 AND deleted_at IS NULL AND is_paused = false
          AND (ends_at IS NULL OR ends_at > $2)
        ORDER BY created_at DESC`,
      [organizationId, new Date()]
    )
    return rows.rows
      .map((row) => mapPromotion(row))
      .filter(
        (promotion) =>
          promotion.workspaceIds.length === 0 ||
          (workspaceId !== null && promotion.workspaceIds.includes(workspaceId))
      )
  }

  private async getRow(organizationId: string, id: string): Promise<PromotionRow> {
    const result = await this.database.query<PromotionRow>(
      `SELECT ${PROMOTION_COLUMNS} FROM promotions
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    const row = result.rows[0]
    if (!row) throw PROMOTION_ERRORS.notFound()
    return row
  }

  private params(input: PromotionInput): unknown[] {
    return [
      input.name.trim(),
      input.discountType,
      input.discountValue,
      input.discountType === "percent" ? input.maxDiscountPerUnit : null,
      input.scope,
      JSON.stringify(input.scope === "products" ? input.productIds : []),
      JSON.stringify(input.scope === "categories" ? input.categories : []),
      JSON.stringify(input.scope === "products" ? [] : input.excludedProductIds),
      JSON.stringify(input.workspaceIds),
      input.startsAt ? new Date(input.startsAt) : null,
      input.endsAt ? new Date(input.endsAt) : null,
      JSON.stringify([...new Set(input.daysOfWeek)].sort()),
      input.startTime || null,
      input.endTime || null,
      input.licenceNumber?.trim() || null,
      input.isPaused,
      input.amountIncludesTax,
    ]
  }

  async create(
    organizationId: string,
    actorUserId: string | null,
    input: PromotionInput
  ): Promise<PromotionView> {
    await requirePromotionsEnabled(this.database, organizationId)
    validate(input)
    const id = randomUUID()
    await this.database.query(
      `INSERT INTO promotions
         (name, discount_type, discount_value, max_discount_per_unit, scope, product_ids,
          categories, excluded_product_ids, workspace_ids, starts_at, ends_at, days_of_week,
          start_time, end_time, licence_number, is_paused, amount_includes_tax, id,
          organization_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20)`,
      [...this.params(input), id, organizationId, actorUserId]
    )
    return mapPromotion(await this.getRow(organizationId, id))
  }

  async update(organizationId: string, id: string, input: PromotionInput): Promise<PromotionView> {
    await requirePromotionsEnabled(this.database, organizationId)
    validate(input)
    await this.getRow(organizationId, id)
    await this.database.query(
      `UPDATE promotions SET
         name = $1, discount_type = $2, discount_value = $3, max_discount_per_unit = $4,
         scope = $5, product_ids = $6, categories = $7, excluded_product_ids = $8,
         workspace_ids = $9, starts_at = $10, ends_at = $11, days_of_week = $12,
         start_time = $13, end_time = $14, licence_number = $15, is_paused = $16,
         amount_includes_tax = $17, updated_at = now()
       WHERE id = $18 AND organization_id = $19`,
      [...this.params(input), id, organizationId]
    )
    const stats = await this.stats(organizationId)
    return mapPromotion(await this.getRow(organizationId, id), stats.get(id))
  }

  // Soft delete: sales it already discounted keep pointing at it (and keep its name).
  async remove(organizationId: string, id: string): Promise<void> {
    await requirePromotionsEnabled(this.database, organizationId)
    await this.getRow(organizationId, id)
    await this.database.query(
      "UPDATE promotions SET deleted_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2",
      [id, organizationId]
    )
  }

  // The name a sale line records for the promotion it got -- null when the id isn't one of this
  // organization's promotions. Deliberately not gated on the subscription or the schedule: a sale
  // made offline under a promotion is recorded as it was rung up, even if it syncs later.
  async nameOf(organizationId: string, id: string): Promise<string | null> {
    const result = await this.database.query<{ name: string }>(
      "SELECT name FROM promotions WHERE organization_id = $1 AND id = $2",
      [organizationId, id]
    )
    return result.rows[0]?.name ?? null
  }
}
