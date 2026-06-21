import type { AuthGateway, AuthSessionViewModel, SessionStoragePort } from "../contracts"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"
import { GetCurrentUserQuery } from "../queries"
import { ClearSessionCommand, RestoreSessionCommand } from "../commands"

export class RestoreSessionUseCase {
  private readonly restoreSessionCommand: RestoreSessionCommand
  private readonly clearSessionCommand: ClearSessionCommand
  private readonly getCurrentUserQuery: GetCurrentUserQuery

  constructor(gateway: AuthGateway, sessionStorage: SessionStoragePort) {
    this.restoreSessionCommand = new RestoreSessionCommand(sessionStorage)
    this.clearSessionCommand = new ClearSessionCommand(sessionStorage)
    this.getCurrentUserQuery = new GetCurrentUserQuery(gateway)
  }

  async execute(): Promise<AuthSessionViewModel | null> {
    const session = this.restoreSessionCommand.execute()
    if (!session) {
      return null
    }

    const currentUser = await this.getCurrentUserQuery.execute(session)
    if (!currentUser.user) {
      this.clearSessionCommand.execute()
      return null
    }

    const readModel = mapLoginResponseDtoToReadModel({
      user: currentUser.user,
      session,
    })

    return mapAuthReadModelToViewModel(readModel)
  }
}
