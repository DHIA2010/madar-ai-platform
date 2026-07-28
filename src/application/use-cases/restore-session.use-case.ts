import type { AuthGateway, AuthSessionViewModel, SessionStoragePort } from "../contracts"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"
import { GetCurrentUserQuery, RefreshSessionQuery } from "../queries"
import { ClearSessionCommand, PersistSessionCommand, RestoreSessionCommand } from "../commands"

export class RestoreSessionUseCase {
  private readonly restoreSessionCommand: RestoreSessionCommand
  private readonly persistSessionCommand: PersistSessionCommand
  private readonly clearSessionCommand: ClearSessionCommand
  private readonly getCurrentUserQuery: GetCurrentUserQuery
  private readonly refreshSessionQuery: RefreshSessionQuery
  private readonly sessionStorage: SessionStoragePort

  constructor(gateway: AuthGateway, sessionStorage: SessionStoragePort) {
    this.sessionStorage = sessionStorage
    this.restoreSessionCommand = new RestoreSessionCommand(sessionStorage)
    this.persistSessionCommand = new PersistSessionCommand(sessionStorage)
    this.clearSessionCommand = new ClearSessionCommand(sessionStorage)
    this.getCurrentUserQuery = new GetCurrentUserQuery(gateway)
    this.refreshSessionQuery = new RefreshSessionQuery(gateway)
  }

  async execute(): Promise<AuthSessionViewModel | null> {
    const restoredSession = this.restoreSessionCommand.execute()
    if (!restoredSession) {
      return null
    }

    if (this.sessionStorage.isRefreshTokenExpired(restoredSession)) {
      this.clearSessionCommand.execute()
      return null
    }

    let activeSession = restoredSession

    if (this.sessionStorage.isAccessTokenExpired(restoredSession)) {
      activeSession = await this.refreshSessionQuery.execute(restoredSession.refreshToken.token)
      this.persistSessionCommand.execute(activeSession)
    }

    const currentUser = await this.getCurrentUserQuery.execute(activeSession)
    if (!currentUser.user) {
      this.clearSessionCommand.execute()
      return null
    }

    const readModel = mapLoginResponseDtoToReadModel({
      user: currentUser.user,
      session: activeSession,
    })

    return mapAuthReadModelToViewModel(readModel)
  }
}
