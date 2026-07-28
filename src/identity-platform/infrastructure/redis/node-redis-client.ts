import { createClient, type RedisClientType } from "redis"

import type { IdentityPlatformConfig } from "../../configuration"
import type { RedisLikeClient } from "./redis-like-client"

export class NodeRedisClient implements RedisLikeClient {
  private readonly client: RedisClientType
  private connecting: Promise<void> | null = null

  constructor(config: IdentityPlatformConfig) {
    this.client = createClient({
      url: config.redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
      },
    })
  }

  private async ensureConnected() {
    if (this.client.isOpen) {
      return
    }
    if (!this.connecting) {
      this.connecting = (async () => {
        await this.client.connect()
      })().finally(() => {
        this.connecting = null
      })
    }
    await this.connecting
  }

  async get(key: string) {
    await this.ensureConnected()
    return this.client.get(key)
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number }) {
    await this.ensureConnected()
    if (options?.ttlSeconds) {
      await this.client.set(key, value, { EX: options.ttlSeconds })
      return
    }
    await this.client.set(key, value)
  }

  async del(key: string) {
    await this.ensureConnected()
    await this.client.del(key)
  }

  async incr(key: string) {
    await this.ensureConnected()
    return this.client.incr(key)
  }

  async expire(key: string, ttlSeconds: number) {
    await this.ensureConnected()
    await this.client.expire(key, ttlSeconds)
  }

  async ttl(key: string) {
    await this.ensureConnected()
    return this.client.ttl(key)
  }

  async sAdd(key: string, member: string) {
    await this.ensureConnected()
    await this.client.sAdd(key, member)
  }

  async sMembers(key: string) {
    await this.ensureConnected()
    return this.client.sMembers(key)
  }

  async sRem(key: string, member: string) {
    await this.ensureConnected()
    await this.client.sRem(key, member)
  }

  async ping() {
    await this.ensureConnected()
    return this.client.ping()
  }

  async end() {
    if (this.client.isOpen) {
      await this.client.quit()
    }
  }
}
