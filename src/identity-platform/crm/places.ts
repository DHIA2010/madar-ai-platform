import { createPublicKey, verify } from "node:crypto"

import { z } from "zod"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"
import { type Prospect, prospectMarks } from "./prospects"

// The sales team's free directory of Saudi businesses (Madar Admin -> CRM -> "البحث عن عملاء").
//
// Where it comes from: the Overture Maps Foundation's open "places" data (business pages from
// Meta, Foursquare, Microsoft and others, under licences that allow keeping and using it). The
// whole file is far too large for this server to read (12 GB, and reading it needs more memory
// than the server has), so a GitHub workflow (.github/workflows/saudi-places.yml) reads it once
// a month, keeps the Saudi rows and sends them here. That workflow proves who it is with the
// short-lived identity token GitHub gives every run: no password or key is stored anywhere.
//
// What is done with it: searched by activity, name, city or around a point (a mall, a street),
// with no limit on searches; the rows the team chooses become leads in the pipeline.

// The kinds of business the team looks for, each a set of the data's own categories.
export const PLACE_ACTIVITIES: Array<{ key: string; label: string; categories: string[] }> = [
  {
    key: "restaurants",
    label: "مطاعم",
    categories: [
      "restaurant",
      "casual_eatery",
      "fast_food_restaurant",
      "food_service",
      "food_truck_stand",
      "food_court",
      "food_and_drink",
    ],
  },
  {
    key: "cafes",
    label: "مقاهي وعصائر",
    categories: [
      "coffee_shop",
      "cafe",
      "smoothie_juice_bar",
      "non_alcoholic_beverage_venue",
      "lounge",
    ],
  },
  {
    key: "fashion",
    label: "ملابس وأزياء",
    categories: ["fashion_and_apparel_store", "department_store", "second_hand_store"],
  },
  {
    key: "salons",
    label: "صالونات وتجميل",
    categories: ["personal_or_beauty_service", "wellness_service"],
  },
  {
    key: "beauty_stores",
    label: "عطور ومستحضرات تجميل",
    categories: ["personal_care_and_beauty_store"],
  },
  {
    key: "groceries",
    label: "بقالات وأسواق غذائية",
    categories: [
      "food_and_beverage_store",
      "convenience_store",
      "warehouse_club_store",
      "superstore",
      "market",
      "farmers_market",
      "discount_store",
    ],
  },
  { key: "electronics", label: "إلكترونيات وجوالات", categories: ["electronics_store"] },
  { key: "home", label: "أثاث ومستلزمات منزلية", categories: ["hardware_home_and_garden_store"] },
  {
    key: "gifts",
    label: "ورد وهدايا وألعاب",
    categories: [
      "flowers_and_gifts_store",
      "toys_and_games_store",
      "arts_crafts_and_hobby_store",
      "books_music_and_video_store",
    ],
  },
  {
    key: "shops",
    label: "متاجر أخرى",
    categories: [
      "shopping",
      "specialty_store",
      "sporting_goods_store",
      "animal_and_pet_store",
      "office_supply_store",
      "wholesaler",
    ],
  },
  { key: "malls", label: "مولات ومراكز تسوق", categories: ["shopping_mall"] },
  { key: "pharmacies", label: "صيدليات", categories: ["pharmacy_and_drug_store"] },
  {
    key: "clinics",
    label: "عيادات ومراكز طبية",
    categories: [
      "dental_clinic",
      "outpatient_care_facility",
      "health_care",
      "hospital",
      "diagnostics_imaging_or_lab_service",
      "specialized_health_care",
      "medical_service",
      "vision_or_eye_care_clinic",
      "primary_care_or_general_clinic",
      "pediatric_clinic",
      "physical_medicine_and_rehabilitation",
      "behavioral_or_mental_health_clinic",
      "reproductive_perinatal_and_womens_care",
      "complementary_and_alternative_medicine",
    ],
  },
  {
    key: "automotive",
    label: "سيارات: ورش ومعارض وقطع غيار",
    categories: [
      "automotive_service",
      "auto_dealer",
      "vehicle_parts_store",
      "vehicle_dealer",
      "vehicle_service",
    ],
  },
  {
    key: "gyms",
    label: "أندية ومراكز رياضية",
    categories: ["gym", "sport_or_fitness_facility", "fitness_studio", "sport_or_recreation_club"],
  },
  {
    key: "hotels",
    label: "فنادق وشقق",
    categories: ["hotel", "lodging", "resort", "private_lodging", "bed_and_breakfast"],
  },
  { key: "laundry", label: "مغاسل", categories: ["laundry_service"] },
  { key: "events", label: "مناسبات وحفلات", categories: ["event_or_party_service", "event_venue"] },
  {
    key: "services",
    label: "خدمات منزلية ومهنية",
    categories: [
      "home_service",
      "professional_service",
      "technical_service",
      "printing_service",
      "design_service",
      "rental_service",
      "building_or_construction_service",
    ],
  },
  { key: "travel", label: "سفر وسياحة", categories: ["travel_service"] },
  { key: "real_estate", label: "عقارات", categories: ["real_estate_service"] },
  {
    key: "education",
    label: "تعليم وتدريب",
    categories: [
      "place_of_learning",
      "specialty_school",
      "education",
      "educational_service",
      "tutoring_service",
      "preschool",
    ],
  },
  {
    key: "pets",
    label: "حيوانات أليفة",
    categories: ["animal_or_pet_service", "animal_and_pet_store"],
  },
]

