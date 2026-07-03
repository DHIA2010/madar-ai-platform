import { EmailAddress } from "../value-objects"
import type { Role } from "../../types"

export interface UserState {
  id: string
  email: string
  passwordHash: string
  fullName: string
  avatarUrl: string | null
  timezone: string
  language: string
  status: "active" | "locked" | "pending_verification" | "disabled"
  emailVerifiedAt: string | null
  preferences: Record<string, string | boolean | number>
  failedLoginAttempts: number
  lockoutUntil: string | null
  activeWorkspaceId: string | null
  primaryOrganizationId: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export class UserEntity {
  private constructor(private readonly state: UserState) {}

  static register(input: {
    id: string
    email: string
    passwordHash: string
    fullName: string
    timezone: string
    language: string
    organizationId: string
    workspaceId: string
    now: string
  }) {
    const email = new EmailAddress(input.email)
    return new UserEntity({
      id: input.id,
      email: email.value,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      avatarUrl: null,
      timezone: input.timezone,
      language: input.language,
      status: "pending_verification",
      emailVerifiedAt: null,
      preferences: {},
      failedLoginAttempts: 0,
      lockoutUntil: null,
      activeWorkspaceId: input.workspaceId,
      primaryOrganizationId: input.organizationId,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
  }

  static rehydrate(state: UserState) {
    return new UserEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get email() {
    return this.state.email
  }

  get status() {
    return this.state.status
  }

  get activeWorkspaceId() {
    return this.state.activeWorkspaceId
  }

  verifyEmail(now: string) {
    this.state.emailVerifiedAt = now
    this.state.status = "active"
    this.state.updatedAt = now
  }

  ensureCanLogin(nowMs: number) {
    if (this.state.lockoutUntil && new Date(this.state.lockoutUntil).getTime() > nowMs) {
      return { allowed: false, reason: "locked", lockedUntil: this.state.lockoutUntil }
    }
    if (this.state.status === "pending_verification") {
      return { allowed: false, reason: "pending_verification" }
    }
    if (this.state.status !== "active") {
      return { allowed: false, reason: "forbidden" }
    }
    return { allowed: true as const }
  }

  recordFailedLogin(now: string, nowMs: number, lockoutAttempts: number, lockoutMinutes: number) {
    this.state.failedLoginAttempts += 1
    if (this.state.failedLoginAttempts >= lockoutAttempts) {
      this.state.lockoutUntil = new Date(nowMs + lockoutMinutes * 60_000).toISOString()
      this.state.status = "locked"
    }
    this.state.updatedAt = now
  }

  recordSuccessfulLogin(now: string) {
    this.state.failedLoginAttempts = 0
    this.state.lockoutUntil = null
    if (this.state.status === "locked") {
      this.state.status = this.state.emailVerifiedAt ? "active" : "pending_verification"
    }
    this.state.updatedAt = now
  }

  updateProfile(
    payload: {
      fullName?: string
      avatarUrl?: string | null
      timezone?: string
      language?: string
      preferences?: Record<string, string | number | boolean>
    },
    now: string
  ) {
    if (payload.fullName !== undefined) this.state.fullName = payload.fullName
    if (payload.avatarUrl !== undefined) this.state.avatarUrl = payload.avatarUrl
    if (payload.timezone !== undefined) this.state.timezone = payload.timezone
    if (payload.language !== undefined) this.state.language = payload.language
    if (payload.preferences !== undefined) this.state.preferences = payload.preferences
    this.state.updatedAt = now
  }

  changeEmail(newEmail: string, now: string) {
    this.state.email = new EmailAddress(newEmail).value
    this.state.emailVerifiedAt = null
    this.state.status = "pending_verification"
    this.state.updatedAt = now
  }

  changePassword(passwordHash: string, now: string) {
    this.state.passwordHash = passwordHash
    this.state.updatedAt = now
  }

  switchWorkspace(workspaceId: string, now: string) {
    this.state.activeWorkspaceId = workspaceId
    this.state.updatedAt = now
  }

  toState(): UserState {
    return { ...this.state }
  }
}

export interface OrganizationState {
  id: string
  name: string
  ownerUserId: string
  status: "active" | "archived" | "deleted"
  metadata: Record<string, string>
  branding: Record<string, string>
  logoUrl: string | null
  timezone: string
  locale: string
  currency: string
  subscriptionReference: string | null
  settings: Record<string, string | boolean | number>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class OrganizationEntity {
  private constructor(private readonly state: OrganizationState) {}

  static create(input: {
    id: string
    ownerUserId: string
    name: string
    metadata?: Record<string, string>
    branding?: Record<string, string>
    logoUrl?: string | null
    timezone?: string
    locale?: string
    currency?: string
    subscriptionReference?: string | null
    settings?: Record<string, string | boolean | number>
    now: string
  }) {
    const trimmedName = input.name.trim()
    if (trimmedName.length < 2 || trimmedName.length > 200) {
      throw new Error("Organization name must be between 2 and 200 characters.")
    }

    return new OrganizationEntity({
      id: input.id,
      ownerUserId: input.ownerUserId,
      name: trimmedName,
      status: "active",
      metadata: input.metadata ?? {},
      branding: input.branding ?? {},
      logoUrl: input.logoUrl ?? null,
      timezone: input.timezone ?? "UTC",
      locale: input.locale ?? "en",
      currency: input.currency ?? "USD",
      subscriptionReference: input.subscriptionReference ?? null,
      settings: input.settings ?? {},
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: OrganizationState) {
    return new OrganizationEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get ownerUserId() {
    return this.state.ownerUserId
  }

  rename(name: string, now: string) {
    this.ensureWritable()
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 200) {
      throw new Error("Organization name must be between 2 and 200 characters.")
    }
    this.state.name = trimmed
    this.state.updatedAt = now
  }

  transferOwnership(newOwnerUserId: string, now: string) {
    this.ensureWritable()
    this.state.ownerUserId = newOwnerUserId
    this.state.updatedAt = now
  }

  archive(now: string) {
    this.ensureWritable()
    this.state.status = "archived"
    this.state.updatedAt = now
  }

  restore(now: string) {
    if (this.state.status !== "archived") {
      throw new Error("Only archived organizations can be restored.")
    }
    this.state.status = "active"
    this.state.updatedAt = now
  }

  softDelete(now: string) {
    if (this.state.status === "deleted") {
      throw new Error("Organization is already deleted.")
    }
    this.state.status = "deleted"
    this.state.deletedAt = now
    this.state.updatedAt = now
  }

  update(
    payload: {
      name?: string
      status?: "active" | "archived" | "deleted"
      metadata?: Record<string, string>
      branding?: Record<string, string>
      logoUrl?: string | null
      timezone?: string
      locale?: string
      currency?: string
      subscriptionReference?: string | null
      settings?: Record<string, string | boolean | number>
    },
    now: string
  ) {
    this.ensureWritable()
    if (payload.name !== undefined) this.rename(payload.name, now)
    if (payload.status === "archived") this.archive(now)
    if (payload.status === "active" && this.state.status === "archived") this.restore(now)
    if (payload.status === "deleted") this.softDelete(now)
    if (payload.metadata !== undefined) this.state.metadata = payload.metadata
    if (payload.branding !== undefined) this.state.branding = payload.branding
    if (payload.logoUrl !== undefined) this.state.logoUrl = payload.logoUrl
    if (payload.timezone !== undefined) this.state.timezone = payload.timezone
    if (payload.locale !== undefined) this.state.locale = payload.locale
    if (payload.currency !== undefined) this.state.currency = payload.currency
    if (payload.subscriptionReference !== undefined)
      this.state.subscriptionReference = payload.subscriptionReference
    if (payload.settings !== undefined) this.state.settings = payload.settings
    this.state.updatedAt = now
  }

  private ensureWritable() {
    if (this.state.status === "deleted" || this.state.deletedAt) {
      throw new Error("Organization is deleted and cannot be modified.")
    }
  }

  toState(): OrganizationState {
    return { ...this.state }
  }
}

export interface WorkspaceState {
  id: string
  organizationId: string
  name: string
  status: "active" | "archived"
  metadata: Record<string, string>
  settings: Record<string, string | boolean | number>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class WorkspaceEntity {
  private constructor(private readonly state: WorkspaceState) {}

  static create(input: {
    id: string
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
    now: string
  }) {
    return new WorkspaceEntity({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      status: "active",
      metadata: input.metadata ?? {},
      settings: input.settings ?? {},
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: WorkspaceState) {
    return new WorkspaceEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get organizationId() {
    return this.state.organizationId
  }

  update(
    payload: {
      name?: string
      status?: "active" | "archived"
      metadata?: Record<string, string>
      settings?: Record<string, string | boolean | number>
    },
    now: string
  ) {
    if (payload.name !== undefined) this.state.name = payload.name
    if (payload.status !== undefined) this.state.status = payload.status
    if (payload.metadata !== undefined) this.state.metadata = payload.metadata
    if (payload.settings !== undefined) this.state.settings = payload.settings
    this.state.updatedAt = now
  }

  toState(): WorkspaceState {
    return { ...this.state }
  }
}

export interface MembershipState {
  id: string
  organizationId: string
  workspaceId: string | null
  userId: string
  role: Role
  status: "invited" | "active" | "suspended" | "removed"
  profile: Record<string, string>
  statusReason: string | null
  invitedByUserId: string | null
  acceptedAt: string | null
  suspendedAt: string | null
  removedAt: string | null
  history: Array<{
    action: string
    actorUserId: string | null
    occurredAt: string
    details: Record<string, string>
  }>
  roleHistory: Array<{
    role: Role
    actorUserId: string | null
    occurredAt: string
  }>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class MembershipEntity {
  private constructor(private readonly state: MembershipState) {}

  static create(input: {
    id: string
    organizationId: string
    workspaceId: string | null
    userId: string
    role: Role
    status?: MembershipState["status"]
    profile?: Record<string, string>
    invitedByUserId?: string | null
    acceptedAt?: string | null
    history?: MembershipState["history"]
    roleHistory?: MembershipState["roleHistory"]
    now: string
  }) {
    const status = input.status ?? "active"
    return new MembershipEntity({
      id: input.id,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      status,
      profile: input.profile ?? {},
      statusReason: null,
      invitedByUserId: input.invitedByUserId ?? null,
      acceptedAt: input.acceptedAt ?? (status === "active" ? input.now : null),
      suspendedAt: null,
      removedAt: null,
      history: input.history ?? [],
      roleHistory: input.roleHistory ?? [
        { role: input.role, actorUserId: input.invitedByUserId ?? null, occurredAt: input.now },
      ],
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: MembershipState) {
    return new MembershipEntity({ ...state })
  }

  get isActive() {
    return this.state.status === "active" && !this.state.deletedAt
  }

  get role() {
    return this.state.role
  }

  activate(now: string, actorUserId: string | null) {
    this.state.status = "active"
    this.state.statusReason = null
    this.state.acceptedAt = this.state.acceptedAt ?? now
    this.state.updatedAt = now
    this.state.history.push({
      action: "membership.activated",
      actorUserId,
      occurredAt: now,
      details: {},
    })
  }

  suspend(reason: string, now: string, actorUserId: string | null) {
    if (this.state.status === "removed") {
      throw new Error("Removed membership cannot be suspended.")
    }
    this.state.status = "suspended"
    this.state.statusReason = reason
    this.state.suspendedAt = now
    this.state.updatedAt = now
    this.state.history.push({
      action: "membership.suspended",
      actorUserId,
      occurredAt: now,
      details: { reason },
    })
  }

  reactivate(now: string, actorUserId: string | null) {
    if (this.state.status !== "suspended") {
      throw new Error("Only suspended memberships can be reactivated.")
    }
    this.state.status = "active"
    this.state.statusReason = null
    this.state.updatedAt = now
    this.state.history.push({
      action: "membership.reactivated",
      actorUserId,
      occurredAt: now,
      details: {},
    })
  }

  remove(reason: string, now: string, actorUserId: string | null) {
    if (this.state.status === "removed") {
      throw new Error("Membership already removed.")
    }
    this.state.status = "removed"
    this.state.statusReason = reason
    this.state.removedAt = now
    this.state.deletedAt = now
    this.state.updatedAt = now
    this.state.history.push({
      action: "membership.removed",
      actorUserId,
      occurredAt: now,
      details: { reason },
    })
  }

  assignRole(role: Role, now: string, actorUserId: string | null) {
    this.state.role = role
    this.state.updatedAt = now
    this.state.roleHistory.push({
      role,
      actorUserId,
      occurredAt: now,
    })
    this.state.history.push({
      action: "membership.role_assigned",
      actorUserId,
      occurredAt: now,
      details: { role },
    })
  }

  updateProfile(profile: Record<string, string>, now: string, actorUserId: string | null) {
    this.state.profile = profile
    this.state.updatedAt = now
    this.state.history.push({
      action: "membership.profile_updated",
      actorUserId,
      occurredAt: now,
      details: profile,
    })
  }

  toState(): MembershipState {
    return { ...this.state }
  }
}

export interface SessionState {
  id: string
  userId: string
  organizationId: string
  workspaceId: string | null
  refreshTokenHash: string
  refreshTokenFamily: string
  revokedAt: string | null
  rememberMe: boolean
  userAgent: string
  ipAddress: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export class SessionEntity {
  private constructor(private readonly state: SessionState) {}

  static create(input: SessionState) {
    return new SessionEntity({ ...input })
  }

  static rehydrate(state: SessionState) {
    return new SessionEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get userId() {
    return this.state.userId
  }

  get organizationId() {
    return this.state.organizationId
  }

  get workspaceId() {
    return this.state.workspaceId
  }

  get rememberMe() {
    return this.state.rememberMe
  }

  get expiresAt() {
    return this.state.expiresAt
  }

  get refreshTokenHash() {
    return this.state.refreshTokenHash
  }

  isExpired(nowMs: number) {
    return new Date(this.state.expiresAt).getTime() < nowMs
  }

  isRevoked() {
    return Boolean(this.state.revokedAt)
  }

  rotateRefreshToken(refreshTokenHash: string, expiresAt: string, now: string) {
    this.state.refreshTokenHash = refreshTokenHash
    this.state.expiresAt = expiresAt
    this.state.updatedAt = now
  }

  revoke(now: string) {
    this.state.revokedAt = now
    this.state.updatedAt = now
  }

  toState(): SessionState {
    return { ...this.state }
  }
}

export interface EmailVerificationState {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export class EmailVerificationEntity {
  private constructor(private readonly state: EmailVerificationState) {}

  static create(state: EmailVerificationState) {
    return new EmailVerificationEntity({ ...state })
  }

  static rehydrate(state: EmailVerificationState) {
    return new EmailVerificationEntity({ ...state })
  }

  get userId() {
    return this.state.userId
  }

  get tokenHash() {
    return this.state.tokenHash
  }

  canConsume(nowMs: number) {
    return !this.state.consumedAt && new Date(this.state.expiresAt).getTime() >= nowMs
  }

  consume(now: string) {
    this.state.consumedAt = now
  }

  toState(): EmailVerificationState {
    return { ...this.state }
  }
}

export interface PasswordResetState {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export class PasswordResetEntity {
  private constructor(private readonly state: PasswordResetState) {}

  static create(state: PasswordResetState) {
    return new PasswordResetEntity({ ...state })
  }

  static rehydrate(state: PasswordResetState) {
    return new PasswordResetEntity({ ...state })
  }

  get userId() {
    return this.state.userId
  }

  get tokenHash() {
    return this.state.tokenHash
  }

  canConsume(nowMs: number) {
    return !this.state.consumedAt && new Date(this.state.expiresAt).getTime() >= nowMs
  }

  consume(now: string) {
    this.state.consumedAt = now
  }

  toState(): PasswordResetState {
    return { ...this.state }
  }
}

export interface InvitationState {
  id: string
  token: string
  email: string
  organizationId: string
  workspaceId: string | null
  role: Role
  invitedBy: string
  status: "pending" | "accepted" | "declined" | "canceled" | "expired"
  idempotencyKey: string
  expiresAt: string
  acceptedAt: string | null
  declinedAt: string | null
  canceledAt: string | null
  lastSentAt: string
  resendCount: number
  createdAt: string
}

export class InvitationEntity {
  private constructor(private readonly state: InvitationState) {}

  static create(state: InvitationState) {
    return new InvitationEntity({ ...state, email: new EmailAddress(state.email).value })
  }

  static rehydrate(state: InvitationState) {
    return new InvitationEntity({ ...state })
  }

  get token() {
    return this.state.token
  }

  get email() {
    return this.state.email
  }

  get organizationId() {
    return this.state.organizationId
  }

  get workspaceId() {
    return this.state.workspaceId
  }

  get role() {
    return this.state.role
  }

  get id() {
    return this.state.id
  }

  get status() {
    return this.state.status
  }

  get invitedBy() {
    return this.state.invitedBy
  }

  get idempotencyKey() {
    return this.state.idempotencyKey
  }

  canAccept(nowMs: number) {
    return this.state.status === "pending" && new Date(this.state.expiresAt).getTime() >= nowMs
  }

  accept(now: string) {
    if (this.state.status !== "pending") {
      throw new Error("Only pending invitations can be accepted.")
    }
    this.state.status = "accepted"
    this.state.acceptedAt = now
  }

  decline(now: string) {
    if (this.state.status !== "pending") {
      throw new Error("Only pending invitations can be declined.")
    }
    this.state.status = "declined"
    this.state.declinedAt = now
  }

  cancel(now: string) {
    if (this.state.status !== "pending") {
      throw new Error("Only pending invitations can be canceled.")
    }
    this.state.status = "canceled"
    this.state.canceledAt = now
  }

  markExpired(now: string) {
    if (this.state.status !== "pending") {
      return
    }
    this.state.status = "expired"
    this.state.declinedAt = this.state.declinedAt ?? now
  }

  resend(now: string) {
    if (this.state.status !== "pending") {
      throw new Error("Only pending invitations can be resent.")
    }
    this.state.lastSentAt = now
    this.state.resendCount += 1
  }

  toState(): InvitationState {
    return { ...this.state }
  }
}

export interface AuditLogState {
  id: string
  actorUserId: string | null
  organizationId: string | null
  workspaceId: string | null
  action: string
  targetType: string
  targetId: string | null
  details: Record<string, unknown>
  ipAddress: string
  userAgent: string
  createdAt: string
}

export class AuditLogEntity {
  private constructor(private readonly state: AuditLogState) {}

  static create(state: AuditLogState) {
    return new AuditLogEntity({ ...state })
  }

  toState(): AuditLogState {
    return { ...this.state }
  }
}
