import type {
  AcceptInvitationResponseDto,
  AuthGateway,
  AuthSessionDto,
  AuthSessionViewModel,
  AuthUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
  SessionStoragePort,
  VerifyEmailRequestDto,
} from "../contracts"
import { GetCurrentUserQuery } from "../queries"
import { LoginUseCase, LogoutUseCase, RegisterUseCase, RestoreSessionUseCase } from "../use-cases"

export class AuthenticationApplicationService {
  private readonly restoreSessionUseCase: RestoreSessionUseCase
  private readonly loginUseCase: LoginUseCase
  private readonly registerUseCase: RegisterUseCase
  private readonly logoutUseCase: LogoutUseCase
  private readonly getCurrentUserQuery: GetCurrentUserQuery

  constructor(
    private readonly gateway: AuthGateway,
    sessionStorage: SessionStoragePort
  ) {
    this.restoreSessionUseCase = new RestoreSessionUseCase(gateway, sessionStorage)
    this.loginUseCase = new LoginUseCase(gateway, sessionStorage)
    this.registerUseCase = new RegisterUseCase(gateway, sessionStorage)
    this.logoutUseCase = new LogoutUseCase(gateway, sessionStorage)
    this.getCurrentUserQuery = new GetCurrentUserQuery(gateway)
  }

  restoreSession(): Promise<AuthSessionViewModel | null> {
    return this.restoreSessionUseCase.execute()
  }

  login(payload: LoginRequestDto): Promise<AuthSessionViewModel> {
    return this.loginUseCase.execute(payload)
  }

  register(payload: RegisterRequestDto): Promise<AuthSessionViewModel> {
    return this.registerUseCase.execute(payload)
  }

  refreshSession(refreshToken: string): Promise<AuthSessionDto> {
    return this.gateway.refreshSession({ refreshToken })
  }

  logout(session: AuthSessionDto | null): Promise<void> {
    return this.logoutUseCase.execute(session)
  }

  async getCurrentUser(session: AuthSessionDto | null): Promise<AuthUserDto | null> {
    const currentUser = await this.getCurrentUserQuery.execute(session)
    return currentUser.user
  }

  forgotPassword(payload: ForgotPasswordRequestDto): Promise<void> {
    return this.gateway.forgotPassword(payload)
  }

  resetPassword(payload: ResetPasswordRequestDto): Promise<void> {
    return this.gateway.resetPassword(payload)
  }

  verifyEmail(payload: VerifyEmailRequestDto): Promise<void> {
    return this.gateway.verifyEmail(payload)
  }

  acceptInvitation(token: string): Promise<AcceptInvitationResponseDto> {
    return this.gateway.acceptInvitation(token)
  }
}
