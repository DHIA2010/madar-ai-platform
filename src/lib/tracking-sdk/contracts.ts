export type TrackingEndpointPath =
  | "/track"
  | "/identify"
  | "/session/start"
  | "/session/end"
  | "/consent"
  | "/batch"

export type TrackingAuthMode = "public" | "private" | "anonymous" | "signed"

export interface TrackingContext {
  timestamp: string
  language: string
  screenSize: string
  referrer: string | null
  landingPage: string
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    term: string | null
    content: string | null
  }
  device: {
    userAgent: string
    browser: string
    platform: string
  }
}

export interface TrackingApiRequest {
  tenantId: string
  workspaceId: string
  trackingKey?: string
  timestamp: string
  payload: unknown
}

export interface TrackingApiResponse<TData = unknown> {
  success: boolean
  statusCode: number
  requestId: string
  data?: TData
  error?: {
    code: string
    message: string
  }
}

export interface QueuedEvent {
  id: string
  path: TrackingEndpointPath
  payload: unknown
  createdAt: number
  attempts: number
  nextAttemptAt: number
}
