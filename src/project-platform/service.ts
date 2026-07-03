import { randomUUID } from "node:crypto"

import {
  ProjectEntity,
  DataSourceEntity,
  ProjectInvitationEntity,
  ProjectMemberEntity,
} from "./domain/entities"
import type { ProjectRepositories } from "./domain/repositories"
import type { ProjectDomainEvent } from "./domain/events"
import { PROJECT_ERRORS } from "./application/errors/ProjectError"
import type {
  CreateProjectCommand,
  CreateProjectDataSourceCommand,
  AddProjectMemberCommand,
  InviteProjectMemberCommand,
  UpdateProjectCommand,
  UpdateProjectDataSourceCommand,
  UpdateProjectMemberRoleCommand,
  SuspendProjectMemberCommand,
  RemoveProjectMemberCommand,
  AcceptProjectInvitationCommand,
  DeclineProjectInvitationCommand,
  CancelProjectInvitationCommand,
  ResendProjectInvitationCommand,
} from "./application/commands"
import type { ListProjectsQuery, ListDataSourcesQuery } from "./application/queries"

interface ProjectAuthenticatedActor {
  userId: string
  sessionId: string
  organizationId: string
  workspaceId: string | null
  roles: Array<"owner" | "admin" | "manager" | "analyst" | "viewer">
}

interface ProjectEventPublisher {
  publish(events: ProjectDomainEvent[]): Promise<void>
}

interface ProjectLogger {
  info(message: string, details?: Record<string, unknown>): void
}

interface ProjectMetricsProvider {
  incrementCounter(name: string, value?: number, tags?: Record<string, string>): void
}

class InMemoryProjectEventPublisher implements ProjectEventPublisher {
  readonly published: ProjectDomainEvent[] = []
  async publish(events: ProjectDomainEvent[]) {
    this.published.push(...events)
  }
}

interface ProjectPlatformDependencies {
  repositories: ProjectRepositories
  eventPublisher?: ProjectEventPublisher
  logger?: ProjectLogger
  metrics?: ProjectMetricsProvider
}

function defaultNow() {
  return new Date().toISOString()
}

function createEvent(
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
): ProjectDomainEvent {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: 1,
    aggregateType,
    aggregateId,
    occurredAt: defaultNow(),
    metadata: {},
    payload,
  }
}

export class ProjectPlatformService {
  constructor(private readonly deps: ProjectPlatformDependencies) {}

  private async publish(events: ProjectDomainEvent[]) {
    if (events.length === 0) return
    await (this.deps.eventPublisher ?? new InMemoryProjectEventPublisher()).publish(events)
  }

