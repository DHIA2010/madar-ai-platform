import type {
  DataSourceRepository,
  ProjectInvitationRepository,
  ProjectMemberRepository,
  ProjectRepositories,
  ProjectRepository,
} from "../../domain/repositories"
import type {
  DataSourceState,
  ProjectInvitationState,
  ProjectMemberState,
  ProjectState,
} from "../../domain/entities"
import { PostgresDatabase } from "../../../backend-foundation/postgres/database"

function mapPrimitiveRecord(value: unknown): Record<string, string | number | boolean> {
  return (value as Record<string, string | number | boolean>) ?? {}
}

function mapProject(row: Record<string, unknown>): ProjectState {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    status: row.status as ProjectState["status"],
    metadata: (row.metadata as Record<string, string>) ?? {},
    branding: (row.branding as Record<string, string>) ?? {},
    logoUrl: (row.logo_url as string | null) ?? null,
    timezone: String(row.timezone),
    currency: String(row.currency),
    locale: String(row.locale),
    environment: row.environment as ProjectState["environment"],
    settings: mapPrimitiveRecord(row.settings),
    retentionPolicy: (row.retention_policy as string | null) ?? null,
    defaultDashboard: (row.default_dashboard as string | null) ?? null,
    notificationPreferences: mapPrimitiveRecord(row.notification_preferences),
    featureFlags: (row.feature_flags as Record<string, boolean>) ?? {},
    connectorPreferences: mapPrimitiveRecord(row.connector_preferences),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  }
}

function mapProjectMember(row: Record<string, unknown>): ProjectMemberState {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    organizationRole: String(row.organization_role) as ProjectMemberState["organizationRole"],
    projectRole: String(row.project_role) as ProjectMemberState["projectRole"],
    accessPolicy: String(row.access_policy) as ProjectMemberState["accessPolicy"],
    permissions: (row.permissions as Record<string, boolean>) ?? {},
    status: String(row.status) as ProjectMemberState["status"],
    statusReason: (row.status_reason as string | null) ?? null,
    invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    suspendedAt: (row.suspended_at as string | null) ?? null,
    removedAt: (row.removed_at as string | null) ?? null,
    history: (row.history as ProjectMemberState["history"]) ?? [],
    roleHistory: (row.role_history as ProjectMemberState["roleHistory"]) ?? [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  }
}

function mapProjectInvitation(row: Record<string, unknown>): ProjectInvitationState {
  return {
    id: String(row.id),
    token: String(row.token),
    email: String(row.email),
    projectId: String(row.project_id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    role: String(row.role_code) as ProjectInvitationState["role"],
    invitedByUserId: String(row.invited_by_user_id),
    status: String(row.status) as ProjectInvitationState["status"],
    idempotencyKey: String(row.idempotency_key),
    expiresAt: String(row.expires_at),
    acceptedAt: (row.accepted_at as string | null) ?? null,
    declinedAt: (row.declined_at as string | null) ?? null,
    canceledAt: (row.canceled_at as string | null) ?? null,
    lastSentAt: String(row.last_sent_at),
    resendCount: Number(row.resend_count ?? 0),
    createdAt: String(row.created_at),
  }
}

function mapDataSource(row: Record<string, unknown>): DataSourceState {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    type: String(row.type) as DataSourceState["type"],
    status: String(row.status) as DataSourceState["status"],
    metadata: mapPrimitiveRecord(row.metadata),
    validationStatus: String(row.validation_status) as DataSourceState["validationStatus"],
    healthStatus: String(row.health_status) as DataSourceState["healthStatus"],
    syncStatus: String(row.sync_status) as DataSourceState["syncStatus"],
    connectionStatus: String(row.connection_status) as DataSourceState["connectionStatus"],
    futureOauthReady: Boolean(row.future_oauth_ready),
    connectionReference: (row.connection_reference as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  }
}

class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "project-find-by-id",
      text: "SELECT * FROM projects WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapProject(result.rows[0]) : null
  }
  async list(
    input: {
      organizationId?: string
      workspaceId?: string | null
      status?: ProjectState["status"]
      page?: number
      pageSize?: number
      sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
    } = {}
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const where: string[] = []
    const values: unknown[] = []
    if (input.organizationId) {
      values.push(input.organizationId)
      where.push(`organization_id = $${values.length}`)
    }
    if (input.workspaceId !== undefined) {
      values.push(input.workspaceId)
      where.push(`workspace_id IS NOT DISTINCT FROM $${values.length}`)
    }
    if (input.status) {
      values.push(input.status)
      where.push(`status = $${values.length}`)
    }
    const orderBy =
      input.sort === "name:asc"
        ? "name ASC"
        : input.sort === "name:desc"
          ? "name DESC"
          : input.sort === "createdAt:asc"
            ? "created_at ASC"
            : "created_at DESC"
    values.push(pageSize)
    values.push((page - 1) * pageSize)
    const query = `SELECT * FROM projects ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy} LIMIT $${values.length - 1} OFFSET $${values.length}`
    const result = await this.db.query({ name: "project-list", text: query, values })
    return result.rows.map(mapProject)
  }
  async save(project: ProjectState) {
    await this.db.query({
      name: "project-upsert",
      text: `
        INSERT INTO projects (
          id, organization_id, workspace_id, owner_user_id, name, status, metadata, branding, logo_url,
          timezone, currency, locale, environment, settings, retention_policy, default_dashboard,
          notification_preferences, feature_flags, connector_preferences, created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        )
        ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          owner_user_id = EXCLUDED.owner_user_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          branding = EXCLUDED.branding,
          logo_url = EXCLUDED.logo_url,
          timezone = EXCLUDED.timezone,
          currency = EXCLUDED.currency,
          locale = EXCLUDED.locale,
          environment = EXCLUDED.environment,
          settings = EXCLUDED.settings,
          retention_policy = EXCLUDED.retention_policy,
          default_dashboard = EXCLUDED.default_dashboard,
          notification_preferences = EXCLUDED.notification_preferences,
          feature_flags = EXCLUDED.feature_flags,
          connector_preferences = EXCLUDED.connector_preferences,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
      `,
      values: [
        project.id,
        project.organizationId,
        project.workspaceId,
        project.ownerUserId,
        project.name,
        project.status,
        JSON.stringify(project.metadata),
        JSON.stringify(project.branding),
        project.logoUrl,
        project.timezone,
        project.currency,
        project.locale,
        project.environment,
        JSON.stringify(project.settings),
        project.retentionPolicy,
        project.defaultDashboard,
        JSON.stringify(project.notificationPreferences),
        JSON.stringify(project.featureFlags),
        JSON.stringify(project.connectorPreferences),
        project.createdAt,
        project.updatedAt,
        project.deletedAt,
      ],
    })
  }
}

