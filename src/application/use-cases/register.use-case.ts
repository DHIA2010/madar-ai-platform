import type {
  AuthGateway,
  AuthSessionViewModel,
  RegisterRequestDto,
  SessionStoragePort,
} from "../contracts"
import { PersistSessionCommand } from "../commands"
import { mapAuthReadModelToViewModel, mapLoginResponseDtoToReadModel } from "../mappers"
import { registerRequestDtoSchema } from "../validators"

export class RegisterUseCase {
  private readonly persistSessionCommand: PersistSessionCommand

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.persistSessionCommand = new PersistSessionCommand(sessionStorage)
  }

  async execute(payload: RegisterRequestDto): Promise<AuthSessionViewModel> {
    const validatedPayload = registerRequestDtoSchema.parse(payload)
    const response = await this.gateway.register(validatedPayload)
    this.persistSessionCommand.execute(response.session)
    return mapAuthReadModelToViewModel(mapLoginResponseDtoToReadModel(response))
  }
}
