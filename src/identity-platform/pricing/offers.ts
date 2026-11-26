import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { ADDON_CODES, AddonsService } from "../subscriptions/addons"
import {
  type PurchasableApplication,
  SUBSCRIPTION_APPLICATIONS,
  type SubscriptionApplication,
} from "../subscriptions/types"
import type { PricingService } from "./service"
import type { PlatformPackage } from "./types"

// Offers (العروض): limited-time deals Madar Admin switches on and off. An offer is several years
// of one package for one price, with other apps and add-ons included free for the same years --
// bought once from the apps page (billing/moyasar: offer checkout), everything in it switched on.
// After its years the package renews at its normal yearly price and the included extras end.

type Row = Record<string, unknown>

export interface OfferInput {
  title: string
  subtitle: string | null
  application: PurchasableApplication
  packageId: string | null
  priceHalalas: number
  years: number
  bonusApplications: SubscriptionApplication[]
  bonusAddons: string[]
  features: string[]
  isActive: boolean
  endsOn: string | null
}

export interface OfferView extends OfferInput {
  id: string
  sortOrder: number
  // The package actually bought (the chosen one, or the application's dearest active package).
  package: { id: string; name: string; yearlyPriceHalalas: number | null } | null
  // What everything in it would cost at normal yearly prices for the same years.
  regularHalalas: number
  // Switched on, not past its last day, and its package can be bought.
  available: boolean
}

const refuse = (code: string, message: string, status = 409) =>
  new IdentityError(code, status, "business", message)
const list = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? JSON.parse(value) : value
  return Array.isArray(parsed) ? parsed.map(String) : []
}
// A date column, as YYYY-MM-DD (the driver hands it back as a Date at local midnight).
const dateOnly = (value: unknown): string | null => {
  if (!value) return null
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, "0")
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return String(value).slice(0, 10)
}
const riyadhToday = (now = new Date()) =>
  new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

export class PlatformOffersService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly pricing: PricingService
  ) {}

  private async views(rows: Row[]): Promise<OfferView[]> {
    const catalog = await this.pricing.getCatalog({ includeInactive: false })
    const addons = await new AddonsService(this.db).prices().catch(() => [])
    const today = riyadhToday()
    const yearlyOf = (application: string) => {
      const entry = catalog.find((item) => item.application === application)
      const prices = (entry?.packages ?? [])
        .map((pkg) => pkg.yearlyPriceHalalas)
        .filter((price): price is number => price !== null)
      return prices.length > 0 ? Math.min(...prices) : 0
    }
    return rows.map((row) => {
      const application = String(row.application) as PurchasableApplication
      const packages = catalog.find((entry) => entry.application === application)?.packages ?? []
      const chosen: PlatformPackage | undefined = row.package_id
        ? packages.find((pkg) => pkg.id === row.package_id)
        : [...packages]
            .filter((pkg) => pkg.yearlyPriceHalalas !== null)
            .sort((a, b) => (b.yearlyPriceHalalas ?? 0) - (a.yearlyPriceHalalas ?? 0))[0]
      const years = Number(row.years)
      const bonusApplications = list(row.bonus_applications).filter((app) =>
        (SUBSCRIPTION_APPLICATIONS as readonly string[]).includes(app)
      ) as SubscriptionApplication[]
      const bonusAddons = list(row.bonus_addons).filter((code) =>
        (ADDON_CODES as readonly string[]).includes(code)
      )
      const regularHalalas =
        years *
        ((chosen?.yearlyPriceHalalas ?? 0) +
          bonusApplications.reduce((sum, app) => sum + yearlyOf(app), 0) +
          bonusAddons.reduce(
            (sum, code) =>
              sum + (addons.find((addon) => addon.code === code)?.yearlyPriceHalalas ?? 0),
            0
          ))
      const endsOn = dateOnly(row.ends_on)
      return {
        id: String(row.id),
        title: String(row.title),
        subtitle: row.subtitle ? String(row.subtitle) : null,
        application,
        packageId: row.package_id ? String(row.package_id) : null,
        priceHalalas: Number(row.price_halalas),
        years,
        bonusApplications,
        bonusAddons,
        features: list(row.features),
        isActive: row.is_active === true,
        endsOn,
        sortOrder: Number(row.sort_order ?? 0),
        package: chosen
          ? { id: chosen.id, name: chosen.name, yearlyPriceHalalas: chosen.yearlyPriceHalalas }
          : null,
        regularHalalas,
        available:
          row.is_active === true &&
          (!endsOn || endsOn >= today) &&
          Boolean(chosen && chosen.yearlyPriceHalalas !== null),
      }
    })
  }

  async list(options: { availableOnly: boolean }): Promise<OfferView[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM platform_offers ORDER BY sort_order ASC, created_at ASC`
    )
    const views = await this.views(rows.rows)
    return options.availableOnly ? views.filter((offer) => offer.available) : views
  }

  async get(id: string): Promise<OfferView> {
    const rows = await this.db.query<Row>(`SELECT * FROM platform_offers WHERE id = $1`, [id])
    if (!rows.rows[0]) throw refuse("OFFER_NOT_FOUND", "Offer not found.", 404)
    return (await this.views(rows.rows))[0]
  }

  // The offer to buy right now, refused when it's off, over, or its package can't be bought.
  async purchasable(
    id: string
  ): Promise<OfferView & { package: NonNullable<OfferView["package"]> }> {
    const offer = await this.get(id).catch(() => null)
    if (!offer || !offer.available || !offer.package) {
      throw refuse("OFFER_NOT_AVAILABLE", "This offer isn't available right now.")
    }
    return offer as OfferView & { package: NonNullable<OfferView["package"]> }
  }

  async save(id: string | null, input: OfferInput): Promise<OfferView> {
    const values = [
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.application,
      input.packageId,
      input.priceHalalas,
      input.years,
      JSON.stringify(input.bonusApplications),
      JSON.stringify(input.bonusAddons),
      JSON.stringify(input.features.map((line) => line.trim()).filter(Boolean)),
      input.isActive,
      input.endsOn,
    ]
    if (id) {
      const updated = await this.db.query(
        `UPDATE platform_offers SET title = $2, subtitle = $3, application = $4, package_id = $5,
                price_halalas = $6, years = $7, bonus_applications = $8::jsonb,
                bonus_addons = $9::jsonb, features = $10::jsonb, is_active = $11, ends_on = $12,
                updated_at = now()
          WHERE id = $1 RETURNING id`,
        [id, ...values]
      )
      if (updated.rows.length === 0) throw refuse("OFFER_NOT_FOUND", "Offer not found.", 404)
      return this.get(id)
    }
    const created = randomUUID()
    await this.db.query(
      `INSERT INTO platform_offers
         (id, title, subtitle, application, package_id, price_halalas, years, bonus_applications,
          bonus_addons, features, is_active, ends_on, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM platform_offers))`,
      [created, ...values]
    )
    return this.get(created)
  }

  async remove(id: string): Promise<void> {
    await this.db.query(`DELETE FROM platform_offers WHERE id = $1`, [id])
  }
}