class PostgresProjectMemberRepository implements ProjectMemberRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "project-member-find-by-id",
      text: "SELECT * FROM project_members WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapProjectMember(result.rows[0]) : null
  }
  async findByProjectAndUser(projectId: string, userId: string) {
    const result = await this.db.query({
      name: "project-member-find-by-project-user",
      text: "SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1",
      values: [projectId, userId],
    })
    return result.rows[0] ? mapProjectMember(result.rows[0]) : null
  }
  async listByProjectId(projectId: string) {
    const result = await this.db.query({
      name: "project-member-list-by-project",
      text: "SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at ASC",
      values: [projectId],
    })
    return result.rows.map(mapProjectMember)
  }
  async listByOrganizationId(organizationId: string) {
    const result = await this.db.query({
      name: "project-member-list-by-org",
      text: "SELECT * FROM project_members WHERE organization_id = $1 ORDER BY created_at ASC",
      values: [organizationId],
    })
    return result.rows.map(mapProjectMember)
  }
  async save(member: ProjectMemberState) {
    await this.db.query({
      name: "project-member-upsert",
      text: `INSERT INTO project_members (
          id, project_id, organization_id, user_id, organization_role, project_role, access_policy, permissions,
          status, status_reason, invited_by_user_id, accepted_at, suspended_at, removed_at, history, role_history,
          created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        ) ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          organization_id = EXCLUDED.organization_id,
          user_id = EXCLUDED.user_id,
          organization_role = EXCLUDED.organization_role,
          project_role = EXCLUDED.project_role,
          access_policy = EXCLUDED.access_policy,
          permissions = EXCLUDED.permissions,
          status = EXCLUDED.status,
          status_reason = EXCLUDED.status_reason,
          invited_by_user_id = EXCLUDED.invited_by_user_id,
          accepted_at = EXCLUDED.accepted_at,
          suspended_at = EXCLUDED.suspended_at,
          removed_at = EXCLUDED.removed_at,
          history = EXCLUDED.history,
          role_history = EXCLUDED.role_history,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at`,
      values: [
        member.id,
        member.projectId,
        member.organizationId,
        member.userId,
        member.organizationRole,
        member.projectRole,
        member.accessPolicy,
        JSON.stringify(member.permissions),
        member.status,
        member.statusReason,
        member.invitedByUserId,
        member.acceptedAt,
        member.suspendedAt,
        member.removedAt,
        JSON.stringify(member.history),
        JSON.stringify(member.roleHistory),
        member.createdAt,
        member.updatedAt,
        member.deletedAt,
      ],
    })
  }
}

