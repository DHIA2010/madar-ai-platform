export interface RedisLikeClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>
  del(key: string): Promise<void>
  incr(key: string): Promise<number>
  expire(key: string, ttlSeconds: number): Promise<void>
  ttl(key: string): Promise<number>
  sAdd(key: string, member: string): Promise<void>
  sMembers(key: string): Promise<string[]>
  sRem(key: string, member: string): Promise<void>
  ping(): Promise<string>
}
