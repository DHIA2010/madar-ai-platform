export type IdentityErrorCategory =
  | "business"
  | "validation"
  | "security"
  | "infrastructure"
  | "external"

export class IdentityError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly category: IdentityErrorCategory,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "IdentityError"
  }
}

export const ERRORS = {
  invalidCredentials: () =>
    new IdentityError("AUTH_INVALID_CREDENTIALS", 401, "security", "Invalid email or password."),
  emailAlreadyExists: () =>
    new IdentityError("AUTH_EMAIL_EXISTS", 409, "business", "Email already exists."),
  emailNotVerified: () =>
    new IdentityError("AUTH_EMAIL_NOT_VERIFIED", 403, "security", "Email is not verified."),
  tokenInvalid: () =>
    new IdentityError("AUTH_TOKEN_INVALID", 401, "security", "Token is invalid or expired."),
  forbidden: () => new IdentityError("AUTH_FORBIDDEN", 403, "security", "Permission denied."),
  locked: (until: string) =>
    new IdentityError("AUTH_ACCOUNT_LOCKED", 423, "security", "Account temporarily locked.", {
      lockedUntil: until,
    }),
  notFound: (entity: string) =>
    new IdentityError("RESOURCE_NOT_FOUND", 404, "business", `${entity} not found.`),
  validation: (details: Record<string, unknown>) =>
    new IdentityError("VALIDATION_ERROR", 400, "validation", "Request validation failed.", details),
}
