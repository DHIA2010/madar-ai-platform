export class ApplicationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = this.constructor.name
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super("application_validation", message)
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message: string) {
    super("application_authorization", message)
  }
}

export class ReadModelNotFoundError extends ApplicationError {
  constructor(readModelId: string) {
    super("read_model_not_found", `Read model ${readModelId} could not be found.`)
  }
}

export class ReadModelExpiredError extends ApplicationError {
  constructor(readModelId: string) {
    super("read_model_expired", `Read model ${readModelId} has expired.`)
  }
}

export class CommandFailedError extends ApplicationError {
  constructor(commandName: string, message: string) {
    super("command_failed", `${commandName} failed: ${message}`)
  }
}
