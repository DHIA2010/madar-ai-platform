import type {
  AcceptInvitationResponseDto,
  AuthSessionDto,
  AuthUserDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshSessionRequestDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
  UpdateProfileRequestDto,
  UploadAvatarRequestDto,
  VerifyEmailRequestDto,
} from "@/application/contracts/authentication.contracts"
import type { ApiClient } from "@/infrastructure/http"

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  owner: [
    "org:read",
    "org:write",
    "org:invite",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "session:revoke",
    "identity:read",
    "identity:write",
  ],
  admin: [
    "org:read",
    "org:invite",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "session:revoke",
    "identity:read",
    "identity:write",
  ],
  manager: [
    "org:read",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "identity:read",
    "identity:write",
  ],
  analyst: ["org:read", "workspace:read", "workspace:switch", "session:read", "identity:read"],
  viewer: ["org:read", "workspace:read", "workspace:switch", "identity:read"],
}

interface IdentityLoginResponse {
  user: {
    id: string
    email: string
    fullName: string
    avatarUrl?: string | null
    status?: string
    modulePermissions?: string[]
  }
  session: {
    accessToken: string
    accessTokenExpiresAt: string
    refreshToken: string
    refreshTokenExpiresAt: string
    rememberMe?: boolean
  }
}

interface IdentitySessionResponse {
  user: {
    id: string
    email: string
    fullName: string
    avatarUrl?: string | null
    status?: string
    emailVerifiedAt?: string | null
    modulePermissions?: string[]
  }
  roles?: string[]
}

interface IdentityProfileResponse {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  emailVerifiedAt?: string | null
  modulePermissions?: string[]
}

function mapRoles(roles: string[] | undefined) {
  const resolvedRoles = roles && roles.length > 0 ? roles : ["owner"]
  return resolvedRoles.map((role) => ({
    id: `role_${role}`,
    name: role,
    permissions: ROLE_PERMISSION_MAP[role] ?? ROLE_PERMISSION_MAP.owner,
  }))
}

function mapPermissions(roles: string[] | undefined) {
  const roleEntries = mapRoles(roles)
  return Array.from(new Set(roleEntries.flatMap((role) => role.permissions)))
}

function mapProfileResponse(response: IdentityProfileResponse): AuthUserDto {
  return {
    id: response.id,
    email: response.email,
    fullName: response.fullName,
    avatarUrl: response.avatarUrl,
    emailVerified: Boolean(response.emailVerifiedAt),
    roles: [],
    permissions: [],
    modulePermissions: response.modulePermissions ?? [],
  }
}

function mapSession(session: IdentityLoginResponse["session"]): AuthSessionDto {
  return {
    issuedAt: new Date().toISOString(),
    rememberMe: Boolean(session.rememberMe),
    strategy: "storage",
    accessToken: {
      token: session.accessToken,
      tokenType: "Bearer",
      expiresAt: session.accessTokenExpiresAt,
    },
    refreshToken: {
      token: session.refreshToken,
      expiresAt: session.refreshTokenExpiresAt,
    },
  }
}

export class AuthenticationApiAdapter {
  constructor(private readonly client: ApiClient) {}

  async login(payload: LoginRequestDto): Promise<LoginResponseDto> {
    const response = await this.client.post<LoginRequestDto, IdentityLoginResponse>(
      "/v1/auth/login",
      payload
    )
    return {
      user: {
        id: response.user.id,
        email: response.user.email,
        fullName: response.user.fullName,
        avatarUrl: response.user.avatarUrl ?? null,
        emailVerified: true,
        roles: mapRoles(["owner"]),
        permissions: mapPermissions(["owner"]),
        modulePermissions: response.user.modulePermissions ?? [],
      },
      session: mapSession(response.session),
    }
  }

  async register(payload: RegisterRequestDto): Promise<LoginResponseDto> {
    const response = await this.client.post<
      Omit<RegisterRequestDto, "rememberMe"> & { timezone: string; language: string },
      {
        userId: string
        organizationId: string
        workspaceId: string | null
        verificationToken: string
      }
    >("/v1/auth/register", {
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      organizationName: payload.organizationName,
      invitationToken: payload.invitationToken,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: "en",
    })

    // register() leaves the account "pending_verification" (login is blocked until
    // verified), so immediately consume the verification token the backend just handed
    // back before logging in — mirrors clicking the verification email link inline.
    await this.verifyEmail({ token: response.verificationToken })

    return this.login({
      email: payload.email,
      password: payload.password,
      rememberMe: payload.rememberMe,
    })
  }

  logout(_session: AuthSessionDto | null): Promise<void> {
    return this.client.post<Record<string, never>, void>("/v1/auth/logout", {})
  }

  async currentUser(_session: AuthSessionDto | null): Promise<CurrentUserDto> {
    const response = await this.client.get<IdentitySessionResponse>("/v1/auth/session")
    return {
      user: response.user
        ? {
            id: response.user.id,
            email: response.user.email,
            fullName: response.user.fullName,
            avatarUrl: response.user.avatarUrl ?? null,
            emailVerified: Boolean(response.user.emailVerifiedAt),
            roles: mapRoles(response.roles),
            permissions: mapPermissions(response.roles),
            modulePermissions: response.user.modulePermissions ?? [],
          }
        : null,
    }
  }

  async refreshSession(payload: RefreshSessionRequestDto): Promise<AuthSessionDto> {
    const response = await this.client.post<
      RefreshSessionRequestDto,
      IdentityLoginResponse["session"]
    >("/v1/auth/refresh", payload)
    return mapSession(response)
  }

  forgotPassword(payload: ForgotPasswordRequestDto): Promise<void> {
    return this.client.post<ForgotPasswordRequestDto, void>("/v1/auth/password/forgot", payload)
  }

  resetPassword(payload: ResetPasswordRequestDto): Promise<void> {
    return this.client.post<ResetPasswordRequestDto, void>("/v1/auth/password/reset", payload)
  }

  verifyEmail(payload: VerifyEmailRequestDto): Promise<void> {
    return this.client.post<VerifyEmailRequestDto, void>("/v1/auth/verify-email", payload)
  }

  acceptInvitation(token: string): Promise<AcceptInvitationResponseDto> {
    return this.client.post<Record<string, never>, AcceptInvitationResponseDto>(
      `/v1/organizations/invitations/${encodeURIComponent(token)}/accept`,
      {}
    )
  }

  async updateProfile(payload: UpdateProfileRequestDto): Promise<AuthUserDto> {
    const response = await this.client.patch<UpdateProfileRequestDto, IdentityProfileResponse>(
      "/v1/identity/profile",
      payload
    )
    return mapProfileResponse(response)
  }

  async uploadAvatar(payload: UploadAvatarRequestDto): Promise<AuthUserDto> {
    const response = await this.client.post<UploadAvatarRequestDto, IdentityProfileResponse>(
      "/v1/identity/profile/avatar",
      payload
    )
    return mapProfileResponse(response)
  }

  async removeAvatar(): Promise<AuthUserDto> {
    const response = await this.client.delete<IdentityProfileResponse>(
      "/v1/identity/profile/avatar"
    )
    return mapProfileResponse(response)
  }
}
