import { randomUUID } from "node:crypto"

import type {
  ExecutionEvent,
  ExecutionHooks,
  ExecutionMiddleware,
  ExecutionRuntimeRequest,
  ExecutionRuntimeResult,
  ExecutionState,
} from "./runtime.contracts"
import { ExecutionCancelledError, ExecutionNotFoundError, ExecutionRuntimeError } from "./errors"
import { ExecutionDispatcher } from "./dispatcher"
import type { ExecutionEngineRegistry } from "./registry"
import { ExecutionMetrics } from "./metrics"
import { ExecutionBus } from "./bus"

export interface ExecutionRuntimeDependencies {
  registry: ExecutionEngineRegistry
  dispatcher?: ExecutionDispatcher
  bus?: ExecutionBus
  hooks?: ExecutionHooks[]
  middlewares?: ExecutionMiddleware[]
  now?: () => string
  publishEvents?: (events: ExecutionEvent[]) => Promise<void> | void
}

export class ExecutionRuntime {
  private readonly states = new Map<string, ExecutionState>()
  private readonly events: ExecutionEvent[] = []
  private readonly hooks: ExecutionHooks[]
  private readonly middlewares: ExecutionMiddleware[]
  private readonly metrics = new ExecutionMetrics()
  private readonly dispatcher: ExecutionDispatcher
  private readonly bus: ExecutionBus