// Cities as a square of the map around their middle (the data's own city names are written
// every which way, in two languages).
export const PLACE_CITIES: Array<{
  key: string
  label: string
  latitude: number
  longitude: number
  km: number
}> = [
  { key: "riyadh", label: "الرياض", latitude: 24.7136, longitude: 46.6753, km: 45 },
  { key: "jeddah", label: "جدة", latitude: 21.5433, longitude: 39.1728, km: 40 },
  { key: "makkah", label: "مكة المكرمة", latitude: 21.3891, longitude: 39.8579, km: 25 },
  { key: "madinah", label: "المدينة المنورة", latitude: 24.4686, longitude: 39.6142, km: 25 },
  { key: "dammam", label: "الدمام", latitude: 26.4207, longitude: 50.0888, km: 16 },
  { key: "khobar", label: "الخبر والظهران", latitude: 26.2794, longitude: 50.1783, km: 14 },
  { key: "jubail", label: "الجبيل", latitude: 27.0046, longitude: 49.646, km: 20 },
  { key: "ahsa", label: "الأحساء", latitude: 25.3833, longitude: 49.5861, km: 25 },
  { key: "taif", label: "الطائف", latitude: 21.2703, longitude: 40.4158, km: 20 },
  { key: "buraydah", label: "بريدة", latitude: 26.326, longitude: 43.975, km: 18 },
  { key: "tabuk", label: "تبوك", latitude: 28.3838, longitude: 36.555, km: 18 },
  { key: "abha", label: "أبها", latitude: 18.2164, longitude: 42.5053, km: 15 },
  { key: "khamis", label: "خميس مشيط", latitude: 18.3, longitude: 42.7333, km: 15 },
  { key: "hail", label: "حائل", latitude: 27.5114, longitude: 41.7208, km: 18 },
  { key: "jazan", label: "جازان", latitude: 16.8892, longitude: 42.5511, km: 15 },
  { key: "najran", label: "نجران", latitude: 17.4917, longitude: 44.1322, km: 18 },
  { key: "yanbu", label: "ينبع", latitude: 24.0895, longitude: 38.0618, km: 20 },
]

export const PLACES_PAGE = 100

// One business as the workflow sends it.
const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .nullish()
    .transform((value) => (value && value.trim() ? value.trim().slice(0, max) : null))
