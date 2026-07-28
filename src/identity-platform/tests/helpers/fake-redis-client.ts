import type { RedisLikeClient } from "../../infrastructure/redis/redis-like-client"

interface Entry {
  value: string
  expiresAt: number | null
}

export class FakeRedisClient implements RedisLikeClient {
  private readonly strings = new Map<string, Entry>()
  private readonly sets = new Map<string, Set<string>>()

  private isExpired(entry: Entry | undefined) {
    return Boolean(entry?.expiresAt && entry.expiresAt <= Date.now())
  }

  private getEntry(key: string) {
    const entry = this.strings.get(key)
    if (this.isExpired(entry)) {
      this.strings.delete(key)
      return undefined
    }
    return entry
  }

  async get(key: string) {
    return this.getEntry(key)?.value ?? null
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number }) {
    this.strings.set(key, {
      value,
      expiresAt: options?.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : null,
    })
  }

  async del(key: string) {
    this.strings.delete(key)
    this.sets.delete(key)
  }

  async incr(key: string) {
    const existing = Number((await this.get(key)) ?? 0)
    const next = existing + 1
    const current = this.getEntry(key)
    this.strings.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null })
    return next
  }

  async expire(key: string, ttlSeconds: number) {
    const existing = this.getEntry(key)
    if (!existing) {
      return
    }
    this.strings.set(key, { value: existing.value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async ttl(key: string) {
    const entry = this.getEntry(key)
    if (!entry || entry.expiresAt === null) {
      return -1
    }
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  }

  async sAdd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>()
    set.add(member)
    this.sets.set(key, set)
  }

  async sMembers(key: string) {
    return [...(this.sets.get(key) ?? new Set<string>())]
  }

  async sRem(key: string, member: string) {
    const set = this.sets.get(key)
    set?.delete(member)
  }

  async ping() {
    return "PONG"
  }
}
