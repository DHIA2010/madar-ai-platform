import type {
  DataSourceState,
  ProjectInvitationState,
  ProjectMemberState,
  ProjectState,
} from "../entities"

export interface ProjectRepository {
  findById(id: string): Promise<ProjectState | null>
  list(input?: {
    organizationId?: string
    workspaceId?: string | null
    status?: ProjectState["status"]
    page?: number
    pageSize?: number
    sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
  }): Promise<ProjectState[]>
  save(project: ProjectState): Promise<void>
}

export interface ProjectMemberRepository {
  findById(id: string): Promise<ProjectMemberState | null>
  findByProjectAndUser(projectId: string, userId: string): Promise<ProjectMemberState | null>
  listByProjectId(projectId: string): Promise<ProjectMemberState[]>
  listByOrganizationId(organizationId: string): Promise<ProjectMemberState[]>
  save(member: ProjectMemberState): Promise<void>
}

export interface ProjectInvitationRepository {
  findById(id: string): Promise<ProjectInvitationState | null>
  findByToken(token: string): Promise<ProjectInvitationState | null>
  listByProjectId(projectId: string, input?: { page?: number; pageSize?: number; status?: ProjectInvitationState["status"] }): Promise<ProjectInvitationState[]>
  findPendingByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<ProjectInvitationState | null>
  save(invitation: ProjectInvitationState): Promise<void>
}

export interface DataSourceRepository {
  findById(id: string): Promise<DataSourceState | null>
  listByProjectId(projectId: string, input?: {
    page?: number
    pageSize?: number
    status?: DataSourceState["status"]
    type?: DataSourceState["type"]
  }): Promise<DataSourceState[]>
  save(dataSource: DataSourceState): Promise<void>
}

export interface ProjectRepositories {
  projects: ProjectRepository
  projectMembers: ProjectMemberRepository
  projectInvitations: ProjectInvitationRepository
  dataSources: DataSourceRepository
}
