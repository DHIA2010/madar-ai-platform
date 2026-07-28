import { z } from "zod"

export interface IdentityPlatformConfig {
  jwtSecret: string
  tokenHashSecret: string
  port: number
  accessTokenTtlSeconds: number
  refreshTokenTtlDays: number
  rememberMeRefreshTokenTtlDays: number
  lockoutAttempts: number
  lockoutMinutes: number
  postgresUrl: string
  postgresMaxConnections: number
  redisUrl: string
  redisKeyPrefix: string
  storagePath: string
  emailFrom: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  featureFlags: Record<string, boolean>
}

const configSchema = z.object({
  jwtSecret: z.string().min(16),
  tokenHashSecret: z.string().min(16),
  port: z.number().int().positive(),
  accessTokenTtlSeconds: z.number().int().positive(),
  refreshTokenTtlDays: z.number().int().positive(),
  rememberMeRefreshTokenTtlDays: z.number().int().positive(),
  lockoutAttempts: z.number().int().positive(),
  lockoutMinutes: z.number().int().positive(),
  postgresUrl: z.string().min(1),
  postgresMaxConnections: z.number().int().positive(),
  redisUrl: z.string().min(1),
  redisKeyPrefix: z.string().min(1),
  storagePath: z.string().min(1),
  emailFrom: z.string().email(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().positive().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  featureFlags: z.record(z.string(), z.boolean()),
})

export function loadIdentityPlatformConfig(
  overrides: Partial<IdentityPlatformConfig> = {}
): IdentityPlatformConfig {
  const featureFlagsRaw =
    overrides.featureFlags ??
    (() => {
      const raw = process.env.IDENTITY_PLATFORM_FEATURE_FLAGS
      if (!raw) {
        return {}
      }
      try {
        return JSON.parse(raw) as Record<string, boolean>
      } catch {
        return {}
      }
    })()

  return configSchema.parse({
    jwtSecret:
      overrides.jwtSecret ??
      process.env.IDENTITY_PLATFORM_JWT_SECRET ??
      "dev_identity_secret_change_me",
    tokenHashSecret:
      overrides.tokenHashSecret ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "dev_identity_token_hash_change_me",
    port: overrides.port ?? Number(process.env.IDENTITY_PLATFORM_PORT ?? 4000),
    accessTokenTtlSeconds: overrides.accessTokenTtlSeconds ?? 60 * 15,
    refreshTokenTtlDays: overrides.refreshTokenTtlDays ?? 7,
    rememberMeRefreshTokenTtlDays: overrides.rememberMeRefreshTokenTtlDays ?? 30,
    lockoutAttempts: overrides.lockoutAttempts ?? 5,
    lockoutMinutes: overrides.lockoutMinutes ?? 15,
    postgresUrl:
      overrides.postgresUrl ??
      process.env.IDENTITY_PLATFORM_POSTGRES_URL ??
      "postgresql://localhost:5432/madar_identity",
    postgresMaxConnections:
      overrides.postgresMaxConnections ??
      Number(process.env.IDENTITY_PLATFORM_POSTGRES_MAX_CONNECTIONS ?? 10),
    redisUrl:
      overrides.redisUrl ?? process.env.IDENTITY_PLATFORM_REDIS_URL ?? "redis://localhost:6379",
    redisKeyPrefix:
      overrides.redisKeyPrefix ??
      process.env.IDENTITY_PLATFORM_REDIS_KEY_PREFIX ??
      "madar:identity:",
    storagePath:
      overrides.storagePath ??
      process.env.IDENTITY_PLATFORM_STORAGE_PATH ??
      ".madar-identity-storage",
    emailFrom:
      overrides.emailFrom ?? process.env.IDENTITY_PLATFORM_EMAIL_FROM ?? "identity@madar.local",
    smtpHost: overrides.smtpHost ?? process.env.IDENTITY_PLATFORM_SMTP_HOST,
    smtpPort:
      overrides.smtpPort ??
      (process.env.IDENTITY_PLATFORM_SMTP_PORT
        ? Number(process.env.IDENTITY_PLATFORM_SMTP_PORT)
        : undefined),
    smtpUser: overrides.smtpUser ?? process.env.IDENTITY_PLATFORM_SMTP_USER,
    smtpPassword: overrides.smtpPassword ?? process.env.IDENTITY_PLATFORM_SMTP_PASSWORD,
    featureFlags: featureFlagsRaw,
  })
}
