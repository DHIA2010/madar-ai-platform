import type {
  AuthSessionDto,
  AuthSessionViewModel,
  AuthUserDto,
  CurrentUserDto,
  LoginResponseDto,
  ReadModelViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapLoginResponseDtoToReadModel(dto: LoginResponseDto) {
  return createReadModel({
    id: `auth-session:${dto.user.id}`,
    owner: "authentication",
    sourceDomains: ["authentication"],
    payload: dto,
  })
}

export function mapAuthReadModelToViewModel(
  readModel: ReturnType<typeof mapLoginResponseDtoToReadModel>
): AuthSessionViewModel {
  return {
    user: readModel.payload.user,
    session: readModel.payload.session,
  }
}

export function mapCurrentUserDtoToViewModel(dto: CurrentUserDto): AuthUserDto | null {
  return dto.user ? { ...dto.user } : null
}

export function mapSessionDtoToViewModel(session: AuthSessionDto | null): AuthSessionDto | null {
  return session ? { ...session } : null
}
