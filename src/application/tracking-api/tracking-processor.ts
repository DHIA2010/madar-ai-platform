import { ZodError } from "zod"

import { TrackingManager } from "@/application/services/tracking-manager.service"

import type { TrackingRequest, TrackingResponse } from "./tracking-api.contracts"
import { TrackingValidation } from "./tracking-validation"

function ok(requestId: string, data: unknown): TrackingResponse {
  return {
    success: true,
    statusCode: 200,
    requestId,
    data,
  }
}

function badRequest(requestId: string, code: string, message: string): TrackingResponse {
  return {
    success: false,
    statusCode: 400,
    requestId,
    error: { code, message },
  }
}

export class TrackingProcessor {
  private readonly endedSessions = new Set<string>()

  constructor(
    private readonly trackingManager: TrackingManager,
    private readonly validation: TrackingValidation
  ) {}

  process(request: TrackingRequest, requestId: string): TrackingResponse {
    try {
      if (request.path === "/session/start") {
        const payload = this.validation.parseSessionStartPayload(request)
        const session = this.trackingManager.startSession(payload)
        return ok(requestId, { session })
      }

      if (request.path === "/session/end") {
        const payload = this.validation.parseSessionEndPayload(request)
        if (!this.trackingManager.resumeSession(payload.sessionId)) {
          return badRequest(requestId, "session_not_found", "Session was not found")
        }

        this.endedSessions.add(payload.sessionId)

        // Forward endpoint activity into Tracking Platform without adding new business logic.
        this.trackingManager.trackEvent({
          sessionId: payload.sessionId,
          name: "page_viewed",
          context: payload.context,
          payload: {
            sessionEnded: true,
            exitPage: payload.exitPage ?? payload.context.exitPage ?? null,
          },
        })

        return ok(requestId, { ended: true, sessionId: payload.sessionId })
      }

      if (request.path === "/identify") {
        const payload = this.validation.parseIdentifyPayload(request)
        const merged = this.trackingManager.mergeIdentity(payload)
        if (!merged) {
          return badRequest(requestId, "visitor_not_found", "Visitor was not found")
        }

        return ok(requestId, { visitor: merged })
      }

      if (request.path === "/consent") {
        const payload = this.validation.parseConsentPayload(request)
        this.trackingManager.setConsent(payload.visitorId, payload.consent)
        return ok(requestId, { consent: this.trackingManager.getConsent(payload.visitorId) })
      }

      if (request.path === "/track") {
        const payload = this.validation.parseTrackPayload(request)
        if (this.endedSessions.has(payload.sessionId)) {
          return badRequest(requestId, "session_ended", "Session already ended")
        }

        const result = this.trackingManager.trackEvent(payload)
        if (!result.accepted) {
          return badRequest(requestId, "track_rejected", result.reason ?? "Track request rejected")
        }

        return ok(requestId, { accepted: true, eventId: result.eventId })
      }

      if (request.path === "/batch") {
        const payload = this.validation.parseBatchPayload(request)

        const results = payload.events.map((event) => {
          if (this.endedSessions.has(event.sessionId)) {
            return {
              accepted: false,
              duplicate: false,
              reason: "session_ended",
            }
          }
          return this.trackingManager.trackEvent(event)
        })

        return ok(requestId, {
          processed: results.length,
          accepted: results.filter((entry) => entry.accepted).length,
          duplicates: results.filter((entry) => entry.duplicate).length,
          rejected: results.filter((entry) => !entry.accepted).length,
          results,
        })
      }

      return {
        success: false,
        statusCode: 404,
        requestId,
        error: { code: "endpoint_not_found", message: "Tracking endpoint not found" },
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return badRequest(
          requestId,
          "payload_invalid",
          error.issues[0]?.message ?? "Payload invalid"
        )
      }

      return {
        success: false,
        statusCode: 500,
        requestId,
        error: {
          code: "tracking_processing_failed",
          message: error instanceof Error ? error.message : "Unknown tracking processing error",
        },
      }
    }
  }
}
