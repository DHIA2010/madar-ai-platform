import type { ExecutionLifecycleState, ExecutionRuntimeResult } from "./runtime.contracts"

export interface ExecutionMetricsSnapshot {
  queued: number
  dispatched: number
  running: number
  completed: number
  failed: number
  cancelled: number
  averageDurationMs: number
}

export class ExecutionMetrics {
  private readonly counts: Record<ExecutionLifecycleState, number> = {
    queued: 0,
    dispatched: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  }

  private readonly durations: number[] = []

  recordState(state: ExecutionLifecycleState) {
    this.counts[state] += 1
  }

  recordResult(result: ExecutionRuntimeResult) {
    const durationMs = Math.max(0, Date.parse(result.finishedAt) - Date.parse(result.startedAt))
    this.durations.push(durationMs)
  }

  snapshot(): ExecutionMetricsSnapshot {
    const totalDuration = this.durations.reduce((sum, value) => sum + value, 0)
    return {
      queued: this.counts.queued,
      dispatched: this.counts.dispatched,
      running: this.counts.running,
      completed: this.counts.completed,
      failed: this.counts.failed,
      cancelled: this.counts.cancelled,
      averageDurationMs: this.durations.length > 0 ? totalDuration / this.durations.length : 0,
    }
  }
}
