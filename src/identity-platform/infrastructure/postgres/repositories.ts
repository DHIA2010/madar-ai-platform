import type { TokenService } from "../../application/ports"
import type {
  IdentityRepositories,
  AuditLogRepository,
  EmailVerificationRepository,
  InvitationRepository,
  MembershipRepository,
  OrganizationRepository,
  PasswordResetRepository,
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
  UserState,
  WorkspaceState,
} from "../../domain/entities"
import { PostgresDatabase } from "./database"

function mapUser(row: Record<string, unknown>): UserState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    fullName: String(row.full_name),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    timezone: String(row.timezone),
    language: String(row.language),
    status: row.account_status as UserState["status"],
    emailVerifiedAt: toIsoString(row.email_verified_at),
    preferences: (row.preferences as Record<string, string | boolean | number>) ?? {},
    failedLoginAttempts: Number(row.failed_login_count),
    lockoutUntil: toIsoString(row.locked_until),
    activeWorkspaceId: (row.active_workspace_id as string | null) ?? null,
    primaryOrganizationId: (row.primary_organization_id as string | null) ?? null,
    deletedAt: toIsoString(row.deleted_at),
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
  }
}

function mapOrganization(row: Record<string, unknown>): OrganizationState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
    status: row.status as OrganizationState["status"],
    metadata: (row.metadata as Record<string, string>) ?? {},
    branding: (row.branding as Record<string, string>) ?? {},
    logoUrl: (row.logo_url as string | null) ?? null,
    timezone: (row.timezone as string | null) ?? "UTC",
    locale: (row.locale as string | null) ?? "en",
    currency: (row.currency as string | null) ?? "USD",
    subscriptionReference: (row.subscription_reference as string | null) ?? null,
    settings: (row.settings as Record<string, string | boolean | number>) ?? {},
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
    deletedAt: toIsoString(row.deleted_at),
  }
}

function mapWorkspace(row: Record<string, unknown>): WorkspaceState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    status: row.status as WorkspaceState["status"],
    metadata: (row.metadata as Record<string, string>) ?? {},
    settings: (row.settings as Record<string, string | boolean | number>) ?? {},
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
    deletedAt: toIsoString(row.deleted_at),
  }
}

function mapMembership(row: Record<string, unknown>): MembershipState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    userId: String(row.user_id),
    role: row.role_code as MembershipState["role"],
    status: (row.status as MembershipState["status"]) ?? "active",
    profile: (row.metadata as Record<string, string>) ?? {},
    statusReason: (row.status_reason as string | null) ?? null,
    invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
    acceptedAt: toIsoString(row.accepted_at),
    suspendedAt: toIsoString(row.suspended_at),
    removedAt: toIsoString(row.removed_at),
    history: (row.history as MembershipState["history"]) ?? [],
    roleHistory: (row.role_history as MembershipState["roleHistory"]) ?? [],
    createdAt: toIsoString(row.created_at) ?? "",
    updatedAt: toIsoString(row.updated_at) ?? "",
    deletedAt: toIsoString(row.deleted_at),
  }
}

function mapEmailVerification(row: Record<string, unknown>): EmailVerificationState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: toIsoString(row.expires_at) ?? "",
    consumedAt: toIsoString(row.used_at),
    createdAt: toIsoString(row.created_at) ?? "",
  }
}

function mapPasswordReset(row: Record<string, unknown>): PasswordResetState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: toIsoString(row.expires_at) ?? "",
    consumedAt: toIsoString(row.used_at),
    createdAt: toIsoString(row.created_at) ?? "",
  }
}

