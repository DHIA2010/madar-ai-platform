import type { AppError } from "@/lib/app-errors"

import type {
  CurrentUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshToken,
  ResetPasswordRequest,
  Session,
  VerifyEmailRequest,
} from "./models"

export interface AuthenticationService {
  login(payload: LoginRequest): Promise<LoginResponse>
  logout(session: Session | null): Promise<void>
  refresh(refreshToken: RefreshToken): Promise<Session>
  currentUser(session: Session | null): Promise<CurrentUser>
  forgotPassword(payload: ForgotPasswordRequest): Promise<void>
  resetPassword(payload: ResetPasswordRequest): Promise<void>
  verifyEmail(payload: VerifyEmailRequest): Promise<void>
}

export interface AuthenticationSessionManager {
  persist(session: Session): void
  restore(): Session | null
  clear(): void
  isExpired(session: Session | null): boolean
}

export interface AuthContextValue {
  currentUser: CurrentUser["user"]
  authStatus: "idle" | "loading" | "authenticated" | "unauthenticated"
  login: (payload: LoginRequest) => Promise<void>
  logout: () => Promise<void>
}

export interface AuthCommandResult<T> {
  data: T | null
  error: AppError | null
}
