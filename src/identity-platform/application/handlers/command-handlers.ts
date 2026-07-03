import type { Role } from "../../types"
import type { IdentityPlatformConfig } from "../../configuration"
import type { RequestContext, AuthenticatedActor, TokenPair } from "../dto/identity-dtos"
import type {
  AcceptInvitationCommand,
  ArchiveOrganizationCommand,
  AssignMemberRoleCommand,
  CancelInvitationCommand,
  ChangeEmailCommand,
  ChangePasswordCommand,
  CreateOrganizationCommand,
  CreateWorkspaceCommand,
  DeclineInvitationCommand,
  DeleteOrganizationCommand,
  ForgotPasswordCommand,
  InviteMemberCommand,
  LoginUserCommand,
  LogoutCommand,
  ReactivateMemberCommand,
  RefreshSessionCommand,
  RemoveMemberCommand,
  ResendInvitationCommand,
  RestoreOrganizationCommand,
  RegisterUserCommand,
  ResetPasswordCommand,
  RevokeSessionCommand,
  SuspendMemberCommand,
  SwitchWorkspaceCommand,
  TransferOwnershipCommand,
  UpdateMemberProfileCommand,
  UpdateOrganizationCommand,
  UpdateProfileCommand,
  UpdateWorkspaceCommand,
  VerifyEmailCommand,
} from "../commands"
import type {
  Clock,
  EmailGateway,
  EventPublisher,
  FeatureFlagProvider,
  Logger,
  MetricsProvider,
  PasswordHasher,
  RateLimiter,
  TokenService,
  UuidGenerator,
} from "../ports"
import type { IdentityRepositories } from "../../domain/repositories"
import {
  AuditLogEntity,
  EmailVerificationEntity,
  InvitationEntity,
  MembershipEntity,
  OrganizationEntity,
  PasswordResetEntity,
  SessionEntity,
  UserEntity,
  WorkspaceEntity,
} from "../../domain/entities"
import type { DomainEvent } from "../../domain/events"
import { ERRORS, IdentityError } from "../errors/IdentityError"
import { hasPermission, resolvePermissions } from "../../domain/domain-services/permission-service"

export interface IdentityCommandHandlerDependencies {
  config: IdentityPlatformConfig
  repositories: IdentityRepositories
  clock: Clock
  uuid: UuidGenerator
  hasher: PasswordHasher
  tokenService: TokenService
  rateLimiter: RateLimiter
  emailGateway: EmailGateway
  logger: Logger
  eventPublisher: EventPublisher
  featureFlags?: FeatureFlagProvider
  metrics?: MetricsProvider
}

export class IdentityCommandHandlers {
  constructor(private readonly deps: IdentityCommandHandlerDependencies) {}

  private get now() {
    return this.deps.clock.nowIso()
  }

  private async audit(
    action: string,
    context: RequestContext,
    actorUserId: string | null,
    organizationId: string | null,
    workspaceId: string | null,
    targetType: string,
    targetId: string | null,
    details: Record<string, unknown> = {}
  ) {
    const entry = AuditLogEntity.create({
      id: this.deps.uuid.generate(),
      actorUserId,
      organizationId,
      workspaceId,
      action,
      targetType,
      targetId,
      details,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      createdAt: this.now,
    })
    await this.deps.repositories.auditLogs.append(entry.toState())
  }

