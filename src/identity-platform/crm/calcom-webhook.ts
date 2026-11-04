import { createHmac, timingSafeEqual } from "node:crypto"

// Cal.com's booking webhook (Settings → Developer → Webhooks, events: booking created, requested,
// rescheduled, cancelled and rejected), signed with the webhook's secret: X-Cal-Signature-256 is the hex
// HMAC-SHA256 of the raw body.

export function verifyCalcomSignature(rawBody: Buffer, header: unknown, secret: string) {
  if (typeof header !== "string" || !header) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const given = header.trim().toLowerCase()
  return (
    given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
}

export type CalcomEvent = "created" | "requested" | "rescheduled" | "cancelled" | "rejected"

const EVENTS: Record<string, CalcomEvent> = {
  BOOKING_CREATED: "created",
  BOOKING_REQUESTED: "requested",
  BOOKING_RESCHEDULED: "rescheduled",
  BOOKING_CANCELLED: "cancelled",
  BOOKING_REJECTED: "rejected",
}

export interface CalcomBooking {
  event: CalcomEvent
  // Why it was cancelled or rejected, when given.
  reason: string | null
  email: string | null
  name: string | null
  phone: string | null
  startTime: string
  uid: string | null
  // The website form's sales lead, when the booking came from its step (metadata[leadId]).
  salesLeadId: string | null
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
// Booking-form answers arrive as { value } (or a bare string on older payloads).
const answer = (value: unknown) =>
  text(value) ??
  (value && typeof value === "object" ? text((value as { value?: unknown }).value) : null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The booking in a webhook, or null for events the CRM doesn't use.
export function parseCalcomBooking(body: unknown): CalcomBooking | null {
  if (!body || typeof body !== "object") return null
  const { triggerEvent, payload } = body as { triggerEvent?: unknown; payload?: unknown }
  const event = typeof triggerEvent === "string" ? EVENTS[triggerEvent] : undefined
  if (!event) return null
  if (!payload || typeof payload !== "object") return null
  const booking = payload as {
    startTime?: unknown
    uid?: unknown
    cancellationReason?: unknown
    rejectionReason?: unknown
    attendees?: { email?: unknown; name?: unknown; phoneNumber?: unknown }[]
    responses?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
  const startTime = text(booking.startTime)
  if (!startTime || Number.isNaN(new Date(startTime).getTime())) return null
  const attendee = booking.attendees?.[0] ?? {}
  const responses = booking.responses ?? {}
  const leadId = text(booking.metadata?.leadId)
  return {
    event,
    reason: text(booking.cancellationReason) ?? text(booking.rejectionReason),
    email: text(attendee.email) ?? answer(responses.email),
    name: text(attendee.name) ?? answer(responses.name),
    phone:
      answer(responses.attendeePhoneNumber) ??
      answer(responses.phone) ??
      text(attendee.phoneNumber),
    startTime: new Date(startTime).toISOString(),
    uid: text(booking.uid),
    salesLeadId: leadId && UUID.test(leadId) ? leadId : null,
  }
}
