import type { RateLimiter } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"
import type { RedisLikeClient } from "./redis-like-client"

export class RedisRateLimiter implements RateLimiter {
  private readonly prefix: string

  constructor(private readonly client: RedisLikeClient, config: IdentityPlatformConfig) {
    this.prefix = config.redisKeyPrefix
  }

  async check(key: string, limit: number, windowMs: number) {
    const namespacedKey = `${this.prefix}ratelimit:${key}`
    const current = await this.client.incr(namespacedKey)
    if (current === 1) {
      await this.client.expire(namespacedKey, Math.ceil(windowMs / 1000))
    }
    if (current > limit) {
      const ttl = await this.client.ttl(namespacedKey)
      return {
        allowed: false,
        retryAfterSeconds: ttl > 0 ? ttl : Math.ceil(windowMs / 1000),
      }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }
}
