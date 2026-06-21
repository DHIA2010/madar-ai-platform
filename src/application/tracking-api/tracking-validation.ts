import { z } from "zod"

import {
  trackingConsentSchema,
  trackingContextSchema,
  trackingEventNameSchema,
} from "@/application/validators/tracking.validators"

import type {
  BatchPayload,
  ConsentPayload,
  IdentifyPayload,
  SessionEndPayload,
  SessionStartPayload,
  TrackPayload,
  TrackingRequest,
} from "./tracking-api.contracts"

const requestSchema = z.object({
  method: z.literal("POST"),
  path: z.enum(["/track", "/identify", "/session/start", "/session/end", "/consent", "/batch"]),
  headers: z.record(z.string(), z.string().optional()),
  ipAddress: z.string().min(1),
  body: z.object({
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1),
    trackingKey: z.string().optional(),
    timestamp: z.string().min(1),
    payload: z.unknown(),
  }),
})

const trackPayloadSchema = z.object({
  sessionId: z.string().min(1),
  eventId: z.string().optional(),
  name: trackingEventNameSchema,
  context: trackingContextSchema,
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

const identifyPayloadSchema = z.object({
  sourceVisitorId: z.string().min(1),
  targetCustomerId: z.string().min(1),
})

const sessionStartPayloadSchema = z.object({
  visitorId: z.string().optional(),
  customerId: z.string().optional(),
  context: trackingContextSchema,
  sessionTtlMinutes: z.number().int().min(1).max(720).optional(),
})

const sessionEndPayloadSchema = z.object({
  sessionId: z.string().min(1),
  context: trackingContextSchema,
  exitPage: z.string().optional(),
})

const consentPayloadSchema = z.object({
  visitorId: z.string().min(1),
  consent: trackingConsentSchema,
})

const batchPayloadSchema = z.object({
  events: z.array(trackPayloadSchema).min(1).max(500),
})

export class TrackingValidation {
  constructor(private readonly maxPayloadBytes: number = 128 * 1024) {}

  validateRequest(request: TrackingRequest): { valid: true } | { valid: false; reason: string } {
    const parsed = requestSchema.safeParse(request)
    if (!parsed.success) {
      return { valid: false, reason: "schema_invalid" }
    }

    const requestTimestamp = new Date(request.body.timestamp)
    if (Number.isNaN(requestTimestamp.getTime())) {
      return { valid: false, reason: "timestamp_invalid" }
    }

    const skewMs = Math.abs(Date.now() - requestTimestamp.getTime())
    if (skewMs > 15 * 60 * 1000) {
      return { valid: false, reason: "timestamp_out_of_range" }
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(request.body.payload), "utf8")
    if (payloadBytes > this.maxPayloadBytes) {
      return { valid: false, reason: "payload_too_large" }
    }

    return { valid: true }
  }

  parseTrackPayload(request: TrackingRequest): TrackPayload {
    return trackPayloadSchema.parse(request.body.payload)
  }

  parseIdentifyPayload(request: TrackingRequest): IdentifyPayload {
    return identifyPayloadSchema.parse(request.body.payload)
  }

  parseSessionStartPayload(request: TrackingRequest): SessionStartPayload {
    return sessionStartPayloadSchema.parse(request.body.payload)
  }

  parseSessionEndPayload(request: TrackingRequest): SessionEndPayload {
    return sessionEndPayloadSchema.parse(request.body.payload)
  }

  parseConsentPayload(request: TrackingRequest): ConsentPayload {
    return consentPayloadSchema.parse(request.body.payload)
  }

  parseBatchPayload(request: TrackingRequest): BatchPayload {
    return batchPayloadSchema.parse(request.body.payload)
  }
}