export const placeRowSchema = z.object({
  id: z.string().trim().min(8).max(80),
  name: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .transform((value) => value.slice(0, 200)),
  category: text(80),
  confidence: z.number().min(0).max(1).catch(0),
  phones: z.array(z.string().max(60)).max(10).catch([]),
  website: text(400),
  email: text(254),
  social: text(400),
  address: text(300),
  locality: text(120),
  latitude: z.number().min(15).max(33),
  longitude: z.number().min(34).max(56),
  closed: z.boolean().catch(false),
})
export const placesBatchSchema = z.object({
  release: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  rows: z.array(placeRowSchema).min(1).max(1000),
})
export const placesCompleteSchema = z.object({
  release: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
})
export type PlaceRow = z.infer<typeof placeRowSchema>

export interface PlacesState {
  release: string | null
  loadedAt: string | null
  places: number
  refreshRequestedAt: string | null
}

// A phone as people dial it, and the Saudi mobile among a business's numbers (WhatsApp).
function phonesOf(phones: string[]): { phone: string | null; mobile: string | null } {
  let phone: string | null = null
  let mobile: string | null = null
  for (const raw of phones) {
    const digits = raw.replace(/\D/g, "")
    if (digits.length < 7 || digits.length > 15) continue
    const local = digits.replace(/^(00966|966|0)/, "")
    if (!mobile && /^5\d{8}$/.test(local)) mobile = `966${local}`
    if (!phone) phone = raw.trim().startsWith("+") ? `+${digits}` : digits
  }
  return { phone: mobile ? `+${mobile}` : phone, mobile }
}

const refuse = (code: string, status: number, message: string) =>
  new IdentityError(code, status, "business", message)

export class CrmPlacesDirectory {
  constructor(private readonly db: PostgresDatabase) {}

