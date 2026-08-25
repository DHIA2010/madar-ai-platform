import { createHash } from "node:crypto"

// Shared by OrderAttributionService (hashing an order's customer email at match time) and the
// storefront capture snippet's /v1/tracking/capture handler (hashing an email the snippet
// observed client-side) -- one implementation, so both sides of a customer_ref comparison are
// guaranteed to hash identically. Raw email is never stored anywhere; only this hash is.
export function hashCustomerEmail(email: string | null): string | null {
  if (!email) return null
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}