function mapInvitation(row: Record<string, unknown>, token: string): InvitationState {
  const toIsoString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }

  return {
    id: String(row.id),
    token,
    email: String(row.email),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    role: row.role_code as InvitationState["role"],
    invitedBy: String(row.invited_by_user_id),
    status: (row.status as InvitationState["status"]) ?? "pending",
    idempotencyKey: (row.idempotency_key as string | null) ?? String(row.id),
    expiresAt: toIsoString(row.expires_at) ?? "",
    acceptedAt: toIsoString(row.accepted_at),
    declinedAt: toIsoString(row.declined_at),
    canceledAt: toIsoString(row.canceled_at),
    lastSentAt: toIsoString(row.last_sent_at) ?? toIsoString(row.created_at) ?? "",
    resendCount: Number((row.resend_count as number | null) ?? 0),
    createdAt: toIsoString(row.created_at) ?? "",
  }
}

class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findById(id: string) {
    const result = await this.db.query({
      name: "identity-users-find-by-id",
      text: "SELECT * FROM users WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async findByEmail(email: string) {
    const result = await this.db.query({
      name: "identity-users-find-by-email",
      text: "SELECT * FROM users WHERE email = $1 LIMIT 1",
      values: [email],
    })
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async save(user: UserState) {
    await this.db.query({
      name: "identity-users-upsert",
      text: `
        INSERT INTO users (
          id, email, password_hash, full_name, avatar_url, timezone, language, account_status,
          email_verified_at, preferences, failed_login_count, locked_until,
          primary_organization_id, active_workspace_id, created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          timezone = EXCLUDED.timezone,
          language = EXCLUDED.language,
          account_status = EXCLUDED.account_status,
          email_verified_at = EXCLUDED.email_verified_at,
          preferences = EXCLUDED.preferences,
          failed_login_count = EXCLUDED.failed_login_count,
          locked_until = EXCLUDED.locked_until,
          primary_organization_id = EXCLUDED.primary_organization_id,
          active_workspace_id = EXCLUDED.active_workspace_id,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        user.id,
        user.email,
        user.passwordHash,
        user.fullName,
        user.avatarUrl,
        user.timezone,
        user.language,
        user.status,
        user.emailVerifiedAt,
        JSON.stringify(user.preferences),
        user.failedLoginAttempts,
        user.lockoutUntil,
        user.primaryOrganizationId,
        user.activeWorkspaceId,
        user.createdAt,
        user.updatedAt,
        user.deletedAt,
      ],
    })
  }
}

class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "identity-orgs-find-by-id",
      text: "SELECT * FROM organizations WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapOrganization(result.rows[0]) : null
  }
  async list(
    input: {
      ownerUserId?: string
      status?: OrganizationState["status"]
      page?: number
      pageSize?: number
      sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
    } = {}
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const where: string[] = []
    const values: unknown[] = []

    if (input.ownerUserId) {
      values.push(input.ownerUserId)
      where.push(`owner_user_id = $${values.length}`)
    }
    if (input.status) {
      values.push(input.status)
      where.push(`status = $${values.length}`)
    }

    const orderBy = (() => {
      switch (input.sort) {
        case "name:asc":
          return "name ASC"
        case "name:desc":
          return "name DESC"
        case "createdAt:asc":
          return "created_at ASC"
        default:
          return "created_at DESC"
      }
    })()

    values.push(pageSize)
    values.push((page - 1) * pageSize)
    const query = `
      SELECT *
      FROM organizations
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${orderBy}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `
    const result = await this.db.query({ name: "identity-orgs-list", text: query, values })
    return result.rows.map(mapOrganization)
  }
  async save(organization: OrganizationState) {
    await this.db.query({
      name: "identity-orgs-upsert",
      text: `
        INSERT INTO organizations (
          id, name, owner_user_id, status, metadata, branding, logo_url,
          timezone, locale, currency, subscription_reference,
          settings, created_at, updated_at, deleted_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          owner_user_id = EXCLUDED.owner_user_id,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          branding = EXCLUDED.branding,
          logo_url = EXCLUDED.logo_url,
          timezone = EXCLUDED.timezone,
          locale = EXCLUDED.locale,
          currency = EXCLUDED.currency,
          subscription_reference = EXCLUDED.subscription_reference,
          settings = EXCLUDED.settings,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        organization.id,
        organization.name,
        organization.ownerUserId,
        organization.status,
        JSON.stringify(organization.metadata),
        JSON.stringify(organization.branding),
        organization.logoUrl,
        organization.timezone,
        organization.locale,
        organization.currency,
        organization.subscriptionReference,
        JSON.stringify(organization.settings),
        organization.createdAt,
        organization.updatedAt,
        organization.deletedAt,
      ],
    })
  }
}

class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "identity-workspaces-find-by-id",
      text: "SELECT * FROM workspaces WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null
  }
  async save(workspace: WorkspaceState) {
    await this.db.query({
      name: "identity-workspaces-upsert",
      text: `
        INSERT INTO workspaces (id, organization_id, name, status, metadata, settings, created_at, updated_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          settings = EXCLUDED.settings,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        workspace.id,
        workspace.organizationId,
        workspace.name,
        workspace.status,
        JSON.stringify(workspace.metadata),
        JSON.stringify(workspace.settings),
        workspace.createdAt,
        workspace.updatedAt,
        workspace.deletedAt,
      ],
    })
  }
}

class PostgresMembershipRepository implements MembershipRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "identity-memberships-find-by-id",
      text: "SELECT * FROM memberships WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapMembership(result.rows[0]) : null
  }
  async save(membership: MembershipState) {
    await this.db.query({
      name: "identity-memberships-upsert",
      text: `
        INSERT INTO memberships (
          id, user_id, organization_id, workspace_id, role_code, status,
          metadata, status_reason, invited_by_user_id, accepted_at, suspended_at,
          removed_at, history, role_history,
          created_at, updated_at, deleted_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          role_code = EXCLUDED.role_code,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          status_reason = EXCLUDED.status_reason,
          invited_by_user_id = EXCLUDED.invited_by_user_id,
          accepted_at = EXCLUDED.accepted_at,
          suspended_at = EXCLUDED.suspended_at,
          removed_at = EXCLUDED.removed_at,
          history = EXCLUDED.history,
          role_history = EXCLUDED.role_history,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        membership.id,
        membership.userId,
        membership.organizationId,
        membership.workspaceId,
        membership.role,
        membership.status,
        JSON.stringify(membership.profile),
        membership.statusReason,
        membership.invitedByUserId,
        membership.acceptedAt,
        membership.suspendedAt,
        membership.removedAt,
        JSON.stringify(membership.history),
        JSON.stringify(membership.roleHistory),
        membership.createdAt,
        membership.updatedAt,
        membership.deletedAt,
      ],
    })
  }
  async findByUserAndWorkspace(userId: string, workspaceId: string) {
    const result = await this.db.query({
      name: "identity-memberships-find-user-workspace",
      text: "SELECT * FROM memberships WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL LIMIT 1",
      values: [userId, workspaceId],
    })
    return result.rows[0] ? mapMembership(result.rows[0]) : null
  }
  async findByUserAndOrganization(userId: string, organizationId: string) {
    const result = await this.db.query({
      name: "identity-memberships-find-user-org",
      text: "SELECT * FROM memberships WHERE user_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1",
      values: [userId, organizationId],
    })
    return result.rows[0] ? mapMembership(result.rows[0]) : null
  }
  async findFirstByUserId(userId: string) {
    const result = await this.db.query({
      name: "identity-memberships-find-first-user",
      text: "SELECT * FROM memberships WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1",
      values: [userId],
    })
    return result.rows[0] ? mapMembership(result.rows[0]) : null
  }
  async listByUserId(userId: string) {
    const result = await this.db.query({
      name: "identity-memberships-list-user",
      text: "SELECT * FROM memberships WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC",
      values: [userId],
    })
    return result.rows.map(mapMembership)
  }
  async listByWorkspaceId(workspaceId: string) {
    const result = await this.db.query({
      name: "identity-memberships-list-workspace",
      text: "SELECT * FROM memberships WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC",
      values: [workspaceId],
    })
    return result.rows.map(mapMembership)
  }
  async listByOrganizationId(organizationId: string) {
    const result = await this.db.query({
      name: "identity-memberships-list-org",
      text: "SELECT * FROM memberships WHERE organization_id = $1 ORDER BY created_at ASC",
      values: [organizationId],
    })
    return result.rows.map(mapMembership)
  }
  async listRolesByUserInOrganization(userId: string, organizationId: string) {
    const result = await this.db.query<{ role_code: string }>({
      name: "identity-memberships-list-roles-user-org",
      text: "SELECT role_code FROM memberships WHERE user_id = $1 AND organization_id = $2 AND deleted_at IS NULL",
      values: [userId, organizationId],
    })
    return result.rows.map((row) => row.role_code)
  }
}

class PostgresEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findByTokenHash(tokenHash: string) {
    const result = await this.db.query({
      name: "identity-email-verifications-find",
      text: "SELECT * FROM email_verifications WHERE token_hash = $1 AND deleted_at IS NULL LIMIT 1",
      values: [tokenHash],
    })
    return result.rows[0] ? mapEmailVerification(result.rows[0]) : null
  }
  async save(entry: EmailVerificationState) {
    await this.db.query({
      name: "identity-email-verifications-upsert",
      text: `
        INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at, used_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          used_at = EXCLUDED.used_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        entry.id,
        entry.userId,
        entry.tokenHash,
        entry.expiresAt,
        entry.createdAt,
        entry.consumedAt,
        null,
      ],
    })
  }
}

class PostgresPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findByTokenHash(tokenHash: string) {
    const result = await this.db.query({
      name: "identity-password-resets-find",
      text: "SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND deleted_at IS NULL LIMIT 1",
      values: [tokenHash],
    })
    return result.rows[0] ? mapPasswordReset(result.rows[0]) : null
  }
  async save(entry: PasswordResetState) {
    await this.db.query({
      name: "identity-password-resets-upsert",
      text: `
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at, used_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          used_at = EXCLUDED.used_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        entry.id,
        entry.userId,
        entry.tokenHash,
        entry.expiresAt,
        entry.createdAt,
        entry.consumedAt,
        null,
      ],
    })
  }
}

