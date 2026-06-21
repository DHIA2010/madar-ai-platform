import type { AuthSessionDto, LoginRequestDto, SessionStoragePort } from "../contracts"

export class RestoreSessionCommand {
  constructor(private readonly sessionStorage: SessionStoragePort) {}

  execute(): AuthSessionDto | null {
    return this.sessionStorage.restore()
  }
}

export class PersistSessionCommand {
  constructor(private readonly sessionStorage: SessionStoragePort) {}

  execute(session: AuthSessionDto): void {
    this.sessionStorage.persist(session)
  }
}

export class ClearSessionCommand {
  constructor(private readonly sessionStorage: SessionStoragePort) {}

  execute(): void {
    this.sessionStorage.clear()
  }
}

export class LoginCommand {
  execute(payload: LoginRequestDto): LoginRequestDto {
    return payload
  }
}
