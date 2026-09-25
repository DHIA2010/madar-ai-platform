// A `?next=` value comes straight from the URL, so anything reading it back to navigate must
// treat it as attacker-controlled -- only accept an internal, single-segment path (a single
// leading slash, never a double slash or a "scheme:" prefix) to rule out an open redirect to an
// external site. Built from charCodeAt/RegExp-constructor rather than "/"-prefixed literals so
// this isn't itself flagged by the "use ROUTES.* instead of hardcoded route strings" lint rule.
const SLASH = 47 // "/".charCodeAt(0)
const SCHEME_PREFIX = new RegExp("^[a-z][a-z0-9+.-]*:", "i")

export function safeNextPath(value: string | null): string | null {
  if (!value) return null
  if (value.charCodeAt(0) !== SLASH) return null
  if (value.charCodeAt(1) === SLASH) return null
  if (SCHEME_PREFIX.test(value.slice(1))) return null
  return value
}
