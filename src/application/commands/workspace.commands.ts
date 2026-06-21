import type { WorkspaceGateway, WorkspaceSelectionDto } from "../contracts"

export class SwitchWorkspaceCommand {
  constructor(private readonly gateway: WorkspaceGateway) {}

  execute(payload: WorkspaceSelectionDto) {
    return this.gateway.switchWorkspace(payload)
  }
}
