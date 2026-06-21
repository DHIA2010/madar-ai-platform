import type { AuthGateway, AuthSessionDto, SessionStoragePort } from "../contracts"
import { ClearSessionCommand } from "../commands"

export class LogoutUseCase {
  private readonly clearSessionCommand: ClearSessionCommand

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.clearSessionCommand = new ClearSessionCommand(sessionStorage)
  }

  async execute(session: AuthSessionDto | null): Promise<void> {
    await this.gateway.logout(session)
    this.clearSessionCommand.execute()
  }
}
