import type { Role } from "../types"
import type { CustomRoleRepository, SessionRepository } from "../domain/repositories"
import { SessionEntity } from "../domain/entities"
import { resolveMembershipModulePermissions } from "../domain/domain-services/module-permission-service"

import type { Clock, TokenService, UuidGenerator } from "./ports"

// Extracted from IdentityCommandHandlers.login()'s tail so a second caller (Zid marketplace
// auto-provisioning) can mint a real session for a user it just created, without duplicating the
// token/session mechanics or reimplementing them differently by accident.

export interface SessionIssuerConfig {
  accessTokenTtlSeconds: number
  refreshTokenTtlDays: number
  rememberMeRefreshTokenTtlDays: number
}

export interface SessionIssuerDeps {
  config: SessionIssuerConfig
  clock: Clock
  uuid: UuidGenerator
  tokenService: TokenService
  sessions: SessionRepository
  customRoles: CustomRoleRepository
}

export interface BuildTokenPairInput {
  userId: string
  organizationId: string
  workspaceId: string | null
  sessionId: string
  rememberMe: boolean
}

export function buildTokenPair(
  deps: Pick<SessionIssuerDeps, "config" | "clock" | "tokenService" | "uuid">,
  input: BuildTokenPairInput
) {
  const nowSeconds = Math.floor(deps.clock.now().getTime() / 1000)
  const accessTokenExpiresAt = new Date(
    (nowSeconds + deps.config.accessTokenTtlSeconds) * 1000
  ).toISOString()
  const refreshDays = input.rememberMe
    ? deps.config.rememberMeRefreshTokenTtlDays
    : deps.config.refreshTokenTtlDays
  const refreshTokenExpiresAt = new Date(
    Date.now() + refreshDays * 24 * 60 * 60 * 1000
  ).toISOString()

  return {
    accessToken: deps.tokenService.signAccessToken({
      sub: input.userId,
      sid: input.sessionId,
      org: input.organizationId,
      ws: input.workspaceId ?? undefined,
      typ: "access",
      iat: nowSeconds,
      exp: nowSeconds + deps.config.accessTokenTtlSeconds,
      jti: deps.uuid.generate(),
    }),
    refreshToken: deps.tokenService.generateOpaqueToken(),
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  }
}

export interface IssueSessionUser {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  timezone: string
  language: string
  status: string
}

export interface IssueSessionMembership {
  organizationId: string
  workspaceId: string | null
  role: Role
  customRoleId: string | null
  moduleAccessRevoked: boolean
}

export async function issueSessionForMember(input: {
  user: IssueSessionUser
  membership: IssueSessionMembership
  context: { ipAddress: string; userAgent: string }
  rememberMe: boolean
  now: string
  deps: SessionIssuerDeps
}) {
  const sessionId = input.deps.uuid.generate()
  const tokens = buildTokenPair(input.deps, {
    userId: input.user.id,
    organizationId: input.membership.organizationId,
    workspaceId: input.membership.workspaceId,
    sessionId,
    rememberMe: input.rememberMe,
  })

  const session = SessionEntity.create({
    id: sessionId,
    userId: input.user.id,
    organizationId: input.membership.organizationId,
    workspaceId: input.membership.workspaceId,
    refreshTokenHash: input.deps.tokenService.hashOpaqueToken(tokens.refreshToken),
    refreshTokenFamily: input.deps.uuid.generate(),
    revokedAt: null,
    rememberMe: input.rememberMe,
    userAgent: input.context.userAgent,
    ipAddress: input.context.ipAddress,
    expiresAt: tokens.refreshTokenExpiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  })
  await input.deps.sessions.save(session.toState())

  const modulePermissions = await resolveMembershipModulePermissions(
    input.membership,
    input.deps.customRoles
  )

  return {
    user: {
      id: input.user.id,
      email: input.user.email,
      fullName: input.user.fullName,
      avatarUrl: input.user.avatarUrl,
      timezone: input.user.timezone,
      language: input.user.language,
      status: input.user.status,
      modulePermissions,
    },
    session: {
      sessionId,
      organizationId: input.membership.organizationId,
      workspaceId: input.membership.workspaceId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      rememberMe: input.rememberMe,
    },
  }
}
