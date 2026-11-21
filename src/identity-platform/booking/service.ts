import { randomBytes, randomUUID } from "node:crypto"

import type { z } from "zod"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { LoyaltyService } from "../loyalty/service"
import {
  BookingExtras,
  parseJsonList,
  type Quote,
  type ServiceAddon,
  type ServiceOption,
} from "./extras"
import type {
  bookingCreateSchema,
  bookingProviderSchema,
  bookingServiceSchema,
  bookingSettingsSchema,
  bookingTimeOffSchema,
} from "./schemas"

// The Booking app: services, the people who provide them, their hours and time off, the bookings
// themselves and the business's public booking page.
//
// Time. Every moment is stored as an instant; a "day" and a provider's working hours are in the
// business's own clock, which is Riyadh time for every organization today (no daylight saving, so
// a fixed three hours ahead of UTC).
//
// When a time is free. A provider can take a booking of a service at a time when: the provider
// does that service; the whole service fits inside one of the provider's working periods that
// weekday; no time off covers it; and no other booking of the provider overlaps it -- counting
// the free minutes each service keeps after itself. A service with room for several people (a
// group session) is the one exception: bookings of that same service at that same start share
// the slot until its capacity is used.

const RIYADH_OFFSET_MS = 3 * 60 * 60_000
const MINUTE = 60_000
// How long an online booking waiting for its payment holds its time.
export const PAYMENT_HOLD_MINUTES = 15
const DAY_MS = 24 * 60 * MINUTE

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show"
// A booking in one of these still holds its time.
const HOLDING: BookingStatus[] = ["pending", "confirmed", "completed", "no_show"]

export const BOOKING_ERRORS = {
  notFound: (what: string) =>
    new IdentityError("BOOKING_NOT_FOUND", 404, "business", `${what} not found.`),
  invalid: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 422, "business", message, details),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 409, "business", message, details),
}

export interface BookingSettingsView {
  slug: string | null
  onlineEnabled: boolean
  displayName: string | null
  description: string | null
  phone: string | null
  address: string | null
  slotIntervalMinutes: number
  leadTimeMinutes: number
  advanceDays: number
  autoConfirm: boolean
  cancellationAllowed: boolean
  cancellationDeadlineMinutes: number
  reviewsEnabled: boolean
  whatsappConfirmation: boolean
  whatsappReminder: boolean
  reminderHoursBefore: number
  invoiceOnCompletion: boolean
  calendarToken: string | null
  // Paying online when booking: off, a deposit (a share of the price) or the whole price.
  paymentMode: "off" | "deposit" | "full"
  depositPercent: number
  moyasarPublishableKey: string | null
  // Whether the business's secret key has been saved (the key itself is never sent back).
  moyasarSecretSet: boolean
}

export interface BookingServiceView {
  id: string
  name: string
  description: string | null
  category: string | null
  durationMinutes: number
  price: number
  bufferMinutes: number
  capacity: number
  color: string | null
  visibility: "published" | "internal"
  isActive: boolean
  options: ServiceOption[]
  addons: ServiceAddon[]
  // The services this one is made of, when it is a bundle.
  bundleServiceIds: string[]
  // The rooms and equipment it cannot be given without.
  resourceIds: string[]
}

export interface BookingResourceView {
  id: string
  name: string
  kind: "room" | "equipment"
  quantity: number
  isActive: boolean
}

export interface WaitlistView {
  id: string
  serviceId: string
  serviceName: string
  providerId: string | null
  providerName: string | null
  customerName: string
  customerPhone: string | null
  preferredDate: string
  note: string | null
  status: "waiting" | "booked" | "removed"
  source: "staff" | "online"
  createdAt: string
  // The first time that has opened on the day they asked for, if any.
  openTime: string | null
}

export interface WorkingPeriod {
  weekday: number
  startMinute: number
  endMinute: number
}

export interface BookingProviderView {
  id: string
  workspaceId: string | null
  userId: string | null
  name: string
  title: string | null
  phone: string | null
  color: string | null
  isActive: boolean
  // The share of a completed booking this provider earns, in percent.
  commissionRate: number
  serviceIds: string[]
  hours: WorkingPeriod[]
}

export interface BookingTimeOffView {
  id: string
  providerId: string | null
  startsAt: string
  endsAt: string
  kind: string
  note: string | null
}

export interface BookingView {
  id: string
  number: number
  serviceId: string
  serviceName: string
  serviceColor: string | null
  providerId: string
  providerName: string
  customerId: string | null
  customerName: string
  customerPhone: string | null
  partySize: number
  startsAt: string
  endsAt: string
  price: number
  status: BookingStatus
  paymentStatus: "unpaid" | "paid"
  paymentMethod: string | null
  source: "staff" | "online"
  notes: string | null
  customerNotes: string | null
  cancelReason: string | null
  cancelledBy: string | null
  publicToken: string
  createdAt: string
  // How the price was reached: before anything is taken off, then each thing taken off.
  optionName: string | null
  addons: Array<{ id: string; name: string; price: number }>
  subtotal: number
  discount: number
  couponCode: string | null
  giftAmount: number
  loyaltyPoints: number
  loyaltyDiscount: number
  loyaltyEarned: number
  customerPlanId: string | null
  commissionAmount: number
  invoiceId: string | null
  invoiceNumber: string | null
  confirmationSentAt: string | null
  reminderSentAt: string | null
  // The repeating series this booking is one visit of, if any.
  seriesId: string | null
  // What has to be paid online for the booking to stand, what was paid that way, and what of
  // it was given back.
  paymentDue: number
  paidOnline: number
  refundedOnline: number
  // Until when an unpaid online booking holds its time.
  paymentExpiresAt: string | null
}

export interface SlotView {
  startsAt: string
  // The time on the business's clock, "HH:MM".
  time: string
  // The providers free at this time, the least busy that day first.
  providerIds: string[]
  // Places left, for a service that takes several people.
  remaining: number
}

type ServiceInput = z.infer<typeof bookingServiceSchema>
type ProviderInput = z.infer<typeof bookingProviderSchema>
type SettingsInput = z.infer<typeof bookingSettingsSchema>
type TimeOffInput = z.infer<typeof bookingTimeOffSchema>
type CreateInput = z.infer<typeof bookingCreateSchema>

type Row = Record<string, unknown>

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
const ms = (value: unknown) => new Date(iso(value)).getTime()
const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

// ---- The business's clock ----

// The first instant of a day ("YYYY-MM-DD") on the business's clock.
export const dayStart = (day: string) =>
  new Date(`${day}T00:00:00.000Z`).getTime() - RIYADH_OFFSET_MS
