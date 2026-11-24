import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"
import type { PlatformSettingsRepository } from "../platform-settings/types"

// The sales team's prospect finder (Madar Admin -> CRM): businesses found on Google Maps through
// Google's own Places service -- "مطاعم في الرياض" -- with their phone, website and rating, to
// call or message one by one.
//
// What Google allows shapes all of it (Places policies: its content may not be copied and saved,
// business names and addresses included; a place's id may be kept for good):
//   - A search is asked live each time and shown with Google's name on it. Nothing of what comes
//     back is written to the database.
//   - What Madar keeps is its own: against a place's id, how the team's contact with it went and
//     a note. A lead is made in the pipeline by the salesperson from what the business tells
//     them, the way every lead is.
//   - An e-mail is not Google's to give: it is read off the business's own website when asked
//     for, and shown, not stored.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
// Phone, website and rating put a search on Google's "Text Search Enterprise" price: the first
// 1,000 searches of a month are free, then 35 USD per 1,000 (Google's price list, read
// 24 November 2026). A search is one page of up to 20 places; every further page is one more.
export const FREE_SEARCHES_A_MONTH = 1000
export const USD_PER_SEARCH = 0.035
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",")

export const PROSPECT_STATUSES = ["contacted", "interested", "not_interested", "no_answer"] as const
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]

