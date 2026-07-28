import type { RateLimiter } from "../../application/ports"

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, number[]>()

  async check(key: string, limit: number, windowMs: number) {
    const now = Date.now()
    const existing = this.counters.get(key) ?? []
    const active = existing.filter((timestamp) => now - timestamp < windowMs)

    if (active.length >= limit) {
      const oldest = active[0]
      this.counters.set(key, active)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      }
    }

    active.push(now)
    this.counters.set(key, active)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}
