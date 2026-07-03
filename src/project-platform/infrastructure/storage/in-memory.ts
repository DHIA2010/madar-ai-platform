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

export interface InMemoryProjectDataStore {
  projects: ProjectState[]
  projectMembers: ProjectMemberState[]
  projectInvitations: ProjectInvitationState[]
  dataSources: DataSourceState[]
}

function paginate<T>(rows: T[], page = 1, pageSize = 20) {
  return rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

class InMemoryProjectRepository implements ProjectRepository {
  constructor(private readonly store: InMemoryProjectDataStore) {}
  async findById(id: string) {
    return clone(this.store.projects.find((project) => project.id === id) ?? null)
  }
  async list(input: { organizationId?: string; workspaceId?: string | null; status?: ProjectState["status"]; page?: number; pageSize?: number; sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc" } = {}) {
    const items = this.store.projects.filter((project) => {
      if (input.organizationId && project.organizationId !== input.organizationId) return false
      if (input.workspaceId !== undefined && project.workspaceId !== input.workspaceId) return false
      if (input.status && project.status !== input.status) return false
      return true
    })
    items.sort((a, b) => {
      switch (input.sort) {
        case "name:asc": return a.name.localeCompare(b.name)
        case "name:desc": return b.name.localeCompare(a.name)
        case "createdAt:asc": return a.createdAt.localeCompare(b.createdAt)
        default: return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return paginate(items, input.page, input.pageSize).map(clone)
  }
  async save(project: ProjectState) {
    const index = this.store.projects.findIndex((item) => item.id === project.id)
    const value = clone(project)
    if (index >= 0) this.store.projects[index] = value
    else this.store.projects.push(value)
  }
}

class InMemoryProjectMemberRepository implements ProjectMemberRepository {
  constructor(private readonly store: InMemoryProjectDataStore) {}
  async findById(id: string) { return clone(this.store.projectMembers.find((member) => member.id === id) ?? null) }
  async findByProjectAndUser(projectId: string, userId: string) { return clone(this.store.projectMembers.find((member) => member.projectId === projectId && member.userId === userId) ?? null) }
  async listByProjectId(projectId: string) { return this.store.projectMembers.filter((member) => member.projectId === projectId).map(clone) }
  async listByOrganizationId(organizationId: string) { return this.store.projectMembers.filter((member) => member.organizationId === organizationId).map(clone) }
  async save(member: ProjectMemberState) {
    const index = this.store.projectMembers.findIndex((item) => item.id === member.id)
    const value = clone(member)
    if (index >= 0) this.store.projectMembers[index] = value
    else this.store.projectMembers.push(value)
  }
}

class InMemoryProjectInvitationRepository implements ProjectInvitationRepository {
  constructor(private readonly store: InMemoryProjectDataStore) {}
  async findById(id: string) { return clone(this.store.projectInvitations.find((item) => item.id === id) ?? null) }
  async findByToken(token: string) { return clone(this.store.projectInvitations.find((item) => item.token === token) ?? null) }
  async listByProjectId(projectId: string, input: { page?: number; pageSize?: number; status?: ProjectInvitationState["status"] } = {}) {
    const items = this.store.projectInvitations.filter((item) => item.projectId === projectId && (!input.status || item.status === input.status))
    return paginate(items, input.page, input.pageSize).map(clone)
  }
  async findPendingByIdempotencyKey(projectId: string, idempotencyKey: string) { return clone(this.store.projectInvitations.find((item) => item.projectId === projectId && item.idempotencyKey === idempotencyKey && item.status === "pending") ?? null) }
  async save(invitation: ProjectInvitationState) {
    const index = this.store.projectInvitations.findIndex((item) => item.id === invitation.id)
    const value = clone(invitation)
    if (index >= 0) this.store.projectInvitations[index] = value
    else this.store.projectInvitations.push(value)
  }
}

class InMemoryDataSourceRepository implements DataSourceRepository {
  constructor(private readonly store: InMemoryProjectDataStore) {}
  async findById(id: string) { return clone(this.store.dataSources.find((item) => item.id === id) ?? null) }
  async listByProjectId(projectId: string, input: { page?: number; pageSize?: number; status?: DataSourceState["status"]; type?: DataSourceState["type"] } = {}) {
    const items = this.store.dataSources.filter((item) => {
      if (item.projectId !== projectId) return false
      if (input.status && item.status !== input.status) return false
      if (input.type && item.type !== input.type) return false
      return true
    })
    return paginate(items, input.page, input.pageSize).map(clone)
  }
  async save(dataSource: DataSourceState) {
    const index = this.store.dataSources.findIndex((item) => item.id === dataSource.id)
    const value = clone(dataSource)
    if (index >= 0) this.store.dataSources[index] = value
    else this.store.dataSources.push(value)
  }
}

export function createInMemoryProjectRepositories(store: InMemoryProjectDataStore = {
  projects: [],
  projectMembers: [],
  projectInvitations: [],
  dataSources: [],
}): ProjectRepositories {
  return {
    projects: new InMemoryProjectRepository(store),
    projectMembers: new InMemoryProjectMemberRepository(store),
    projectInvitations: new InMemoryProjectInvitationRepository(store),
    dataSources: new InMemoryDataSourceRepository(store),
  }
}
