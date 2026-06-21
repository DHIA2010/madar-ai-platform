import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type { QueuedEvent, TrackingEndpointPath } from "./contracts"
import { RetryManager } from "./retry-manager"
import type { StorageAdapter } from "./storage"
import { Transport } from "./transport"

function createQueueId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class QueueManager {
  private flushLock = false

  constructor(
    private readonly storage: StorageAdapter,
    private readonly transport: Transport,
    private readonly retryManager: RetryManager,
    private readonly config: ResolvedTrackingSdkConfiguration
  ) {}

  enqueue(path: TrackingEndpointPath, payload: unknown): void {
    const queue = this.readQueue()

    queue.push({
      id: createQueueId(),
      path,
      payload,
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    })

    this.writeQueue(queue)
  }

  async sendOrQueue(path: TrackingEndpointPath, payload: unknown): Promise<void> {
    try {
      await this.transport.send(path, payload)
    } catch {
      this.enqueue(path, payload)
    }
  }

  async flush(): Promise<void> {
    if (this.flushLock) {
      return
    }

    this.flushLock = true

    try {
      const queue = this.readQueue()
      if (queue.length === 0) {
        return
      }

      const now = Date.now()
      const pending: QueuedEvent[] = []

      for (const item of queue.slice(0, this.config.batchSize)) {
        if (item.nextAttemptAt > now) {
          pending.push(item)
          continue
        }

        try {
          await this.retryManager.execute(async () => {
            await this.transport.send(item.path, item.payload)
          })
        } catch {
          const attempts = item.attempts + 1
          if (attempts <= this.config.retryCount) {
            pending.push({
              ...item,
              attempts,
              nextAttemptAt: now + attempts * 1000,
            })
          }
        }
      }

      const untouched = queue.slice(this.config.batchSize)
      this.writeQueue([...pending, ...untouched])
    } finally {
      this.flushLock = false
    }
  }

  count(): number {
    return this.readQueue().length
  }

  private readQueue(): QueuedEvent[] {
    const raw = this.storage.getItem(this.config.queueStorageKey)
    if (!raw) {
      return []
    }

    try {
      const parsed = JSON.parse(raw) as QueuedEvent[]
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed
    } catch {
      return []
    }
  }

  private writeQueue(queue: QueuedEvent[]): void {
    this.storage.setItem(this.config.queueStorageKey, JSON.stringify(queue))
  }
}
