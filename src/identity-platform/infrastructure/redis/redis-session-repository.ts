import type { SessionRepository } from "../../domain/repositories"
import type { SessionState } from "../../domain/entities"
import type { IdentityPlatformConfig } from "../../configuration"
import type { RedisLikeClient } from "./redis-like-client"

function toTtlSeconds(expiresAt: string) {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

export class RedisSessionRepository implements SessionRepository {
  private readonly prefix: string

  constructor(private readonly client: RedisLikeClient, config: IdentityPlatformConfig) {
    this.prefix = config.redisKeyPrefix
  }

  private sessionKey(id: string) {
    return `${this.prefix}sessions:${id}`
  }

  private refreshKey(hash: string) {
    return `${this.prefix}refresh:${hash}`
  }

  private userSessionsKey(userId: string) {
    return `${this.prefix}users:${userId}:sessions`
  }

  async findById(id: string) {
    const raw = await this.client.get(this.sessionKey(id))
    return raw ? (JSON.parse(raw) as SessionState) : null
  }

  async findByRefreshTokenHash(refreshTokenHash: string) {
    const sessionId = await this.client.get(this.refreshKey(refreshTokenHash))
    return sessionId ? this.findById(sessionId) : null
  }

  async listByUserId(userId: string) {
    const sessionIds = await this.client.sMembers(this.userSessionsKey(userId))
    const sessions = await Promise.all(sessionIds.map((id) => this.findById(id)))
    return sessions.filter((session): session is SessionState => Boolean(session))
  }

  async save(session: SessionState) {
    const previous = await this.findById(session.id)
    const ttlSeconds = toTtlSeconds(session.expiresAt)
    await this.client.set(this.sessionKey(session.id), JSON.stringify(session), { ttlSeconds })
    await this.client.set(this.refreshKey(session.refreshTokenHash), session.id, { ttlSeconds })
    await this.client.sAdd(this.userSessionsKey(session.userId), session.id)
    if (previous && previous.refreshTokenHash !== session.refreshTokenHash) {
      await this.client.del(this.refreshKey(previous.refreshTokenHash))
    }
  }
}
