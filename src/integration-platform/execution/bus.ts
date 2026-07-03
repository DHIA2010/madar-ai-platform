import { randomUUID } from "node:crypto"

import type {
  ExecutionDispatchOptions,
  ExecutionEnvelope,
  ExecutionEnvelopeKind,
  ExecutionEnvelopeMetadata,
  ExecutionInterceptor,
  RuntimeEventPublisher,
} from "./bus.contracts"
import { ExecutionRuntimeError } from "./errors"
import { ExecutionPipeline } from "./pipeline"
import { defaultExecutionPolicy, mergeExecutionPolicy } from "./policies"
import { ExecutionPublisher } from "./publisher"
import { ExecutionSubscriberRegistry } from "./subscribers"
import type {
  ExecutionEvent,
  ExecutionRuntimeRequest,
  ExecutionRuntimeResult,
  ExecutionState,
} from "./runtime.contracts"
import type { ExecutionDispatcher } from "./dispatcher"

export interface ExecutionBusDependencies {
  dispatcher: ExecutionDispatcher
  now?: () => string
}

export class ExecutionBus implements RuntimeEventPublisher {
  private readonly pipeline = new ExecutionPipeline()
  private readonly subscribers = new ExecutionSubscriberRegistry()
  private readonly publisher = new ExecutionPublisher({
    publishEnvelope: (envelope) => this.publishEnvelope(envelope),
  })
  private readonly cancellations = new Map<string, string>()

  constructor(private readonly deps: ExecutionBusDependencies) {}

  private now() {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  private envelopeMetadata(
    request: ExecutionRuntimeRequest,
    state: ExecutionState["status"],
    durationMs?: number,
    retryCount = 0
  ): ExecutionEnvelopeMetadata {
    return {
      correlationId: request.context.correlationId,
      traceId: request.context.traceId,
      engineName: request.engineId,
      workflowVersion: request.context.metadata.workflowVersion ?? "1.0.0",
      retryCount,
      currentState: state,
      durationMs,
    }
  }

  private createEnvelope<TPayload>(
    kind: ExecutionEnvelopeKind,
    executionId: string,
    payload: TPayload,
    metadata: ExecutionEnvelopeMetadata
  ): ExecutionEnvelope<TPayload> {
    return {
      envelopeId: randomUUID(),
      kind,
      executionId,
      createdAt: this.now(),
      metadata,
      payload,
    }
  }

  async publishEnvelope(envelope: ExecutionEnvelope<unknown>) {
    await this.subscribers.notify(envelope)
  }

  addInterceptor(interceptor: ExecutionInterceptor) {
    this.pipeline.use(interceptor)
  }

  subscribe(subscriber: Parameters<ExecutionSubscriberRegistry["add"]>[0]) {
    return this.subscribers.add(subscriber)
  }

  unsubscribe(subscriberId: string) {
    this.subscribers.remove(subscriberId)
  }

  cancel(executionId: string, reason = "cancelled by bus") {
    this.cancellations.set(executionId, reason)
  }

  async publishRuntimeEvent(event: ExecutionEvent, state: ExecutionState): Promise<void> {
    const envelope = this.createEnvelope(
      "ExecutionEvent",
      event.executionId,
      event,
      this.envelopeMetadata(
        state.request,
        state.status,
        undefined,
        state.request.context.metadata.retryCount ?? 0
      )
    )
    await this.publisher.publish("ExecutionEvent", envelope)
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    if (timeoutMs <= 0) {
      return promise
    }

    let timer: NodeJS.Timeout | undefined
    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ExecutionRuntimeError(
              "execution_timed_out",
              `Execution exceeded timeout ${timeoutMs}ms.`
            )
          )
        }, timeoutMs)
      })
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  async dispatch(
    request: ExecutionRuntimeRequest,
    options?: ExecutionDispatchOptions
  ): Promise<ExecutionRuntimeResult> {
    const policy = mergeExecutionPolicy(options?.policy ?? defaultExecutionPolicy)
    let lastError: unknown = null

    for (let attempt = 1; attempt <= policy.retry.maxAttempts; attempt += 1) {
      const cancelledReason = this.cancellations.get(request.executionId)
      if (policy.cancellation.enabled && cancelledReason) {
        const cancelledAt = this.now()
        return {
          executionId: request.executionId,
          engineId: request.engineId,
          status: "cancelled",
          output: { reason: cancelledReason },
          startedAt: cancelledAt,
          finishedAt: cancelledAt,
        }
      }

      const startedAt = this.now()
      const requestEnvelope = this.createEnvelope(
        "ExecutionRequest",
        request.executionId,
        request,
        this.envelopeMetadata(request, "running", undefined, attempt - 1)
      )
      await this.publisher.publish("ExecutionRequest", requestEnvelope)

      try {
        const result = await this.pipeline.run(
          {
            envelope: requestEnvelope,
            request,
            policy,
            attempt,
          },
          () =>
            this.runWithTimeout(this.deps.dispatcher.dispatch(request), policy.timeout.timeoutMs)
        )

        const finishedAt = this.now()
        const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
        const normalizedResult: ExecutionRuntimeResult = {
          ...result,
          startedAt: result.startedAt ?? startedAt,
          finishedAt: result.finishedAt ?? finishedAt,
        }

        const resultEnvelope = this.createEnvelope(
          "ExecutionResult",
          request.executionId,
          normalizedResult,
          this.envelopeMetadata(request, normalizedResult.status, durationMs, attempt - 1)
        )
        await this.publisher.publish("ExecutionResult", resultEnvelope)
        return normalizedResult
      } catch (error) {
        lastError = error
        const code =
          error instanceof ExecutionRuntimeError
            ? error.code
            : error instanceof Error
              ? error.name
              : "execution_error"
        if (attempt < policy.retry.maxAttempts && policy.retry.retryableErrorCodes.includes(code)) {
          continue
        }
        throw error
      }
    }

    throw (
      lastError ??
      new ExecutionRuntimeError("execution_error", "Execution failed without an explicit error.")
    )
  }
}
