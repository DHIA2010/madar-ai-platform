import type { CacheProvider } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"
import type { RedisLikeClient } from "./redis-like-client"

export class RedisCacheProvider implements CacheProvider {
  private readonly prefix: string

  constructor(
    private readonly client: RedisLikeClient,
    config: IdentityPlatformConfig
  ) {
    this.prefix = `${config.redisKeyPrefix}cache:`
  }

  async get(key: string) {
    return this.client.get(`${this.prefix}${key}`)
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    await this.client.set(`${this.prefix}${key}`, value, { ttlSeconds })
  }

  async delete(key: string) {
    await this.client.del(`${this.prefix}${key}`)
  }

  async healthCheck() {
    try {
      const response = await this.client.ping()
      return { ok: response === "PONG", message: response }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "redis unavailable" }
    }
  }
}
