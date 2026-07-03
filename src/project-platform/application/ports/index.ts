export interface Clock {
  now(): Date
  nowIso(): string
}

export interface UuidGenerator {
  generate(): string
}

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
  error(message: string, details?: Record<string, unknown>): void
}

export interface MetricsProvider {
  incrementCounter(name: string, value?: number, tags?: Record<string, string>): void
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void
}

export interface EventPublisher {
  publish(events: Array<Record<string, unknown>>): Promise<void>
}

export interface FeatureFlagProvider {
  isEnabled(input: { key: string; workspaceId?: string; defaultValue?: boolean }): Promise<boolean>
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<{
    allowed: boolean
    retryAfterSeconds: number
  }>
}
