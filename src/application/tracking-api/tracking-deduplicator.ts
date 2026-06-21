import type { TrackingRequest } from "./tracking-api.contracts"

interface DedupRecord {
  seenAt: number
}

export class TrackingDeduplicator {
  private readonly seen = new Map<string, DedupRecord>()

  constructor(private readonly ttlMs: number = 5 * 60 * 1000) {}

  isDuplicate(request: TrackingRequest): boolean {
    this.compact()

    const key = this.computeKey(request)
    const existing = this.seen.get(key)
    if (existing) {
      return true
    }

    this.seen.set(key, { seenAt: Date.now() })
    return false
  }

  private computeKey(request: TrackingRequest): string {
    const payload = request.body.payload as Record<string, unknown> | undefined
    const dedupeSeed = String(payload?.eventId ?? payload?.sessionId ?? request.body.timestamp)
    return `${request.body.workspaceId}:${request.path}:${dedupeSeed}`
  }

  private compact() {
    const now = Date.now()
    for (const [key, value] of this.seen.entries()) {
      if (now - value.seenAt > this.ttlMs) {
        this.seen.delete(key)
      }
    }
  }
}
