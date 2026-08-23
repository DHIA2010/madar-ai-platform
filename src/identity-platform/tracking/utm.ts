const MAX_UTM_VALUE_LENGTH = 100

// Stored/matchable value: trimmed, Unicode-normalized, lowercased, collapsed to a
// clean slug (letters/digits/hyphen/underscore only, Unicode-aware so Arabic and
// other non-Latin scripts survive). URL-encoding happens only when building the
// live query string (buildUtmQueryString/appendUtmToUrl), never here, so the same
// normalized value is what campaign-links/service.ts writes and what
// attribution/order-attribution-service.ts matches against.
export function normalizeUtmValue(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return ""
  }

  const normalized = trimmed.normalize("NFKC").toLowerCase()
  const slug = normalized
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug.slice(0, MAX_UTM_VALUE_LENGTH)
}

const UTM_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const

export type UtmParams = Partial<Record<(typeof UTM_QUERY_KEYS)[number], string | null | undefined>>

export function buildUtmQueryString(params: UtmParams): string {
  const searchParams = new URLSearchParams()
  for (const key of UTM_QUERY_KEYS) {
    const value = params[key]
    if (value) {
      searchParams.set(key, value)
    }
  }
  return searchParams.toString()
}

export function appendUtmToUrl(baseUrl: string, params: UtmParams): string {
  const query = buildUtmQueryString(params)
  if (!query) {
    return baseUrl
  }
  const separator = baseUrl.includes("?") ? "&" : "?"
  return `${baseUrl}${separator}${query}`
}
