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
    try {
      await this.gateway.logout(session)
    } finally {
      this.clearSessionCommand.execute()
    }
  }
}
