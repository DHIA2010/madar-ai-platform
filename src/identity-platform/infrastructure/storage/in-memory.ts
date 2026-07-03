import { randomUUID } from "node:crypto"

import type {
  IdentityRepositories,
  AuditLogRepository,
  EmailVerificationRepository,
  InvitationRepository,
  MembershipRepository,
  OrganizationRepository,
  PasswordResetRepository,
  SessionRepository,
  UserRepository,
  WorkspaceRepository,
} from "../../domain/repositories"
import type {
  AuditLogState,
  EmailVerificationState,
  InvitationState,
  MembershipState,
  OrganizationState,
  PasswordResetState,
  SessionState,
  UserState,
  WorkspaceState,
} from "../../domain/entities"

export interface InMemoryIdentityDataStore {
  users: Map<string, UserState>
  usersByEmail: Map<string, string>
  organizations: Map<string, OrganizationState>
  workspaces: Map<string, WorkspaceState>
  memberships: Map<string, MembershipState>
  sessions: Map<string, SessionState>
  emailVerifications: Map<string, EmailVerificationState>
  passwordResets: Map<string, PasswordResetState>
  invitations: Map<string, InvitationState>
  auditLogs: AuditLogState[]
}

export function createInMemoryIdentityDataStore(): InMemoryIdentityDataStore {
  return {
    users: new Map(),
    usersByEmail: new Map(),
    organizations: new Map(),
    workspaces: new Map(),
    memberships: new Map(),
    sessions: new Map(),
    emailVerifications: new Map(),
    passwordResets: new Map(),
    invitations: new Map(),
    auditLogs: [],
  }
}

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}

  async findById(id: string) {
    return this.store.users.get(id) ?? null
  }

  async findByEmail(email: string) {
    const userId = this.store.usersByEmail.get(email.toLowerCase())
    return userId ? this.store.users.get(userId) ?? null : null
  }

  async save(user: UserState) {
    const previous = this.store.users.get(user.id)
    if (previous && previous.email !== user.email) {
      this.store.usersByEmail.delete(previous.email)
    }
    this.store.users.set(user.id, { ...user })
    this.store.usersByEmail.set(user.email, user.id)
  }
}

class InMemoryOrganizationRepository implements OrganizationRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findById(id: string) {
    return this.store.organizations.get(id) ?? null
  }
  async list(input: {
    ownerUserId?: string
    status?: OrganizationState["status"]
    page?: number
    pageSize?: number
    sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
  } = {}) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const rows = [...this.store.organizations.values()]
      .filter((organization) => (input.ownerUserId ? organization.ownerUserId === input.ownerUserId : true))
      .filter((organization) => (input.status ? organization.status === input.status : true))

    const sorted = rows.sort((left, right) => {
      const sort = input.sort ?? "createdAt:desc"
      if (sort === "name:asc") return left.name.localeCompare(right.name)
      if (sort === "name:desc") return right.name.localeCompare(left.name)
      if (sort === "createdAt:asc") return left.createdAt.localeCompare(right.createdAt)
      return right.createdAt.localeCompare(left.createdAt)
    })

    const offset = (page - 1) * pageSize
    return sorted.slice(offset, offset + pageSize)
  }
  async save(organization: OrganizationState) {
    this.store.organizations.set(organization.id, { ...organization })
  }
}

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findById(id: string) {
    return this.store.workspaces.get(id) ?? null
  }
  async save(workspace: WorkspaceState) {
    this.store.workspaces.set(workspace.id, { ...workspace })
  }
}

