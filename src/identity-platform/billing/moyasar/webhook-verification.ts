import { timingSafeEqual } from "node:crypto"

// Unlike Shopify's HMAC-over-query-string (see shopify-oauth/service.ts's verifyCallbackHmac),
// Moyasar authenticity is a plain merchant-configured shared secret echoed back verbatim as
// secret_token on every webhook payload (https://docs.moyasar.com/api/webhooks/02-events) -- no
// signing involved, so verification is just a constant-time string compare.
export function verifyMoyasarWebhookSecret(providedToken: unknown, expectedToken: string): boolean {
  if (typeof providedToken !== "string" || providedToken.length === 0) {
    return false
  }

  const providedBuffer = Buffer.from(providedToken)
  const expectedBuffer = Buffer.from(expectedToken)
  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}