  private async readState(): Promise<PlacesState> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT release, loaded_at, places, refresh_requested_at FROM crm_places_state WHERE id = 1`
    )
    const row = result.rows[0]
    const date = (value: unknown) => (value ? new Date(String(value)).toISOString() : null)
    return {
      release: row?.release ? String(row.release) : null,
      loadedAt: date(row?.loaded_at),
      places: Number(row?.places ?? 0),
      refreshRequestedAt: date(row?.refresh_requested_at),
    }
  }

  private async writeState(
    patch: Partial<Record<"release" | "loaded_at" | "places" | "refresh_requested_at", unknown>>
  ) {
    const exists = await this.db.query(`SELECT id FROM crm_places_state WHERE id = 1`)
    if (exists.rows.length === 0)
      await this.db.query(`INSERT INTO crm_places_state (id) VALUES (1)`)
    const keys = Object.keys(patch)
    await this.db.query(
      `UPDATE crm_places_state SET ${keys.map((key, index) => `${key} = $${index + 1}`).join(", ")} WHERE id = 1`,
      keys.map((key) => patch[key as keyof typeof patch])
    )
  }

  // What the page shows above the search: how fresh the directory is, and what can be picked.
  async overview(actor: AuthenticatedActor) {
    requirePlatformPermission(actor, "crm:manage")
    return {
      ...(await this.readState()),
      activities: PLACE_ACTIVITIES.map(({ key, label }) => ({ key, label })),
      cities: PLACE_CITIES.map(({ key, label }) => ({ key, label })),
    }
  }

  // The team asks for a fresh load: the workflow's daily check sees it and loads again.
  async requestRefresh(actor: AuthenticatedActor): Promise<PlacesState> {
    requirePlatformPermission(actor, "crm:manage")
    await this.writeState({ refresh_requested_at: new Date().toISOString() })
    return this.readState()
  }

  // Businesses by activity, by words in the name or address, in a city, or within a distance
  // of a point. Those with a phone come first, the surest first among them.
  async search(
    actor: AuthenticatedActor,
    input: {
      activity?: string | null
      keyword?: string | null
      city?: string | null
      area?: { latitude: number; longitude: number; radius: number } | null
      mobileOnly?: boolean
      offset?: number
    }
  ): Promise<{ items: Prospect[]; total: number; nextOffset: number | null }> {
    requirePlatformPermission(actor, "crm:manage")
    const where: string[] = ["closed = false"]
    const params: unknown[] = []
    const add = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    const activity = PLACE_ACTIVITIES.find((entry) => entry.key === input.activity)
    if (activity) where.push(`category IN (${activity.categories.map(add).join(", ")})`)
    const keyword = (input.keyword ?? "").trim()
    if (keyword.length >= 2) {
      const like = add(`%${keyword.replace(/[\\%_]/g, (match) => `\\${match}`)}%`)
      where.push(`(name ILIKE ${like} OR address ILIKE ${like})`)
    }
    const city = PLACE_CITIES.find((entry) => entry.key === input.city)
    const box = input.area
      ? { ...input.area, metres: input.area.radius }
      : city
        ? { latitude: city.latitude, longitude: city.longitude, metres: city.km * 1000 }
        : null
    if (box) {
      const lat = box.metres / 111_320
      const lng = box.metres / (111_320 * Math.max(0.01, Math.cos((box.latitude * Math.PI) / 180)))
      where.push(`latitude BETWEEN ${add(box.latitude - lat)} AND ${add(box.latitude + lat)}`)
      where.push(`longitude BETWEEN ${add(box.longitude - lng)} AND ${add(box.longitude + lng)}`)
    }
    if (input.mobileOnly) where.push("mobile IS NOT NULL")
    const offset = Math.max(0, input.offset ?? 0)
    const counted = await this.db.query<{ total: number }>(
      `SELECT count(*) AS total FROM crm_places WHERE ${where.join(" AND ")}`,
      params
    )
    const total = Number(counted.rows[0]?.total ?? 0)
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, name, category, phone, mobile, website, email, social, address, latitude, longitude
         FROM crm_places WHERE ${where.join(" AND ")}
        ORDER BY has_phone DESC, confidence DESC, id
        LIMIT ${PLACES_PAGE} OFFSET ${offset}`,
      params
    )
    const marks = await prospectMarks(
      this.db,
      result.rows.map((row) => String(row.id))
    )
    const labels = new Map<string, string>()
    for (const entry of PLACE_ACTIVITIES) {
      for (const category of entry.categories) labels.set(category, entry.label)
    }
    const value = (raw: unknown) => (typeof raw === "string" && raw ? raw : null)
    const items = result.rows.map((row): Prospect => {
      const id = String(row.id)
      const latitude = Number(row.latitude)
      const longitude = Number(row.longitude)
      const phone = value(row.phone)
      return {
        placeId: id,
        name: String(row.name),
        category: labels.get(String(row.category)) ?? null,
        address: value(row.address),
        phone,
        internationalPhone: phone,
        website: value(row.website),
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        rating: null,
        ratings: null,
        closed: false,
        latitude,
        longitude,
        email: value(row.email),
        social: value(row.social),
        mark: marks.get(id) ?? null,
      }
    })
    return {
      items,
      total,
      nextOffset: offset + items.length < total ? offset + items.length : null,
    }
  }

  // ---- The monthly load (called by the workflow, which the route has already checked) ----

  async loadState(): Promise<PlacesState> {
    return this.readState()
  }

  // One batch of a release's rows. A business already here (from the release before, or from
  // an earlier try of this one) is replaced.
  async loadBatch(release: string, rows: PlaceRow[]): Promise<{ saved: number }> {
    const unique = [...new Map(rows.map((row) => [row.id, row])).values()]
    const ids = unique.map((row) => row.id)
    await this.db.query(
      `DELETE FROM crm_places WHERE id IN (${ids.map((_, index) => `$${index + 1}`).join(", ")})`,
      ids
    )
    const params: unknown[] = []
    const tuples = unique.map((row) => {
      const { phone, mobile } = phonesOf(row.phones)
      const values = [
        row.id,
        release,
        row.name,
        row.category,
        phone,
        mobile,
        phone !== null,
        row.website,
        row.email,
        row.social,
        row.address,
        row.locality,
        row.latitude,
        row.longitude,
        row.confidence,
        row.closed,
      ]
      const start = params.length
      params.push(...values)
      return `(${values.map((_, index) => `$${start + index + 1}`).join(", ")})`
    })
    await this.db.query(
      `INSERT INTO crm_places
         (id, release, name, category, phone, mobile, has_phone, website, email, social, address,
          locality, latitude, longitude, confidence, closed)
       VALUES ${tuples.join(", ")}`,
      params
    )
    return { saved: unique.length }
  }

  // The release is all in: businesses of older releases that are no longer listed go. A load
  // that came out far smaller than what is here is taken as broken and changes nothing.
  async loadComplete(release: string): Promise<PlacesState> {
    const before = await this.readState()
    const counted = await this.db.query<{ total: number }>(
      `SELECT count(*) AS total FROM crm_places WHERE release = $1`,
      [release]
    )
    const loaded = Number(counted.rows[0]?.total ?? 0)
    if (loaded === 0 || loaded < before.places * 0.5) {
      throw refuse("CRM_PLACES_LOAD_TOO_SMALL", 409, "The load is far smaller than the directory.")
    }
    await this.db.query(`DELETE FROM crm_places WHERE release <> $1`, [release])
    await this.writeState({
      release,
      loaded_at: new Date().toISOString(),
      places: loaded,
      refresh_requested_at: null,
    })
    return this.readState()
  }
}

