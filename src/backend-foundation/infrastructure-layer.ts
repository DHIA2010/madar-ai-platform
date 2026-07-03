import { randomUUID } from "node:crypto"

import type {
  Clock,
  FoundationLogger,
  FoundationMetrics,
  FoundationTracer,
  ProblemDetails,
  UuidGenerator,
} from "./types"

export class ConsoleFoundationLogger implements FoundationLogger {
  info(message: string, fields?: Record<string, unknown>) {
    console.info(message, fields ?? {})
  }
  warn(message: string, fields?: Record<string, unknown>) {
    console.warn(message, fields ?? {})
  }
  error(message: string, fields?: Record<string, unknown>) {
    console.error(message, fields ?? {})
  }
  debug(message: string, fields?: Record<string, unknown>) {
    console.debug(message, fields ?? {})
  }
}

export class InMemoryFoundationMetrics implements FoundationMetrics {
  private readonly counters = new Map<string, number>()

  increment(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value)
  }

  histogram() {
    // Histogram storage is intentionally omitted for now to keep the foundation lightweight.
  }
}

export class NoopFoundationTracer implements FoundationTracer {
  startSpan() {
    return { end() {} }
  }
}

export class SystemClock implements Clock {
  now() {
    return new Date()
  }

  nowIso() {
    return new Date().toISOString()
  }
}

export class CryptoUuidGenerator implements UuidGenerator {
  generate() {
    return randomUUID()
  }
}

export class FoundationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "FoundationError"
  }
}

export function mapErrorToProblem(error: unknown): ProblemDetails {
  if (error instanceof FoundationError) {
    return {
      type: `https://madar.dev/problems/${error.code.toLowerCase()}`,
      title: error.code,
      status: error.status,
      detail: error.message,
      extensions: error.details,
    }
  }

  return {
    type: "https://madar.dev/problems/internal-error",
    title: "Internal Server Error",
    status: 500,
    detail: error instanceof Error ? error.message : "Unexpected error.",
  }
}
