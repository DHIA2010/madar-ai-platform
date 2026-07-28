export class ExecutionRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "ExecutionRuntimeError"
  }
}

export class ExecutionNotFoundError extends ExecutionRuntimeError {
  constructor(executionId: string) {
    super("execution_not_found", `Execution ${executionId} was not found.`, { executionId })
  }
}

export class ExecutionCancelledError extends ExecutionRuntimeError {
  constructor(executionId: string) {
    super("execution_cancelled", `Execution ${executionId} was cancelled.`, { executionId })
  }
}

export class ExecutionEngineNotRegisteredError extends ExecutionRuntimeError {
  constructor(engineId: string) {
    super("engine_not_registered", `Execution engine ${engineId} is not registered.`, { engineId })
  }
}