// ---- Who is calling the load routes ----

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com"
export const PLACES_TOKEN_AUDIENCE = "madar-saudi-places"
const PLACES_WORKFLOW = ".github/workflows/saudi-places.yml"
type Jwk = { kid?: string; kty?: string; n?: string; e?: string }
let keys: { at: number; list: Jwk[] } | null = null

async function githubKeys(): Promise<Jwk[]> {
  if (keys && Date.now() - keys.at < 60 * 60_000) return keys.list
  const response = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`GitHub keys: ${response.status}`)
  const body = (await response.json()) as { keys?: Jwk[] }
  keys = { at: Date.now(), list: body.keys ?? [] }
  return keys.list
}

// True for the identity token of a run of Madar's own places workflow on the main branch:
// signed by GitHub, meant for this server, not expired, and from that repository and file.
export async function isPlacesWorkflow(
  authorization: string | undefined,
  repository = process.env.CRM_PLACES_GITHUB_REPOSITORY ?? "DHIA2010/madar-ai-platform"
): Promise<boolean> {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]
  const parts = token?.split(".") ?? []
  if (parts.length !== 3) return false
  try {
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
    const header = decode(parts[0]) as { alg?: string; kid?: string }
    const claims = decode(parts[1]) as Record<string, unknown>
    if (header.alg !== "RS256" || !header.kid) return false
    const jwk = (await githubKeys()).find((entry) => entry.kid === header.kid)
    if (!jwk) return false
    const signed = verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk as never, format: "jwk" }),
      Buffer.from(parts[2], "base64url")
    )
    if (!signed) return false
    const now = Date.now() / 1000
    return (
      claims.iss === GITHUB_ISSUER &&
      claims.aud === PLACES_TOKEN_AUDIENCE &&
      typeof claims.exp === "number" &&
      claims.exp > now &&
      claims.repository === repository &&
      claims.ref === "refs/heads/main" &&
      String(claims.job_workflow_ref ?? "").startsWith(`${repository}/${PLACES_WORKFLOW}@`)
    )
  } catch {
    return false
  }
}

export const placesInternals = {
  phonesOf,
  forgetKeys: () => {
    keys = null
  },
}