  constructor(private readonly deps: ExecutionRuntimeDependencies) {
    this.hooks = deps.hooks ?? []
    this.middlewares = deps.middlewares ?? []
    this.dispatcher = deps.dispatcher ?? new ExecutionDispatcher(deps.registry)
    this.bus = deps.bus ?? new ExecutionBus({ dispatcher: this.dispatcher, now: deps.now })
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  private async emit(event: ExecutionEvent, state: ExecutionState) {
    this.events.push(event)
    for (const hook of this.hooks) {
      await hook.onEvent?.(event, state)
    }
    await this.bus.publishRuntimeEvent(event, state)
    await Promise.resolve(this.deps.publishEvents?.([event]))
  }

  private async updateState(state: ExecutionState) {
    this.states.set(state.executionId, state)
    this.metrics.recordState(state.status)
    for (const hook of this.hooks) {
      await hook.onStateChange?.(state)
    }
  }

  private createState(request: ExecutionRuntimeRequest): ExecutionState {
    const queuedAt = this.now()
    return {
      executionId: request.executionId,
      engineId: request.engineId,
      status: "queued",
      request,
      metadata: request.context.metadata,
      queuedAt,
      dispatchedAt: null,
      startedAt: null,
      finishedAt: null,
      cancelledAt: null,
      result: null,
      error: null,
    }
  }

  private async runMiddleware(
    context: { state: ExecutionState; request: ExecutionRuntimeRequest },
    dispatch: () => Promise<ExecutionRuntimeResult>
  ) {
    const chain = [...this.middlewares]
    let index = -1

    const invoke = async (): Promise<ExecutionRuntimeResult> => {
      index += 1
      const middleware = chain[index]
      if (!middleware) {
        return dispatch()
      }
      return middleware(context, invoke)
    }

    return invoke()
  }

  useMiddleware(middleware: ExecutionMiddleware) {
    this.middlewares.push(middleware)
  }

  useHook(hook: ExecutionHooks) {
    this.hooks.push(hook)
  }

  async queue(request: ExecutionRuntimeRequest) {
    const state = this.createState(request)
    await this.updateState(state)
    await this.emit(
      {
        eventId: randomUUID(),
        executionId: request.executionId,
        engineId: request.engineId,
        type: "ExecutionQueued",
        occurredAt: state.queuedAt,
        payload: { metadata: request.context.metadata },
      },
      state
    )
    return state
  }

  async dispatch(executionId: string): Promise<ExecutionRuntimeResult> {
    const state = this.states.get(executionId)
    if (!state) {
      throw new ExecutionNotFoundError(executionId)
    }

    if (state.status === "cancelled") {
      throw new ExecutionCancelledError(executionId)
    }

    const dispatchedAt = this.now()
    const dispatchedState: ExecutionState = { ...state, status: "dispatched", dispatchedAt }
    await this.updateState(dispatchedState)
    await this.emit(
      {
        eventId: randomUUID(),
        executionId,
        engineId: state.engineId,
        type: "ExecutionDispatched",
        occurredAt: dispatchedAt,
        payload: { engineId: state.engineId },
      },
      dispatchedState
    )

    const runningAt = this.now()
    const runningState: ExecutionState = {
      ...dispatchedState,
      status: "running",
      startedAt: runningAt,
    }
    await this.updateState(runningState)
    await this.emit(
      {
        eventId: randomUUID(),
        executionId,
        engineId: state.engineId,
        type: "ExecutionStarted",
        occurredAt: runningAt,
        payload: { connectorId: state.request.connectorId },
      },
      runningState
    )
    await this.emit(
      {
        eventId: randomUUID(),
        executionId,
        engineId: state.engineId,
        type: "ExecutionHeartbeat",
        occurredAt: runningAt,
        payload: { state: "running" },
      },
      runningState
    )

    for (const hook of this.hooks) {
      await hook.onBeforeExecute?.({ state: runningState, request: state.request })
    }

    try {
      const result = await this.runMiddleware({ state: runningState, request: state.request }, () =>
        this.bus.dispatch(state.request, {
          policy: {
            retry: {
              maxAttempts: Math.max(1, state.request.context.metadata.retryCount ?? 1),
              retryableErrorCodes: ["execution_timed_out", "engine_not_registered"],
            },
            timeout: {
              timeoutMs: state.request.context.metadata.timeoutMs ?? 30000,
            },
          },
        })
      )
      const completedAt = this.now()
      const terminalResult: ExecutionRuntimeResult = {
        ...result,
        startedAt: runningAt,
        finishedAt: completedAt,
      }
      this.metrics.recordResult(terminalResult)

      if (terminalResult.status === "failed") {
        const failedState: ExecutionState = {
          ...runningState,
          status: "failed",
          finishedAt: completedAt,
          result: terminalResult,
          error: {
            code: "execution_failed",
            message: "Execution completed with failed status.",
            retryable: false,
          },
        }
        await this.updateState(failedState)
        for (const hook of this.hooks) {
          await hook.onAfterExecute?.(
            { state: failedState, request: state.request },
            terminalResult
          )
        }
        await this.emit(
          {
            eventId: randomUUID(),
            executionId,
            engineId: state.engineId,
            type: "ExecutionFailed",
            occurredAt: completedAt,
            payload: { output: terminalResult.output },
          },
          failedState
        )
        return terminalResult
      }

      if (terminalResult.status === "cancelled") {
        const cancelledState: ExecutionState = {
          ...runningState,
          status: "cancelled",
          finishedAt: completedAt,
          cancelledAt: completedAt,
          result: terminalResult,
          error: {
            code: "execution_cancelled",
            message: "Execution completed with cancelled status.",
            retryable: false,
          },
        }
        await this.updateState(cancelledState)
        for (const hook of this.hooks) {
          await hook.onAfterExecute?.(
            { state: cancelledState, request: state.request },
            terminalResult
          )
        }
        await this.emit(
          {
            eventId: randomUUID(),
            executionId,
            engineId: state.engineId,
            type: "ExecutionCancelled",
            occurredAt: completedAt,
            payload: { output: terminalResult.output },
          },
          cancelledState
        )
        return terminalResult
      }

      const completedResult: ExecutionRuntimeResult = { ...terminalResult, status: "completed" }
      const completedState: ExecutionState = {
        ...runningState,
        status: "completed",
        finishedAt: completedAt,
        result: completedResult,
      }
      await this.updateState(completedState)
      for (const hook of this.hooks) {
        await hook.onAfterExecute?.(
          { state: completedState, request: state.request },
          completedResult
        )
      }
      await this.emit(
        {
          eventId: randomUUID(),
          executionId,
          engineId: state.engineId,
          type: "ExecutionCompleted",
          occurredAt: completedAt,
          payload: { output: completedResult.output },
        },
        completedState
      )
      return completedResult
    } catch (error) {
      const failedAt = this.now()
      const executionError = {
        code:
          error instanceof ExecutionRuntimeError
            ? error.code
            : error instanceof Error
              ? error.name
              : "execution_error",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      }
      const failedState: ExecutionState = {
        ...runningState,
        status: "failed",
        finishedAt: failedAt,
        error: executionError,
      }
      await this.updateState(failedState)
      for (const hook of this.hooks) {
        await hook.onError?.({ state: failedState, request: state.request }, executionError)
      }
      if (executionError.code === "execution_timed_out") {
        await this.emit(
          {
            eventId: randomUUID(),
            executionId,
            engineId: state.engineId,
            type: "ExecutionTimedOut",
            occurredAt: failedAt,
            payload: { error: executionError },
          },
          failedState
        )
      } else {
        await this.emit(
          {
            eventId: randomUUID(),
            executionId,
            engineId: state.engineId,
            type: "ExecutionFailed",
            occurredAt: failedAt,
            payload: { error: executionError },
          },
          failedState
        )
      }
      return {
        executionId,
        engineId: state.engineId,
        status: "failed",
        output: { error: executionError.message },
        startedAt: runningAt,
        finishedAt: failedAt,
      }
    }
  }

  async execute(request: ExecutionRuntimeRequest) {
    await this.queue(request)
    return this.dispatch(request.executionId)
  }

  async cancel(executionId: string, reason = "cancelled by runtime") {
    const state = this.states.get(executionId)
    if (!state) {
      throw new ExecutionNotFoundError(executionId)
    }

    this.bus.cancel(executionId, reason)

    const cancelledAt = this.now()
    const cancelledState: ExecutionState = {
      ...state,
      status: "cancelled",
      cancelledAt,
      finishedAt: cancelledAt,
      error: { code: "execution_cancelled", message: reason, retryable: false },
    }
    await this.updateState(cancelledState)
    await this.emit(
      {
        eventId: randomUUID(),
        executionId,
        engineId: state.engineId,
        type: "ExecutionCancelled",
        occurredAt: cancelledAt,
        payload: { reason },
      },
      cancelledState
    )

    return {
      executionId,
      engineId: state.engineId,
      status: "cancelled" as const,
      output: { reason },
      startedAt: state.startedAt ?? cancelledAt,
      finishedAt: cancelledAt,
    }
  }

  getState(executionId: string) {
    return this.states.get(executionId) ?? null
  }

  listEvents() {
    return [...this.events]
  }

  getMetrics() {
    return this.metrics.snapshot()
  }
}
