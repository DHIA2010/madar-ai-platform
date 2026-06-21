export interface AuthUserDto {
  id: string
  email: string
  fullName: string
  emailVerified: boolean
  roles: Array<{
    id: string
    name: string
    permissions: string[]
  }>
  permissions: string[]
}

export interface AuthSessionDto {
  accessToken: {
    token: string
    tokenType: "Bearer"
    expiresAt: string
  }
  refreshToken: {
    token: string
    expiresAt: string
  }
  issuedAt: string
  rememberMe?: boolean
  strategy?: "storage" | "cookie"
}

export interface LoginRequestDto {
  email: string
  password: string
  rememberMe?: boolean
}

export interface ForgotPasswordRequestDto {
  email: string
}

export interface ResetPasswordRequestDto {
  token: string
  password: string
  confirmPassword: string
}

export interface VerifyEmailRequestDto {
  token: string
}

export interface LoginResponseDto {
  user: AuthUserDto
  session: AuthSessionDto
}

export interface CurrentUserDto {
  user: AuthUserDto | null
}

export interface AuthenticationRepository {
  login(payload: LoginRequestDto): Promise<LoginResponseDto>
  logout(session: AuthSessionDto | null): Promise<void>
  currentUser(session: AuthSessionDto | null): Promise<CurrentUserDto>
  forgotPassword(payload: ForgotPasswordRequestDto): Promise<void>
  resetPassword(payload: ResetPasswordRequestDto): Promise<void>
  verifyEmail(payload: VerifyEmailRequestDto): Promise<void>
}

export type AuthGateway = AuthenticationRepository
export type AuthenticationGateway = AuthenticationRepository

export interface SessionStoragePort {
  persist(session: AuthSessionDto): void
  restore(): AuthSessionDto | null
  clear(): void
  isExpired(session: AuthSessionDto | null): boolean
}

export type SessionStorageGateway = SessionStoragePort

export interface AuthSessionViewModel {
  user: AuthUserDto
  session: AuthSessionDto
}
