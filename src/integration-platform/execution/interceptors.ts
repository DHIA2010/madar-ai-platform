import type { ExecutionInterceptor } from "./bus.contracts"

export function createNoopExecutionInterceptor(): ExecutionInterceptor {
  return async (_context, next) => next()
}

export function createTracingExecutionInterceptor(trace: string[]): ExecutionInterceptor {
  return async (context, next) => {
    trace.push(`interceptor:before:${context.request.executionId}:${context.attempt}`)
    const result = await next()
    trace.push(
      `interceptor:after:${result.status}:${context.request.executionId}:${context.attempt}`
    )
    return result
  }
}
