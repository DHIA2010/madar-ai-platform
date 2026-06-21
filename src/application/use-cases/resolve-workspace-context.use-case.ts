import type {
  WorkspaceContextViewModel,
  WorkspaceGateway,
  WorkspaceServiceSelectionDto,
} from "../contracts"
import {
  mapWorkspaceContextDtoToReadModel,
  mapWorkspaceContextReadModelToViewModel,
} from "../mappers"
import { GetWorkspaceQuery } from "../queries"
import { workspaceServiceSelectionDtoSchema } from "../validators"

export class ResolveWorkspaceContextUseCase {
  private readonly query: GetWorkspaceQuery

  constructor(gateway: WorkspaceGateway) {
    this.query = new GetWorkspaceQuery(gateway)
  }

  async execute(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceContextViewModel> {
    const validatedSelection = workspaceServiceSelectionDtoSchema.parse(selection)
    const payload = await this.query.execute(validatedSelection)
    return mapWorkspaceContextReadModelToViewModel(mapWorkspaceContextDtoToReadModel(payload))
  }
}
