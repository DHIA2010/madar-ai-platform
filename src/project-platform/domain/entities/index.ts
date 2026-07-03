import type {
  DataSourceConnectionStatus,
  DataSourceHealth,
  DataSourceStatus,
  DataSourceSyncStatus,
  DataSourceType,
  ProjectEnvironment,
  ProjectInvitationStatus,
  ProjectMemberStatus,
  ProjectRole,
  ProjectStatus,
} from "../../types"

type PrimitiveValue = string | number | boolean

function assertName(name: string, label: string) {
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new Error(`${label} must be between 2 and 200 characters.`)
  }
  return trimmed
}

function assertPrimitiveRecord(record: Record<string, unknown>, label: string) {
  for (const [key, value] of Object.entries(record)) {
    if (value === null) {
      continue
    }
    const valueType = typeof value
    if (valueType !== "string" && valueType !== "number" && valueType !== "boolean") {
      throw new Error(`${label} must contain only JSON-compatible primitive values. Invalid key: ${key}`)
    }
  }
}

function cloneRecord<T extends Record<string, unknown>>(record: T): T {
  return { ...record }
}

export interface ProjectState {
  id: string
  organizationId: string
  workspaceId: string | null
  ownerUserId: string
  name: string
  status: ProjectStatus
  metadata: Record<string, string>
  branding: Record<string, string>
  logoUrl: string | null
  timezone: string
  currency: string
  locale: string
  environment: ProjectEnvironment
  settings: Record<string, PrimitiveValue>
  retentionPolicy: string | null
  defaultDashboard: string | null
  notificationPreferences: Record<string, PrimitiveValue>
  featureFlags: Record<string, boolean>
  connectorPreferences: Record<string, PrimitiveValue>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class ProjectEntity {
  private constructor(private readonly state: ProjectState) {}

  static create(input: {
    id: string
    organizationId: string
    workspaceId?: string | null
    ownerUserId: string
    name: string
    metadata?: Record<string, string>
    branding?: Record<string, string>
    logoUrl?: string | null
    timezone?: string
    currency?: string
    locale?: string
    environment?: ProjectEnvironment
    settings?: Record<string, PrimitiveValue>
    retentionPolicy?: string | null
    defaultDashboard?: string | null
    notificationPreferences?: Record<string, PrimitiveValue>
    featureFlags?: Record<string, boolean>
    connectorPreferences?: Record<string, PrimitiveValue>
    now: string
  }) {
    const name = assertName(input.name, "Project name")
    return new ProjectEntity({
      id: input.id,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      ownerUserId: input.ownerUserId,
      name,
      status: "active",
      metadata: input.metadata ?? {},
      branding: input.branding ?? {},
      logoUrl: input.logoUrl ?? null,
      timezone: input.timezone ?? "UTC",
      currency: input.currency ?? "USD",
      locale: input.locale ?? "en",
      environment: input.environment ?? "production",
      settings: input.settings ?? {},
      retentionPolicy: input.retentionPolicy ?? null,
      defaultDashboard: input.defaultDashboard ?? null,
      notificationPreferences: input.notificationPreferences ?? {},
      featureFlags: input.featureFlags ?? {},
      connectorPreferences: input.connectorPreferences ?? {},
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: ProjectState) {
    return new ProjectEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get organizationId() {
    return this.state.organizationId
  }

  get status() {
    return this.state.status
  }

  get ownerUserId() {
    return this.state.ownerUserId
  }

  rename(name: string, now: string) {
    this.ensureWritable()
    this.state.name = assertName(name, "Project name")
    this.state.updatedAt = now
  }

  archive(now: string) {
    this.ensureWritable()
    this.state.status = "archived"
    this.state.updatedAt = now
  }

  restore(now: string) {
    if (this.state.status !== "archived") {
      throw new Error("Only archived projects can be restored.")
    }
    this.state.status = "active"
    this.state.updatedAt = now
  }

  softDelete(now: string) {
    if (this.state.status === "deleted") {
      throw new Error("Project is already deleted.")
    }
    this.state.status = "deleted"
    this.state.deletedAt = now
    this.state.updatedAt = now
  }

  update(payload: {
    name?: string
    status?: ProjectStatus
    workspaceId?: string | null
    metadata?: Record<string, string>
    branding?: Record<string, string>
    logoUrl?: string | null
    timezone?: string
    currency?: string
    locale?: string
    environment?: ProjectEnvironment
    settings?: Record<string, PrimitiveValue>
    retentionPolicy?: string | null
    defaultDashboard?: string | null
    notificationPreferences?: Record<string, PrimitiveValue>
    featureFlags?: Record<string, boolean>
    connectorPreferences?: Record<string, PrimitiveValue>
  }, now: string) {
    this.ensureWritable()
    if (payload.name !== undefined) this.rename(payload.name, now)
    if (payload.status === "archived") this.archive(now)
    if (payload.status === "active" && this.state.status === "archived") this.restore(now)
    if (payload.status === "deleted") this.softDelete(now)
    if (payload.workspaceId !== undefined) this.state.workspaceId = payload.workspaceId
    if (payload.metadata !== undefined) {
      assertPrimitiveRecord(payload.metadata as Record<string, unknown>, "Project metadata")
      this.state.metadata = payload.metadata
    }
    if (payload.branding !== undefined) {
      assertPrimitiveRecord(payload.branding as Record<string, unknown>, "Project branding")
      this.state.branding = payload.branding
    }
    if (payload.logoUrl !== undefined) this.state.logoUrl = payload.logoUrl
    if (payload.timezone !== undefined) this.state.timezone = payload.timezone
    if (payload.currency !== undefined) this.state.currency = payload.currency
    if (payload.locale !== undefined) this.state.locale = payload.locale
    if (payload.environment !== undefined) this.state.environment = payload.environment
    if (payload.settings !== undefined) {
      assertPrimitiveRecord(payload.settings as Record<string, unknown>, "Project settings")
      this.state.settings = payload.settings
    }
    if (payload.retentionPolicy !== undefined) this.state.retentionPolicy = payload.retentionPolicy
    if (payload.defaultDashboard !== undefined) this.state.defaultDashboard = payload.defaultDashboard
    if (payload.notificationPreferences !== undefined) {
      assertPrimitiveRecord(payload.notificationPreferences as Record<string, unknown>, "Notification preferences")
      this.state.notificationPreferences = payload.notificationPreferences
    }
    if (payload.featureFlags !== undefined) this.state.featureFlags = payload.featureFlags
    if (payload.connectorPreferences !== undefined) {
      assertPrimitiveRecord(payload.connectorPreferences as Record<string, unknown>, "Connector preferences")
      this.state.connectorPreferences = payload.connectorPreferences
    }
    this.state.updatedAt = now
  }

  private ensureWritable() {
    if (this.state.status === "deleted" || this.state.deletedAt) {
      throw new Error("Project is deleted and cannot be modified.")
    }
  }

  toState(): ProjectState {
    return {
      ...this.state,
      metadata: cloneRecord(this.state.metadata),
      branding: cloneRecord(this.state.branding),
      settings: cloneRecord(this.state.settings),
      notificationPreferences: cloneRecord(this.state.notificationPreferences),
      featureFlags: cloneRecord(this.state.featureFlags),
      connectorPreferences: cloneRecord(this.state.connectorPreferences),
    }
  }
}

export interface ProjectMemberState {
  id: string
  projectId: string
  organizationId: string
  userId: string
  organizationRole: ProjectRole
  projectRole: ProjectRole
  accessPolicy: "inherited" | "custom" | "restricted"
  permissions: Record<string, boolean>
  status: ProjectMemberStatus
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
    role: ProjectRole
    actorUserId: string | null
    occurredAt: string
  }>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class ProjectMemberEntity {
  private constructor(private readonly state: ProjectMemberState) {}

  static create(input: {
    id: string
    projectId: string
    organizationId: string
    userId: string
    organizationRole: ProjectRole
    projectRole: ProjectRole
    accessPolicy?: ProjectMemberState["accessPolicy"]
    permissions?: Record<string, boolean>
    status?: ProjectMemberStatus
    invitedByUserId?: string | null
    acceptedAt?: string | null
    history?: ProjectMemberState["history"]
    roleHistory?: ProjectMemberState["roleHistory"]
    now: string
  }) {
    const status = input.status ?? "active"
    return new ProjectMemberEntity({
      id: input.id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      userId: input.userId,
      organizationRole: input.organizationRole,
      projectRole: input.projectRole,
      accessPolicy: input.accessPolicy ?? "inherited",
      permissions: input.permissions ?? {},
      status,
      statusReason: null,
      invitedByUserId: input.invitedByUserId ?? null,
      acceptedAt: input.acceptedAt ?? (status === "active" ? input.now : null),
      suspendedAt: null,
      removedAt: null,
      history: input.history ?? [],
      roleHistory: input.roleHistory ?? [
        { role: input.projectRole, actorUserId: input.invitedByUserId ?? null, occurredAt: input.now },
      ],
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: ProjectMemberState) {
    return new ProjectMemberEntity({ ...state, permissions: { ...state.permissions } })
  }

  get userId() {
    return this.state.userId
  }

  get projectRole() {
    return this.state.projectRole
  }

  assignRole(role: ProjectRole, actorUserId: string | null, now: string) {
    this.ensureWritable()
    this.state.projectRole = role
    this.state.roleHistory.push({ role, actorUserId, occurredAt: now })
    this.state.updatedAt = now
  }

  suspend(reason: string, actorUserId: string | null, now: string) {
    this.ensureWritable()
    this.state.status = "suspended"
    this.state.statusReason = reason
    this.state.suspendedAt = now
    this.state.history.push({ action: "suspended", actorUserId, occurredAt: now, details: { reason } })
    this.state.updatedAt = now
  }

  reactivate(actorUserId: string | null, now: string) {
    if (this.state.status !== "suspended") {
      throw new Error("Only suspended project members can be reactivated.")
    }
    this.state.status = "active"
    this.state.statusReason = null
    this.state.suspendedAt = null
    this.state.history.push({ action: "reactivated", actorUserId, occurredAt: now, details: {} })
    this.state.updatedAt = now
  }

  remove(reason: string, actorUserId: string | null, now: string) {
    this.ensureWritable()
    this.state.status = "removed"
    this.state.statusReason = reason
    this.state.removedAt = now
    this.state.history.push({ action: "removed", actorUserId, occurredAt: now, details: { reason } })
    this.state.updatedAt = now
  }

  private ensureWritable() {
    if (this.state.status === "removed" || this.state.deletedAt) {
      throw new Error("Project member is removed and cannot be modified.")
    }
  }

  toState(): ProjectMemberState {
    return {
      ...this.state,
      permissions: { ...this.state.permissions },
      history: [...this.state.history],
      roleHistory: [...this.state.roleHistory],
    }
  }
}

export interface ProjectInvitationState {
  id: string
  token: string
  email: string
  projectId: string
  organizationId: string
  workspaceId: string | null
  role: ProjectRole
  invitedByUserId: string
  status: ProjectInvitationStatus
  idempotencyKey: string
  expiresAt: string
  acceptedAt: string | null
  declinedAt: string | null
  canceledAt: string | null
  lastSentAt: string
  resendCount: number
  createdAt: string
}

export class ProjectInvitationEntity {
  private constructor(private readonly state: ProjectInvitationState) {}

  static create(input: {
    id: string
    token: string
    email: string
    projectId: string
    organizationId: string
    workspaceId?: string | null
    role: ProjectRole
    invitedByUserId: string
    idempotencyKey: string
    expiresAt: string
    now: string
  }) {
    return new ProjectInvitationEntity({
      id: input.id,
      token: input.token,
      email: input.email.toLowerCase(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      declinedAt: null,
      canceledAt: null,
      lastSentAt: input.now,
      resendCount: 0,
      createdAt: input.now,
    })
  }

  static rehydrate(state: ProjectInvitationState) {
    return new ProjectInvitationEntity({ ...state })
  }

  accept(now: string) {
    this.ensurePending()
    if (new Date(this.state.expiresAt).getTime() <= new Date(now).getTime()) {
      throw new Error("Invitation is expired.")
    }
    this.state.status = "accepted"
    this.state.acceptedAt = now
  }

  decline(now: string) {
    this.ensurePending()
    this.state.status = "declined"
    this.state.declinedAt = now
  }

  cancel(now: string) {
    this.ensurePending()
    this.state.status = "canceled"
    this.state.canceledAt = now
  }

  resend(now: string) {
    this.ensurePending()
    this.state.lastSentAt = now
    this.state.resendCount += 1
  }

  markExpired(now: string) {
    if (this.state.status !== "pending") {
      throw new Error("Only pending invitations can expire.")
    }
    this.state.status = "expired"
    this.state.lastSentAt = now
  }

  private ensurePending() {
    if (this.state.status !== "pending") {
      throw new Error("Invitation is not pending.")
    }
  }

  toState(): ProjectInvitationState {
    return { ...this.state }
  }
}

export interface DataSourceState {
  id: string
  projectId: string
  organizationId: string
  name: string
  type: DataSourceType
  status: DataSourceStatus
  metadata: Record<string, string | number | boolean>
  validationStatus: "pending" | "valid" | "invalid"
  healthStatus: DataSourceHealth
  syncStatus: DataSourceSyncStatus
  connectionStatus: DataSourceConnectionStatus
  futureOauthReady: boolean
  connectionReference: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export class DataSourceEntity {
  private constructor(private readonly state: DataSourceState) {}

  static create(input: {
    id: string
    projectId: string
    organizationId: string
    name: string
    type: DataSourceType
    metadata?: Record<string, string | number | boolean>
    futureOauthReady?: boolean
    connectionReference?: string | null
    now: string
  }) {
    return new DataSourceEntity({
      id: input.id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      name: assertName(input.name, "Data source name"),
      type: input.type,
      status: "draft",
      metadata: input.metadata ?? {},
      validationStatus: "pending",
      healthStatus: "unknown",
      syncStatus: "pending",
      connectionStatus: "not_applicable",
      futureOauthReady: input.futureOauthReady ?? true,
      connectionReference: input.connectionReference ?? null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    })
  }

  static rehydrate(state: DataSourceState) {
    return new DataSourceEntity({ ...state })
  }

  get id() {
    return this.state.id
  }

  get projectId() {
    return this.state.projectId
  }

  enable(now: string) {
    this.ensureWritable()
    this.state.status = "enabled"
    this.state.validationStatus = "valid"
    this.state.healthStatus = "healthy"
    this.state.syncStatus = "idle"
    this.state.connectionStatus = "connected"
    this.state.updatedAt = now
  }

  disable(now: string) {
    this.ensureWritable()
    this.state.status = "disabled"
    this.state.healthStatus = "unknown"
    this.state.syncStatus = "disabled"
    this.state.connectionStatus = "disconnected"
    this.state.updatedAt = now
  }

  archive(now: string) {
    this.ensureWritable()
    this.state.status = "archived"
    this.state.updatedAt = now
  }

  softDelete(now: string) {
    if (this.state.status === "deleted") {
      throw new Error("Data source is already deleted.")
    }
    this.state.status = "deleted"
    this.state.deletedAt = now
    this.state.updatedAt = now
  }

  update(payload: {
    name?: string
    type?: DataSourceType
    metadata?: Record<string, string | number | boolean>
    validationStatus?: "pending" | "valid" | "invalid"
    healthStatus?: DataSourceHealth
    syncStatus?: DataSourceSyncStatus
    connectionStatus?: DataSourceConnectionStatus
    futureOauthReady?: boolean
    connectionReference?: string | null
    status?: DataSourceStatus
  }, now: string) {
    this.ensureWritable()
    if (payload.name !== undefined) this.state.name = assertName(payload.name, "Data source name")
    if (payload.type !== undefined) this.state.type = payload.type
    if (payload.metadata !== undefined) this.state.metadata = payload.metadata
    if (payload.validationStatus !== undefined) this.state.validationStatus = payload.validationStatus
    if (payload.healthStatus !== undefined) this.state.healthStatus = payload.healthStatus
    if (payload.syncStatus !== undefined) this.state.syncStatus = payload.syncStatus
    if (payload.connectionStatus !== undefined) this.state.connectionStatus = payload.connectionStatus
    if (payload.futureOauthReady !== undefined) this.state.futureOauthReady = payload.futureOauthReady
    if (payload.connectionReference !== undefined) this.state.connectionReference = payload.connectionReference
    if (payload.status === "enabled") this.enable(now)
    if (payload.status === "disabled") this.disable(now)
    if (payload.status === "archived") this.archive(now)
    if (payload.status === "deleted") this.softDelete(now)
    this.state.updatedAt = now
  }

  private ensureWritable() {
    if (this.state.status === "deleted" || this.state.deletedAt) {
      throw new Error("Data source is deleted and cannot be modified.")
    }
  }

  toState(): DataSourceState {
    return { ...this.state, metadata: { ...this.state.metadata } }
  }
}