// The day an instant falls on, on the business's clock.
export const dayOf = (instant: number) =>
  new Date(instant + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
const weekdayOf = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay()
const minuteOfDay = (instant: number) => {
  const local = new Date(instant + RIYADH_OFFSET_MS)
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`

const mapSettings = (row: Row): BookingSettingsView => ({
  slug: text(row.slug),
  onlineEnabled: row.online_enabled === true,
  displayName: text(row.display_name),
  description: text(row.description),
  phone: text(row.phone),
  address: text(row.address),
  slotIntervalMinutes: Number(row.slot_interval_minutes),
  leadTimeMinutes: Number(row.lead_time_minutes),
  advanceDays: Number(row.advance_days),
  autoConfirm: row.auto_confirm === true,
  cancellationAllowed: row.cancellation_allowed === true,
  cancellationDeadlineMinutes: Number(row.cancellation_deadline_minutes),
  reviewsEnabled: row.reviews_enabled !== false,
  whatsappConfirmation: row.whatsapp_confirmation === true,
  whatsappReminder: row.whatsapp_reminder === true,
  reminderHoursBefore: Number(row.reminder_hours_before ?? 24),
  invoiceOnCompletion: row.invoice_on_completion === true,
  calendarToken: text(row.calendar_token),
  paymentMode:
    row.payment_mode === "deposit" || row.payment_mode === "full" ? row.payment_mode : "off",
  depositPercent: Number(row.deposit_percent ?? 30),
  moyasarPublishableKey: text(row.moyasar_publishable_key),
  moyasarSecretSet: Boolean(row.moyasar_secret_encrypted),
})

const mapService = (row: Row): BookingServiceView => ({
  id: String(row.id),
  name: String(row.name),
  description: text(row.description),
  category: text(row.category),
  durationMinutes: Number(row.duration_minutes),
  price: Number(row.price),
  bufferMinutes: Number(row.buffer_minutes),
  capacity: Number(row.capacity),
  color: text(row.color),
  visibility: row.visibility === "internal" ? "internal" : "published",
  isActive: row.is_active === true,
  options: parseJsonList<ServiceOption>(row.options),
  addons: parseJsonList<ServiceAddon>(row.addons),
  bundleServiceIds: parseJsonList<string>(row.bundle_service_ids),
  resourceIds: [],
})

// What deciding a provider's free time needs to know about one day.
interface DayContext {
  bookings: Array<{
    id: string
    providerId: string
    serviceId: string
    start: number
    // The end, with the free minutes its service keeps after itself.
    heldUntil: number
    partySize: number
  }>
  timeOff: Array<{ providerId: string | null; start: number; end: number }>
  // Which rooms and equipment each service needs, and how many of each the business has.
  needs: Map<string, string[]>
  stock: Map<string, number>
}

export class BookingService {
  // Coupons, gift cards, packages, points and reviews, and the price of a booking.
  readonly extras: BookingExtras

  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date(),
    // The Loyalty app the points are kept in; the server passes the one it shares with the
    // cashier, and anything else gets its own over the same database.
    loyalty: LoyaltyService = new LoyaltyService(db, now)
  ) {
    this.extras = new BookingExtras(db, () => dayOf(this.now().getTime()), loyalty)
  }

  // What happens on its own around a booking (booking/automation.ts), set where the server is
  // put together: a WhatsApp confirmation once a booking is confirmed, an invoice once a visit
  // is finished. Neither may fail the booking itself.
  hooks: {
    confirmed?: (organizationId: string, bookingId: string) => Promise<void>
    completed?: (organizationId: string, bookingId: string, userId: string | null) => Promise<void>
  } = {}

  private after(work: Promise<void> | undefined, what: string, bookingId: string) {
    void work?.catch((error: unknown) =>
      console.error(`booking.${what}_failed`, { bookingId, error })
    )
  }

  // ---- Settings ----

  async getSettings(organizationId: string): Promise<BookingSettingsView> {
    const existing = await this.db.query<Row>(
      `SELECT * FROM booking_settings WHERE organization_id = $1`,
      [organizationId]
    )
    if (existing.rows[0]) return mapSettings(existing.rows[0])
    await this.db.query(
      `INSERT INTO booking_settings (organization_id) VALUES ($1)
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId]
    )
    const created = await this.db.query<Row>(
      `SELECT * FROM booking_settings WHERE organization_id = $1`,
      [organizationId]
    )
    return mapSettings(created.rows[0])
  }

  async updateSettings(organizationId: string, patch: SettingsInput): Promise<BookingSettingsView> {
    const current = await this.getSettings(organizationId)
    const next = { ...current, ...patch }
    if (next.slug && next.slug !== current.slug) {
      const taken = await this.db.query(
        `SELECT 1 FROM booking_settings WHERE slug = $1 AND organization_id <> $2`,
        [next.slug, organizationId]
      )
      if (taken.rows.length > 0) {
        throw BOOKING_ERRORS.conflict("BOOKING_SLUG_TAKEN", "That page address is taken.")
      }
    }
    // Asking for payment needs both of the business's Moyasar keys in place.
    if (
      next.paymentMode !== "off" &&
      !(clean(next.moyasarPublishableKey) && current.moyasarSecretSet)
    ) {
      throw BOOKING_ERRORS.invalid(
        "BOOKING_PAYMENT_KEYS_REQUIRED",
        "Add both Moyasar keys before asking for payment online."
      )
    }
    if (next.onlineEnabled && !next.slug) {
      throw BOOKING_ERRORS.invalid(
        "BOOKING_SLUG_REQUIRED",
        "The booking page needs an address before it can be opened."
      )
    }
    await this.db.query(
      `UPDATE booking_settings SET
         slug = $2, online_enabled = $3, display_name = $4, description = $5, phone = $6,
         address = $7, slot_interval_minutes = $8, lead_time_minutes = $9, advance_days = $10,
         auto_confirm = $11, cancellation_allowed = $12, cancellation_deadline_minutes = $13,
         reviews_enabled = $14, whatsapp_confirmation = $15, whatsapp_reminder = $16,
         reminder_hours_before = $17, invoice_on_completion = $18, calendar_token = $19,
         payment_mode = $20, deposit_percent = $21, moyasar_publishable_key = $22,
         updated_at = now()
       WHERE organization_id = $1`,
      [
        organizationId,
        next.slug ?? null,
        next.onlineEnabled,
        clean(next.displayName),
        clean(next.description),
        clean(next.phone),
        clean(next.address),
        next.slotIntervalMinutes,
        next.leadTimeMinutes,
        next.advanceDays,
        next.autoConfirm,
        next.cancellationAllowed,
        next.cancellationDeadlineMinutes,
        next.reviewsEnabled,
        next.whatsappConfirmation,
        next.whatsappReminder,
        next.reminderHoursBefore,
        next.invoiceOnCompletion,
        current.calendarToken,
        next.paymentMode,
        next.depositPercent,
        clean(next.moyasarPublishableKey),
      ]
    )
    return this.getSettings(organizationId)
  }

  // ---- Services ----

  async listServices(organizationId: string): Promise<BookingServiceView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_services WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY sort_order ASC, created_at ASC`,
      [organizationId]
    )
    const links = await this.db.query<Row>(
      `SELECT service_id, resource_id FROM booking_service_resources WHERE organization_id = $1`,
      [organizationId]
    )
    return result.rows.map((row) => ({
      ...mapService(row),
      resourceIds: links.rows
        .filter((link) => link.service_id === row.id)
        .map((link) => String(link.resource_id)),
    }))
  }

  private async service(organizationId: string, id: string): Promise<BookingServiceView> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_services WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (!result.rows[0]) throw BOOKING_ERRORS.notFound("Service")
    const links = await this.db.query<Row>(
      `SELECT resource_id FROM booking_service_resources WHERE service_id = $1`,
      [id]
    )
    return {
      ...mapService(result.rows[0]),
      resourceIds: links.rows.map((link) => String(link.resource_id)),
    }
  }

  private async writeServiceResources(organizationId: string, id: string, resourceIds: string[]) {
    const known = new Set((await this.listResources(organizationId)).map((entry) => entry.id))
    await this.db.query(`DELETE FROM booking_service_resources WHERE service_id = $1`, [id])
    for (const resourceId of new Set(resourceIds)) {
      if (!known.has(resourceId)) continue
      await this.db.query(
        `INSERT INTO booking_service_resources (service_id, resource_id, organization_id)
         VALUES ($1, $2, $3)`,
        [id, resourceId, organizationId]
      )
    }
  }

  // ---- Rooms and equipment ----

  async listResources(organizationId: string): Promise<BookingResourceView[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_resources WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [organizationId]
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: row.kind === "equipment" ? "equipment" : "room",
      quantity: Number(row.quantity),
      isActive: row.is_active === true,
    }))
  }

  async saveResource(
    organizationId: string,
    id: string | null,
    input: { name: string; kind: "room" | "equipment"; quantity: number; isActive: boolean }
  ): Promise<BookingResourceView> {
    const resourceId = id ?? randomUUID()
    if (id) {
      const updated = await this.db.query(
        `UPDATE booking_resources SET name = $3, kind = $4, quantity = $5, is_active = $6
          WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
        [organizationId, id, input.name, input.kind, input.quantity, input.isActive]
      )
      if (updated.rows.length === 0) throw BOOKING_ERRORS.notFound("Resource")
    } else {
      await this.db.query(
        `INSERT INTO booking_resources (id, organization_id, name, kind, quantity, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resourceId, organizationId, input.name, input.kind, input.quantity, input.isActive]
      )
    }
    const saved = (await this.listResources(organizationId)).find(
      (entry) => entry.id === resourceId
    )
    if (!saved) throw BOOKING_ERRORS.notFound("Resource")
    return saved
  }

  async removeResource(organizationId: string, id: string): Promise<void> {
    const removed = await this.db.query(
      `UPDATE booking_resources SET deleted_at = now(), is_active = false
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
      [organizationId, id]
    )
    if (removed.rows.length === 0) throw BOOKING_ERRORS.notFound("Resource")
    await this.db.query(`DELETE FROM booking_service_resources WHERE resource_id = $1`, [id])
  }

  async createService(organizationId: string, input: ServiceInput): Promise<BookingServiceView> {
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_services
         (id, organization_id, name, description, category, duration_minutes, price,
          buffer_minutes, capacity, color, visibility, is_active, options, addons,
          bundle_service_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb,
               $15::jsonb)`,
      [
        id,
        organizationId,
        input.name,
        clean(input.description),
        clean(input.category),
        input.durationMinutes,
        input.price,
        input.bufferMinutes,
        input.capacity,
        input.color ?? null,
        input.visibility,
        input.isActive,
        JSON.stringify(this.withIds(input.options)),
        JSON.stringify(this.withIds(input.addons)),
        JSON.stringify(input.bundleServiceIds),
      ]
    )
    await this.writeServiceResources(organizationId, id, input.resourceIds)
    return this.service(organizationId, id)
  }

  async updateService(
    organizationId: string,
    id: string,
    input: ServiceInput
  ): Promise<BookingServiceView> {
    await this.service(organizationId, id)
    await this.db.query(
      `UPDATE booking_services SET
         name = $3, description = $4, category = $5, duration_minutes = $6, price = $7,
         buffer_minutes = $8, capacity = $9, color = $10, visibility = $11, is_active = $12,
         options = $13::jsonb, addons = $14::jsonb, bundle_service_ids = $15::jsonb,
         updated_at = now()
       WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        input.name,
        clean(input.description),
        clean(input.category),
        input.durationMinutes,
        input.price,
        input.bufferMinutes,
        input.capacity,
        input.color ?? null,
        input.visibility,
        input.isActive,
        JSON.stringify(this.withIds(input.options)),
        JSON.stringify(this.withIds(input.addons)),
        JSON.stringify(input.bundleServiceIds),
      ]
    )
    await this.writeServiceResources(organizationId, id, input.resourceIds)
    return this.service(organizationId, id)
  }

  // An option or add-on keeps its id once it has one, so bookings made with it still name it.
  private withIds<T extends { id?: string | null }>(items: T[]): Array<T & { id: string }> {
    return items.map((item) => ({ ...item, id: item.id || randomUUID() }))
  }

  // Taken off the list; bookings already made keep pointing at it.
  async removeService(organizationId: string, id: string): Promise<void> {
    await this.service(organizationId, id)
    await this.db.query(
      `UPDATE booking_services SET deleted_at = now() WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    await this.db.query(`DELETE FROM booking_provider_services WHERE service_id = $1`, [id])
  }

  // ---- Providers ----

  async listProviders(organizationId: string): Promise<BookingProviderView[]> {
    const [providers, links, hours] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM booking_providers WHERE organization_id = $1 AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [organizationId]
      ),
      this.db.query<Row>(
        `SELECT provider_id, service_id FROM booking_provider_services WHERE organization_id = $1`,
        [organizationId]
      ),
      this.db.query<Row>(
        `SELECT provider_id, weekday, start_minute, end_minute FROM booking_working_hours
          WHERE organization_id = $1`,
        [organizationId]
      ),
    ])
    return providers.rows.map((row) => ({
      id: String(row.id),
      workspaceId: text(row.workspace_id),
      userId: text(row.user_id),
      name: String(row.name),
      title: text(row.title),
      phone: text(row.phone),
      color: text(row.color),
      isActive: row.is_active === true,
      commissionRate: Number(row.commission_rate ?? 0),
      serviceIds: links.rows
        .filter((link) => link.provider_id === row.id)
        .map((link) => String(link.service_id)),
      hours: hours.rows
        .filter((period) => period.provider_id === row.id)
        .map((period) => ({
          weekday: Number(period.weekday),
          startMinute: Number(period.start_minute),
          endMinute: Number(period.end_minute),
        }))
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
    }))
  }

  private async provider(organizationId: string, id: string): Promise<BookingProviderView> {
    const found = (await this.listProviders(organizationId)).find((entry) => entry.id === id)
    if (!found) throw BOOKING_ERRORS.notFound("Provider")
    return found
  }

  // A day's periods must not overlap one another.
  private checkHours(hours: WorkingPeriod[]) {
    const sorted = [...hours].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const period = sorted[index]
      if (period.weekday === previous.weekday && period.startMinute < previous.endMinute) {
        throw BOOKING_ERRORS.invalid(
          "BOOKING_HOURS_OVERLAP",
          "Two working periods on the same day overlap."
        )
      }
    }
  }

  private async writeProviderLinks(organizationId: string, id: string, input: ProviderInput) {
    this.checkHours(input.hours)
    const known = new Set((await this.listServices(organizationId)).map((entry) => entry.id))
    await this.db.query(`DELETE FROM booking_provider_services WHERE provider_id = $1`, [id])
    for (const serviceId of new Set(input.serviceIds)) {
      if (!known.has(serviceId)) continue
      await this.db.query(
        `INSERT INTO booking_provider_services (provider_id, service_id, organization_id)
         VALUES ($1, $2, $3)`,
        [id, serviceId, organizationId]
      )
    }
    await this.db.query(`DELETE FROM booking_working_hours WHERE provider_id = $1`, [id])
    for (const period of input.hours) {
      await this.db.query(
        `INSERT INTO booking_working_hours
           (id, organization_id, provider_id, weekday, start_minute, end_minute)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), organizationId, id, period.weekday, period.startMinute, period.endMinute]
      )
    }
  }

  async createProvider(
    organizationId: string,
    workspaceId: string | null,
    input: ProviderInput
  ): Promise<BookingProviderView> {
    this.checkHours(input.hours)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_providers
         (id, organization_id, workspace_id, user_id, name, title, phone, color, is_active,
          commission_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        organizationId,
        workspaceId,
        input.userId ?? null,
        input.name,
        clean(input.title),
        clean(input.phone),
        input.color ?? null,
        input.isActive,
        input.commissionRate,
      ]
    )
    await this.writeProviderLinks(organizationId, id, input)
    return this.provider(organizationId, id)
  }

  async updateProvider(
    organizationId: string,
    id: string,
    input: ProviderInput
  ): Promise<BookingProviderView> {
    await this.provider(organizationId, id)
    this.checkHours(input.hours)
    await this.db.query(
      `UPDATE booking_providers SET
         user_id = $3, name = $4, title = $5, phone = $6, color = $7, is_active = $8,
         commission_rate = $9, updated_at = now()
       WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        input.userId ?? null,
        input.name,
        clean(input.title),
        clean(input.phone),
        input.color ?? null,
        input.isActive,
        input.commissionRate,
      ]
    )
    await this.writeProviderLinks(organizationId, id, input)
    return this.provider(organizationId, id)
  }

  async removeProvider(organizationId: string, id: string): Promise<void> {
    await this.provider(organizationId, id)
    const upcoming = await this.db.query<Row>(
      `SELECT id, status FROM bookings
        WHERE organization_id = $1 AND provider_id = $2 AND starts_at > $3`,
      [organizationId, id, this.now().toISOString()]
    )
    const open = upcoming.rows.filter(
      (row) => row.status === "pending" || row.status === "confirmed"
    ).length
    if (open > 0) {
      throw BOOKING_ERRORS.conflict(
        "BOOKING_PROVIDER_HAS_BOOKINGS",
        "This provider still has upcoming bookings.",
        { count: open }
      )
    }
    await this.db.query(
      `UPDATE booking_providers SET deleted_at = now(), is_active = false
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
  }

  // ---- Time off ----

  async listTimeOff(organizationId: string): Promise<BookingTimeOffView[]> {
    // What has already passed is of no use to anyone planning.
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_time_off WHERE organization_id = $1 AND ends_at > $2
        ORDER BY starts_at ASC`,
      [organizationId, new Date(this.now().getTime() - DAY_MS).toISOString()]
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      providerId: text(row.provider_id),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      kind: String(row.kind),
      note: text(row.note),
    }))
  }

  async createTimeOff(organizationId: string, input: TimeOffInput): Promise<BookingTimeOffView> {
    if (input.providerId) await this.provider(organizationId, input.providerId)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_time_off (id, organization_id, provider_id, starts_at, ends_at, kind, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        organizationId,
        input.providerId ?? null,
        input.startsAt,
        input.endsAt,
        input.kind,
        clean(input.note),
      ]
    )
    const all = await this.listTimeOff(organizationId)
    return (
      all.find((entry) => entry.id === id) ?? {
        id,
        providerId: input.providerId ?? null,
        startsAt: new Date(input.startsAt).toISOString(),
        endsAt: new Date(input.endsAt).toISOString(),
        kind: input.kind,
        note: clean(input.note),
      }
    )
  }

  async deleteTimeOff(organizationId: string, id: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM booking_time_off WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [organizationId, id]
    )
    if (result.rows.length === 0) throw BOOKING_ERRORS.notFound("Time off")
  }

  // ---- When a time is free ----

  // Everything that holds time between two instants (with a day's margin either side, so a
  // booking's free minutes after it are never missed).
  private async dayContext(
    organizationId: string,
    from: number,
    to: number,
    ignoreBookingId?: string | null
  ): Promise<DayContext> {
    const [bookings, services, timeOff, links, resources] = await Promise.all([
      this.db.query<Row>(
        `SELECT id, provider_id, service_id, starts_at, ends_at, party_size, status,
                payment_expires_at, paid_online FROM bookings
          WHERE organization_id = $1 AND starts_at < $3 AND ends_at > $2`,
        [organizationId, new Date(from - DAY_MS).toISOString(), new Date(to + DAY_MS).toISOString()]
      ),
      this.db.query<Row>(
        `SELECT id, buffer_minutes FROM booking_services WHERE organization_id = $1`,
        [organizationId]
      ),
      this.db.query<Row>(
        `SELECT provider_id, starts_at, ends_at FROM booking_time_off
          WHERE organization_id = $1 AND starts_at < $3 AND ends_at > $2`,
        [organizationId, new Date(from).toISOString(), new Date(to).toISOString()]
      ),
      this.db.query<Row>(
        `SELECT service_id, resource_id FROM booking_service_resources WHERE organization_id = $1`,
        [organizationId]
      ),
      this.db.query<Row>(
        `SELECT id, quantity, is_active, deleted_at FROM booking_resources
          WHERE organization_id = $1`,
        [organizationId]
      ),
    ])
    // A resource that was stopped or removed no longer holds anything back.
    const stock = new Map(
      resources.rows
        .filter((row) => row.is_active === true && !row.deleted_at)
        .map((row) => [String(row.id), Number(row.quantity)])
    )
    const needs = new Map<string, string[]>()
    for (const link of links.rows) {
      if (!stock.has(String(link.resource_id))) continue
      const key = String(link.service_id)
      needs.set(key, [...(needs.get(key) ?? []), String(link.resource_id)])
    }
    const buffer = new Map(
      services.rows.map((row) => [String(row.id), Number(row.buffer_minutes) * MINUTE])
    )
    return {
      bookings: bookings.rows
        .filter((row) => HOLDING.includes(row.status as BookingStatus))
        .filter((row) => row.id !== ignoreBookingId)
        // An online booking still unpaid after its hold has let go of its time.
        .filter((row) => !this.holdLapsed(row))
        .map((row) => ({
          id: String(row.id),
          providerId: String(row.provider_id),
          serviceId: String(row.service_id),
          start: ms(row.starts_at),
          heldUntil: ms(row.ends_at) + (buffer.get(String(row.service_id)) ?? 0),
          partySize: Number(row.party_size),
        })),
      timeOff: timeOff.rows.map((row) => ({
        providerId: text(row.provider_id),
        start: ms(row.starts_at),
        end: ms(row.ends_at),
      })),
      needs,
      stock,
    }
  }

  private holdLapsed(row: Row): boolean {
    return (
      row.status === "pending" &&
      Boolean(row.payment_expires_at) &&
      Number(row.paid_online ?? 0) === 0 &&
      ms(row.payment_expires_at) <= this.now().getTime()
    )
  }

  // Cancels the online bookings that were never paid for within their hold, so they leave the
  // calendar and give back whatever they used (a coupon's use, a gift card's amount).
  private async releaseUnpaid(organizationId: string): Promise<void> {
    const waiting = await this.db.query<Row>(
      `SELECT id, status, payment_expires_at, paid_online FROM bookings
        WHERE organization_id = $1 AND status = 'pending' AND payment_expires_at IS NOT NULL`,
      [organizationId]
    )
    for (const row of waiting.rows) {
      if (!this.holdLapsed(row)) continue
      await this.setStatus(organizationId, String(row.id), "cancelled", {
        by: "customer",
        reason: "unpaid",
      }).catch((error: unknown) => console.error("booking.release_unpaid_failed", error))
    }
  }

  // What is asked for online at booking, for a price: nothing, a share of it, or all of it.
  private onlineDue(settings: BookingSettingsView, total: number): number {
    if (settings.paymentMode === "off" || total <= 0) return 0
    if (!settings.moyasarPublishableKey || !settings.moyasarSecretSet) return 0
    if (settings.paymentMode === "full") return total
    return Math.max(1, Math.round(total * settings.depositPercent) / 100)
  }

  // The places a provider has left for a service at a start time: 0 when it cannot be taken.
  private placesLeft(
    context: DayContext,
    provider: BookingProviderView,
    service: BookingServiceView,
    start: number,
    options: { withinHours: boolean }
  ): number {
    const end = start + service.durationMinutes * MINUTE
    if (options.withinHours) {
      const day = dayOf(start)
      const from = minuteOfDay(start)
      const until = from + service.durationMinutes
      const fits = provider.hours.some(
        (period) =>
          period.weekday === weekdayOf(day) &&
          from >= period.startMinute &&
          until <= period.endMinute
      )
      if (!fits) return 0
      const off = context.timeOff.some(
        (entry) =>
          (entry.providerId === null || entry.providerId === provider.id) &&
          start < entry.end &&
          entry.start < end
      )
      if (off) return 0
    }
    const heldUntil = end + service.bufferMinutes * MINUTE
    let used = 0
    for (const booking of context.bookings) {
      if (booking.providerId !== provider.id) continue
      if (!(start < booking.heldUntil && booking.start < heldUntil)) continue
      // Sharing a group session's slot is the only overlap allowed.
      if (service.capacity > 1 && booking.serviceId === service.id && booking.start === start) {
        used += booking.partySize
        continue
      }
      return 0
    }
    // The rooms and equipment the service needs: one of each, free for the same stretch of
    // time. People sharing a group session share its room, so that session counts once.
    for (const resourceId of context.needs.get(service.id) ?? []) {
      const sessions = new Set<string>()
      for (const booking of context.bookings) {
        if (!(context.needs.get(booking.serviceId) ?? []).includes(resourceId)) continue
        if (!(start < booking.heldUntil && booking.start < heldUntil)) continue
        const sharing =
          service.capacity > 1 &&
          booking.providerId === provider.id &&
          booking.serviceId === service.id &&
          booking.start === start
        if (!sharing) sessions.add(`${booking.providerId}:${booking.serviceId}:${booking.start}`)
      }
      if (sessions.size >= (context.stock.get(resourceId) ?? 0)) return 0
    }
    return Math.max(0, service.capacity - used)
  }

  // The service as long as the chosen option and add-ons make it -- what has to fit in a slot.
  private sized(
    service: BookingServiceView,
    optionId?: string | null,
    addonIds?: string[] | null
  ): BookingServiceView {
    const option = service.options.find((entry) => entry.id === optionId)
    const extra = service.addons
      .filter((addon) => (addonIds ?? []).includes(addon.id))
      .reduce((total, addon) => total + addon.extraMinutes, 0)
    return {
      ...service,
      durationMinutes: (option ? option.durationMinutes : service.durationMinutes) + extra,
    }
  }

  // The start times that can be booked on a day, for one provider or for any of them.
  async availability(
    organizationId: string,
    query: {
      serviceId: string
      date: string
      providerId?: string
      partySize?: number
      ignoreBookingId?: string
      optionId?: string
      addonIds?: string[]
    },
    // The public page keeps to the notice and advance rules; staff see every free time.
    options: { online: boolean }
  ): Promise<{ date: string; slots: SlotView[] }> {
    const [settings, whole, providers] = await Promise.all([
      this.getSettings(organizationId),
      this.service(organizationId, query.serviceId),
      this.listProviders(organizationId),
    ])
    const service = this.sized(whole, query.optionId, query.addonIds)
    const candidates = providers.filter(
      (provider) =>
        provider.isActive &&
        provider.serviceIds.includes(service.id) &&
        (!query.providerId || provider.id === query.providerId)
    )
    const partySize = query.partySize ?? 1
    const start = dayStart(query.date)
    const now = this.now().getTime()
    const empty = { date: query.date, slots: [] as SlotView[] }
    if (candidates.length === 0 || !service.isActive) return empty
    if (options.online) {
      const lastDay = dayStart(dayOf(now)) + settings.advanceDays * DAY_MS
      if (start > lastDay) return empty
    }
    const earliest = options.online ? now + settings.leadTimeMinutes * MINUTE : now
    const context = await this.dayContext(
      organizationId,
      start,
      start + DAY_MS,
      query.ignoreBookingId
    )
    const weekday = weekdayOf(query.date)
    const load = new Map<string, number>()
    for (const booking of context.bookings) {
      if (dayOf(booking.start) !== query.date) continue
      load.set(booking.providerId, (load.get(booking.providerId) ?? 0) + 1)
    }

    const slots = new Map<number, SlotView>()
    for (const provider of candidates) {
      for (const period of provider.hours.filter((entry) => entry.weekday === weekday)) {
        for (
          let minute = period.startMinute;
          minute + service.durationMinutes <= period.endMinute;
          minute += settings.slotIntervalMinutes
        ) {
          const instant = start + minute * MINUTE
          if (instant < earliest) continue
          const left = this.placesLeft(context, provider, service, instant, { withinHours: true })
          if (left < partySize) continue
          const slot = slots.get(instant) ?? {
            startsAt: new Date(instant).toISOString(),
            time: clock(minute),
            providerIds: [],
            remaining: 0,
          }
          slot.providerIds.push(provider.id)
          slot.remaining = Math.max(slot.remaining, left)
          slots.set(instant, slot)
        }
      }
    }
    const ordered = [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, slot]) => slot)
    for (const slot of ordered) {
      slot.providerIds.sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))
    }
    return { date: query.date, slots: ordered }
  }

  // ---- Bookings ----

  private async views(organizationId: string, rows: Row[]): Promise<BookingView[]> {
    if (rows.length === 0) return []
    const [services, providers] = await Promise.all([
      this.db.query<Row>(
        `SELECT id, name, color FROM booking_services WHERE organization_id = $1`,
        [organizationId]
      ),
      this.db.query<Row>(`SELECT id, name FROM booking_providers WHERE organization_id = $1`, [
        organizationId,
      ]),
    ])
    const service = new Map(services.rows.map((row) => [String(row.id), row]))
    const provider = new Map(providers.rows.map((row) => [String(row.id), String(row.name)]))
    return rows.map((row) => ({
      id: String(row.id),
      number: Number(row.number),
      serviceId: String(row.service_id),
      serviceName: String(service.get(String(row.service_id))?.name ?? ""),
      serviceColor: text(service.get(String(row.service_id))?.color),
      providerId: String(row.provider_id),
      providerName: provider.get(String(row.provider_id)) ?? "",
      customerId: text(row.customer_id),
      customerName: String(row.customer_name),
      customerPhone: text(row.customer_phone),
      partySize: Number(row.party_size),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      price: Number(row.price),
      status: row.status as BookingStatus,
      paymentStatus: row.payment_status === "paid" ? "paid" : "unpaid",
      paymentMethod: text(row.payment_method),
      source: row.source === "online" ? "online" : "staff",
      notes: text(row.notes),
      customerNotes: text(row.customer_notes),
      cancelReason: text(row.cancel_reason),
      cancelledBy: text(row.cancelled_by),
      publicToken: String(row.public_token),
      createdAt: iso(row.created_at),
      optionName: text(row.option_name),
      addons: parseJsonList<{ id: string; name: string; price: number }>(row.addons),
      subtotal: Number(row.subtotal ?? row.price),
      discount: Number(row.discount ?? 0),
      couponCode: text(row.coupon_code),
      giftAmount: Number(row.gift_amount ?? 0),
      loyaltyPoints: Number(row.loyalty_points ?? 0),
      loyaltyDiscount: Number(row.loyalty_discount ?? 0),
      loyaltyEarned: Number(row.loyalty_earned ?? 0),
      customerPlanId: text(row.customer_plan_id),
      commissionAmount: Number(row.commission_amount ?? 0),
      invoiceId: text(row.invoice_id),
      invoiceNumber: text(row.invoice_number),
      confirmationSentAt: row.confirmation_sent_at ? iso(row.confirmation_sent_at) : null,
      reminderSentAt: row.reminder_sent_at ? iso(row.reminder_sent_at) : null,
      seriesId: text(row.series_id),
      paymentDue: Number(row.payment_due ?? 0),
      paidOnline: Number(row.paid_online ?? 0),
      refundedOnline: Number(row.refunded_online ?? 0),
      paymentExpiresAt: row.payment_expires_at ? iso(row.payment_expires_at) : null,
    }))
  }

  async listBookings(
    organizationId: string,
    filters: {
      from?: string
      to?: string
      status?: BookingStatus
      providerId?: string
      search?: string
    } = {}
  ): Promise<BookingView[]> {
    await this.releaseUnpaid(organizationId)
    const values: unknown[] = [organizationId]
    const conditions = ["organization_id = $1"]
    if (filters.from) {
      values.push(new Date(dayStart(filters.from)).toISOString())
      conditions.push(`starts_at >= $${values.length}`)
    }
    if (filters.to) {
      values.push(new Date(dayStart(filters.to) + DAY_MS).toISOString())
      conditions.push(`starts_at < $${values.length}`)
    }
    if (filters.status) {
      values.push(filters.status)
      conditions.push(`status = $${values.length}`)
    }
    if (filters.providerId) {
      values.push(filters.providerId)
      conditions.push(`provider_id = $${values.length}`)
    }
    const result = await this.db.query<Row>(
      `SELECT * FROM bookings WHERE ${conditions.join(" AND ")} ORDER BY starts_at ASC LIMIT 2000`,
      values
    )
    const needle = filters.search?.trim().toLowerCase()
    const digits = needle?.replace(/\D/g, "")
    const rows = needle
      ? result.rows.filter(
          (row) =>
            String(row.customer_name).toLowerCase().includes(needle) ||
            String(row.number) === needle ||
            (digits
              ? String(row.customer_phone ?? "")
                  .replace(/\D/g, "")
                  .includes(digits)
              : false)
        )
      : result.rows
    return this.views(organizationId, rows)
  }

  private async bookingRow(organizationId: string, id: string): Promise<Row> {
    const result = await this.db.query<Row>(
      `SELECT * FROM bookings WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!result.rows[0]) throw BOOKING_ERRORS.notFound("Booking")
    return result.rows[0]
  }

  async getBooking(organizationId: string, id: string): Promise<BookingView> {
    return (await this.views(organizationId, [await this.bookingRow(organizationId, id)]))[0]
  }

  // The provider who takes a booking: the one asked for, or the least busy one who is free.
  private async chooseProvider(
    organizationId: string,
    service: BookingServiceView,
    start: number,
    input: { providerId?: string | null; partySize: number; force: boolean },
    ignoreBookingId?: string
  ): Promise<BookingProviderView> {
    const providers = (await this.listProviders(organizationId)).filter(
      (provider) => provider.isActive && provider.serviceIds.includes(service.id)
    )
    const asked = input.providerId
      ? providers.find((provider) => provider.id === input.providerId)
      : null
    if (input.providerId && !asked) {
      throw BOOKING_ERRORS.invalid(
        "BOOKING_PROVIDER_NOT_FOR_SERVICE",
        "That provider does not offer this service."
      )
    }
    const candidates = asked ? [asked] : providers
    if (candidates.length === 0) {
      throw BOOKING_ERRORS.invalid("BOOKING_NO_PROVIDER", "No provider offers this service.")
    }
    const context = await this.dayContext(organizationId, start, start + DAY_MS, ignoreBookingId)
    const load = (provider: BookingProviderView) =>
      context.bookings.filter(
        (booking) => booking.providerId === provider.id && dayOf(booking.start) === dayOf(start)
      ).length
    const free = candidates
      .filter(
        (provider) =>
          this.placesLeft(context, provider, service, start, { withinHours: true }) >=
          input.partySize
      )
      .sort((a, b) => load(a) - load(b))
    if (free[0]) return free[0]
    // Staff may book over the rules, with the provider they named (or the first, if none).
    if (input.force) return candidates[0]
    throw BOOKING_ERRORS.conflict("BOOKING_TIME_TAKEN", "That time is no longer available.")
  }

  // The customers list entry behind a booking: the one named, the one with that phone, or a new
  // one. A failure here must not lose the booking, so it falls back to no link.
  private async customerFor(
    organizationId: string,
    workspaceId: string | null,
    input: { customerId?: string | null; name: string; phone: string | null },
    createdBy: string | null
  ): Promise<string | null> {
    try {
      if (input.customerId) {
        const found = await this.db.query(
          `SELECT id FROM customers WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [organizationId, input.customerId]
        )
        if (found.rows[0]) return input.customerId
      }
      if (input.phone) {
        const same = await this.db.query<Row>(
          `SELECT id FROM customers
            WHERE organization_id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
          [organizationId, input.phone]
        )
        if (same.rows[0]) return String(same.rows[0].id)
      }
      const id = randomUUID()
      await this.db.query(
        `INSERT INTO customers (id, organization_id, workspace_id, name, phone, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, organizationId, workspaceId, input.name, input.phone, createdBy]
      )
      return id
    } catch (error) {
      console.error("booking.customer_link_failed", { organizationId, error })
      return null
    }
  }

  async createBooking(
    organizationId: string,
    input: CreateInput & { customerNotes?: string | null },
    context: {
      source: "staff" | "online"
      userId: string | null
      workspaceId: string | null
      seriesId?: string | null
    }
  ): Promise<BookingView> {
    // Bookings never paid for within their hold are let go first, so the time one of them held
    // is not shown twice.
    await this.releaseUnpaid(organizationId)
    const settings = await this.getSettings(organizationId)
    const whole = await this.service(organizationId, input.serviceId)
    if (!whole.isActive) {
      throw BOOKING_ERRORS.invalid("BOOKING_SERVICE_INACTIVE", "That service is not offered now.")
    }
    const service = this.sized(whole, input.optionId, input.addonIds)
    const start = new Date(input.startsAt).getTime()
    const online = context.source === "online"
    const force = !online && input.force
    if (online) {
      const now = this.now().getTime()
      if (service.visibility !== "published") throw BOOKING_ERRORS.notFound("Service")
      if (start < now + settings.leadTimeMinutes * MINUTE) {
        throw BOOKING_ERRORS.conflict("BOOKING_TOO_SOON", "That time is too soon to book.")
      }
      if (start > dayStart(dayOf(now)) + (settings.advanceDays + 1) * DAY_MS) {
        throw BOOKING_ERRORS.conflict("BOOKING_TOO_FAR", "That time is too far ahead to book.")
      }
    }
    if (input.partySize > service.capacity) {
      throw BOOKING_ERRORS.invalid("BOOKING_PARTY_TOO_LARGE", "Too many people for one booking.", {
        capacity: service.capacity,
      })
    }
    const provider = await this.chooseProvider(organizationId, service, start, {
      providerId: input.providerId,
      partySize: input.partySize,
      force,
    })
    const phone = clean(input.customerPhone)
    const customerId = await this.customerFor(
      organizationId,
      provider.workspaceId ?? context.workspaceId,
      { customerId: input.customerId, name: input.customerName, phone },
      context.userId
    )
    // The price, worked out the same way the customer was shown it. A package and points belong
    // to a known customer, so only the staff can use them.
    const quote = await this.extras.quote(organizationId, {
      service: whole,
      partySize: input.partySize,
      optionId: input.optionId,
      addonIds: input.addonIds,
      couponCode: input.couponCode,
      giftCode: input.giftCode,
      customerPlanId: online ? null : input.customerPlanId,
      redeemPoints: online ? null : input.redeemPoints,
      customerId,
      customerPhone: phone,
      day: dayOf(start),
    })
    // What a customer booking online has to pay before the booking stands.
    const due = online ? this.onlineDue(settings, quote.total) : 0
    const numbered = await this.db.query<Row>(
      `SELECT COALESCE(MAX(number), 0) AS last FROM bookings WHERE organization_id = $1`,
      [organizationId]
    )
    const id = randomUUID()
    // What the booking uses up is taken before it is written, so a spent gift card or an empty
    // package refuses the booking instead of leaving one that was never paid for.
    await this.extras.take(organizationId, this.usedBy(id, customerId, input.partySize, quote))
    await this.db.query(
      `INSERT INTO bookings
         (id, organization_id, workspace_id, number, service_id, provider_id, customer_id,
          customer_name, customer_phone, party_size, starts_at, ends_at, price, status, source,
          notes, customer_notes, public_token, created_by, option_id, option_name, addons,
          subtotal, discount, coupon_id, coupon_code, gift_card_id, gift_amount, customer_plan_id,
          loyalty_points, loyalty_discount, payment_status, series_id, payment_due,
          payment_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22::jsonb, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
               $34, $35)`,
      [
        id,
        organizationId,
        provider.workspaceId ?? context.workspaceId,
        Number(numbered.rows[0]?.last ?? 0) + 1,
        service.id,
        provider.id,
        customerId,
        input.customerName,
        phone,
        input.partySize,
        new Date(start).toISOString(),
        new Date(start + service.durationMinutes * MINUTE).toISOString(),
        quote.total,
        (online && !settings.autoConfirm) || due > 0 ? "pending" : "confirmed",
        context.source,
        online ? null : clean(input.notes),
        online ? clean(input.customerNotes ?? input.notes) : null,
        randomBytes(24).toString("base64url"),
        context.userId,
        quote.optionId,
        quote.optionName,
        JSON.stringify(quote.addons),
        quote.subtotal,
        quote.discount,
        quote.coupon?.id ?? null,
        quote.coupon?.code ?? null,
        quote.gift?.id ?? null,
        quote.giftAmount,
        quote.customerPlanId,
        quote.loyaltyPoints,
        quote.loyaltyDiscount,
        // Nothing left to pay (a package, a gift card or points covered it): it is paid.
        quote.total === 0 && quote.subtotal > 0 ? "paid" : "unpaid",
        context.seriesId ?? null,
        due,
        due > 0
          ? new Date(this.now().getTime() + PAYMENT_HOLD_MINUTES * MINUTE).toISOString()
          : null,
      ]
    )
    if (!(online && !settings.autoConfirm) && due === 0) {
      this.after(this.hooks.confirmed?.(organizationId, id), "confirmation", id)
    }
    return this.getBooking(organizationId, id)
  }

  // A booking that repeats: the same visit every so many weeks, a number of times. Each visit is
  // a booking of its own, made the ordinary way, so each keeps to the free times -- a week where
  // the time is taken is left out and reported, and the rest are still made. A coupon, a gift
  // card and points apply to the first visit only (they are one-off by nature); a package pays
  // for every visit it still has room for.
  async createSeries(
    organizationId: string,
    input: CreateInput & { everyWeeks: number; count: number },
    context: { userId: string | null; workspaceId: string | null }
  ): Promise<{
    seriesId: string
    created: BookingView[]
    skipped: Array<{ startsAt: string; code: string }>
  }> {
    const seriesId = randomUUID()
    const first = new Date(input.startsAt).getTime()
    const created: BookingView[] = []
    const skipped: Array<{ startsAt: string; code: string }> = []
    for (let index = 0; index < input.count; index += 1) {
      const startsAt = new Date(first + index * input.everyWeeks * 7 * DAY_MS).toISOString()
      try {
        created.push(
          await this.createBooking(
            organizationId,
            {
              ...input,
              startsAt,
              // Keep the provider the first visit got, so the series stays with one person.
              providerId: created[0]?.providerId ?? input.providerId,
              couponCode: index === 0 ? input.couponCode : null,
              giftCode: index === 0 ? input.giftCode : null,
              redeemPoints: index === 0 ? input.redeemPoints : null,
            },
            { source: "staff", ...context, seriesId }
          )
        )
      } catch (error) {
        // The first visit failing is the whole request failing; a later one is only left out.
        if (index === 0 || !(error instanceof IdentityError)) throw error
        skipped.push({ startsAt, code: error.code })
      }
    }
    return { seriesId, created, skipped }
  }

  // Cancels what is still to come of a series: the visits not yet started and not yet finished.
  async cancelSeries(organizationId: string, seriesId: string): Promise<{ cancelled: number }> {
    const rows = await this.db.query<Row>(
      `SELECT id, status, starts_at FROM bookings WHERE organization_id = $1 AND series_id = $2`,
      [organizationId, seriesId]
    )
    const now = this.now().getTime()
    let cancelled = 0
    for (const row of rows.rows) {
      const open = row.status === "pending" || row.status === "confirmed"
      if (!open || ms(row.starts_at) <= now) continue
      await this.setStatus(organizationId, String(row.id), "cancelled", { by: "staff" })
      cancelled += 1
    }
    return { cancelled }
  }

  // ---- The waiting list ----

  async listWaitlist(organizationId: string): Promise<WaitlistView[]> {
    const [entries, services, providers] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM booking_waitlist WHERE organization_id = $1 AND status = 'waiting'
          ORDER BY preferred_date ASC, created_at ASC LIMIT 300`,
        [organizationId]
      ),
      this.listServices(organizationId),
      this.listProviders(organizationId),
    ])
    const today = dayOf(this.now().getTime())
    const views: WaitlistView[] = []
    // The free times of one service on one day are worked out once, however many wait for it.
    const open = new Map<string, string | null>()
    for (const row of entries.rows) {
      const day =
        row.preferred_date instanceof Date
          ? row.preferred_date.toISOString().slice(0, 10)
          : String(row.preferred_date).slice(0, 10)
      const service = services.find((entry) => entry.id === row.service_id)
      const providerId = text(row.provider_id)
      const key = `${String(row.service_id)}:${providerId ?? ""}:${day}`
      if (!open.has(key)) {
        const slots =
          service && day >= today
            ? (
                await this.availability(
                  organizationId,
                  { serviceId: service.id, date: day, providerId: providerId ?? undefined },
                  { online: false }
                )
              ).slots
            : []
        open.set(key, slots[0]?.startsAt ?? null)
      }
      views.push({
        id: String(row.id),
        serviceId: String(row.service_id),
        serviceName: service?.name ?? "",
        providerId,
        providerName: providers.find((entry) => entry.id === providerId)?.name ?? null,
        customerName: String(row.customer_name),
        customerPhone: text(row.customer_phone),
        preferredDate: day,
        note: text(row.note),
        status: "waiting",
        source: row.source === "online" ? "online" : "staff",
        createdAt: iso(row.created_at),
        openTime: open.get(key) ?? null,
      })
    }
    return views
  }

  async addToWaitlist(
    organizationId: string,
    input: {
      serviceId: string
      providerId?: string | null
      customerName: string
      customerPhone?: string | null
      preferredDate: string
      note?: string | null
    },
    source: "staff" | "online"
  ): Promise<{ id: string }> {
    const service = await this.service(organizationId, input.serviceId)
    if (source === "online" && service.visibility !== "published") {
      throw BOOKING_ERRORS.notFound("Service")
    }
    const phone = clean(input.customerPhone)
    // Asking twice for the same service and day keeps one place, not two.
    const same = await this.db.query<Row>(
      `SELECT id, customer_phone FROM booking_waitlist
        WHERE organization_id = $1 AND service_id = $2 AND preferred_date = $3
          AND status = 'waiting'`,
      [organizationId, service.id, input.preferredDate]
    )
    const existing = same.rows.find((row) => phone !== null && row.customer_phone === phone)
    if (existing) return { id: String(existing.id) }
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO booking_waitlist
         (id, organization_id, service_id, provider_id, customer_name, customer_phone,
          preferred_date, note, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        organizationId,
        service.id,
        input.providerId ?? null,
        input.customerName,
        phone,
        input.preferredDate,
        clean(input.note),
        source,
      ]
    )
    return { id }
  }

  // Off the list: given a booking, or taken off.
  async closeWaitlist(
    organizationId: string,
    id: string,
    status: "booked" | "removed"
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE booking_waitlist SET status = $3
        WHERE organization_id = $1 AND id = $2 AND status = 'waiting' RETURNING id`,
      [organizationId, id, status]
    )
    if (result.rows.length === 0) throw BOOKING_ERRORS.notFound("Waiting list entry")
  }

  async publicJoinWaitlist(
    slug: string,
    input: {
      serviceId: string
      providerId?: string | null
      customerName: string
      customerPhone: string
      preferredDate: string
    }
  ) {
    const { organizationId } = await this.organizationBySlug(slug)
    await this.appIsOn(organizationId)
    return this.addToWaitlist(organizationId, input, "online")
  }

  // What a booking uses up, in the shape `extras.take` and `extras.release` read.
  private usedBy(id: string, customerId: string | null, partySize: number, quote: Quote): Row {
    return {
      id,
      customer_id: customerId,
      party_size: partySize,
      customer_plan_id: quote.customerPlanId,
      gift_card_id: quote.gift?.id ?? null,
      gift_amount: quote.giftAmount,
      loyalty_points: quote.loyaltyPoints,
      coupon_id: quote.coupon?.id ?? null,
    }
  }

  // The price of a booking before it is made, for the booking window and the public page.
  async quoteBooking(
    organizationId: string,
    input: {
      serviceId: string
      partySize: number
      optionId?: string | null
      addonIds?: string[]
      couponCode?: string | null
      giftCode?: string | null
      customerPlanId?: string | null
      redeemPoints?: number | null
      customerId?: string | null
      customerPhone?: string | null
      date?: string | null
    },
    options: { online: boolean }
  ): Promise<Quote> {
    const service = await this.service(organizationId, input.serviceId)
    return this.extras.quote(organizationId, {
      service,
      partySize: input.partySize,
      optionId: input.optionId,
      addonIds: input.addonIds,
      couponCode: input.couponCode,
      giftCode: input.giftCode,
      customerPlanId: options.online ? null : input.customerPlanId,
      redeemPoints: options.online ? null : input.redeemPoints,
      customerId: input.customerId,
      customerPhone: clean(input.customerPhone),
      day: input.date ?? dayOf(this.now().getTime()),
    })
  }

  // What the staff need to know about a customer while booking: their packages and points.
  async lookupCustomer(organizationId: string, phone: string) {
    const typed = phone.trim()
    const found = await this.db.query<Row>(
      `SELECT id, name FROM customers
        WHERE organization_id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
      [organizationId, typed]
    )
    const customer = found.rows[0]
    const customerId = customer ? String(customer.id) : null
    const plans = (
      await this.extras.listCustomerPlans(organizationId, { phone: typed, customerId })
    ).filter((plan) => plan.usable)
    return {
      customerId,
      name: customer ? String(customer.name) : null,
      points: customerId ? await this.extras.pointsOf(organizationId, customerId) : 0,
      plans,
    }
  }

  async rescheduleBooking(
    organizationId: string,
    id: string,
    input: { startsAt: string; providerId?: string | null; force: boolean }
  ): Promise<BookingView> {
    const row = await this.bookingRow(organizationId, id)
    if (row.status === "cancelled" || row.status === "completed") {
      throw BOOKING_ERRORS.conflict(
        "BOOKING_NOT_OPEN",
        "A finished or cancelled booking cannot be moved."
      )
    }
    const service = this.sized(
      await this.service(organizationId, String(row.service_id)),
      text(row.option_id),
      parseJsonList<{ id: string }>(row.addons).map((addon) => addon.id)
    )
    const start = new Date(input.startsAt).getTime()
    const provider = await this.chooseProvider(
      organizationId,
      service,
      start,
      {
        providerId: input.providerId ?? String(row.provider_id),
        partySize: Number(row.party_size),
        force: input.force,
      },
      id
    )
    await this.db.query(
      `UPDATE bookings SET starts_at = $3, ends_at = $4, provider_id = $5, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        new Date(start).toISOString(),
        new Date(start + service.durationMinutes * MINUTE).toISOString(),
        provider.id,
      ]
    )
    return this.getBooking(organizationId, id)
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: BookingStatus,
    options: { reason?: string | null; by: "staff" | "customer"; userId?: string | null }
  ): Promise<BookingView> {
    const row = await this.bookingRow(organizationId, id)
    const current = row.status as BookingStatus
    if (current === status) return this.getBooking(organizationId, id)
    // Bringing a cancelled booking back must find its time still free.
    if (current === "cancelled") {
      const service = this.sized(
        await this.service(organizationId, String(row.service_id)),
        text(row.option_id),
        parseJsonList<{ id: string }>(row.addons).map((addon) => addon.id)
      )
      const provider = await this.provider(organizationId, String(row.provider_id))
      const start = ms(row.starts_at)
      const context = await this.dayContext(organizationId, start, start + DAY_MS, id)
      const left = this.placesLeft(context, provider, service, start, { withinHours: false })
      if (left < Number(row.party_size)) {
        throw BOOKING_ERRORS.conflict("BOOKING_TIME_TAKEN", "That time is no longer available.")
      }
      // ...and takes again what it used: the package visit, the gift card amount, the points.
      await this.extras.take(organizationId, row)
    }
    // A cancelled booking gives back what it used.
    if (status === "cancelled") await this.extras.release(organizationId, row)

    // A finished visit earns the customer points and the provider their share. Leaving
    // "completed" takes both back.
    let earned = Number(row.loyalty_earned ?? 0)
    let commission = Number(row.commission_amount ?? 0)
    if (current === "completed") {
      await this.extras.unearn(organizationId, row)
      earned = 0
      commission = 0
    }
    if (status === "completed") {
      earned = await this.extras.earn(organizationId, row)
      const provider = (await this.listProviders(organizationId)).find(
        (entry) => entry.id === row.provider_id
      )
      // On what the visit was sold for, after its discount.
      const sold = Number(row.subtotal ?? row.price) - Number(row.discount ?? 0)
      commission = Math.round(sold * (provider?.commissionRate ?? 0)) / 100
    }
    await this.db.query(
      `UPDATE bookings SET status = $3, cancel_reason = $4, cancelled_by = $5,
              loyalty_earned = $6, commission_amount = $7, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        status,
        status === "cancelled" ? clean(options.reason) : null,
        status === "cancelled" ? options.by : null,
        earned,
        commission,
      ]
    )
    if (status === "confirmed") {
      this.after(this.hooks.confirmed?.(organizationId, id), "confirmation", id)
    }
    if (status === "completed") {
      // Waited for, so the answer already carries the invoice -- but never allowed to undo the
      // completion if the invoice cannot be issued.
      await this.hooks
        .completed?.(organizationId, id, options.userId ?? null)
        .catch((error: unknown) =>
          console.error("booking.invoice_failed", { bookingId: id, error })
        )
    }
    return this.getBooking(organizationId, id)
  }

  async setPayment(
    organizationId: string,
    id: string,
    input: { paid: boolean; method?: string | null }
  ): Promise<BookingView> {
    await this.bookingRow(organizationId, id)
    await this.db.query(
      `UPDATE bookings SET payment_status = $3, payment_method = $4, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, input.paid ? "paid" : "unpaid", input.paid ? clean(input.method) : null]
    )
    return this.getBooking(organizationId, id)
  }

  async setNotes(organizationId: string, id: string, notes: string | null): Promise<BookingView> {
    await this.bookingRow(organizationId, id)
    await this.db.query(
      `UPDATE bookings SET notes = $3, updated_at = now() WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, clean(notes)]
    )
    return this.getBooking(organizationId, id)
  }

  // ---- Overview ----

  async overview(organizationId: string, range: { from: string; to: string }) {
    const bookings = await this.listBookings(organizationId, range)
    const live = bookings.filter((booking) => booking.status !== "cancelled")
    const count = (status: BookingStatus) =>
      bookings.filter((booking) => booking.status === status).length
    const sum = (list: BookingView[]) => list.reduce((total, booking) => total + booking.price, 0)
    const group = <K extends string>(key: (booking: BookingView) => K) => {
      const groups = new Map<K, BookingView[]>()
      for (const booking of live) {
        groups.set(key(booking), [...(groups.get(key(booking)) ?? []), booking])
      }
      return groups
    }
    const minutes = (list: BookingView[]) =>
      list.reduce(
        (total, booking) => total + (ms(booking.endsAt) - ms(booking.startsAt)) / MINUTE,
        0
      )
    const today = dayOf(this.now().getTime())
    const todays = (await this.listBookings(organizationId, { from: today, to: today })).filter(
      (booking) => booking.status !== "cancelled"
    )
    const hours = new Array<number>(24).fill(0)
    for (const booking of live) hours[Math.floor(minuteOfDay(ms(booking.startsAt)) / 60)] += 1

    return {
      range,
      totals: {
        bookings: bookings.length,
        pending: count("pending"),
        confirmed: count("confirmed"),
        completed: count("completed"),
        cancelled: count("cancelled"),
        noShow: count("no_show"),
        online: bookings.filter((booking) => booking.source === "online").length,
        // What finished visits were worth, what is still to come, and what was collected.
        revenue: sum(bookings.filter((booking) => booking.status === "completed")),
        expected: sum(
          bookings.filter(
            (booking) => booking.status === "confirmed" || booking.status === "pending"
          )
        ),
        collected: sum(live.filter((booking) => booking.paymentStatus === "paid")),
        // Taken off prices by coupons and points, and what providers earned on finished visits.
        discounts: live.reduce(
          (total, booking) =>
            total + (booking.customerPlanId ? 0 : booking.discount) + booking.loyaltyDiscount,
          0
        ),
        commissions: live.reduce((total, booking) => total + booking.commissionAmount, 0),
      },
      services: [...group((booking) => booking.serviceId).values()]
        .map((list) => ({ name: list[0].serviceName, bookings: list.length, value: sum(list) }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 8),
      providers: [...group((booking) => booking.providerId).values()]
        .map((list) => ({
          name: list[0].providerName,
          bookings: list.length,
          bookedMinutes: Math.round(minutes(list)),
          value: sum(list),
          commission: list.reduce((total, booking) => total + booking.commissionAmount, 0),
        }))
        .sort((a, b) => b.bookings - a.bookings),
      // Bookings by the hour they start, on the business's clock.
      hours,
      today: todays,
    }
  }

  // ---- The public booking page ----

  private async organizationBySlug(slug: string) {
    const result = await this.db.query<Row>(`SELECT * FROM booking_settings WHERE slug = $1`, [
      slug.trim().toLowerCase(),
    ])
    const row = result.rows[0]
    if (!row || row.online_enabled !== true) throw BOOKING_ERRORS.notFound("Booking page")
    return { organizationId: String(row.organization_id), settings: mapSettings(row) }
  }

  // Whether the organization still has the Booking app: a lapsed subscription closes the page.
  private async appIsOn(organizationId: string): Promise<{ name: string; logoUrl: string | null }> {
    const result = await this.db.query<Row>(
      `SELECT name, logo_url, settings FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const row = result.rows[0]
    const settings = (
      typeof row?.settings === "string" ? JSON.parse(row.settings) : (row?.settings ?? {})
    ) as Record<string, unknown>
    const trialEnd =
      typeof settings.bookingTrialEndsAt === "string" ? settings.bookingTrialEndsAt : null
    const lapsed = trialEnd !== null && new Date(trialEnd).getTime() <= this.now().getTime()
    if (!row || settings.bookingEnabled !== true || lapsed) {
      throw BOOKING_ERRORS.notFound("Booking page")
    }
    return { name: String(row.name), logoUrl: text(row.logo_url) }
  }

  async publicPage(slug: string) {
    const { organizationId, settings } = await this.organizationBySlug(slug)
    const organization = await this.appIsOn(organizationId)
    const [services, providers] = await Promise.all([
      this.listServices(organizationId),
      this.listProviders(organizationId),
    ])
    const active = providers.filter((provider) => provider.isActive)
    return {
      name: settings.displayName ?? organization.name,
      logoUrl: organization.logoUrl,
      description: settings.description,
      phone: settings.phone,
      address: settings.address,
      advanceDays: settings.advanceDays,
      cancellationAllowed: settings.cancellationAllowed,
      cancellationDeadlineMinutes: settings.cancellationDeadlineMinutes,
      autoConfirm: settings.autoConfirm,
      services: services
        .filter((service) => service.isActive && service.visibility === "published")
        // A service nobody provides cannot be booked, so it is not shown.
        .filter((service) => active.some((provider) => provider.serviceIds.includes(service.id)))
        .map((service) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          category: service.category,
          durationMinutes: service.durationMinutes,
          price: service.price,
          capacity: service.capacity,
          options: service.options,
          addons: service.addons,
          providerIds: active
            .filter((provider) => provider.serviceIds.includes(service.id))
            .map((provider) => provider.id),
        })),
      providers: active.map((provider) => ({
        id: provider.id,
        name: provider.name,
        title: provider.title,
      })),
      reviews: settings.reviewsEnabled ? await this.extras.publicReviews(organizationId) : null,
    }
  }

  async publicQuote(
    slug: string,
    input: {
      serviceId: string
      partySize: number
      optionId?: string | null
      addonIds?: string[]
      couponCode?: string | null
      giftCode?: string | null
      customerPhone?: string | null
      date?: string | null
    }
  ) {
    const { organizationId } = await this.organizationBySlug(slug)
    await this.appIsOn(organizationId)
    return this.quoteBooking(organizationId, input, { online: true })
  }

  async publicAvailability(
    slug: string,
    query: {
      serviceId: string
      date: string
      providerId?: string
      partySize?: number
      optionId?: string
      addonIds?: string[]
    }
  ) {
    const { organizationId } = await this.organizationBySlug(slug)
    await this.appIsOn(organizationId)
    const service = await this.service(organizationId, query.serviceId)
    if (service.visibility !== "published") throw BOOKING_ERRORS.notFound("Service")
    return this.availability(
      organizationId,
      {
        serviceId: query.serviceId,
        date: query.date,
        providerId: query.providerId,
        partySize: query.partySize,
        optionId: query.optionId,
        addonIds: query.addonIds,
      },
      { online: true }
    )
  }

  // What the customer sees of their own booking.
  private async publicView(row: Row) {
    const organizationId = String(row.organization_id)
    const [booking] = await this.views(organizationId, [row])
    const settings = await this.getSettings(organizationId)
    const organization = await this.db.query<Row>(
      `SELECT name, logo_url FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const open = booking.status === "pending" || booking.status === "confirmed"
    const deadline = ms(booking.startsAt) - settings.cancellationDeadlineMinutes * MINUTE
    return {
      number: booking.number,
      status: booking.status,
      serviceName: booking.serviceName,
      providerName: booking.providerName,
      customerName: booking.customerName,
      partySize: booking.partySize,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      price: booking.price,
      optionName: booking.optionName,
      addons: booking.addons.map((addon) => addon.name),
      subtotal: booking.subtotal,
      // Everything taken off the price, whatever took it off.
      reduction: Math.max(0, Math.round((booking.subtotal - booking.price) * 100) / 100),
      // Still to be paid online for the booking to stand: the amount, and what Moyasar's form
      // needs to take it. Gone once paid, cancelled or out of time.
      payment:
        booking.paymentDue > 0 &&
        booking.paidOnline === 0 &&
        booking.status === "pending" &&
        settings.moyasarPublishableKey &&
        (!booking.paymentExpiresAt || ms(booking.paymentExpiresAt) > this.now().getTime())
          ? {
              amount: booking.paymentDue,
              publishableKey: settings.moyasarPublishableKey,
              bookingId: booking.id,
              expiresAt: booking.paymentExpiresAt,
              full: booking.paymentDue >= booking.price,
            }
          : null,
      paidOnline: Math.round((booking.paidOnline - booking.refundedOnline) * 100) / 100,
      refundedOnline: booking.refundedOnline,
      // A finished visit can be reviewed, where the business takes reviews.
      canReview: booking.status === "completed" && settings.reviewsEnabled,
      review: await this.extras.reviewOf(booking.id),
      business: {
        name: settings.displayName ?? String(organization.rows[0]?.name ?? ""),
        logoUrl: text(organization.rows[0]?.logo_url),
        phone: settings.phone,
        address: settings.address,
        slug: settings.slug,
      },
      canCancel: open && settings.cancellationAllowed && this.now().getTime() <= deadline,
      cancelDeadline: new Date(deadline).toISOString(),
    }
  }

  async publicCreate(
    slug: string,
    input: {
      serviceId: string
      providerId?: string | null
      startsAt: string
      customerName: string
      customerPhone: string
      partySize: number
      notes?: string | null
      optionId?: string | null
      addonIds?: string[]
      couponCode?: string | null
      giftCode?: string | null
    }
  ) {
    const { organizationId } = await this.organizationBySlug(slug)
    await this.appIsOn(organizationId)
    const booking = await this.createBooking(
      organizationId,
      {
        serviceId: input.serviceId,
        providerId: input.providerId ?? null,
        startsAt: input.startsAt,
        customerId: null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        partySize: input.partySize,
        notes: input.notes ?? null,
        force: false,
        optionId: input.optionId ?? null,
        addonIds: input.addonIds ?? [],
        couponCode: input.couponCode ?? null,
        giftCode: input.giftCode ?? null,
        customerPlanId: null,
        redeemPoints: null,
      },
      { source: "online", userId: null, workspaceId: null }
    )
    const view = await this.publicView(await this.bookingRow(organizationId, booking.id))
    return { token: booking.publicToken, booking: view }
  }

  private async rowByToken(token: string): Promise<Row> {
    const found = await this.db.query<Row>(
      `SELECT organization_id FROM bookings WHERE public_token = $1`,
      [token]
    )
    if (found.rows[0]) await this.releaseUnpaid(String(found.rows[0].organization_id))
    const result = await this.db.query<Row>(`SELECT * FROM bookings WHERE public_token = $1`, [
      token,
    ])
    if (!result.rows[0]) throw BOOKING_ERRORS.notFound("Booking")
    return result.rows[0]
  }

  async publicBooking(token: string) {
    return this.publicView(await this.rowByToken(token))
  }

  async publicReview(token: string, input: { rating: number; comment?: string | null }) {
    const row = await this.rowByToken(token)
    const settings = await this.getSettings(String(row.organization_id))
    if (!settings.reviewsEnabled) {
      throw BOOKING_ERRORS.conflict("BOOKING_REVIEW_CLOSED", "Reviews are not taken.")
    }
    await this.extras.saveReview(row, input)
    return this.publicView(row)
  }

  async publicCancel(token: string) {
    const row = await this.rowByToken(token)
    const view = await this.publicView(row)
    if (view.status === "cancelled") return view
    if (!view.canCancel) {
      throw BOOKING_ERRORS.conflict(
        "BOOKING_CANCEL_CLOSED",
        "This booking can no longer be cancelled online."
      )
    }
    await this.setStatus(String(row.organization_id), String(row.id), "cancelled", {
      by: "customer",
    })
    return this.publicView(await this.rowByToken(token))
  }
}