class PostgresProjectInvitationRepository implements ProjectInvitationRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "project-invite-find-by-id",
      text: "SELECT * FROM project_invitations WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapProjectInvitation(result.rows[0]) : null
  }
  async findByToken(token: string) {
    const result = await this.db.query({
      name: "project-invite-find-by-token",
      text: "SELECT * FROM project_invitations WHERE token = $1 LIMIT 1",
      values: [token],
    })
    return result.rows[0] ? mapProjectInvitation(result.rows[0]) : null
  }
  async listByProjectId(
    projectId: string,
    input: { page?: number; pageSize?: number; status?: ProjectInvitationState["status"] } = {}
  ) {
    const values: unknown[] = [projectId]
    let where = "project_id = $1"
    if (input.status) {
      values.push(input.status)
      where += ` AND status = $${values.length}`
    }
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    values.push(pageSize)
    values.push((page - 1) * pageSize)
    const result = await this.db.query({
      name: "project-invite-list",
      text: `SELECT * FROM project_invitations WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    })
    return result.rows.map(mapProjectInvitation)
  }
  async findPendingByIdempotencyKey(projectId: string, idempotencyKey: string) {
    const result = await this.db.query({
      name: "project-invite-find-pending-idempotency",
      text: "SELECT * FROM project_invitations WHERE project_id = $1 AND idempotency_key = $2 AND status = 'pending' AND deleted_at IS NULL LIMIT 1",
      values: [projectId, idempotencyKey],
    })
    return result.rows[0] ? mapProjectInvitation(result.rows[0]) : null
  }
  async save(invitation: ProjectInvitationState) {
    await this.db.query({
      name: "project-invite-upsert",
      text: `INSERT INTO project_invitations (
          id, token, email, project_id, organization_id, workspace_id, role_code, invited_by_user_id, status,
          idempotency_key, expires_at, accepted_at, declined_at, canceled_at, last_sent_at, resend_count,
          created_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
        ) ON CONFLICT (id) DO UPDATE SET
          token = EXCLUDED.token,
          email = EXCLUDED.email,
          project_id = EXCLUDED.project_id,
          organization_id = EXCLUDED.organization_id,
          workspace_id = EXCLUDED.workspace_id,
          role_code = EXCLUDED.role_code,
          invited_by_user_id = EXCLUDED.invited_by_user_id,
          status = EXCLUDED.status,
          idempotency_key = EXCLUDED.idempotency_key,
          expires_at = EXCLUDED.expires_at,
          accepted_at = EXCLUDED.accepted_at,
          declined_at = EXCLUDED.declined_at,
          canceled_at = EXCLUDED.canceled_at,
          last_sent_at = EXCLUDED.last_sent_at,
          resend_count = EXCLUDED.resend_count,
          deleted_at = EXCLUDED.deleted_at`,
      values: [
        invitation.id,
        invitation.token,
        invitation.email,
        invitation.projectId,
        invitation.organizationId,
        invitation.workspaceId,
        invitation.role,
        invitation.invitedByUserId,
        invitation.status,
        invitation.idempotencyKey,
        invitation.expiresAt,
        invitation.acceptedAt,
        invitation.declinedAt,
        invitation.canceledAt,
        invitation.lastSentAt,
        invitation.resendCount,
        invitation.createdAt,
        null,
      ],
    })
  }
}

class PostgresDataSourceRepository implements DataSourceRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async findById(id: string) {
    const result = await this.db.query({
      name: "project-datasource-find-by-id",
      text: "SELECT * FROM data_sources WHERE id = $1 LIMIT 1",
      values: [id],
    })
    return result.rows[0] ? mapDataSource(result.rows[0]) : null
  }
  async listByProjectId(
    projectId: string,
    input: {
      page?: number
      pageSize?: number
      status?: DataSourceState["status"]
      type?: DataSourceState["type"]
    } = {}
  ) {
    const where: string[] = ["project_id = $1"]
    const values: unknown[] = [projectId]
    if (input.status) {
      values.push(input.status)
      where.push(`status = $${values.length}`)
    }
    if (input.type) {
      values.push(input.type)
      where.push(`type = $${values.length}`)
    }
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    values.push(pageSize)
    values.push((page - 1) * pageSize)
    const result = await this.db.query({
      name: "project-datasource-list",
      text: `SELECT * FROM data_sources WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    })
    return result.rows.map(mapDataSource)
  }
  async save(dataSource: DataSourceState) {
    await this.db.query({
      name: "project-datasource-upsert",
      text: `INSERT INTO data_sources (
          id, project_id, organization_id, name, type, status, metadata, validation_status, health_status,
          sync_status, connection_status, future_oauth_ready, connection_reference, created_at, updated_at, deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
        ) ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          organization_id = EXCLUDED.organization_id,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          validation_status = EXCLUDED.validation_status,
          health_status = EXCLUDED.health_status,
          sync_status = EXCLUDED.sync_status,
          connection_status = EXCLUDED.connection_status,
          future_oauth_ready = EXCLUDED.future_oauth_ready,
          connection_reference = EXCLUDED.connection_reference,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at`,
      values: [
        dataSource.id,
        dataSource.projectId,
        dataSource.organizationId,
        dataSource.name,
        dataSource.type,
        dataSource.status,
        JSON.stringify(dataSource.metadata),
        dataSource.validationStatus,
        dataSource.healthStatus,
        dataSource.syncStatus,
        dataSource.connectionStatus,
        dataSource.futureOauthReady,
        dataSource.connectionReference,
        dataSource.createdAt,
        dataSource.updatedAt,
        dataSource.deletedAt,
      ],
    })
  }
}

export function createPostgresProjectRepositories(db: PostgresDatabase): ProjectRepositories {
  return {
    projects: new PostgresProjectRepository(db),
    projectMembers: new PostgresProjectMemberRepository(db),
    projectInvitations: new PostgresProjectInvitationRepository(db),
    dataSources: new PostgresDataSourceRepository(db),
  }
}
