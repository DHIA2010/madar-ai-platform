import type {
  AuthGateway,
  AuthSessionViewModel,
  LoginRequestDto,
  SessionStoragePort,
} from "../contracts"
import { PersistSessionCommand } from "../commands"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"
import { loginRequestDtoSchema } from "../validators"

export class LoginUseCase {
  private readonly persistSessionCommand: PersistSessionCommand

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.persistSessionCommand = new PersistSessionCommand(sessionStorage)
  }

  async execute(payload: LoginRequestDto): Promise<AuthSessionViewModel> {
    const validatedPayload = loginRequestDtoSchema.parse(payload)
    const response = await this.gateway.login(validatedPayload)
    this.persistSessionCommand.execute(response.session)
    return mapAuthReadModelToViewModel(mapLoginResponseDtoToReadModel(response))
  }
}
