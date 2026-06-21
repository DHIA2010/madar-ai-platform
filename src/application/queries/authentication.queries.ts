import type { AuthGateway, AuthSessionDto, CurrentUserDto } from "../contracts"

export class GetCurrentUserQuery {
  constructor(private readonly gateway: AuthGateway) {}

  execute(session: AuthSessionDto | null): Promise<CurrentUserDto> {
    return this.gateway.currentUser(session)
  }
}

export class RefreshSessionQuery {
  constructor(private readonly gateway: AuthGateway) {}

  execute(refreshToken: string): Promise<AuthSessionDto> {
    return this.gateway.refreshSession({ refreshToken })
  }
}