class InMemoryMembershipRepository implements MembershipRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findById(id: string) {
    return this.store.memberships.get(id) ?? null
  }
  async save(membership: MembershipState) {
    this.store.memberships.set(membership.id, { ...membership })
  }
  async findByUserAndWorkspace(userId: string, workspaceId: string) {
    for (const membership of this.store.memberships.values()) {
      if (membership.userId === userId && membership.workspaceId === workspaceId && !membership.deletedAt) {
        return membership
      }
    }
    return null
  }
  async findByUserAndOrganization(userId: string, organizationId: string) {
    for (const membership of this.store.memberships.values()) {
      if (membership.userId === userId && membership.organizationId === organizationId && !membership.deletedAt) {
        return membership
      }
    }
    return null
  }
  async findFirstByUserId(userId: string) {
    for (const membership of this.store.memberships.values()) {
      if (membership.userId === userId && !membership.deletedAt) {
        return membership
      }
    }
    return null
  }
  async listByUserId(userId: string) {
    return [...this.store.memberships.values()].filter((membership) => membership.userId === userId && !membership.deletedAt)
  }
  async listByWorkspaceId(workspaceId: string) {
    return [...this.store.memberships.values()].filter((membership) => membership.workspaceId === workspaceId && !membership.deletedAt)
  }
  async listByOrganizationId(organizationId: string) {
    return [...this.store.memberships.values()].filter((membership) => membership.organizationId === organizationId)
  }
  async listRolesByUserInOrganization(userId: string, organizationId: string) {
    const memberships = await this.listByOrganizationId(organizationId)
    return memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.role)
  }
}

class InMemorySessionRepository implements SessionRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findById(id: string) {
    return this.store.sessions.get(id) ?? null
  }
  async findByRefreshTokenHash(refreshTokenHash: string) {
    for (const session of this.store.sessions.values()) {
      if (session.refreshTokenHash === refreshTokenHash && !session.revokedAt) {
        return session
      }
    }
    return null
  }
  async listByUserId(userId: string) {
    return [...this.store.sessions.values()].filter((session) => session.userId === userId)
  }
  async save(session: SessionState) {
    this.store.sessions.set(session.id, { ...session })
  }
}

class InMemoryEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findByTokenHash(tokenHash: string) {
    return this.store.emailVerifications.get(tokenHash) ?? null
  }
  async save(entry: EmailVerificationState) {
    this.store.emailVerifications.set(entry.tokenHash, { ...entry })
  }
}

class InMemoryPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findByTokenHash(tokenHash: string) {
    return this.store.passwordResets.get(tokenHash) ?? null
  }
  async save(entry: PasswordResetState) {
    this.store.passwordResets.set(entry.tokenHash, { ...entry })
  }
}

class InMemoryInvitationRepository implements InvitationRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async findById(id: string) {
    for (const invitation of this.store.invitations.values()) {
      if (invitation.id === id) {
        return invitation
      }
    }
    return null
  }
  async findByToken(token: string) {
    return this.store.invitations.get(token) ?? null
  }
  async listByOrganizationId(
    organizationId: string,
    input: { page?: number; pageSize?: number; status?: InvitationState["status"] } = {}
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const rows = [...this.store.invitations.values()]
      .filter((invitation) => invitation.organizationId === organizationId)
      .filter((invitation) => (input.status ? invitation.status === input.status : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const offset = (page - 1) * pageSize
    return rows.slice(offset, offset + pageSize)
  }
  async findPendingByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    for (const invitation of this.store.invitations.values()) {
      if (
        invitation.organizationId === organizationId
        && invitation.idempotencyKey === idempotencyKey
        && invitation.status === "pending"
      ) {
        return invitation
      }
    }
    return null
  }
  async save(entry: InvitationState) {
    this.store.invitations.set(entry.token, { ...entry })
  }
}

class InMemoryAuditLogRepository implements AuditLogRepository {
  constructor(private readonly store: InMemoryIdentityDataStore) {}
  async append(entry: AuditLogState) {
    this.store.auditLogs.push({ ...entry })
  }
  async listRecent(page: number, pageSize: number) {
    const start = (page - 1) * pageSize
    return this.store.auditLogs.slice().reverse().slice(start, start + pageSize)
  }
  async count() {
    return this.store.auditLogs.length
  }
}

export function createInMemoryRepositories(store = createInMemoryIdentityDataStore()): IdentityRepositories {
  return {
    users: new InMemoryUserRepository(store),
    organizations: new InMemoryOrganizationRepository(store),
    workspaces: new InMemoryWorkspaceRepository(store),
    memberships: new InMemoryMembershipRepository(store),
    sessions: new InMemorySessionRepository(store),
    emailVerifications: new InMemoryEmailVerificationRepository(store),
    passwordResets: new InMemoryPasswordResetRepository(store),
    invitations: new InMemoryInvitationRepository(store),
    auditLogs: new InMemoryAuditLogRepository(store),
  }
}

export function newId() {
  return randomUUID()
}

export function nowIso() {
  return new Date().toISOString()
}