  private async enforceRateLimit(key: string, limit: number, windowMs: number) {
    const decision = await this.deps.rateLimiter.check(key, limit, windowMs)
    if (!decision.allowed) {
      throw new IdentityError("AUTH_RATE_LIMITED", 429, "security", "Too many requests.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      })
    }
  }

  private createEvent(input: {
    eventType: string
    aggregateType: string
    aggregateId: string
    context: RequestContext
    payload: Record<string, unknown>
  }): DomainEvent {
    return {
      eventId: this.deps.uuid.generate(),
      eventType: input.eventType,
      eventVersion: 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      occurredAt: this.now,
      metadata: {
        requestId: input.context.requestId,
        correlationId: input.context.correlationId,
      },
      payload: input.payload,
    }
  }

  private async publishEvents(context: RequestContext, events: DomainEvent[]) {
    if (events.length === 0) {
      return
    }
    await this.deps.eventPublisher.publish(events)
    this.deps.logger.info("identity.domain_events.published", {
      requestId: context.requestId,
      correlationId: context.correlationId,
      count: events.length,
      eventTypes: events.map((event) => event.eventType),
    })
  }

  private buildTokenPair(input: {
    userId: string
    organizationId: string
    workspaceId: string | null
    sessionId: string
    rememberMe: boolean
  }): TokenPair {
    const nowSeconds = Math.floor(this.deps.clock.now().getTime() / 1000)
    const accessTokenExpiresAt = new Date(
      (nowSeconds + this.deps.config.accessTokenTtlSeconds) * 1000
    ).toISOString()
    const refreshDays = input.rememberMe
      ? this.deps.config.rememberMeRefreshTokenTtlDays
      : this.deps.config.refreshTokenTtlDays
    const refreshTokenExpiresAt = new Date(
      Date.now() + refreshDays * 24 * 60 * 60 * 1000
    ).toISOString()

    return {
      accessToken: this.deps.tokenService.signAccessToken({
        sub: input.userId,
        sid: input.sessionId,
        org: input.organizationId,
        ws: input.workspaceId ?? undefined,
        typ: "access",
        iat: nowSeconds,
        exp: nowSeconds + this.deps.config.accessTokenTtlSeconds,
        jti: this.deps.uuid.generate(),
      }),
      refreshToken: this.deps.tokenService.generateOpaqueToken(),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    }
  }

  async register(command: RegisterUserCommand, context: RequestContext) {
    await this.enforceRateLimit(`register:${context.ipAddress}`, 20, 60_000)
    if (await this.deps.repositories.users.findByEmail(command.email.toLowerCase())) {
      throw ERRORS.emailAlreadyExists()
    }

    const timestamp = this.now
    const userId = this.deps.uuid.generate()
    const organizationId = this.deps.uuid.generate()
    const workspaceId = this.deps.uuid.generate()
    const user = UserEntity.register({
      id: userId,
      email: command.email,
      passwordHash: this.deps.hasher.hash(command.password),
      fullName: command.fullName,
      timezone: command.timezone,
      language: command.language,
      organizationId,
      workspaceId,
      now: timestamp,
    })
    const organization = OrganizationEntity.create({
      id: organizationId,
      ownerUserId: userId,
      name: command.organizationName,
      now: timestamp,
    })
    const workspace = WorkspaceEntity.create({
      id: workspaceId,
      organizationId,
      name: `${command.organizationName} - Default`,
      now: timestamp,
    })
    const membership = MembershipEntity.create({
      id: this.deps.uuid.generate(),
      organizationId,
      workspaceId,
      userId,
      role: "owner",
      now: timestamp,
    })

    await this.deps.repositories.users.save(user.toState())
    await this.deps.repositories.organizations.save(organization.toState())
    await this.deps.repositories.workspaces.save(workspace.toState())
    await this.deps.repositories.memberships.save(membership.toState())

    const verificationToken = this.deps.tokenService.generateOpaqueToken()
    const verification = EmailVerificationEntity.create({
      id: this.deps.uuid.generate(),
      userId,
      tokenHash: this.deps.tokenService.hashOpaqueToken(verificationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: timestamp,
    })
    await this.deps.repositories.emailVerifications.save(verification.toState())
    await this.deps.emailGateway.sendVerificationEmail({
      email: user.email,
      token: verificationToken,
    })

    await this.audit(
      "auth.register",
      context,
      userId,
      organizationId,
      workspaceId,
      "user",
      userId,
      {
        email: user.email,
      }
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "UserRegistered",
        aggregateType: "user",
        aggregateId: userId,
        context,
        payload: { userId, organizationId, workspaceId, email: user.email },
      }),
      this.createEvent({
        eventType: "OrganizationCreated",
        aggregateType: "organization",
        aggregateId: organizationId,
        context,
        payload: { organizationId, ownerUserId: userId },
      }),
      this.createEvent({
        eventType: "WorkspaceCreated",
        aggregateType: "workspace",
        aggregateId: workspaceId,
        context,
        payload: { workspaceId, organizationId },
      }),
      this.createEvent({
        eventType: "EmailVerificationRequested",
        aggregateType: "user",
        aggregateId: userId,
        context,
        payload: { userId, email: user.email },
      }),
    ])

