import type { DomainEvent } from "../../domain/events"

export interface Clock {
  now(): Date
  nowIso(): string
}

export interface UuidGenerator {
  generate(): string
}

export interface PasswordHasher {
  hash(plainText: string): string
  verify(plainText: string, encodedHash: string): boolean
}

export interface TokenService {
  generateOpaqueToken(): string
  hashOpaqueToken(token: string): string
  signAccessToken(payload: AccessTokenPayload): string
  verifyAccessToken(token: string): AccessTokenPayload | null
}

export interface AccessTokenPayload {
  sub: string
  sid: string
  org: string
  ws?: string
  typ: "access"
  exp: number
  iat: number
  jti: string
}

export interface RateLimiter {
  check(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean
    retryAfterSeconds: number
  }>
}

export interface EmailGateway {
  sendVerificationEmail(input: { email: string; token: string }): Promise<void>
  sendPasswordResetEmail(input: { email: string; token: string }): Promise<void>
  sendInvitationEmail(input: {
    email: string
    token: string
    organizationId: string
    workspaceId?: string
  }): Promise<void>
}

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
  error(message: string, details?: Record<string, unknown>): void
}

export interface EventPublisher {
  publish(events: DomainEvent[]): Promise<void>
}

export interface StorageProvider {
  putObject(input: { key: string; body: string | Buffer; contentType?: string }): Promise<void>
  getObject(key: string): Promise<Buffer | null>
  deleteObject(key: string): Promise<void>
}

export interface CacheProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
  healthCheck(): Promise<{ ok: boolean; message: string }>
}

export interface FeatureFlagProvider {
  isEnabled(input: { key: string; workspaceId?: string; defaultValue?: boolean }): Promise<boolean>
}

export interface ConfigurationProvider {
  get(key: string): string | undefined
  require(key: string): string
}

export interface MetricsProvider {
  incrementCounter(name: string, value?: number, tags?: Record<string, string>): void
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void
}
