type Role = "owner" | "admin" | "manager" | "analyst" | "viewer"

export interface RequestContext {
  requestId: string
  correlationId: string
  ipAddress: string
  userAgent: string
  headers: Record<string, string | string[] | undefined>
}

export interface AuthenticatedActor {
  userId: string
  sessionId: string
  organizationId: string
  workspaceId: string | null
  roles: Role[]
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}
