import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { BillingInterval } from "./types"

// Paid add-ons bought on their own, independent of any app package: a monthly or yearly price
// (edited in Madar Admin), and per organization a period that each payment extends. The first is
// the WhatsApp daily report's paid plan (whatsapp/daily-report.ts).

export const ADDON_CODES = ["whatsapp_daily_report"] as const
export type AddonCode = (typeof ADDON_CODES)[number]

export interface AddonPrice {
  code: AddonCode
  monthlyPriceHalalas: number
  yearlyPriceHalalas: number
  isActive: boolean
}

export interface OrganizationAddon {
  code: AddonCode
  interval: BillingInterval
  currentPeriodEnd: string
  source: "payment" | "grant"
}

export interface AddonOverview extends AddonPrice {
  // The organization's own add-on while it runs; null when it never had it or it has lapsed.
  active: OrganizationAddon | null
}

const toIso = (value: unknown) =>
  (value instanceof Date ? value : new Date(String(value))).toISOString()

const isAddonCode = (code: string): code is AddonCode =>
  (ADDON_CODES as readonly string[]).includes(code)

export const ADDON_ERRORS = {
  unknown: () => new IdentityError("ADDON_NOT_FOUND", 404, "business", "Unknown add-on."),
  unavailable: () =>
    new IdentityError("ADDON_UNAVAILABLE", 409, "business", "This add-on isn't on sale right now."),
}

// One period on from `from` (or now, when the add-on has lapsed).
function addPeriod(from: Date, interval: BillingInterval): Date {
  const next = new Date(from)
  if (interval === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

export class AddonsService {
  constructor(private readonly db: PostgresDatabase) {}

  async prices(): Promise<AddonPrice[]> {
    const result = await this.db.query<{
      code: string
      monthly_price_halalas: number
      yearly_price_halalas: number
      is_active: boolean
    }>(
      `SELECT code, monthly_price_halalas, yearly_price_halalas, is_active FROM platform_addons
        ORDER BY code`
    )
    return result.rows
      .filter((row) => isAddonCode(row.code))
      .map((row) => ({
        code: row.code as AddonCode,
        monthlyPriceHalalas: Number(row.monthly_price_halalas),
        yearlyPriceHalalas: Number(row.yearly_price_halalas),
        isActive: row.is_active,
      }))
  }

  async price(code: string): Promise<AddonPrice> {
    const found = (await this.prices()).find((entry) => entry.code === code)
    if (!found) throw ADDON_ERRORS.unknown()
    return found
  }

  async updatePrice(
    code: string,
    input: { monthlyPriceHalalas: number; yearlyPriceHalalas: number; isActive: boolean },
    actorUserId: string
  ): Promise<AddonPrice> {
    if (!isAddonCode(code)) throw ADDON_ERRORS.unknown()
    await this.db.query(
      `UPDATE platform_addons
          SET monthly_price_halalas = $2, yearly_price_halalas = $3, is_active = $4,
              updated_at = now(), updated_by = $5
        WHERE code = $1`,
      [code, input.monthlyPriceHalalas, input.yearlyPriceHalalas, input.isActive, actorUserId]
    )
    return this.price(code)
  }

  // The organization's add-on while it runs (its period hasn't ended).
  async active(
    organizationId: string,
    code: AddonCode,
    now = new Date()
  ): Promise<OrganizationAddon | null> {
    const result = await this.db.query<{
      billing_interval: string
      current_period_end: unknown
      source: string
    }>(
      `SELECT billing_interval, current_period_end, source FROM organization_addons
        WHERE organization_id = $1 AND addon_code = $2`,
      [organizationId, code]
    )
    const row = result.rows[0]
    if (!row) return null
    const end = toIso(row.current_period_end)
    if (new Date(end).getTime() <= now.getTime()) return null
    return {
      code,
      interval: row.billing_interval === "yearly" ? "yearly" : "monthly",
      currentPeriodEnd: end,
      source: row.source === "grant" ? "grant" : "payment",
    }
  }

  async overview(organizationId: string): Promise<AddonOverview[]> {
    const prices = await this.prices()
    return Promise.all(
      prices.map(async (price) => ({
        ...price,
        active: await this.active(organizationId, price.code),
      }))
    )
  }

  // One more period: from the running period's end when it hasn't lapsed (an early renewal loses
  // nothing), otherwise from now.
  async extend(
    organizationId: string,
    code: AddonCode,
    interval: BillingInterval,
    source: "payment" | "grant",
    now = new Date()
  ): Promise<OrganizationAddon> {
    const running = await this.active(organizationId, code, now)
    const end = addPeriod(running ? new Date(running.currentPeriodEnd) : now, interval)
    await this.db.query(
      `INSERT INTO organization_addons
         (organization_id, addon_code, billing_interval, current_period_end, source, started_at,
          updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (organization_id, addon_code) DO UPDATE SET
         billing_interval = $3, current_period_end = $4, source = $5, updated_at = now()`,
      [organizationId, code, interval, end, source]
    )
    return { code, interval, currentPeriodEnd: end.toISOString(), source }
  }

  // Madar Admin: ends an organization's add-on now.
  async revoke(organizationId: string, code: AddonCode): Promise<void> {
    await this.db.query(
      `UPDATE organization_addons SET current_period_end = now(), updated_at = now()
        WHERE organization_id = $1 AND addon_code = $2`,
      [organizationId, code]
    )
  }
}
