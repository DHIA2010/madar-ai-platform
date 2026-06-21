import type { WorkspaceGateway, WorkspaceSelectionDto, WorkspaceDto } from "../contracts"
import { SwitchWorkspaceCommand } from "../commands"
import { workspaceSelectionDtoSchema } from "../validators"

export class SwitchWorkspaceUseCase {
  private readonly command: SwitchWorkspaceCommand

  constructor(gateway: WorkspaceGateway) {
    this.command = new SwitchWorkspaceCommand(gateway)
  }

  async execute(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    const validatedPayload = workspaceSelectionDtoSchema.parse(payload)
    return this.command.execute(validatedPayload)
  }
}
