import type { TrackingRateLimitPolicy, TrackingRequest } from "./tracking-api.contracts"

interface Bucket {
  windowStartMs: number
  count: number
}

export interface TrackingRateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
}

export class TrackingRateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(private readonly policy: TrackingRateLimitPolicy) {}

  check(request: TrackingRequest): TrackingRateLimitResult {
    const key = `${request.body.workspaceId}:${request.ipAddress}:${request.path}`
    const now = Date.now()

    const existing = this.buckets.get(key)
    if (!existing || now - existing.windowStartMs >= this.policy.windowMs) {
      const bucket: Bucket = {
        windowStartMs: now,
        count: 1,
      }
      this.buckets.set(key, bucket)

      return {
        allowed: true,
        remaining: this.policy.maxRequests - 1,
        resetAt: new Date(now + this.policy.windowMs).toISOString(),
      }
    }

    existing.count += 1
    this.buckets.set(key, existing)

    const remaining = Math.max(this.policy.maxRequests - existing.count, 0)

    return {
      allowed: existing.count <= this.policy.maxRequests,
      remaining,
      resetAt: new Date(existing.windowStartMs + this.policy.windowMs).toISOString(),
    }
  }
}
