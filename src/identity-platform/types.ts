export type Role = "owner" | "admin" | "manager" | "analyst" | "viewer"

export type Permission =
  | "org:read"
  | "org:write"
  | "org:invite"
  | "workspace:read"
  | "workspace:write"
  | "workspace:switch"
  | "membership:write"
  | "session:read"
  | "session:revoke"
  | "identity:read"
  | "identity:write"

export interface RequestContext {
  requestId: string
  correlationId: string
  ipAddress: string
  userAgent: string
  headers: Record<string, string | string[] | undefined>
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}
