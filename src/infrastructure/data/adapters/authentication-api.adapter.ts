import type {
  AuthSessionDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshSessionRequestDto,
  ResetPasswordRequestDto,
  VerifyEmailRequestDto,
} from "@/application/contracts/authentication.contracts"
import type { ApiClient } from "@/infrastructure/http"

export class AuthenticationApiAdapter {
  constructor(private readonly client: ApiClient) {}

  login(payload: LoginRequestDto): Promise<LoginResponseDto> {
    return this.client.post<LoginRequestDto, LoginResponseDto>("/auth/login", payload)
  }

  logout(session: AuthSessionDto | null): Promise<void> {
    return this.client.post<{ refreshToken?: string }, void>("/auth/logout", {
      refreshToken: session?.refreshToken?.token,
    })
  }

  currentUser(_session: AuthSessionDto | null): Promise<CurrentUserDto> {
    return this.client.get<CurrentUserDto>("/auth/me")
  }

  refreshSession(payload: RefreshSessionRequestDto): Promise<AuthSessionDto> {
    return this.client.post<RefreshSessionRequestDto, AuthSessionDto>("/auth/refresh", payload)
  }

  forgotPassword(payload: ForgotPasswordRequestDto): Promise<void> {
    return this.client.post<ForgotPasswordRequestDto, void>("/auth/forgot-password", payload)
  }

  resetPassword(payload: ResetPasswordRequestDto): Promise<void> {
    return this.client.post<ResetPasswordRequestDto, void>("/auth/reset-password", payload)
  }

  verifyEmail(payload: VerifyEmailRequestDto): Promise<void> {
    return this.client.post<VerifyEmailRequestDto, void>("/auth/verify-email", payload)
  }
}
