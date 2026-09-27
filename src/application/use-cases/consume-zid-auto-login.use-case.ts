import type { AuthGateway, AuthSessionViewModel, SessionStoragePort } from "../contracts"
import { PersistSessionCommand } from "../commands"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"

// Same shape as LoginUseCase/RegisterUseCase (persist the real session this response carries,
// then hand back a view model the auth store can hydrate from) plus redirectUrl, since this
// handoff already knows exactly where the merchant continues to -- the "connection successful"
// screen a direct Zid connect would also land on.
export class ConsumeZidAutoLoginUseCase {
  private readonly persistSessionCommand: PersistSessionCommand

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.persistSessionCommand = new PersistSessionCommand(sessionStorage)
  }

  async execute(handoffToken: string): Promise<AuthSessionViewModel & { redirectUrl: string }> {
    const response = await this.gateway.consumeZidAutoLogin(handoffToken)
    this.persistSessionCommand.execute(response.session)
    return {
      ...mapAuthReadModelToViewModel(mapLoginResponseDtoToReadModel(response)),
      redirectUrl: response.redirectUrl,
    }
  }
}
