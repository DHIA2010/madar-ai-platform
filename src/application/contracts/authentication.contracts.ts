export interface AuthUserDto {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  emailVerified: boolean
  roles: Array<{
    id: string
    name: string
    permissions: string[]
  }>
  permissions: string[]
  modulePermissions: string[]
}

export interface UpdateProfileRequestDto {
  fullName?: string
}

export interface UploadAvatarRequestDto {
  contentType: string
  dataBase64: string
}

export interface ChangePasswordRequestDto {
  currentPassword: string
  newPassword: string
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

export interface RegisterRequestDto {
  fullName: string
  email: string
  password: string
  organizationName?: string
  invitationToken?: string
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

export interface AcceptInvitationResponseDto {
  success: boolean
  membershipId?: string
}

export interface ClaimZidMarketplaceInstallResponseDto {
  connectionId: string
  status: string
}

export interface ZidMarketplaceInstallSummaryDto {
  storeName: string
  currency: string | null
  status: string
}

export interface LoginResponseDto {
  user: AuthUserDto
  session: AuthSessionDto
}

export interface CurrentUserDto {
  user: AuthUserDto | null
}

export interface RefreshSessionRequestDto {
  refreshToken: string
}

export interface AuthenticationRepository {
  login(payload: LoginRequestDto): Promise<LoginResponseDto>
  register(payload: RegisterRequestDto): Promise<LoginResponseDto>
  logout(session: AuthSessionDto | null): Promise<void>
  currentUser(session: AuthSessionDto | null): Promise<CurrentUserDto>
  refreshSession(payload: RefreshSessionRequestDto): Promise<AuthSessionDto>
  forgotPassword(payload: ForgotPasswordRequestDto): Promise<void>
  resetPassword(payload: ResetPasswordRequestDto): Promise<void>
  verifyEmail(payload: VerifyEmailRequestDto): Promise<void>
  acceptInvitation(token: string): Promise<AcceptInvitationResponseDto>
  claimZidMarketplaceInstall(claimToken: string): Promise<ClaimZidMarketplaceInstallResponseDto>
  getZidMarketplaceInstallSummary(claimToken: string): Promise<ZidMarketplaceInstallSummaryDto>
  updateProfile(payload: UpdateProfileRequestDto): Promise<AuthUserDto>
  uploadAvatar(payload: UploadAvatarRequestDto): Promise<AuthUserDto>
  removeAvatar(): Promise<AuthUserDto>
  changePassword(payload: ChangePasswordRequestDto): Promise<void>
}

export type AuthGateway = AuthenticationRepository
export type AuthenticationGateway = AuthenticationRepository

export interface SessionStoragePort {
  persist(session: AuthSessionDto): void
  restore(): AuthSessionDto | null
  clear(): void
  isExpired(session: AuthSessionDto | null): boolean
  isAccessTokenExpired(session: AuthSessionDto | null): boolean
  isRefreshTokenExpired(session: AuthSessionDto | null): boolean
}

export type SessionStorageGateway = SessionStoragePort

export interface AuthSessionViewModel {
  user: AuthUserDto
  session: AuthSessionDto
}
