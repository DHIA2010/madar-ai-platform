import { timingSafeEqual } from "node:crypto"

// Confirmed against docs.zid.sa/create-a-webhook: unlike Salla's HMAC-signed-body scheme, Zid
// sends a plain `Authorization: Basic base64(username:password)` header on every webhook
// delivery, where username/password are values WE chose when creating the subscription (not a
// secret Zid generates) -- see zid-credentials.ts's resolveZidWebhookCredentials(). There is no
// digest to compute; verification is just comparing the delivered header against the credential
// we configured, in constant time.
export function verifyZidWebhookBasicAuth(
  authorizationHeader: unknown,
  username: string,
  password: string
): boolean {
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith("Basic ")) {
    return false
  }

  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(authorizationHeader)
  // timingSafeEqual throws (rather than returning false) on a buffer-length mismatch, so this has
  // to be checked explicitly first -- same discipline as salla-oauth/webhook-verification.ts.
  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}
