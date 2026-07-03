export class IntegrationPlatformError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "VALIDATION_ERROR"
      | "CONFLICT"
      | "UNAUTHORIZED",
    message: string,
    public readonly status = 400
  ) {
    super(message)
    this.name = "IntegrationPlatformError"
  }
}

export const INTEGRATION_ERRORS = {
  forbidden: () => new IntegrationPlatformError("FORBIDDEN", "Access denied.", 403),
  notFound: (entity: string) =>
    new IntegrationPlatformError("NOT_FOUND", `${entity} was not found.`, 404),
  invalidState: (message: string) => new IntegrationPlatformError("INVALID_STATE", message, 409),
  validation: (message: string) => new IntegrationPlatformError("VALIDATION_ERROR", message, 400),
  conflict: (message: string) => new IntegrationPlatformError("CONFLICT", message, 409),
  unauthorized: () => new IntegrationPlatformError("UNAUTHORIZED", "Authentication required.", 401),
} as const
