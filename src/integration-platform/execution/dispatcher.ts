import type { ExecutionEngineRegistry } from "./registry"
import { ExecutionEngineNotRegisteredError } from "./errors"
import type { ExecutionRuntimeRequest, ExecutionRuntimeResult } from "./runtime.contracts"

export class ExecutionDispatcher {
  constructor(private readonly registry: ExecutionEngineRegistry) {}

  async dispatch(request: ExecutionRuntimeRequest): Promise<ExecutionRuntimeResult> {
    const entry = this.registry.find(request.engineId)
    if (!entry) {
      throw new ExecutionEngineNotRegisteredError(request.engineId)
    }

    return entry.engine.execute({
      executionId: request.executionId,
      connectorId: request.connectorId,
      payload: request.input,
    })
  }
}
