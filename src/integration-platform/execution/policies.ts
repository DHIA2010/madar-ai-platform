import type { ExecutionPolicy } from "./bus.contracts"

export const defaultExecutionPolicy: ExecutionPolicy = {
  retry: {
    maxAttempts: 1,
    retryableErrorCodes: ["execution_timed_out", "engine_unavailable"],
  },
  timeout: {
    timeoutMs: 30000,
  },
  cancellation: {
    enabled: true,
  },
}

export function mergeExecutionPolicy(override?: Partial<ExecutionPolicy>): ExecutionPolicy {
  return {
    retry: {
      maxAttempts: override?.retry?.maxAttempts ?? defaultExecutionPolicy.retry.maxAttempts,
      retryableErrorCodes:
        override?.retry?.retryableErrorCodes ?? defaultExecutionPolicy.retry.retryableErrorCodes,
    },
    timeout: {
      timeoutMs: override?.timeout?.timeoutMs ?? defaultExecutionPolicy.timeout.timeoutMs,
    },
    cancellation: {
      enabled: override?.cancellation?.enabled ?? defaultExecutionPolicy.cancellation.enabled,
    },
  }
}
