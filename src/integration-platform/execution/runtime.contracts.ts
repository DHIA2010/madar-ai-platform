export type ExecutionLifecycleState =
  | "queued"
  | "dispatched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export interface ExecutionOrganizationContext {
  organizationId: string
}

export interface ExecutionWorkspaceContext {
  workspaceId: string
}

export interface ExecutionProjectContext {
  projectId: string | null
}

export interface ExecutionConnectionContext {
  connectionId: string
}

export interface ExecutionWorkflowContext {
  workflowId: string
}

export interface ExecutionSecretsReference {
  provider: string
  ref: string
}

export interface ExecutionMetadata {
  requestedBy: string
  source: string
  attempt: number
  workflowVersion?: string
  retryCount?: number
  timeoutMs?: number
  tags: string[]
}

export interface ExecutionContext {
  organization: ExecutionOrganizationContext
  workspace: ExecutionWorkspaceContext
  project: ExecutionProjectContext
  connection: ExecutionConnectionContext
  workflow: ExecutionWorkflowContext
  correlationId: string
  traceId: string
  secretsReference: ExecutionSecretsReference | null
  metadata: ExecutionMetadata
  featureFlags: Record<string, boolean>
}

export interface ExecutionRuntimeRequest {
  executionId: string
  engineId: string
  connectorId: string
  context: ExecutionContext
  input: Record<string, unknown>
}

export interface ExecutionRuntimeResult {
  executionId: string
  engineId: string
  status: "completed" | "failed" | "cancelled"
  output: Record<string, unknown>
  startedAt: string
  finishedAt: string
}

export interface ExecutionError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface ExecutionState {
  executionId: string
  engineId: string
  status: ExecutionLifecycleState
  request: ExecutionRuntimeRequest
  metadata: ExecutionMetadata
  queuedAt: string
  dispatchedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  cancelledAt: string | null
  result: ExecutionRuntimeResult | null
  error: ExecutionError | null
}

export type ExecutionEventType =
  | "ExecutionQueued"
  | "ExecutionDispatched"
  | "ExecutionStarted"
  | "ExecutionHeartbeat"
  | "ExecutionCompleted"
  | "ExecutionFailed"
  | "ExecutionCancelled"
  | "ExecutionTimedOut"

export interface ExecutionEvent {
  eventId: string
  executionId: string
  engineId: string
  type: ExecutionEventType
  occurredAt: string
  payload: Record<string, unknown>
}

export interface ExecutionMiddlewareContext {
  state: ExecutionState
  request: ExecutionRuntimeRequest
}

export type ExecutionMiddlewareNext = () => Promise<ExecutionRuntimeResult>

export type ExecutionMiddleware = (
  context: ExecutionMiddlewareContext,
  next: ExecutionMiddlewareNext
) => Promise<ExecutionRuntimeResult>

export interface ExecutionHooks {
  onEvent?(event: ExecutionEvent, state: ExecutionState): void | Promise<void>
  onStateChange?(state: ExecutionState): void | Promise<void>
  onBeforeExecute?(context: ExecutionMiddlewareContext): void | Promise<void>
  onAfterExecute?(
    context: ExecutionMiddlewareContext,
    result: ExecutionRuntimeResult
  ): void | Promise<void>
  onError?(context: ExecutionMiddlewareContext, error: ExecutionError): void | Promise<void>
}
