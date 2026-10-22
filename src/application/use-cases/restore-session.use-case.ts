import { AppError } from "@/lib/app-errors"

import type { AuthGateway, AuthSessionViewModel, SessionStoragePort } from "../contracts"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"
import { GetCurrentUserQuery, RefreshSessionQuery } from "../queries"
import { ClearSessionCommand, PersistSessionCommand, RestoreSessionCommand } from "../commands"

// True only for a failure the network itself caused (offline, DNS, timeout) -- never for a real
// response the server sent back, even a rejecting one (expired/invalid token, server error). Only
// a network-level failure here means "we genuinely can't tell right now," which is what falling
// back to the last-known cached profile instead of logging out requires; anything else is a real
// answer and must be trusted.
function isNetworkFailure(error: unknown): boolean {
  return error instanceof AppError && error.kind === "network"
}

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
      try {
        activeSession = await this.refreshSessionQuery.execute(restoredSession.refreshToken.token)
        this.persistSessionCommand.execute(activeSession)
      } catch (error) {
        // Can't reach the server to refresh the token right now -- with no way to confirm the
        // refresh token is still good, this can't let the visitor in at all (nothing to show
        // them that isn't possibly stale past its own expiry), unlike the getCurrentUser case
        // below where the already-valid access token is still good enough on its own.
        if (isNetworkFailure(error)) return null
        throw error
      }
    }

    let user: AuthSessionViewModel["user"] | null = null
    try {
      const currentUser = await this.getCurrentUserQuery.execute(activeSession)
      user = currentUser.user
      if (!user) {
        this.clearSessionCommand.execute()
        return null
      }
      // Mirrored locally so a later restore can fall back to it below when offline -- this is
      // what actually lets the POS offline-mode service worker's cached app shell be usable
      // with no network at all, instead of every reload re-forcing a login this can't complete.
      this.sessionStorage.persistUser(user)
    } catch (error) {
      if (!isNetworkFailure(error)) throw error
      // The access token itself is still within its own expiry (the branch above already
      // handled a genuinely expired one) -- just unconfirmable right now. Trust the last
      // confirmed profile rather than logging out someone who was validly signed in moments ago.
      user = this.sessionStorage.restoreUser()
      if (!user) return null
    }

    const readModel = mapLoginResponseDtoToReadModel({ user, session: activeSession })
    return mapAuthReadModelToViewModel(readModel)
  }
}
