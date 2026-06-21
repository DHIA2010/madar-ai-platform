import type {
  OrganizationDto,
  WorkspaceContextViewModel,
  WorkspaceDto,
  WorkspaceGateway,
  WorkspaceSelectionDto,
  WorkspaceServiceSelectionDto,
} from "../contracts"
import { GetOrganizationsQuery, GetWorkspacesQuery } from "../queries"
import { ResolveWorkspaceContextUseCase, SwitchWorkspaceUseCase } from "../use-cases"

export class WorkspaceApplicationService {
  private readonly resolveWorkspaceContextUseCase: ResolveWorkspaceContextUseCase
  private readonly switchWorkspaceUseCase: SwitchWorkspaceUseCase
  private readonly getOrganizationsQuery: GetOrganizationsQuery
  private readonly getWorkspacesQuery: GetWorkspacesQuery

  constructor(gateway: WorkspaceGateway) {
    this.resolveWorkspaceContextUseCase = new ResolveWorkspaceContextUseCase(gateway)
    this.switchWorkspaceUseCase = new SwitchWorkspaceUseCase(gateway)
    this.getOrganizationsQuery = new GetOrganizationsQuery(gateway)
    this.getWorkspacesQuery = new GetWorkspacesQuery(gateway)
  }

  resolveWorkspaceContext(
    selection: WorkspaceServiceSelectionDto
  ): Promise<WorkspaceContextViewModel> {
    return this.resolveWorkspaceContextUseCase.execute(selection)
  }

  switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    return this.switchWorkspaceUseCase.execute(payload)
  }

  getOrganizations(): Promise<OrganizationDto[]> {
    return this.getOrganizationsQuery.execute()
  }

  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    return this.getWorkspacesQuery.execute(organizationId)
  }

  async getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null> {
    const context = await this.resolveWorkspaceContextUseCase.execute(selection)
    return context.currentWorkspace
  }
}