export interface ProspectMark {
  status: ProspectStatus
  note: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface Prospect {
  placeId: string
  name: string
  category: string | null
  address: string | null
  phone: string | null
  internationalPhone: string | null
  website: string | null
  mapsUrl: string | null
  rating: number | null
  ratings: number | null
  closed: boolean
  // Where it is on the map, so a search can be run inside it (a mall, a market).
  latitude: number | null
  longitude: number | null
  // An e-mail and a social page, where the source gives them (the directory does; Google not).
  email: string | null
  social: string | null
  // The team's own record of contacting this place, when there is one.
  mark: ProspectMark | null
}

// How much of the month's free searches is used, and what going past them costs.
export interface ProspectUsage {
  month: string
  used: number
  free: number
  remaining: number
  usdPerSearch: number
  // Searches past the free ones this month, and what Google charges for them.
  paid: number
  costUsd: number
}

// A square on the map around a point: a mall, a market, a street.
export interface ProspectArea {
  latitude: number
  longitude: number
  radius: number
}

// Google's billing month runs on Pacific time.
function billingMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}`
}

// The corners of the square, in degrees.
function viewport(area: ProspectArea) {
  const lat = area.radius / 111_320
  const lng = area.radius / (111_320 * Math.max(0.01, Math.cos((area.latitude * Math.PI) / 180)))
  return {
    low: { latitude: area.latitude - lat, longitude: area.longitude - lng },
    high: { latitude: area.latitude + lat, longitude: area.longitude + lng },
  }
}

const refuse = (code: string, status: number, message: string) =>
  new IdentityError(code, status, "business", message)

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

// ---- Reading a business's own website for its e-mail ----

const MAX_PAGE_BYTES = 400_000
const PAGE_TIMEOUT_MS = 7000
const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi
// Addresses that sit in page code and are nobody's contact.
const NOT_A_CONTACT =
  /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|sentry|wixpress|domain|email)\.|^(noreply|no-reply|donotreply)@|@\dx\./i

// An address on the open internet, not one inside a network.
function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const [a, b] = address.split(".").map(Number)
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    return true
  }
  if (version === 6) {
    const lower = address.toLowerCase()
    if (lower === "::1" || lower === "::") return false
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return false
    if (lower.startsWith("::ffff:")) return isPublicAddress(lower.slice(7))
    return true
  }
  return false
}

// A web address the server may open: http(s), a named host, resolving only to public addresses.
// The address comes from the staff member's browser, so it is never taken on trust.
async function openable(raw: string): Promise<URL | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password) return null
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (!host || host === "localhost" || isIP(host) !== 0 || !host.includes(".")) return null
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.length === 0) return null
    if (!addresses.every((entry) => isPublicAddress(entry.address))) return null
  } catch {
    return null
  }
  return url
}

// One page's text, following a few redirects (each checked like the first address).
async function readPage(start: string): Promise<{ url: URL; body: string } | null> {
  let target = start
  for (let hop = 0; hop < 4; hop += 1) {
    const url = await openable(target)
    if (!url) return null
    let response: Response
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { accept: "text/html,*/*;q=0.5", "user-agent": "Mozilla/5.0 (compatible)" },
      })
    } catch {
      return null
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location")
      if (!next) return null
      target = new URL(next, url).toString()
      continue
    }
    if (!response.ok) return null
    const kind = response.headers.get("content-type") ?? ""
    if (kind && !/text|html|xml/i.test(kind)) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { url, body: new TextDecoder().decode(bytes.subarray(0, MAX_PAGE_BYTES)) }
  }
  return null
}

function emailsIn(body: string): string[] {
  const decoded = body.replace(/&#64;|&commat;|%40/gi, "@")
  const found = new Set<string>()
  for (const match of decoded.match(EMAIL) ?? []) {
    const email = match.toLowerCase()
    if (!NOT_A_CONTACT.test(email)) found.add(email)
  }
  return [...found]
}

// A "contact us" page linked from the front page, on the same site.
function contactLink(body: string, base: URL): string | null {
  for (const match of body.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    if (!/contact|تواصل|اتصل/i.test(decodeURIComponent(match[1]).toLowerCase())) continue
    try {
      const link = new URL(match[1], base)
      if (link.hostname === base.hostname) return link.toString()
    } catch {
      // Not an address: passed over.
    }
  }
  return null
}

// The team's marks on these places (Google's or the directory's), by place id.
export async function prospectMarks(
  db: PostgresDatabase,
  placeIds: string[]
): Promise<Map<string, ProspectMark>> {
  const marks = new Map<string, ProspectMark>()
  if (placeIds.length === 0) return marks
  const result = await db.query<Record<string, unknown>>(
    `SELECT m.place_id, m.status, m.note, m.updated_at, u.full_name
       FROM crm_prospect_marks m
       LEFT JOIN users u ON u.id = m.updated_by
      WHERE m.place_id IN (${placeIds.map((_, index) => `$${index + 1}`).join(", ")})`,
    placeIds
  )
  for (const row of result.rows) {
    marks.set(String(row.place_id), {
      status: String(row.status) as ProspectStatus,
      note: text(row.note),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      updatedBy: text(row.full_name),
    })
  }
  return marks
}

export class CrmProspectFinder {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly settings: PlatformSettingsRepository
  ) {}

  private marksFor(placeIds: string[]): Promise<Map<string, ProspectMark>> {
    return prospectMarks(this.db, placeIds)
  }

  // This month's count of searches against Google's free allowance.
  async usage(actor: AuthenticatedActor): Promise<ProspectUsage> {
    requirePlatformPermission(actor, "crm:manage")
    return this.usageNow()
  }

  private async usageNow(): Promise<ProspectUsage> {
    const month = billingMonth()
    const result = await this.db.query<{ searches: number }>(
      `SELECT searches FROM crm_prospect_usage WHERE month = $1`,
      [month]
    )
    const used = Number(result.rows[0]?.searches ?? 0)
    const paid = Math.max(0, used - FREE_SEARCHES_A_MONTH)
    return {
      month,
      used,
      free: FREE_SEARCHES_A_MONTH,
      remaining: Math.max(0, FREE_SEARCHES_A_MONTH - used),
      usdPerSearch: USD_PER_SEARCH,
      paid,
      costUsd: Math.round(paid * USD_PER_SEARCH * 100) / 100,
    }
  }

  private async countSearch(): Promise<void> {
    const month = billingMonth()
    const changed = await this.db.query(
      `UPDATE crm_prospect_usage SET searches = searches + 1, updated_at = now()
        WHERE month = $1 RETURNING month`,
      [month]
    )
    if (changed.rows.length === 0) {
      await this.db.query(`INSERT INTO crm_prospect_usage (month, searches) VALUES ($1, 1)`, [
        month,
      ])
    }
  }

  // One page of a search (20 places; Google gives at most three pages for one search). With an
  // area, only places inside that square of the map come back. Past the month's free searches
  // it is refused unless the person chose to go on at Google's price.
  async search(
    actor: AuthenticatedActor,
    input: {
      query: string
      pageToken?: string | null
      area?: ProspectArea | null
      allowPaid?: boolean
    }
  ): Promise<{ items: Prospect[]; nextPageToken: string | null; usage: ProspectUsage }> {
    requirePlatformPermission(actor, "crm:manage")
    const key = (await this.settings.get()).googlePlacesApiKey.trim()
    if (!key) {
      throw refuse(
        "CRM_PROSPECTS_NO_KEY",
        409,
        "The Google Places key has not been saved in the platform settings."
      )
    }
    if (!input.allowPaid && (await this.usageNow()).remaining === 0) {
      throw refuse("CRM_PROSPECTS_FREE_USED", 409, "This month's free Google searches are used up.")
    }
    let response: Response
    try {
      response = await fetch(SEARCH_URL, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
          "x-goog-fieldmask": FIELDS,
        },
        body: JSON.stringify({
          textQuery: input.query,
          languageCode: "ar",
          regionCode: "SA",
          pageSize: 20,
          ...(input.pageToken ? { pageToken: input.pageToken } : {}),
          ...(input.area ? { locationRestriction: { rectangle: viewport(input.area) } } : {}),
        }),
      })
    } catch {
      throw refuse("CRM_PROSPECTS_UNREACHABLE", 502, "Google could not be reached.")
    }
    const body = (await response.json().catch(() => ({}))) as {
      places?: Array<Record<string, unknown>>
      nextPageToken?: string
      error?: { message?: string; status?: string }
    }
    if (!response.ok) {
      // Google's own words (a key that is wrong, not allowed this service, or out of budget).
      throw new IdentityError(
        "CRM_PROSPECTS_REFUSED",
        502,
        "business",
        "Google refused the search.",
        {
          reason: String(body.error?.message ?? response.status).slice(0, 300),
        }
      )
    }
    // Counted once Google has answered: a refused search is not charged.
    await this.countSearch()
    const places = body.places ?? []
    const marks = await this.marksFor(places.map((place) => String(place.id)))
    return {
      items: places.map((place) => {
        const placeId = String(place.id)
        const named = (value: unknown) => text((value as { text?: unknown } | undefined)?.text)
        const at = place.location as { latitude?: unknown; longitude?: unknown } | undefined
        return {
          placeId,
          name: named(place.displayName) ?? "",
          category: named(place.primaryTypeDisplayName),
          address: text(place.formattedAddress),
          phone: text(place.nationalPhoneNumber),
          internationalPhone: text(place.internationalPhoneNumber),
          website: text(place.websiteUri),
          mapsUrl: text(place.googleMapsUri),
          rating: typeof place.rating === "number" ? place.rating : null,
          ratings: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
          closed:
            place.businessStatus === "CLOSED_PERMANENTLY" ||
            place.businessStatus === "CLOSED_TEMPORARILY",
          latitude: typeof at?.latitude === "number" ? at.latitude : null,
          longitude: typeof at?.longitude === "number" ? at.longitude : null,
          email: null,
          social: null,
          mark: marks.get(placeId) ?? null,
        }
      }),
      nextPageToken: text(body.nextPageToken),
      usage: await this.usageNow(),
    }
  }

  // How the team's contact with a place went. An empty status takes the record away.
  async mark(
    actor: AuthenticatedActor,
    input: { placeId: string; status: ProspectStatus | null; note?: string | null }
  ): Promise<ProspectMark | null> {
    requirePlatformPermission(actor, "crm:manage")
    if (!input.status) {
      await this.db.query(`DELETE FROM crm_prospect_marks WHERE place_id = $1`, [input.placeId])
      return null
    }
    const changed = await this.db.query(
      `UPDATE crm_prospect_marks SET status = $2, note = $3, updated_by = $4, updated_at = now()
        WHERE place_id = $1 RETURNING place_id`,
      [input.placeId, input.status, text(input.note), actor.userId]
    )
    if (changed.rows.length === 0) {
      await this.db.query(
        `INSERT INTO crm_prospect_marks (place_id, status, note, updated_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (place_id) DO NOTHING`,
        [input.placeId, input.status, text(input.note), actor.userId]
      )
    }
    return (await this.marksFor([input.placeId])).get(input.placeId) ?? null
  }

  // The e-mail addresses a business publishes on its own website: the page given, and its
  // "contact us" page when the first shows none.
  async emails(actor: AuthenticatedActor, website: string): Promise<string[]> {
    requirePlatformPermission(actor, "crm:manage")
    const front = await readPage(website)
    if (!front) return []
    const found = emailsIn(front.body)
    if (found.length > 0) return found.slice(0, 5)
    const contact = contactLink(front.body, front.url)
    if (!contact) return []
    const page = await readPage(contact)
    return page ? emailsIn(page.body).slice(0, 5) : []
  }
}

export const prospectsInternals = { isPublicAddress, emailsIn, contactLink, viewport, billingMonth }
