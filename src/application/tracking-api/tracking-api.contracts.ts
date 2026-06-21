import type {
  TrackingConsent,
  TrackingContext,
  TrackingEventName,
} from "@/application/contracts/tracking.contracts"

export type TrackingEndpointPath =
  | "/track"
  | "/identify"
  | "/session/start"
  | "/session/end"
  | "/consent"
  | "/batch"

export interface TrackingEndpoint {
  method: "POST"
  path: TrackingEndpointPath
}

export interface TrackingRequest {
  method: "POST"
  path: TrackingEndpointPath
  headers: Record<string, string | undefined>
  ipAddress: string
  body: {
    tenantId: string
    workspaceId: string
    trackingKey?: string
    timestamp: string
    payload: unknown
  }
}

export interface TrackingResponse {
  success: boolean
  statusCode: number
  requestId: string
  data?: unknown
  error?: {
    code: string
    message: string
  }
}

export interface TrackPayload {
  sessionId: string
  eventId?: string
  name: TrackingEventName
  context: TrackingContext
  payload: Record<string, string | number | boolean | null>
}

export interface IdentifyPayload {
  sourceVisitorId: string
  targetCustomerId: string
}

export interface SessionStartPayload {
  visitorId?: string
  customerId?: string
  context: TrackingContext
  sessionTtlMinutes?: number
}

export interface SessionEndPayload {
  sessionId: string
  context: TrackingContext
  exitPage?: string
}

export interface ConsentPayload {
  visitorId: string
  consent: TrackingConsent
}

export interface BatchPayload {
  events: TrackPayload[]
}

export type TrackingAuthenticationMode = "public" | "private" | "anonymous" | "signed"

export interface TrackingAuthenticationConfig {
  publicKeysByWorkspace: Record<string, string[]>
  privateKeysByWorkspace: Record<string, string[]>
  signatureSecretsByWorkspace: Record<string, string>
}

export interface TrackingRateLimitPolicy {
  windowMs: number
  maxRequests: number
}

export interface TrackingMiddlewareContext {
  request: TrackingRequest
  authenticationMode: TrackingAuthenticationMode
}

export type TrackingMiddlewareNext = () => Promise<TrackingResponse>

export type TrackingMiddlewareHandler = (
  context: TrackingMiddlewareContext,
  next: TrackingMiddlewareNext
) => Promise<TrackingResponse>
