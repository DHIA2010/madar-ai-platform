import { randomUUID } from "node:crypto"

import { TrackingManager } from "@/application/services/tracking-manager.service"

import type {
  TrackingAuthenticationConfig,
  TrackingMiddlewareHandler,
  TrackingRequest,
  TrackingResponse,
} from "./tracking-api.contracts"
import { TrackingAuthentication } from "./tracking-authentication"
import { TrackingDeduplicator } from "./tracking-deduplicator"
import { TrackingMiddleware } from "./tracking-middleware"
import { TrackingProcessor } from "./tracking-processor"
import { TrackingRateLimiter } from "./tracking-rate-limiter"
import { TrackingValidation } from "./tracking-validation"

export class TrackingController {
  private readonly authentication: TrackingAuthentication
  private readonly validation: TrackingValidation
  private readonly rateLimiter: TrackingRateLimiter
  private readonly deduplicator: TrackingDeduplicator
  private readonly processor: TrackingProcessor
  private readonly middleware: TrackingMiddleware

  constructor(options?: {
    trackingManager?: TrackingManager
    authenticationConfig?: TrackingAuthenticationConfig
    validation?: TrackingValidation
    rateLimiter?: TrackingRateLimiter
    deduplicator?: TrackingDeduplicator
  }) {
    this.authentication = new TrackingAuthentication(
      options?.authenticationConfig ?? {
        publicKeysByWorkspace: {},
        privateKeysByWorkspace: {},
        signatureSecretsByWorkspace: {},
      }
    )
    this.validation = options?.validation ?? new TrackingValidation()
    this.rateLimiter =
      options?.rateLimiter ?? new TrackingRateLimiter({ windowMs: 60_000, maxRequests: 200 })
    this.deduplicator = options?.deduplicator ?? new TrackingDeduplicator()

    const trackingManager = options?.trackingManager ?? new TrackingManager()
    this.processor = new TrackingProcessor(trackingManager, this.validation)

    const handlers: TrackingMiddlewareHandler[] = [
      async (context, next) => {
        const validationResult = this.validation.validateRequest(context.request)
        if (!validationResult.valid) {
          return {
            success: false,
            statusCode: 400,
            requestId: randomUUID(),
            error: { code: "request_invalid", message: validationResult.reason },
          }
        }
        return next()
      },
      async (context, next) => {
        const authResult = this.authentication.authenticate(context.request)
        if (!authResult.allowed) {
          return {
            success: false,
            statusCode: 401,
            requestId: randomUUID(),
            error: { code: "unauthorized", message: authResult.reason ?? "Unauthorized" },
          }
        }

        context.authenticationMode = authResult.mode
        return next()
      },
      async (context, next) => {
        const limit = this.rateLimiter.check(context.request)
        if (!limit.allowed) {
          return {
            success: false,
            statusCode: 429,
            requestId: randomUUID(),
            error: { code: "rate_limited", message: "Too many tracking requests" },
          }
        }

        return next()
      },
      async (context, next) => {
        if (this.deduplicator.isDuplicate(context.request)) {
          return {
            success: false,
            statusCode: 409,
            requestId: randomUUID(),
            error: { code: "duplicate_request", message: "Duplicate tracking request" },
          }
        }
        return next()
      },
    ]

    this.middleware = new TrackingMiddleware(handlers)
  }

  async handle(request: TrackingRequest): Promise<TrackingResponse> {
    const requestId = randomUUID()

    return this.middleware.run(
      {
        request,
        authenticationMode: "anonymous",
      },
      async () => this.processor.process(request, requestId)
    )
  }
}
