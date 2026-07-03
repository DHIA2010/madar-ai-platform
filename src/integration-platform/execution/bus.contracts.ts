import type { ExecutionEvent, ExecutionLifecycleState, ExecutionRuntimeRequest, ExecutionRuntimeResult, ExecutionState } from "./runtime.contracts"

export type ExecutionEnvelopeKind = "ExecutionRequest" | "ExecutionResult" | "ExecutionEvent" | "ExecutionState"

export interface ExecutionEnvelopeMetadata {
  correlationId: string
  traceId: string
  engineName: string
  workflowVersion: string
  retryCount: number
  currentState: ExecutionLifecycleState
  durationMs?: number
}

export interface ExecutionEnvelope<TPayload> {
  envelopeId: string
  kind: ExecutionEnvelopeKind
  executionId: string
  createdAt: string
  metadata: ExecutionEnvelopeMetadata
  payload: TPayload
}

export interface ExecutionRetryPolicy {
  maxAttempts: number
  retryableErrorCodes: string[]
}

export interface ExecutionTimeoutPolicy {
  timeoutMs: number
}

export interface ExecutionCancellationPolicy {
  enabled: boolean
}

export interface ExecutionPolicy {
  retry: ExecutionRetryPolicy
  timeout: ExecutionTimeoutPolicy
  cancellation: ExecutionCancellationPolicy
}

export interface ExecutionInterceptorContext {
  envelope: ExecutionEnvelope<ExecutionRuntimeRequest>
  request: ExecutionRuntimeRequest
  policy: ExecutionPolicy
  attempt: number
}

export type ExecutionInterceptorNext = () => Promise<ExecutionRuntimeResult>

export type ExecutionInterceptor = (
  context: ExecutionInterceptorContext,
  next: ExecutionInterceptorNext
) => Promise<ExecutionRuntimeResult>

export interface ExecutionSubscriber {
  id: string
  kinds?: ExecutionEnvelopeKind[]
  onEnvelope(envelope: ExecutionEnvelope<unknown>): void | Promise<void>
}

export interface ExecutionDispatchOptions {
  policy?: Partial<ExecutionPolicy>
}

export interface RuntimeEventPublisher {
  publishRuntimeEvent(event: ExecutionEvent, state: ExecutionState): Promise<void>
}
