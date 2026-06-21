import type { TrackingEvent, TrackingQueueItem } from "@/application/contracts/tracking.contracts"

let queueCounter = 0

function nextQueueId() {
  queueCounter += 1
  return `tracking_queue_${String(queueCounter).padStart(6, "0")}`
}

function nowIso() {
  return new Date().toISOString()
}

export class TrackingQueue {
  private readonly items: TrackingQueueItem[] = []

  enqueue(event: TrackingEvent, nextAttemptAt?: string): TrackingQueueItem {
    const item: TrackingQueueItem = {
      queueId: nextQueueId(),
      event,
      attempts: 0,
      enqueuedAt: nowIso(),
      nextAttemptAt: nextAttemptAt ?? nowIso(),
    }

    this.items.push(item)
    return item
  }

  dequeueReady(now: string = nowIso()): TrackingQueueItem[] {
    const ready: TrackingQueueItem[] = []
    const pending: TrackingQueueItem[] = []

    for (const item of this.items) {
      if (new Date(item.nextAttemptAt).getTime() <= new Date(now).getTime()) {
        ready.push(item)
      } else {
        pending.push(item)
      }
    }

    this.items.length = 0
    this.items.push(...pending)
    return ready
  }

  requeue(item: TrackingQueueItem, error: string, delayMs: number): TrackingQueueItem {
    const next: TrackingQueueItem = {
      ...item,
      attempts: item.attempts + 1,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
    }
    this.items.push(next)
    return next
  }

  size(): number {
    return this.items.length
  }
}