class PostgresInvitationRepository implements InvitationRepository {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly tokenService: TokenService
  ) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "identity-invitations-find-by-id",
      text: "SELECT * FROM organization_invitations WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapInvitation(result.rows[0], "") : null
  }
  async findByToken(token: string) {
    const result = await this.db.query({
      name: "identity-invitations-find",
      text: "SELECT * FROM organization_invitations WHERE token_hash = $1 AND deleted_at IS NULL LIMIT 1",
      values: [this.tokenService.hashOpaqueToken(token)],
    })
    return result.rows[0] ? mapInvitation(result.rows[0], token) : null
  }
  async listByOrganizationId(
    organizationId: string,
    input: { page?: number; pageSize?: number; status?: InvitationState["status"] } = {}
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const values: unknown[] = [organizationId]
    const where = ["organization_id = $1", "deleted_at IS NULL"]
    if (input.status) {
      values.push(input.status)
      where.push(`status = $${values.length}`)
    }
    values.push(pageSize)
    values.push((page - 1) * pageSize)
    const result = await this.db.query({
      name: "identity-invitations-list-org",
      text: `
        SELECT *
        FROM organization_invitations
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    })
    return result.rows.map((row) => mapInvitation(row, ""))
  }
  async findPendingByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    const result = await this.db.query({
      name: "identity-invitations-find-idempotency",
      text: `
        SELECT *
        FROM organization_invitations
        WHERE organization_id = $1
          AND idempotency_key = $2
          AND status = 'pending'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      values: [organizationId, idempotencyKey],
    })
    return result.rows[0] ? mapInvitation(result.rows[0], "") : null
  }
  async save(entry: InvitationState) {
    await this.db.query({
      name: "identity-invitations-upsert",
      text: `
        INSERT INTO organization_invitations (
          id, organization_id, workspace_id, email, role_code, invited_by_user_id,
          token_hash, status, idempotency_key,
          expires_at, created_at, accepted_at, declined_at, canceled_at,
          last_sent_at, resend_count, deleted_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          workspace_id = EXCLUDED.workspace_id,
          role_code = EXCLUDED.role_code,
          token_hash = EXCLUDED.token_hash,
          status = EXCLUDED.status,
          idempotency_key = EXCLUDED.idempotency_key,
          expires_at = EXCLUDED.expires_at,
          accepted_at = EXCLUDED.accepted_at,
          declined_at = EXCLUDED.declined_at,
          canceled_at = EXCLUDED.canceled_at,
          last_sent_at = EXCLUDED.last_sent_at,
          resend_count = EXCLUDED.resend_count,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        entry.id,
        entry.organizationId,
        entry.workspaceId,
        entry.email,
        entry.role,
        entry.invitedBy,
        this.tokenService.hashOpaqueToken(entry.token),
        entry.status,
        entry.idempotencyKey,
        entry.expiresAt,
        entry.createdAt,
        entry.acceptedAt,
        entry.declinedAt,
        entry.canceledAt,
        entry.lastSentAt,
        entry.resendCount,
        null,
      ],
    })
  }
}

class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async append(entry: AuditLogState) {
    await this.db.query({
      name: "identity-audit-append",
      text: `
        INSERT INTO audit_logs (id, actor_user_id, organization_id, workspace_id, action, entity_type, entity_id, metadata, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      values: [
        entry.id,
        entry.actorUserId,
        entry.organizationId,
        entry.workspaceId,
        entry.action,
        entry.targetType,
        entry.targetId,
        JSON.stringify({
          ...entry.details,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        }),
        entry.createdAt,
      ],
    })
  }
  async listRecent(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize
    const toIsoString = (value: unknown): string | null => {
      if (!value) return null
      if (value instanceof Date) return value.toISOString()
      return String(value)
    }
    const result = await this.db.query({
      name: "identity-audit-list-recent",
      text: "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      values: [pageSize, offset],
    })
    return result.rows.map((row) => ({
      id: String(row.id),
      actorUserId: (row.actor_user_id as string | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      workspaceId: (row.workspace_id as string | null) ?? null,
      action: String(row.action),
      targetType: String(row.entity_type),
      targetId: (row.entity_id as string | null) ?? null,
      details: (row.metadata as Record<string, unknown>) ?? {},
      ipAddress: String(
        ((row.metadata as Record<string, unknown>)?.ipAddress as string | undefined) ?? "unknown"
      ),
      userAgent: String(
        ((row.metadata as Record<string, unknown>)?.userAgent as string | undefined) ?? "unknown"
      ),
      createdAt: toIsoString(row.created_at) ?? "",
    }))
  }
  async count() {
    const result = await this.db.query<{ count: string }>({
      name: "identity-audit-count",
      text: "SELECT COUNT(*)::text AS count FROM audit_logs",
    })
    return Number(result.rows[0]?.count ?? 0)
  }
}

export function createPostgresRepositories(input: {
  db: PostgresDatabase
  tokenService: TokenService
  sessions: IdentityRepositories["sessions"]
}): IdentityRepositories {
  return {
    users: new PostgresUserRepository(input.db),
    organizations: new PostgresOrganizationRepository(input.db),
    workspaces: new PostgresWorkspaceRepository(input.db),
    memberships: new PostgresMembershipRepository(input.db),
    sessions: input.sessions,
    emailVerifications: new PostgresEmailVerificationRepository(input.db),
    passwordResets: new PostgresPasswordResetRepository(input.db),
    invitations: new PostgresInvitationRepository(input.db, input.tokenService),
    auditLogs: new PostgresAuditLogRepository(input.db),
  }
}
