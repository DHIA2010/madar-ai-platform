import { createHmac, timingSafeEqual } from "node:crypto"

// Confirmed against https://docs.salla.dev/webhooks: the webhook Secret is used to compute an
// HMAC-SHA256 of the raw request body, sent back on the X-salla-signature header as hex. Salla's
// own docs are internally inconsistent about whether this exact mechanism is "Signature" or
// "Token" strategy (the Partner Portal currently has "Token" selected for this app) -- the worked
// code examples given for both strategies compute the identical HMAC-SHA256-of-body-with-secret,
// so this is implemented once here and verified against a real test delivery once deployed, rather
// than guessed twice. If that verification shows Salla actually sends something different (a
// different header, or the plain secret rather than a hash of it), this is the only function that
// needs to change -- the route and service around it don't know or care how verification works
// internally.
export function verifySallaWebhookSignature(
  rawBody: Buffer,
  providedSignature: unknown,
  secret: string
): boolean {
  if (typeof providedSignature !== "string" || providedSignature.length === 0) {
    return false
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(providedSignature)
  // timingSafeEqual throws (rather than returning false) on a buffer-length mismatch, so this has
  // to be checked explicitly first -- same discipline as billing/moyasar/webhook-verification.ts.
  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}
