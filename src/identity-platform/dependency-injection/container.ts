import { randomUUID } from "node:crypto"

import { loadIdentityPlatformConfig, type IdentityPlatformConfig } from "../configuration"
import { IdentityCommandHandlers } from "../application/handlers/command-handlers"
import { IdentityQueryHandlers } from "../application/handlers/query-handlers"
import type { Clock, UuidGenerator } from "../application/ports"
import { createInMemoryRepositories, type InMemoryIdentityDataStore } from "../infrastructure/storage/in-memory"
import { ScryptPasswordHasher, HmacTokenService } from "../infrastructure/jwt/token-service"
import { ConsoleLogger } from "../infrastructure/logger/console-logger"
import { InMemoryEmailGateway } from "../infrastructure/email/in-memory-email-gateway"
import { SmtpEmailGateway } from "../infrastructure/email/smtp-email-gateway"
import { InMemoryEventPublisher } from "../infrastructure/queue/in-memory-event-publisher"
import { InMemoryRateLimiter } from "../infrastructure/redis/in-memory-rate-limiter"
import { NodeRedisClient } from "../infrastructure/redis/node-redis-client"
import { RedisCacheProvider } from "../infrastructure/redis/redis-cache-provider"
import { RedisRateLimiter } from "../infrastructure/redis/redis-rate-limiter"
import { RedisSessionRepository } from "../infrastructure/redis/redis-session-repository"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createPostgresRepositories } from "../infrastructure/postgres/repositories"
import { PostgresOutboxEventPublisher } from "../infrastructure/postgres/outbox-event-publisher"
import { LocalStorageProvider } from "../infrastructure/storage/local-storage-provider"
import { EnvironmentFeatureFlagProvider } from "../infrastructure/feature-flags/environment-feature-flag-provider"
import { EnvironmentConfigurationProvider } from "../infrastructure/configuration/environment-configuration-provider"
import { InMemoryMetricsProvider } from "../infrastructure/observability/in-memory-metrics-provider"
import { GoogleAdsSyncService } from "../google-ads/sync-service"
import {
  AwsSecretsGoogleIdentityCredentialsProvider,
  type GoogleIdentityCredentialsProvider,
} from "../google-oauth/google-identity-credentials"
import { GoogleOAuthController } from "../google-oauth/controller"
import { GoogleOAuthRepository } from "../google-oauth/repository"
import { GoogleOAuthService } from "../google-oauth/service"
import { GoogleAdsIntegrationProvider } from "../integrations/google-ads/provider"
import { GoogleIdentityIntegrationProvider } from "../integrations/google/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { IntegrationProviderRegistry } from "../integrations/provider-registry"

class SystemClock implements Clock {
  now() {
    return new Date()
  }
  nowIso() {
    return new Date().toISOString()
  }
}

class CryptoUuidGenerator implements UuidGenerator {
  generate() {
    return randomUUID()
  }
}

export interface IdentityPlatformContainer {
  config: IdentityPlatformConfig
  commands: IdentityCommandHandlers
  queries: IdentityQueryHandlers
  infrastructure: {
    database?: PostgresDatabase
    cache?: RedisCacheProvider
    storage?: LocalStorageProvider
    featureFlags?: EnvironmentFeatureFlagProvider
    configuration?: EnvironmentConfigurationProvider
    metrics?: InMemoryMetricsProvider
    integrations?: IntegrationProviderRegistry
    googleIdentityCredentialsProvider?: GoogleIdentityCredentialsProvider
  }
}