  private requireOwner(actor: ProjectAuthenticatedActor) {
    if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
      throw PROJECT_ERRORS.forbidden()
    }
  }

  private async assertProjectBelongsToActor(projectId: string, actor: ProjectAuthenticatedActor) {
    const project = await this.deps.repositories.projects.findById(projectId)
    if (!project || project.organizationId !== actor.organizationId) {
      throw PROJECT_ERRORS.notFound("Project")
    }
    return project
  }

  async createProject(actor: ProjectAuthenticatedActor, command: CreateProjectCommand) {
    this.requireOwner(actor)
    const now = defaultNow()
    const project = ProjectEntity.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      workspaceId: command.workspaceId ?? actor.workspaceId,
      ownerUserId: actor.userId,
      name: command.name,
      metadata: command.metadata,
      branding: command.branding,
      logoUrl: command.logoUrl,
      timezone: command.timezone,
      currency: command.currency,
      locale: command.locale,
      environment: command.environment,
      settings: command.settings,
      retentionPolicy: command.retentionPolicy,
      defaultDashboard: command.defaultDashboard,
      notificationPreferences: command.notificationPreferences,
      featureFlags: command.featureFlags,
      connectorPreferences: command.connectorPreferences,
      now,
    })
    await this.deps.repositories.projects.save(project.toState())
    await this.publish([
      createEvent("ProjectCreated", "project", project.id, {
        projectId: project.id,
        organizationId: project.organizationId,
      }),
    ])
    this.deps.logger?.info("project.created", {
      projectId: project.id,
      organizationId: project.organizationId,
    })
    this.deps.metrics?.incrementCounter("project_count", 1, {
      organizationId: project.organizationId,
    })
    return project.toState()
  }

  async listProjects(actor: ProjectAuthenticatedActor, query: ListProjectsQuery = {}) {
    return this.deps.repositories.projects.list({
      organizationId: query.organizationId ?? actor.organizationId,
      workspaceId: query.workspaceId ?? undefined,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
    })
  }

  async getProject(actor: ProjectAuthenticatedActor, projectId: string) {
    const project = await this.assertProjectBelongsToActor(projectId, actor)
    return project
  }

  async updateProject(
    actor: ProjectAuthenticatedActor,
    projectId: string,
    command: UpdateProjectCommand
  ) {
    this.requireOwner(actor)
    const projectState = await this.assertProjectBelongsToActor(projectId, actor)
    const project = ProjectEntity.rehydrate(projectState)
    project.update(command, defaultNow())
    await this.deps.repositories.projects.save(project.toState())
    await this.publish([
      createEvent("ProjectUpdated", "project", project.id, { projectId: project.id }),
    ])
    return project.toState()
  }

  async archiveProject(actor: ProjectAuthenticatedActor, projectId: string) {
    this.requireOwner(actor)
    const project = ProjectEntity.rehydrate(
      await this.assertProjectBelongsToActor(projectId, actor)
    )
    project.archive(defaultNow())
    await this.deps.repositories.projects.save(project.toState())
    await this.publish([createEvent("ProjectArchived", "project", project.id, { projectId })])
    return project.toState()
  }

  async restoreProject(actor: ProjectAuthenticatedActor, projectId: string) {
    this.requireOwner(actor)
    const project = ProjectEntity.rehydrate(
      await this.assertProjectBelongsToActor(projectId, actor)
    )
    project.restore(defaultNow())
    await this.deps.repositories.projects.save(project.toState())
    await this.publish([createEvent("ProjectRestored", "project", project.id, { projectId })])
    return project.toState()
  }

  async deleteProject(actor: ProjectAuthenticatedActor, projectId: string) {
    this.requireOwner(actor)
    const project = ProjectEntity.rehydrate(
      await this.assertProjectBelongsToActor(projectId, actor)
    )
    project.softDelete(defaultNow())
    await this.deps.repositories.projects.save(project.toState())
    await this.publish([createEvent("ProjectDeleted", "project", project.id, { projectId })])
    return project.toState()
  }

  async createDataSource(
    actor: ProjectAuthenticatedActor,
    command: CreateProjectDataSourceCommand
  ) {
    this.requireOwner(actor)
    const project = await this.assertProjectBelongsToActor(command.projectId, actor)
    if (project.status !== "active") {
      throw PROJECT_ERRORS.state("Data sources can only be created on active projects.")
    }
    const dataSource = DataSourceEntity.create({
      id: randomUUID(),
      projectId: command.projectId,
      organizationId: project.organizationId,
      name: command.name,
      type: command.type,
      metadata: command.metadata,
      futureOauthReady: command.futureOauthReady,
      connectionReference: command.connectionReference,
      now: defaultNow(),
    })
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceCreated", "data_source", dataSource.id, {
        projectId: command.projectId,
        dataSourceId: dataSource.id,
      }),
    ])
    return dataSource.toState()
  }

  async updateDataSource(
    actor: ProjectAuthenticatedActor,
    dataSourceId: string,
    command: UpdateProjectDataSourceCommand
  ) {
    this.requireOwner(actor)
    const current = await this.deps.repositories.dataSources.findById(dataSourceId)
    if (!current || current.organizationId !== actor.organizationId) {
      throw PROJECT_ERRORS.notFound("Data source")
    }
    const dataSource = DataSourceEntity.rehydrate(current)
    dataSource.update(command, defaultNow())
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceUpdated", "data_source", dataSource.id, { dataSourceId }),
    ])
    return dataSource.toState()
  }

  async enableDataSource(actor: ProjectAuthenticatedActor, dataSourceId: string) {
    this.requireOwner(actor)
    const dataSource = DataSourceEntity.rehydrate(await this.requireDataSource(actor, dataSourceId))
    dataSource.enable(defaultNow())
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceEnabled", "data_source", dataSource.id, { dataSourceId }),
    ])
    return dataSource.toState()
  }

  async disableDataSource(actor: ProjectAuthenticatedActor, dataSourceId: string) {
    this.requireOwner(actor)
    const dataSource = DataSourceEntity.rehydrate(await this.requireDataSource(actor, dataSourceId))
    dataSource.disable(defaultNow())
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceDisabled", "data_source", dataSource.id, { dataSourceId }),
    ])
    return dataSource.toState()
  }

  async archiveDataSource(actor: ProjectAuthenticatedActor, dataSourceId: string) {
    this.requireOwner(actor)
    const dataSource = DataSourceEntity.rehydrate(await this.requireDataSource(actor, dataSourceId))
    dataSource.archive(defaultNow())
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceArchived", "data_source", dataSource.id, { dataSourceId }),
    ])
    return dataSource.toState()
  }

  async deleteDataSource(actor: ProjectAuthenticatedActor, dataSourceId: string) {
    this.requireOwner(actor)
    const dataSource = DataSourceEntity.rehydrate(await this.requireDataSource(actor, dataSourceId))
    dataSource.softDelete(defaultNow())
    await this.deps.repositories.dataSources.save(dataSource.toState())
    await this.publish([
      createEvent("DataSourceDeleted", "data_source", dataSource.id, { dataSourceId }),
    ])
    return dataSource.toState()
  }

  async listDataSources(actor: ProjectAuthenticatedActor, query: ListDataSourcesQuery) {
    await this.assertProjectBelongsToActor(query.projectId, actor)
    return this.deps.repositories.dataSources.listByProjectId(query.projectId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      type: query.type,
    })
  }

  async inviteProjectMember(actor: ProjectAuthenticatedActor, command: InviteProjectMemberCommand) {
    this.requireOwner(actor)
    const project = await this.assertProjectBelongsToActor(command.projectId, actor)
    const invitation = ProjectInvitationEntity.create({
      id: randomUUID(),
      token: randomUUID(),
      email: command.email,
      projectId: command.projectId,
      organizationId: project.organizationId,
      workspaceId: command.workspaceId ?? project.workspaceId,
      role: command.role,
      invitedByUserId: actor.userId,
      idempotencyKey: command.idempotencyKey ?? randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      now: defaultNow(),
    })
    await this.deps.repositories.projectInvitations.save(invitation.toState())
    return invitation.toState()
  }

  async addProjectMember(actor: ProjectAuthenticatedActor, command: AddProjectMemberCommand) {
    this.requireOwner(actor)
    const project = await this.assertProjectBelongsToActor(command.projectId, actor)
    const member = ProjectMemberEntity.create({
      id: randomUUID(),
      projectId: command.projectId,
      organizationId: project.organizationId,
      userId: command.userId,
      organizationRole: command.organizationRole,
      projectRole: command.projectRole,
      permissions: command.permissions,
      now: defaultNow(),
    })
    await this.deps.repositories.projectMembers.save(member.toState())
    return member.toState()
  }

  async updateProjectMemberRole(
    actor: ProjectAuthenticatedActor,
    command: UpdateProjectMemberRoleCommand
  ) {
    this.requireOwner(actor)
    const memberState = await this.deps.repositories.projectMembers.findByProjectAndUser(
      command.projectId,
      command.userId
    )
    if (!memberState) {
      throw PROJECT_ERRORS.notFound("Project member")
    }
    const member = ProjectMemberEntity.rehydrate(memberState)
    member.assignRole(command.role, actor.userId, defaultNow())
    await this.deps.repositories.projectMembers.save(member.toState())
    return member.toState()
  }

  async suspendProjectMember(
    actor: ProjectAuthenticatedActor,
    command: SuspendProjectMemberCommand
  ) {
    this.requireOwner(actor)
    const memberState = await this.deps.repositories.projectMembers.findByProjectAndUser(
      command.projectId,
      command.userId
    )
    if (!memberState) throw PROJECT_ERRORS.notFound("Project member")
    const member = ProjectMemberEntity.rehydrate(memberState)
    member.suspend(command.reason, actor.userId, defaultNow())
    await this.deps.repositories.projectMembers.save(member.toState())
    return member.toState()
  }

  async removeProjectMember(actor: ProjectAuthenticatedActor, command: RemoveProjectMemberCommand) {
    this.requireOwner(actor)
    const memberState = await this.deps.repositories.projectMembers.findByProjectAndUser(
      command.projectId,
      command.userId
    )
    if (!memberState) throw PROJECT_ERRORS.notFound("Project member")
    const member = ProjectMemberEntity.rehydrate(memberState)
    member.remove(command.reason, actor.userId, defaultNow())
    await this.deps.repositories.projectMembers.save(member.toState())
    return member.toState()
  }

  async acceptProjectInvitation(
    actor: ProjectAuthenticatedActor,
    command: AcceptProjectInvitationCommand
  ) {
    const invitationState = await this.deps.repositories.projectInvitations.findByToken(
      command.token
    )
    if (!invitationState) throw PROJECT_ERRORS.notFound("Project invitation")
    const invitation = ProjectInvitationEntity.rehydrate(invitationState)
    invitation.accept(defaultNow())
    await this.deps.repositories.projectInvitations.save(invitation.toState())
    return invitation.toState()
  }

  async declineProjectInvitation(
    actor: ProjectAuthenticatedActor,
    command: DeclineProjectInvitationCommand
  ) {
    const invitationState = await this.deps.repositories.projectInvitations.findByToken(
      command.token
    )
    if (!invitationState) throw PROJECT_ERRORS.notFound("Project invitation")
    const invitation = ProjectInvitationEntity.rehydrate(invitationState)
    invitation.decline(defaultNow())
    await this.deps.repositories.projectInvitations.save(invitation.toState())
    return invitation.toState()
  }

  async cancelProjectInvitation(
    actor: ProjectAuthenticatedActor,
    command: CancelProjectInvitationCommand
  ) {
    this.requireOwner(actor)
    const invitationState = await this.deps.repositories.projectInvitations.findById(
      command.invitationId
    )
    if (!invitationState) throw PROJECT_ERRORS.notFound("Project invitation")
    const invitation = ProjectInvitationEntity.rehydrate(invitationState)
    invitation.cancel(defaultNow())
    await this.deps.repositories.projectInvitations.save(invitation.toState())
    return invitation.toState()
  }

  async resendProjectInvitation(
    actor: ProjectAuthenticatedActor,
    command: ResendProjectInvitationCommand
  ) {
    this.requireOwner(actor)
    const invitationState = await this.deps.repositories.projectInvitations.findById(
      command.invitationId
    )
    if (!invitationState) throw PROJECT_ERRORS.notFound("Project invitation")
    const invitation = ProjectInvitationEntity.rehydrate(invitationState)
    invitation.resend(defaultNow())
    await this.deps.repositories.projectInvitations.save(invitation.toState())
    return invitation.toState()
  }

  private async requireDataSource(actor: ProjectAuthenticatedActor, dataSourceId: string) {
    const dataSource = await this.deps.repositories.dataSources.findById(dataSourceId)
    if (!dataSource || dataSource.organizationId !== actor.organizationId) {
      throw PROJECT_ERRORS.notFound("Data source")
    }
    return dataSource
  }
}
