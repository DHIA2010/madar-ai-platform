import {
  AppError,
  NetworkError as AppNetworkError,
  ValidationError as AppValidationError,
  AuthorizationError as AppAuthorizationError,
  UnknownError,
} from "@/lib/app-errors"

interface ErrorOptions {
  message: string
  code?: string
  details?: unknown
  status?: number
  cause?: unknown
}

export class ApiError extends AppError {
  constructor(options: ErrorOptions) {
    super("unknown", {
      code: options.code ?? "api_error",
      message: options.message,
      details: options.details,
      status: options.status,
      cause: options.cause,
    })
    this.name = "ApiError"
  }
}

export class ConfigurationError extends AppError {
  constructor(options: ErrorOptions) {
    super("unknown", {
      code: options.code ?? "configuration_error",
      message: options.message,
      details: options.details,
      status: options.status,
      cause: options.cause,
    })
    this.name = "ConfigurationError"
  }
}

export class AuthenticationError extends AppAuthorizationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "auth_error",
      message: options.message,
      details: options.details,
      status: options.status ?? 401,
      cause: options.cause,
    })
    this.name = "AuthenticationError"
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "auth_invalid_credentials",
      message: options.message,
      details: options.details,
      status: options.status ?? 401,
      cause: options.cause,
    })
    this.name = "InvalidCredentialsError"
  }
}

export class SessionExpiredError extends AuthenticationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "auth_session_expired",
      message: options.message,
      details: options.details,
      status: options.status ?? 401,
      cause: options.cause,
    })
    this.name = "SessionExpiredError"
  }
}

export class ValidationError extends AppValidationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "validation_error",
      message: options.message,
      details: options.details,
      status: options.status,
      cause: options.cause,
    })
    this.name = "ValidationError"
  }
}

export class NetworkError extends AppNetworkError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "network_error",
      message: options.message,
      details: options.details,
      status: options.status,
      cause: options.cause,
    })
    this.name = "NetworkError"
  }
}

export class UnauthorizedError extends AppAuthorizationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "unauthorized",
      message: options.message,
      details: options.details,
      status: options.status ?? 401,
      cause: options.cause,
    })
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AppAuthorizationError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "forbidden",
      message: options.message,
      details: options.details,
      status: options.status ?? 403,
      cause: options.cause,
    })
    this.name = "ForbiddenError"
  }
}

export class ConflictError extends AppError {
  constructor(options: ErrorOptions) {
    super("validation", {
      code: options.code ?? "conflict_error",
      message: options.message,
      details: options.details,
      status: options.status ?? 409,
      cause: options.cause,
    })
    this.name = "ConflictError"
  }
}

export class NotFoundError extends AppError {
  constructor(options: ErrorOptions) {
    super("validation", {
      code: options.code ?? "not_found",
      message: options.message,
      details: options.details,
      status: options.status ?? 404,
      cause: options.cause,
    })
    this.name = "NotFoundError"
  }
}

export class TimeoutError extends AppNetworkError {
  constructor(options: ErrorOptions) {
    super({
      code: options.code ?? "timeout_error",
      message: options.message,
      details: options.details,
      status: options.status,
      cause: options.cause,
    })
    this.name = "TimeoutError"
  }
}

export function mapRepositoryError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new TimeoutError({ message: "The request was aborted or timed out.", cause: error })
  }

  if (error instanceof TypeError) {
    return new NetworkError({ message: error.message || "Network request failed.", cause: error })
  }

  if (error instanceof Error) {
    return new UnknownError({ message: error.message, cause: error })
  }

  return new ApiError({ message: "Unknown repository error.", details: error })
}

export function mapAuthenticationRepositoryError(error: unknown): AppError {
  if (error instanceof AppError) {
    const code = error.code.toLowerCase()
    const message = error.message || "Authentication request failed."

    const isInvalidCredentialsCode =
      code.includes("invalid_credentials") || code.includes("invalid_credential")

    const isSessionExpiredCode =
      code.includes("session_expired") ||
      code.includes("token_expired") ||
      code.includes("refresh_expired") ||
      code.includes("session_missing")

    if (isInvalidCredentialsCode) {
      return new InvalidCredentialsError({
        code: error.code,
        message,
        details: error.details,
        status: error.status,
        cause: error,
      })
    }

    if (isSessionExpiredCode) {
      return new SessionExpiredError({
        code: error.code,
        message,
        details: error.details,
        status: error.status,
        cause: error,
      })
    }

    if (error.kind === "authorization" || error.status === 401) {
      return new AuthenticationError({
        code: error.code,
        message,
        details: error.details,
        status: error.status,
        cause: error,
      })
    }
  }

  return mapRepositoryError(error)
}
