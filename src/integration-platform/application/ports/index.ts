import type { IntegrationDomainEvent } from "../../domain/events"

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
  error(message: string, details?: Record<string, unknown>): void
}

export interface EventPublisher {
  publish(events: IntegrationDomainEvent[]): Promise<void>
}

export interface SecretCipher {
  encrypt(plainText: string): string
  decrypt(cipherText: string): string
}

export interface OAuthAdapter {
  connectorId: string
  buildAuthorizationUrl(input: {
    state: string
    codeChallenge?: string
    redirectUri: string
    scopes: string[]
    offlineAccess: boolean
  }): string
  exchangeCode(input: {
    code: string
    redirectUri: string
    codeVerifier?: string
  }): Promise<{
    accessToken: string
    refreshToken?: string
    expiresInSeconds: number
    scopes: string[]
    providerAccountId?: string
    providerAccountEmail?: string
  }>
  refreshAccessToken(input: {
    refreshToken: string
  }): Promise<{
    accessToken: string
    refreshToken?: string
    expiresInSeconds: number
    scopes: string[]
  }>
  revokeToken?(input: { refreshToken?: string; accessToken?: string }): Promise<void>
}