    return {
      userId,
      organizationId,
      workspaceId,
      verificationToken,
    }
  }

  async verifyEmail(command: VerifyEmailCommand, context: RequestContext) {
    const tokenHash = this.deps.tokenService.hashOpaqueToken(command.token)
    const verificationState =
      await this.deps.repositories.emailVerifications.findByTokenHash(tokenHash)
    if (!verificationState) {
      throw ERRORS.tokenInvalid()
    }
    const verification = EmailVerificationEntity.rehydrate(verificationState)
    if (!verification.canConsume(Date.now())) {
      throw ERRORS.tokenInvalid()
    }
    const userState = await this.deps.repositories.users.findById(verification.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    const user = UserEntity.rehydrate(userState)
    user.verifyEmail(this.now)
    verification.consume(this.now)
    await this.deps.repositories.users.save(user.toState())
    await this.deps.repositories.emailVerifications.save(verification.toState())
    await this.audit(
      "auth.verify_email",
      context,
      user.id,
      user.toState().primaryOrganizationId,
      user.activeWorkspaceId,
      "user",
      user.id
    )
  }

  async login(command: LoginUserCommand, context: RequestContext) {
    await this.enforceRateLimit(`login:${context.ipAddress}`, 50, 60_000)
    const userState = await this.deps.repositories.users.findByEmail(command.email.toLowerCase())
    if (!userState) {
      throw ERRORS.invalidCredentials()
    }
    const user = UserEntity.rehydrate(userState)
    const loginCheck = user.ensureCanLogin(Date.now())
    if (!loginCheck.allowed) {
      if (loginCheck.reason === "locked") {
        throw ERRORS.locked(loginCheck.lockedUntil as string)
      }
      if (loginCheck.reason === "pending_verification") {
        throw ERRORS.emailNotVerified()
      }
      throw ERRORS.forbidden()
    }
    if (!this.deps.hasher.verify(command.password, user.toState().passwordHash)) {
      user.recordFailedLogin(
        this.now,
        Date.now(),
        this.deps.config.lockoutAttempts,
        this.deps.config.lockoutMinutes
      )
      await this.deps.repositories.users.save(user.toState())
      await this.audit(
        "auth.login_failed",
        context,
        user.id,
        user.toState().primaryOrganizationId,
        user.activeWorkspaceId,
        "user",
        user.id
      )
      throw ERRORS.invalidCredentials()
    }

    user.recordSuccessfulLogin(this.now)
    await this.deps.repositories.users.save(user.toState())
    const membership = await this.deps.repositories.memberships.findFirstByUserId(user.id)
    if (!membership) {
      throw ERRORS.forbidden()
    }

    const sessionId = this.deps.uuid.generate()
    const tokens = this.buildTokenPair({
      userId: user.id,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      sessionId,
      rememberMe: Boolean(command.rememberMe),
    })
    const session = SessionEntity.create({
      id: sessionId,
      userId: user.id,
      organizationId: membership.organizationId,
      workspaceId: membership.workspaceId,
      refreshTokenHash: this.deps.tokenService.hashOpaqueToken(tokens.refreshToken),
      refreshTokenFamily: this.deps.uuid.generate(),
      revokedAt: null,
      rememberMe: Boolean(command.rememberMe),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: tokens.refreshTokenExpiresAt,
      createdAt: this.now,
      updatedAt: this.now,
    })
    await this.deps.repositories.sessions.save(session.toState())
    await this.audit(
      "auth.login",
      context,
      user.id,
      membership.organizationId,
      membership.workspaceId,
      "session",
      sessionId
    )

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.toState().fullName,
        avatarUrl: user.toState().avatarUrl,
        timezone: user.toState().timezone,
        language: user.toState().language,
        status: user.status,
      },
      session: {
        sessionId,
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        rememberMe: Boolean(command.rememberMe),
      },
    }
  }

  async refresh(command: RefreshSessionCommand, context: RequestContext) {
    await this.enforceRateLimit(`refresh:${context.ipAddress}`, 120, 60_000)
    const tokenHash = this.deps.tokenService.hashOpaqueToken(command.refreshToken)
    const sessionState = await this.deps.repositories.sessions.findByRefreshTokenHash(tokenHash)
    if (!sessionState) {
      throw ERRORS.tokenInvalid()
    }
    const session = SessionEntity.rehydrate(sessionState)
    if (session.isRevoked() || session.isExpired(Date.now())) {
      throw ERRORS.tokenInvalid()
    }
    const tokens = this.buildTokenPair({
      userId: session.userId,
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      sessionId: session.id,
      rememberMe: session.rememberMe,
    })
    session.rotateRefreshToken(
      this.deps.tokenService.hashOpaqueToken(tokens.refreshToken),
      tokens.refreshTokenExpiresAt,
      this.now
    )
    await this.deps.repositories.sessions.save(session.toState())
    await this.audit(
      "auth.refresh",
      context,
      session.userId,
      session.organizationId,
      session.workspaceId,
      "session",
      session.id
    )
    return {
      sessionId: session.id,
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      rememberMe: session.rememberMe,
    }
  }

  async logout(command: LogoutCommand, context: RequestContext, actor: AuthenticatedActor) {
    const sessionState = await this.deps.repositories.sessions.findById(command.sessionId)
    if (!sessionState || sessionState.userId !== actor.userId) {
      throw ERRORS.notFound("Session")
    }
    const session = SessionEntity.rehydrate(sessionState)
    session.revoke(this.now)
    await this.deps.repositories.sessions.save(session.toState())
    await this.audit(
      "auth.logout",
      context,
      actor.userId,
      actor.organizationId,
      actor.workspaceId,
      "session",
      session.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "SessionRevoked",
        aggregateType: "session",
        aggregateId: session.id,
        context,
        payload: { sessionId: session.id, userId: actor.userId, reason: "logout" },
      }),
    ])
  }

  async revokeSession(
    command: RevokeSessionCommand,
    context: RequestContext,
    actor: AuthenticatedActor
  ) {
    if (!hasPermission(actor.roles, "session:revoke")) {
      throw ERRORS.forbidden()
    }
    const sessionState = await this.deps.repositories.sessions.findById(command.sessionId)
    if (!sessionState) {
      throw ERRORS.notFound("Session")
    }
    const session = SessionEntity.rehydrate(sessionState)
    session.revoke(this.now)
    await this.deps.repositories.sessions.save(session.toState())
    await this.audit(
      "auth.session_revoke",
      context,
      actor.userId,
      session.organizationId,
      session.workspaceId,
      "session",
      session.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "SessionRevoked",
        aggregateType: "session",
        aggregateId: session.id,
        context,
        payload: { sessionId: session.id, userId: session.userId, reason: "manual_revoke" },
      }),
    ])
  }

  async createPasswordReset(command: ForgotPasswordCommand, context: RequestContext) {
    await this.enforceRateLimit(`password_reset:${context.ipAddress}`, 10, 60_000)
    const userState = await this.deps.repositories.users.findByEmail(command.email.toLowerCase())
    if (!userState) {
      return { accepted: true }
    }
    const token = this.deps.tokenService.generateOpaqueToken()
    const entry = PasswordResetEntity.create({
      id: this.deps.uuid.generate(),
      userId: userState.id,
      tokenHash: this.deps.tokenService.hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: this.now,
    })
    await this.deps.repositories.passwordResets.save(entry.toState())
    await this.deps.emailGateway.sendPasswordResetEmail({ email: userState.email, token })
    await this.audit(
      "auth.password_reset_requested",
      context,
      userState.id,
      userState.primaryOrganizationId,
      userState.activeWorkspaceId,
      "user",
      userState.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "PasswordResetRequested",
        aggregateType: "user",
        aggregateId: userState.id,
        context,
        payload: { userId: userState.id, email: userState.email },
      }),
    ])
    return { accepted: true, resetToken: token }
  }

  async resetPassword(command: ResetPasswordCommand, context: RequestContext) {
    const tokenHash = this.deps.tokenService.hashOpaqueToken(command.token)
    const resetState = await this.deps.repositories.passwordResets.findByTokenHash(tokenHash)
    if (!resetState) {
      throw ERRORS.tokenInvalid()
    }
    const reset = PasswordResetEntity.rehydrate(resetState)
    if (!reset.canConsume(Date.now())) {
      throw ERRORS.tokenInvalid()
    }
    const userState = await this.deps.repositories.users.findById(reset.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    const user = UserEntity.rehydrate(userState)
    user.changePassword(this.deps.hasher.hash(command.password), this.now)
    await this.deps.repositories.users.save(user.toState())
    reset.consume(this.now)
    await this.deps.repositories.passwordResets.save(reset.toState())
    for (const sessionState of await this.deps.repositories.sessions.listByUserId(user.id)) {
      if (!sessionState.revokedAt) {
        const session = SessionEntity.rehydrate(sessionState)
        session.revoke(this.now)
        await this.deps.repositories.sessions.save(session.toState())
      }
    }
    await this.audit(
      "auth.password_reset_completed",
      context,
      user.id,
      user.toState().primaryOrganizationId,
      user.activeWorkspaceId,
      "user",
      user.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "PasswordChanged",
        aggregateType: "user",
        aggregateId: user.id,
        context,
        payload: { userId: user.id, reason: "password_reset" },
      }),
    ])
  }

  async updateProfile(
    actor: AuthenticatedActor,
    command: UpdateProfileCommand,
    context: RequestContext
  ) {
    const userState = await this.deps.repositories.users.findById(actor.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    const user = UserEntity.rehydrate(userState)
    user.updateProfile(command, this.now)
    await this.deps.repositories.users.save(user.toState())
    await this.audit(
      "identity.profile_updated",
      context,
      actor.userId,
      actor.organizationId,
      actor.workspaceId,
      "user",
      actor.userId
    )
    return user.toState()
  }

  async changeEmail(
    actor: AuthenticatedActor,
    command: ChangeEmailCommand,
    context: RequestContext
  ) {
    const userState = await this.deps.repositories.users.findById(actor.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    if (!this.deps.hasher.verify(command.password, userState.passwordHash)) {
      throw ERRORS.invalidCredentials()
    }
    if (await this.deps.repositories.users.findByEmail(command.newEmail.toLowerCase())) {
      throw ERRORS.emailAlreadyExists()
    }
    const user = UserEntity.rehydrate(userState)
    user.changeEmail(command.newEmail, this.now)
    await this.deps.repositories.users.save(user.toState())
    const verificationToken = this.deps.tokenService.generateOpaqueToken()
    const verification = EmailVerificationEntity.create({
      id: this.deps.uuid.generate(),
      userId: user.id,
      tokenHash: this.deps.tokenService.hashOpaqueToken(verificationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: this.now,
    })
    await this.deps.repositories.emailVerifications.save(verification.toState())
    await this.deps.emailGateway.sendVerificationEmail({
      email: user.toState().email,
      token: verificationToken,
    })
    await this.audit(
      "identity.email_change_requested",
      context,
      actor.userId,
      actor.organizationId,
      actor.workspaceId,
      "user",
      actor.userId
    )
    return { success: true, verificationToken }
  }

  async changePassword(
    actor: AuthenticatedActor,
    command: ChangePasswordCommand,
    context: RequestContext
  ) {
    const userState = await this.deps.repositories.users.findById(actor.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    if (!this.deps.hasher.verify(command.currentPassword, userState.passwordHash)) {
      throw ERRORS.invalidCredentials()
    }
    const user = UserEntity.rehydrate(userState)
    user.changePassword(this.deps.hasher.hash(command.newPassword), this.now)
    await this.deps.repositories.users.save(user.toState())
    for (const sessionState of await this.deps.repositories.sessions.listByUserId(actor.userId)) {
      if (!sessionState.revokedAt) {
        const session = SessionEntity.rehydrate(sessionState)
        session.revoke(this.now)
        await this.deps.repositories.sessions.save(session.toState())
      }
    }
    await this.audit(
      "identity.password_changed",
      context,
      actor.userId,
      actor.organizationId,
      actor.workspaceId,
      "user",
      actor.userId
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "PasswordChanged",
        aggregateType: "user",
        aggregateId: actor.userId,
        context,
        payload: { userId: actor.userId, reason: "password_change" },
      }),
    ])
    return { success: true }
  }

  private async requireOrganizationMembership(userId: string, organizationId: string) {
    const membership = await this.deps.repositories.memberships.findByUserAndOrganization(
      userId,
      organizationId
    )
    if (!membership || membership.deletedAt || membership.status !== "active") {
      throw ERRORS.forbidden()
    }
    return membership
  }

  private async requireOrganizationWriteAccess(actor: AuthenticatedActor, organizationId: string) {
    const membership = await this.requireOrganizationMembership(actor.userId, organizationId)
    if (!hasPermission([membership.role], "org:write")) {
      throw ERRORS.forbidden()
    }
    return membership
  }

  private async listActiveMembershipsByOrganization(organizationId: string) {
    return (await this.deps.repositories.memberships.listByOrganizationId(organizationId)).filter(
      (membership) => !membership.deletedAt && membership.status === "active"
    )
  }

  private async enforceAtLeastOneOwner(organizationId: string) {
    const owners = (await this.listActiveMembershipsByOrganization(organizationId)).filter(
      (membership) => membership.role === "owner"
    )
    if (owners.length === 0) {
      throw new IdentityError(
        "ORG_OWNER_REQUIRED",
        409,
        "business",
        "Organization must have at least one active owner."
      )
    }
  }

  async createOrganization(
    actor: AuthenticatedActor,
    command: CreateOrganizationCommand,
    context: RequestContext
  ) {
    const startedAt = Date.now()
    const organization = OrganizationEntity.create({
      id: this.deps.uuid.generate(),
      ownerUserId: actor.userId,
      name: command.name,
      metadata: command.metadata,
      branding: command.branding,
      logoUrl: command.logoUrl,
      timezone: command.timezone,
      locale: command.locale,
      currency: command.currency,
      subscriptionReference: command.subscriptionReference,
      settings: command.settings,
      now: this.now,
    })
    const ownerMembership = MembershipEntity.create({
      id: this.deps.uuid.generate(),
      organizationId: organization.id,
      workspaceId: null,
      userId: actor.userId,
      role: "owner",
      status: "active",
      invitedByUserId: actor.userId,
      now: this.now,
    })

    await this.deps.repositories.organizations.save(organization.toState())
    await this.deps.repositories.memberships.save(ownerMembership.toState())
    await this.audit(
      "organization.created",
      context,
      actor.userId,
      organization.id,
      null,
      "organization",
      organization.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OrganizationCreated",
        aggregateType: "organization",
        aggregateId: organization.id,
        context,
        payload: { organizationId: organization.id, ownerUserId: actor.userId },
      }),
    ])
    this.deps.metrics?.recordHistogram("organization_create_duration", Date.now() - startedAt, {
      organizationId: organization.id,
    })
    return organization.toState()
  }

  async updateOrganization(
    actor: AuthenticatedActor,
    organizationId: string,
    command: UpdateOrganizationCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, organizationId)
    const organizationState = await this.deps.repositories.organizations.findById(organizationId)
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }
    const organization = OrganizationEntity.rehydrate(organizationState)
    organization.update(command, this.now)
    await this.deps.repositories.organizations.save(organization.toState())
    await this.audit(
      "organization.updated",
      context,
      actor.userId,
      organization.id,
      null,
      "organization",
      organization.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OrganizationUpdated",
        aggregateType: "organization",
        aggregateId: organization.id,
        context,
        payload: { organizationId: organization.id },
      }),
    ])
    return organization.toState()
  }

  async archiveOrganization(
    actor: AuthenticatedActor,
    command: ArchiveOrganizationCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }
    const organization = OrganizationEntity.rehydrate(organizationState)
    organization.archive(this.now)
    await this.deps.repositories.organizations.save(organization.toState())
    await this.audit(
      "organization.archived",
      context,
      actor.userId,
      organization.id,
      null,
      "organization",
      organization.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OrganizationArchived",
        aggregateType: "organization",
        aggregateId: organization.id,
        context,
        payload: { organizationId: organization.id },
      }),
    ])
    return organization.toState()
  }

  async restoreOrganization(
    actor: AuthenticatedActor,
    command: RestoreOrganizationCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }
    const organization = OrganizationEntity.rehydrate(organizationState)
    organization.restore(this.now)
    await this.deps.repositories.organizations.save(organization.toState())
    await this.audit(
      "organization.restored",
      context,
      actor.userId,
      organization.id,
      null,
      "organization",
      organization.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OrganizationUpdated",
        aggregateType: "organization",
        aggregateId: organization.id,
        context,
        payload: { organizationId: organization.id, status: "active" },
      }),
    ])
    return organization.toState()
  }

  async deleteOrganization(
    actor: AuthenticatedActor,
    command: DeleteOrganizationCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }
    const organization = OrganizationEntity.rehydrate(organizationState)
    organization.softDelete(this.now)
    await this.deps.repositories.organizations.save(organization.toState())
    await this.audit(
      "organization.deleted",
      context,
      actor.userId,
      organization.id,
      null,
      "organization",
      organization.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OrganizationDeleted",
        aggregateType: "organization",
        aggregateId: organization.id,
        context,
        payload: { organizationId: organization.id },
      }),
    ])
    return organization.toState()
  }

  async createWorkspace(
    actor: AuthenticatedActor,
    command: CreateWorkspaceCommand,
    context: RequestContext
  ) {
    const membership = await this.deps.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      command.organizationId
    )
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw ERRORS.forbidden()
    }
    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }
    const workspace = WorkspaceEntity.create({
      id: this.deps.uuid.generate(),
      organizationId: command.organizationId,
      name: command.name,
      metadata: command.metadata,
      settings: command.settings,
      now: this.now,
    })
    const ownerMembership = MembershipEntity.create({
      id: this.deps.uuid.generate(),
      organizationId: command.organizationId,
      workspaceId: workspace.id,
      userId: actor.userId,
      role: membership.role,
      now: this.now,
    })
    await this.deps.repositories.workspaces.save(workspace.toState())
    await this.deps.repositories.memberships.save(ownerMembership.toState())
    await this.audit(
      "workspace.created",
      context,
      actor.userId,
      command.organizationId,
      workspace.id,
      "workspace",
      workspace.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "WorkspaceCreated",
        aggregateType: "workspace",
        aggregateId: workspace.id,
        context,
        payload: { workspaceId: workspace.id, organizationId: command.organizationId },
      }),
    ])
    return workspace.toState()
  }

  async updateWorkspace(
    actor: AuthenticatedActor,
    workspaceId: string,
    command: UpdateWorkspaceCommand,
    context: RequestContext
  ) {
    const membership = await this.deps.repositories.memberships.findByUserAndWorkspace(
      actor.userId,
      workspaceId
    )
    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw ERRORS.forbidden()
    }
    const workspaceState = await this.deps.repositories.workspaces.findById(workspaceId)
    if (!workspaceState) {
      throw ERRORS.notFound("Workspace")
    }
    const workspace = WorkspaceEntity.rehydrate(workspaceState)
    workspace.update(command, this.now)
    await this.deps.repositories.workspaces.save(workspace.toState())
    await this.audit(
      "workspace.updated",
      context,
      actor.userId,
      workspace.organizationId,
      workspace.id,
      "workspace",
      workspace.id
    )
    return workspace.toState()
  }

  async inviteMember(
    actor: AuthenticatedActor,
    command: InviteMemberCommand,
    context: RequestContext
  ) {
    const membership = await this.requireOrganizationMembership(
      actor.userId,
      command.organizationId
    )
    if (
      !(
        hasPermission([membership.role], "membership:write") ||
        ["owner", "admin"].includes(membership.role)
      )
    ) {
      throw ERRORS.forbidden()
    }
    const idempotencyKey =
      command.idempotencyKey ??
      `${command.organizationId}:${command.email.toLowerCase()}:${command.role}`
    const existingInvitation = await this.deps.repositories.invitations.findPendingByIdempotencyKey(
      command.organizationId,
      idempotencyKey
    )
    if (existingInvitation) {
      return existingInvitation
    }

    await this.enforceRateLimit(
      `organization_invite:${command.organizationId}:${context.ipAddress}`,
      30,
      60_000
    )

    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState || organizationState.status !== "active") {
      throw ERRORS.notFound("Organization")
    }
    if (command.workspaceId) {
      const workspaceState = await this.deps.repositories.workspaces.findById(command.workspaceId)
      if (!workspaceState || workspaceState.organizationId !== command.organizationId) {
        throw ERRORS.notFound("Workspace")
      }
    }

    const now = this.now
    const invitation = InvitationEntity.create({
      id: this.deps.uuid.generate(),
      token: this.deps.tokenService.generateOpaqueToken(),
      email: command.email,
      organizationId: command.organizationId,
      workspaceId: command.workspaceId ?? null,
      role: command.role,
      invitedBy: actor.userId,
      status: "pending",
      idempotencyKey,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null,
      declinedAt: null,
      canceledAt: null,
      lastSentAt: now,
      resendCount: 0,
      createdAt: now,
    })
    await this.deps.repositories.invitations.save(invitation.toState())
    await this.deps.emailGateway.sendInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      organizationId: command.organizationId,
      workspaceId: command.workspaceId,
    })
    await this.audit(
      "organization.invite_created",
      context,
      actor.userId,
      command.organizationId,
      command.workspaceId ?? null,
      "invitation",
      invitation.toState().id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "MemberInvited",
        aggregateType: "organization",
        aggregateId: command.organizationId,
        context,
        payload: {
          invitationId: invitation.id,
          email: invitation.email,
          role: invitation.role,
          workspaceId: invitation.workspaceId,
        },
      }),
    ])
    return invitation.toState()
  }

  async acceptInvitation(
    actor: AuthenticatedActor,
    command: AcceptInvitationCommand,
    context: RequestContext
  ) {
    const invitationState = await this.deps.repositories.invitations.findByToken(command.token)
    if (!invitationState) {
      throw ERRORS.tokenInvalid()
    }
    const invitation = InvitationEntity.rehydrate(invitationState)
    if (!invitation.canAccept(Date.now())) {
      invitation.markExpired(this.now)
      await this.deps.repositories.invitations.save(invitation.toState())
      await this.publishEvents(context, [
        this.createEvent({
          eventType: "InvitationExpired",
          aggregateType: "invitation",
          aggregateId: invitation.id,
          context,
          payload: { invitationId: invitation.id, organizationId: invitation.organizationId },
        }),
      ])
      throw ERRORS.tokenInvalid()
    }
    const userState = await this.deps.repositories.users.findById(actor.userId)
    if (!userState || userState.email !== invitation.email) {
      throw ERRORS.forbidden()
    }

    const existing = await this.deps.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      invitation.organizationId
    )
    if (existing && existing.status === "active" && !existing.deletedAt) {
      invitation.accept(this.now)
      await this.deps.repositories.invitations.save(invitation.toState())
      return { success: true, membershipId: existing.id }
    }

    invitation.accept(this.now)
    await this.deps.repositories.invitations.save(invitation.toState())
    const membership = MembershipEntity.create({
      id: this.deps.uuid.generate(),
      organizationId: invitation.organizationId,
      workspaceId: invitation.workspaceId,
      userId: actor.userId,
      role: invitation.role,
      status: "active",
      invitedByUserId: invitation.invitedBy,
      acceptedAt: this.now,
      now: this.now,
    })
    await this.deps.repositories.memberships.save(membership.toState())
    await this.audit(
      "organization.invitation_accepted",
      context,
      actor.userId,
      invitation.organizationId,
      invitation.workspaceId,
      "invitation",
      invitation.toState().id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "InvitationAccepted",
        aggregateType: "invitation",
        aggregateId: invitation.toState().id,
        context,
        payload: {
          invitationId: invitation.toState().id,
          userId: actor.userId,
          workspaceId: invitation.workspaceId,
        },
      }),
      this.createEvent({
        eventType: "MemberJoined",
        aggregateType: "organization",
        aggregateId: invitation.organizationId,
        context,
        payload: {
          organizationId: invitation.organizationId,
          userId: actor.userId,
          role: invitation.role,
        },
      }),
    ])
    this.deps.metrics?.incrementCounter("membership_count", 1, {
      organizationId: invitation.organizationId,
    })
    this.deps.metrics?.incrementCounter("invitation_accept_rate", 1, {
      organizationId: invitation.organizationId,
    })
    return { success: true, membershipId: membership.toState().id }
  }

  async declineInvitation(
    actor: AuthenticatedActor,
    command: DeclineInvitationCommand,
    context: RequestContext
  ) {
    const invitationState = await this.deps.repositories.invitations.findByToken(command.token)
    if (!invitationState) {
      throw ERRORS.tokenInvalid()
    }
    const invitation = InvitationEntity.rehydrate(invitationState)
    invitation.decline(this.now)
    await this.deps.repositories.invitations.save(invitation.toState())
    await this.audit(
      "organization.invitation_declined",
      context,
      actor.userId,
      invitation.organizationId,
      invitation.workspaceId,
      "invitation",
      invitation.id
    )
    return { success: true }
  }

  async cancelInvitation(
    actor: AuthenticatedActor,
    command: CancelInvitationCommand,
    context: RequestContext
  ) {
    const invitationState = await this.deps.repositories.invitations.findById(command.invitationId)
    if (!invitationState) {
      throw ERRORS.notFound("Invitation")
    }
    const invitation = InvitationEntity.rehydrate(invitationState)
    await this.requireOrganizationWriteAccess(actor, invitation.organizationId)
    invitation.cancel(this.now)
    await this.deps.repositories.invitations.save(invitation.toState())
    await this.audit(
      "organization.invitation_canceled",
      context,
      actor.userId,
      invitation.organizationId,
      invitation.workspaceId,
      "invitation",
      invitation.id
    )
    return { success: true }
  }

  async resendInvitation(
    actor: AuthenticatedActor,
    command: ResendInvitationCommand,
    context: RequestContext
  ) {
    const invitationState = await this.deps.repositories.invitations.findById(command.invitationId)
    if (!invitationState) {
      throw ERRORS.notFound("Invitation")
    }
    const invitation = InvitationEntity.rehydrate(invitationState)
    await this.requireOrganizationWriteAccess(actor, invitation.organizationId)
    await this.enforceRateLimit(
      `organization_invite_resend:${invitation.organizationId}:${context.ipAddress}`,
      20,
      60_000
    )
    invitation.resend(this.now)
    await this.deps.repositories.invitations.save(invitation.toState())
    await this.deps.emailGateway.sendInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      organizationId: invitation.organizationId,
      workspaceId: invitation.workspaceId ?? undefined,
    })
    await this.audit(
      "organization.invitation_resent",
      context,
      actor.userId,
      invitation.organizationId,
      invitation.workspaceId,
      "invitation",
      invitation.id
    )
    return invitation.toState()
  }

  async removeMember(
    actor: AuthenticatedActor,
    command: RemoveMemberCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const memberState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.memberUserId,
      command.organizationId
    )
    if (!memberState) {
      throw ERRORS.notFound("Membership")
    }
    const member = MembershipEntity.rehydrate(memberState)
    const previousRole = member.role
    member.remove(command.reason, this.now, actor.userId)
    await this.deps.repositories.memberships.save(member.toState())
    await this.enforceAtLeastOneOwner(command.organizationId)
    await this.audit(
      "membership.removed",
      context,
      actor.userId,
      command.organizationId,
      memberState.workspaceId,
      "membership",
      memberState.id
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "RoleRevoked",
        aggregateType: "membership",
        aggregateId: memberState.id,
        context,
        payload: {
          organizationId: command.organizationId,
          userId: command.memberUserId,
          role: previousRole,
        },
      }),
      this.createEvent({
        eventType: "MemberRemoved",
        aggregateType: "organization",
        aggregateId: command.organizationId,
        context,
        payload: {
          organizationId: command.organizationId,
          userId: command.memberUserId,
          reason: command.reason,
        },
      }),
    ])
    return member.toState()
  }

  async suspendMember(
    actor: AuthenticatedActor,
    command: SuspendMemberCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const memberState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.memberUserId,
      command.organizationId
    )
    if (!memberState) {
      throw ERRORS.notFound("Membership")
    }
    const member = MembershipEntity.rehydrate(memberState)
    member.suspend(command.reason, this.now, actor.userId)
    await this.deps.repositories.memberships.save(member.toState())
    await this.enforceAtLeastOneOwner(command.organizationId)
    await this.audit(
      "membership.suspended",
      context,
      actor.userId,
      command.organizationId,
      memberState.workspaceId,
      "membership",
      memberState.id
    )
    return member.toState()
  }

  async reactivateMember(
    actor: AuthenticatedActor,
    command: ReactivateMemberCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const memberState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.memberUserId,
      command.organizationId
    )
    if (!memberState) {
      throw ERRORS.notFound("Membership")
    }
    const member = MembershipEntity.rehydrate(memberState)
    member.reactivate(this.now, actor.userId)
    await this.deps.repositories.memberships.save(member.toState())
    await this.audit(
      "membership.reactivated",
      context,
      actor.userId,
      command.organizationId,
      memberState.workspaceId,
      "membership",
      memberState.id
    )
    return member.toState()
  }

  async transferOwnership(
    actor: AuthenticatedActor,
    command: TransferOwnershipCommand,
    context: RequestContext
  ) {
    const actorMembership = await this.requireOrganizationMembership(
      actor.userId,
      command.organizationId
    )
    if (actorMembership.role !== "owner") {
      throw ERRORS.forbidden()
    }
    const newOwnerState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.newOwnerUserId,
      command.organizationId
    )
    if (!newOwnerState || newOwnerState.status !== "active" || newOwnerState.deletedAt) {
      throw ERRORS.notFound("Membership")
    }
    const organizationState = await this.deps.repositories.organizations.findById(
      command.organizationId
    )
    if (!organizationState) {
      throw ERRORS.notFound("Organization")
    }

    const organization = OrganizationEntity.rehydrate(organizationState)
    const newOwner = MembershipEntity.rehydrate(newOwnerState)
    const currentOwner = MembershipEntity.rehydrate(actorMembership)

    organization.transferOwnership(command.newOwnerUserId, this.now)
    newOwner.assignRole("owner", this.now, actor.userId)
    currentOwner.assignRole("admin", this.now, actor.userId)

    await this.deps.repositories.organizations.save(organization.toState())
    await this.deps.repositories.memberships.save(newOwner.toState())
    await this.deps.repositories.memberships.save(currentOwner.toState())
    await this.enforceAtLeastOneOwner(command.organizationId)
    await this.audit(
      "organization.ownership_transferred",
      context,
      actor.userId,
      command.organizationId,
      null,
      "organization",
      command.organizationId,
      {
        previousOwnerUserId: actor.userId,
        newOwnerUserId: command.newOwnerUserId,
      }
    )
    await this.publishEvents(context, [
      this.createEvent({
        eventType: "OwnershipTransferred",
        aggregateType: "organization",
        aggregateId: command.organizationId,
        context,
        payload: {
          organizationId: command.organizationId,
          previousOwnerUserId: actor.userId,
          newOwnerUserId: command.newOwnerUserId,
        },
      }),
    ])
    return organization.toState()
  }

  async assignMemberRole(
    actor: AuthenticatedActor,
    command: AssignMemberRoleCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const memberState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.memberUserId,
      command.organizationId
    )
    if (!memberState) {
      throw ERRORS.notFound("Membership")
    }
    const member = MembershipEntity.rehydrate(memberState)
    const previousRole = member.role
    member.assignRole(command.role, this.now, actor.userId)
    await this.deps.repositories.memberships.save(member.toState())
    await this.enforceAtLeastOneOwner(command.organizationId)
    await this.audit(
      "membership.role_assigned",
      context,
      actor.userId,
      command.organizationId,
      memberState.workspaceId,
      "membership",
      memberState.id,
      {
        role: command.role,
      }
    )
    await this.publishEvents(context, [
      ...(previousRole === command.role
        ? []
        : [
            this.createEvent({
              eventType: "RoleRevoked",
              aggregateType: "membership",
              aggregateId: memberState.id,
              context,
              payload: {
                organizationId: command.organizationId,
                userId: command.memberUserId,
                role: previousRole,
              },
            }),
          ]),
      this.createEvent({
        eventType: "RoleAssigned",
        aggregateType: "membership",
        aggregateId: memberState.id,
        context,
        payload: {
          organizationId: command.organizationId,
          userId: command.memberUserId,
          role: command.role,
        },
      }),
    ])
    this.deps.metrics?.incrementCounter("role_assignment_count", 1, {
      organizationId: command.organizationId,
      role: command.role,
    })
    return member.toState()
  }

  async updateMemberProfile(
    actor: AuthenticatedActor,
    command: UpdateMemberProfileCommand,
    context: RequestContext
  ) {
    await this.requireOrganizationWriteAccess(actor, command.organizationId)
    const memberState = await this.deps.repositories.memberships.findByUserAndOrganization(
      command.memberUserId,
      command.organizationId
    )
    if (!memberState) {
      throw ERRORS.notFound("Membership")
    }
    const member = MembershipEntity.rehydrate(memberState)
    member.updateProfile(command.profile, this.now, actor.userId)
    await this.deps.repositories.memberships.save(member.toState())
    await this.audit(
      "membership.profile_updated",
      context,
      actor.userId,
      command.organizationId,
      memberState.workspaceId,
      "membership",
      memberState.id
    )
    return member.toState()
  }

  async switchWorkspace(
    actor: AuthenticatedActor,
    command: SwitchWorkspaceCommand,
    context: RequestContext
  ) {
    const membership = await this.deps.repositories.memberships.findByUserAndWorkspace(
      actor.userId,
      command.workspaceId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const userState = await this.deps.repositories.users.findById(actor.userId)
    if (!userState) {
      throw ERRORS.notFound("User")
    }
    const user = UserEntity.rehydrate(userState)
    user.switchWorkspace(command.workspaceId, this.now)
    await this.deps.repositories.users.save(user.toState())
    await this.audit(
      "workspace.switched",
      context,
      actor.userId,
      membership.organizationId,
      command.workspaceId,
      "workspace",
      command.workspaceId
    )
    return { success: true, activeWorkspaceId: command.workspaceId }
  }

  async resolveActorFromAccessToken(accessToken: string): Promise<AuthenticatedActor> {
    const payload = this.deps.tokenService.verifyAccessToken(accessToken)
    if (!payload || payload.typ !== "access") {
      throw ERRORS.tokenInvalid()
    }
    const sessionState = await this.deps.repositories.sessions.findById(payload.sid)
    if (!sessionState) {
      throw ERRORS.tokenInvalid()
    }
    const session = SessionEntity.rehydrate(sessionState)
    if (session.isRevoked() || session.isExpired(Date.now())) {
      throw ERRORS.tokenInvalid()
    }
    const userState = await this.deps.repositories.users.findById(payload.sub)
    if (!userState || userState.deletedAt) {
      throw ERRORS.tokenInvalid()
    }
    const roles = (await this.deps.repositories.memberships.listRolesByUserInOrganization(
      payload.sub,
      session.organizationId
    )) as Role[]
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      roles,
    }
  }

  resolvePermissions(roles: Role[]) {
    return resolvePermissions(roles)
  }
}
