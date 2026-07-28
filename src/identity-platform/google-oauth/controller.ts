import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { GoogleOAuthService } from "./service"
import type { GoogleOAuthStartInput } from "./types"

const CALLBACK_ERROR_REASON_MAP: Record<string, string> = {
  GOOGLE_OAUTH_STATE_INVALID: "state_invalid",
  GOOGLE_OAUTH_STATE_EXPIRED: "state_expired",
  GOOGLE_OAUTH_STATE_ALREADY_CONSUMED: "state_already_consumed",
  GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED: "token_exchange_failed",
  GOOGLE_OAUTH_SCOPE_VALIDATION_FAILED: "scope_validation_failed",
  GOOGLE_OAUTH_REFRESH_TOKEN_MISSING: "refresh_token_missing",
  GOOGLE_OAUTH_CONFIGURATION_ERROR: "configuration_error",
}

function toReasonSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return normalized.length > 0 ? normalized.slice(0, 80) : "unknown"
}

function toSafeCallbackReason(error: unknown) {
  if (error instanceof Error) {
    const mappedReason = CALLBACK_ERROR_REASON_MAP[error.message]
    if (mappedReason) {
      return mappedReason
    }

    const message =
      error.message && error.message.trim().length > 0 ? error.message : "error_without_message"
    return `oauth_callback_failed_${toReasonSlug(message)}`
  }

  if (typeof error === "string") {
    return `oauth_callback_failed_${toReasonSlug(error)}`
  }

  if (error && typeof error === "object") {
    const constructorName =
      (error as { constructor?: { name?: string } }).constructor?.name ?? "object"
    return `oauth_callback_failed_non_error_${toReasonSlug(constructorName)}`
  }

  return `oauth_callback_failed_non_error_${toReasonSlug(typeof error)}`
}

function readHeader(request: IncomingMessage, name: string) {
  const raw = request.headers[name]
  if (Array.isArray(raw)) {
    return raw[0] ?? null
  }
  return typeof raw === "string" ? raw : null
}

export class GoogleOAuthController {
  constructor(private readonly service: GoogleOAuthService) {}

  async start(actor: AuthenticatedActor, input: GoogleOAuthStartInput) {
    return this.service.startAuthorization(actor, input)
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    return this.service.getActiveConnection(actor)
  }

  async callback(request: IncomingMessage, query: URLSearchParams) {
    const error = query.get("error")
    const code = query.get("code")
    const state = query.get("state")

    if (error) {
      return {
        status: 302,
        headers: {
          location: this.service.buildErrorRedirect(error),
        },
      }
    }

    if (!code || !state) {
      return {
        status: 302,
        headers: {
          location: this.service.buildErrorRedirect("missing_code_or_state"),
        },
      }
    }

    try {
      const completed = await this.service.completeAuthorization({ state, code })
      return {
        status: 302,
        headers: {
          location: this.service.buildSuccessRedirect(completed),
        },
      }
    } catch (error) {
      const reason = toSafeCallbackReason(error)
      console.error(
        JSON.stringify({
          level: "error",
          service: "identity-platform",
          event: "provider.error",
          provider: "google-oauth",
          endpoint: "/v1/integrations/google/oauth/callback",
          statusCode: 500,
          errorCode: reason,
          requestId: readHeader(request, "x-request-id"),
          correlationId: readHeader(request, "x-correlation-id"),
          timestamp: new Date().toISOString(),
        })
      )
      return {
        status: 302,
        headers: {
          location: this.service.buildErrorRedirect(reason),
        },
      }
    }
  }
}
