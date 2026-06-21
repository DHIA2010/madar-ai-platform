export interface Permission {
  id: string
  code: string
  description?: string
}

export interface Role {
  id: string
  name: string
  permissions: string[]
}

export interface User {
  id: string
  email: string
  fullName: string
  emailVerified: boolean
  roles: Role[]
  permissions: string[]
}

export interface AccessToken {
  token: string
  tokenType: "Bearer"
  expiresAt: string
}

export interface RefreshToken {
  token: string
  expiresAt: string
}

export interface Session {
  accessToken: AccessToken
  refreshToken: RefreshToken
  issuedAt: string
  rememberMe?: boolean
  strategy?: "storage" | "cookie"
}

export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export interface LoginResponse {
  user: User
  session: Session
}

export interface CurrentUser {
  user: User | null
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated"

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
  confirmPassword: string
}

export interface VerifyEmailRequest {
  token: string
}
