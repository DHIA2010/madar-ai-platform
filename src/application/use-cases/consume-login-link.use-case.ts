import type { AuthGateway, AuthSessionViewModel, SessionStoragePort } from "../contracts"
import { PersistSessionCommand } from "../commands"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"

// Same as ConsumeZidAutoLoginUseCase, for an e-mailed one-click sign-in link: persists the
// session it returns -- replacing whichever account this browser was signed in to -- and hands
// back where to continue.
export class ConsumeLoginLinkUseCase {
  private readonly persistSessionCommand: PersistSessionCommand

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.persistSessionCommand = new PersistSessionCommand(sessionStorage)
  }

  async execute(token: string): Promise<AuthSessionViewModel & { redirectUrl: string }> {
    const response = await this.gateway.consumeLoginLink(token)
    this.persistSessionCommand.execute(response.session)
    return {
      ...mapAuthReadModelToViewModel(mapLoginResponseDtoToReadModel(response)),
      redirectUrl: response.redirectUrl,
    }
  }
}
