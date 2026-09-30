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
  modulePermissions: string[]
  // Madar's own staff (see platformAdminEmails config), resolved once per request -- lets any
  // command check cross-tenant authorization without re-querying an allowlist. Optional (not
  // required) so the many existing test fixtures that construct an AuthenticatedActor literal
  // without it don't all need updating -- absent is treated the same as false everywhere it's
  // checked.
  isPlatformAdmin?: boolean
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}
