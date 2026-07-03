import type { IncomingMessage, ServerResponse } from "node:http"

export type DeploymentEnvironment = "local" | "docker" | "stage" | "production"

export interface FoundationLogger {
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  debug?(message: string, fields?: Record<string, unknown>): void
}

export interface FoundationMetrics {
  increment(name: string, value?: number, tags?: Record<string, string>): void
  histogram(name: string, value: number, tags?: Record<string, string>): void
}

export interface FoundationTracer {
  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): {
    end(status?: "ok" | "error"): void
  }
}

export interface Clock {
  now(): Date
  nowIso(): string
}

export interface UuidGenerator {
  generate(): string
}

export interface TransactionHandle {
  id: string
}

export interface RequestActor {
  userId: string | null
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
}

export interface RequestContext {
  requestId: string
  correlationId: string
  actor: RequestActor
  permissions: string[]
  logger: FoundationLogger
  transaction: TransactionHandle | null
  ipAddress: string
  userAgent: string
  headers: IncomingMessage["headers"]
}

export interface ModuleHealth {
  ok: boolean
  status: "ok" | "degraded" | "down"
  details?: Record<string, unknown>
}

export interface BackendModuleDefinition {
  id: string
  name: string
  version: string
  basePath: string
  capabilities: string[]
  registerRoutes?: (request: IncomingMessage, response: ServerResponse) => Promise<boolean>
  healthCheck?: () => Promise<ModuleHealth>
  openApiPath?: string
}

export interface BackendFoundationConfig {
  environment: DeploymentEnvironment
  appName: string
  appVersion: string
  buildSha: string
  featureFlags: Record<string, boolean>
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  extensions?: Record<string, unknown>
}
