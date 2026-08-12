import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { MetaOAuthService } from "./service"
import type { MetaOAuthStartInput } from "./types"

const CALLBACK_ERROR_REASON_MAP: Record<string, string> = {
  META_OAUTH_STATE_INVALID: "state_invalid",
  META_OAUTH_STATE_EXPIRED: "state_expired",
  META_OAUTH_STATE_ALREADY_CONSUMED: "state_already_consumed",
  META_OAUTH_TOKEN_EXCHANGE_FAILED: "token_exchange_failed",
  META_OAUTH_LONG_LIVED_EXCHANGE_FAILED: "long_lived_exchange_failed",
  META_OAUTH_ACCOUNT_DISCOVERY_FAILED: "account_discovery_failed",
  META_OAUTH_ACCOUNT_DISCOVERY_EMPTY: "account_discovery_empty",
  META_OAUTH_CONFIGURATION_ERROR: "configuration_error",
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

export class MetaOAuthController {
  constructor(private readonly service: MetaOAuthService) {}

  async start(actor: AuthenticatedActor, input: MetaOAuthStartInput) {
    return this.service.startAuthorization(actor, input)
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    return this.service.getActiveConnection(actor)
  }

  async pause(actor: AuthenticatedActor, connectionId: string) {
    return this.service.pauseConnection(actor, connectionId)
  }

  async resume(actor: AuthenticatedActor, connectionId: string) {
    return this.service.resumeConnection(actor, connectionId)
  }

  async disconnect(actor: AuthenticatedActor, input: { connectionId: string; reason?: string }) {
    return this.service.disconnectConnection(actor, input)
  }

  async reconnect(actor: AuthenticatedActor, connectionId: string) {
    return this.service.startReconnect(actor, connectionId)
  }

  async listRecentEvents(
    actor: AuthenticatedActor,
    input: { connectionId: string; limit: number }
  ) {
    return this.service.getRecentEvents(actor, input)
  }

  async callback(_request: IncomingMessage, query: URLSearchParams) {
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
      return {
        status: 302,
        headers: {
          location: this.service.buildErrorRedirect(reason),
        },
      }
    }
  }
}
