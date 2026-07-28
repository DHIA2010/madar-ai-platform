export class ProjectError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly category:
      | "validation"
      | "authorization"
      | "not_found"
      | "conflict"
      | "state"
      | "security",
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = "ProjectError"
  }
}

export const PROJECT_ERRORS = {
  forbidden: () => new ProjectError("PROJECT_FORBIDDEN", 403, "authorization", "Access denied."),
  notFound: (entity: string) =>
    new ProjectError("PROJECT_NOT_FOUND", 404, "not_found", `${entity} not found.`),
  validation: (message: string, details: Record<string, unknown> = {}) =>
    new ProjectError("PROJECT_VALIDATION_ERROR", 400, "validation", message, details),
  conflict: (message: string, details: Record<string, unknown> = {}) =>
    new ProjectError("PROJECT_CONFLICT", 409, "conflict", message, details),
  state: (message: string, details: Record<string, unknown> = {}) =>
    new ProjectError("PROJECT_INVALID_STATE", 400, "state", message, details),
  rateLimited: (retryAfterSeconds: number) =>
    new ProjectError("PROJECT_RATE_LIMITED", 429, "security", "Too many requests.", {
      retryAfterSeconds,
    }),
}