export function createIdentityPlatformContainer(options: {
  config?: Partial<IdentityPlatformConfig>
  store?: InMemoryIdentityDataStore
  mode?: "memory" | "production"
} = {}): IdentityPlatformContainer {
  const config = loadIdentityPlatformConfig(options.config)
  const clock = new SystemClock()
  const uuid = new CryptoUuidGenerator()
  const tokenService = new HmacTokenService(config.jwtSecret, config.tokenHashSecret)
  const mode = options.mode ?? "production"

  if (mode === "memory") {
    const configuration = new EnvironmentConfigurationProvider()
    const metrics = new InMemoryMetricsProvider()
    const featureFlags = new EnvironmentFeatureFlagProvider(config)
    const integrations = new IntegrationProviderRegistry()
    integrations.register(new SnapchatAdsIntegrationProvider())
    const repositories = createInMemoryRepositories(options.store)
    const commands = new IdentityCommandHandlers({
      config,
      repositories,
      clock,
      uuid,
      hasher: new ScryptPasswordHasher(),
      tokenService,
      rateLimiter: new InMemoryRateLimiter(),
      emailGateway: new InMemoryEmailGateway(),
      logger: new ConsoleLogger(),
      eventPublisher: new InMemoryEventPublisher(),
      featureFlags,
      metrics,
    })
    const queries = new IdentityQueryHandlers(repositories)
    return {
      config,
      commands,
      queries,
      infrastructure: {
        configuration,
        metrics,
        featureFlags,
        integrations,
        googleIdentityCredentialsProvider: undefined,
      },
    }
  }

  const database = PostgresDatabase.fromConfig(config)
  const redis = new NodeRedisClient(config)
  const sessionRepository = new RedisSessionRepository(redis, config)
  const repositories = createPostgresRepositories({
    db: database,
    tokenService,
    sessions: sessionRepository,
  })
  const cache = new RedisCacheProvider(redis, config)
  const storage = new LocalStorageProvider(config)
  const featureFlags = new EnvironmentFeatureFlagProvider(config)
  const configuration = new EnvironmentConfigurationProvider()
  const metrics = new InMemoryMetricsProvider()
  const googleIdentityCredentialsProvider = new AwsSecretsGoogleIdentityCredentialsProvider()
  const integrations = new IntegrationProviderRegistry()
  integrations.register(new SnapchatAdsIntegrationProvider(database))
  const googleOAuthController = new GoogleOAuthController(
    new GoogleOAuthService(
      new GoogleOAuthRepository(database),
      undefined,
      googleIdentityCredentialsProvider
    )
  )
  integrations.register(new GoogleIdentityIntegrationProvider(googleOAuthController))
  integrations.register(
    new GoogleAdsIntegrationProvider(
      new GoogleAdsSyncService(database, {
        apiBaseUrl: process.env.IDENTITY_PLATFORM_GOOGLE_ADS_API_BASE_URL ?? "https://googleads.googleapis.com/v22",
        tokenEndpoint: process.env.IDENTITY_PLATFORM_GOOGLE_ADS_TOKEN_ENDPOINT ?? "https://oauth2.googleapis.com/token",
        encryptionKey:
          process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
          ?? process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET
          ?? "",
        developerToken:
          process.env.IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN
          ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN
          ?? "",
        loginCustomerId: process.env.IDENTITY_PLATFORM_GOOGLE_ADS_LOGIN_CUSTOMER_ID,
        maxRetries: Number(process.env.IDENTITY_PLATFORM_GOOGLE_ADS_MAX_RETRIES ?? "2"),
        minRequestIntervalMs: Number(process.env.IDENTITY_PLATFORM_GOOGLE_ADS_RATE_LIMIT_MS ?? "75"),
      })
    )
  )
  const commands = new IdentityCommandHandlers({
    config,
    repositories,
    clock,
    uuid,
    hasher: new ScryptPasswordHasher(),
    tokenService,
    rateLimiter: new RedisRateLimiter(redis, config),
    emailGateway: new SmtpEmailGateway(config),
    logger: new ConsoleLogger(),
    eventPublisher: new PostgresOutboxEventPublisher(database),
    featureFlags,
    metrics,
  })
  const queries = new IdentityQueryHandlers(repositories)
  return {
    config,
    commands,
    queries,
    infrastructure: {
      database,
      cache,
      storage,
      featureFlags,
      configuration,
      metrics,
      integrations,
      googleIdentityCredentialsProvider,
    },
  }
}
