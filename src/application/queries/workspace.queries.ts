import type {
  OrganizationDto,
  WorkspaceDto,
  WorkspaceGateway,
  WorkspaceServiceSelectionDto,
} from "../contracts"

export class GetWorkspaceQuery {
  constructor(private readonly gateway: WorkspaceGateway) {}

  async execute(selection: WorkspaceServiceSelectionDto) {
    const [availableOrganizations, availableWorkspaces, currentWorkspace] = await Promise.all([
      this.gateway.getOrganizations(),
      this.gateway.getWorkspaces(),
      this.gateway.getCurrentWorkspace(selection),
    ])

    const currentOrganization = currentWorkspace
      ? (availableOrganizations.find(
          (organization) => organization.id === currentWorkspace.organizationId
        ) ?? null)
      : selection.organizationId
        ? (availableOrganizations.find(
            (organization) => organization.id === selection.organizationId
          ) ?? null)
        : null

    return {
      currentOrganization,
      currentWorkspace,
      availableOrganizations,
      availableWorkspaces,
    }
  }
}

export class GetOrganizationsQuery {
  constructor(private readonly gateway: WorkspaceGateway) {}

  execute(): Promise<OrganizationDto[]> {
    return this.gateway.getOrganizations()
  }
}

export class GetWorkspacesQuery {
  constructor(private readonly gateway: WorkspaceGateway) {}

  execute(organizationId?: string): Promise<WorkspaceDto[]> {
    return this.gateway.getWorkspaces(organizationId)
  }
}
