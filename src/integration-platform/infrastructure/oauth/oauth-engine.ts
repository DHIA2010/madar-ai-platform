import { randomBytes } from "node:crypto"
import { randomUUID } from "node:crypto"

import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"
import type { CredentialRepository, OAuthSessionRepository, OAuthTokenRepository } from "../../domain/repositories"
import type { OAuthAdapter, SecretCipher } from "../../application/ports"
import { createCredential, createOAuthSession, createOAuthToken, completeOAuthSession, failOAuthSession, revokeOAuthToken } from "../../domain/entities"

export interface OAuthEngineDependencies {
  sessions: OAuthSessionRepository
  tokens: OAuthTokenRepository
  credentials: CredentialRepository
  cipher: SecretCipher
  adapter: OAuthAdapter
  now?: () => string
}

export class OAuthEngine {
  constructor(private readonly deps: OAuthEngineDependencies) {}

  private now() {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  async start(input: { connectionId: string; connectorId: string; redirectUri: string; scopes: string[]; offlineAccess?: boolean; codeChallenge?: string | null }) {
    const state = randomBytes(16).toString("hex")
    const codeVerifier = randomBytes(32).toString("hex")
    const session = createOAuthSession({
      id: randomUUID(),
      connectorId: input.connectorId,
      connectionId: input.connectionId,
      state,
      codeVerifier,
      codeChallenge: input.codeChallenge ?? null,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    await this.deps.sessions.save(session)
    return {
      session,
      authorizationUrl: this.deps.adapter.buildAuthorizationUrl({
        state,
        codeChallenge: session.codeChallenge ?? undefined,
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        offlineAccess: input.offlineAccess ?? false,
      }),
    }
  }

  async complete(input: { state: string; code: string; redirectUri: string }) {
    const session = await this.deps.sessions.findByState(input.state)
    if (!session) {
      throw INTEGRATION_ERRORS.invalidState("OAuth state is invalid.")
    }
    if (session.expiresAt <= this.now()) {
      const expired = failOAuthSession(session, "OAuth state expired.", this.now())
      await this.deps.sessions.save(expired)
      throw INTEGRATION_ERRORS.invalidState("OAuth state expired.")
    }

    const result = await this.deps.adapter.exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: session.codeVerifier ?? undefined,
    })

    const encryptedSecret = this.deps.cipher.encrypt(JSON.stringify({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? null,
    }))

    const credential = createCredential({
      id: randomUUID(),
      connectionId: session.connectionId,
      secretCiphertext: encryptedSecret,
      secretMetadata: {
        providerAccountId: result.providerAccountId ?? null,
        providerAccountEmail: result.providerAccountEmail ?? null,
      },
      version: 1,
    })

    const token = createOAuthToken({
      id: randomUUID(),
      connectionId: session.connectionId,
      providerAccountId: result.providerAccountId ?? null,
      providerEmail: result.providerAccountEmail ?? null,
      accessTokenCiphertext: this.deps.cipher.encrypt(result.accessToken),
      refreshTokenCiphertext: result.refreshToken ? this.deps.cipher.encrypt(result.refreshToken) : null,
      tokenType: "Bearer",
      scopes: result.scopes,
      expiresAt: new Date(Date.now() + result.expiresInSeconds * 1000).toISOString(),
      issuedAt: this.now(),
    })

    await this.deps.credentials.save(credential)
    await this.deps.tokens.save(token)
    const completed = completeOAuthSession(session, {
      providerAccountId: result.providerAccountId ?? null,
      providerAccountEmail: result.providerAccountEmail ?? null,
      now: this.now(),
    })
    await this.deps.sessions.save(completed)
    return { session: completed, credential, token }
  }

  async refresh(credentialId: string) {
    const credential = await this.deps.credentials.findById(credentialId)
    if (!credential) throw INTEGRATION_ERRORS.notFound("Credential")
    const latestToken = await this.deps.tokens.findLatestByCredentialId(credentialId)
    if (!latestToken) throw INTEGRATION_ERRORS.notFound("OAuth token")
    const payload = JSON.parse(this.deps.cipher.decrypt(credential.secretCiphertext)) as { accessToken: string; refreshToken: string | null }
    if (!payload.refreshToken) throw INTEGRATION_ERRORS.invalidState("Refresh token is not available.")

    const refreshed = await this.deps.adapter.refreshAccessToken({ refreshToken: payload.refreshToken })
    const nextCredential = {
      ...credential,
      secretCiphertext: this.deps.cipher.encrypt(JSON.stringify({ accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken ?? payload.refreshToken })),
      version: credential.version + 1,
      updatedAt: this.now(),
    }
    const nextToken = createOAuthToken({
      id: randomUUID(),
      connectionId: credential.connectionId,
      providerAccountId: latestToken.providerAccountId,
      providerEmail: latestToken.providerEmail,
      accessTokenCiphertext: this.deps.cipher.encrypt(refreshed.accessToken),
      refreshTokenCiphertext: this.deps.cipher.encrypt(refreshed.refreshToken ?? payload.refreshToken),
      tokenType: latestToken.tokenType,
      scopes: refreshed.scopes,
      expiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
      issuedAt: this.now(),
    })
    await this.deps.credentials.save(nextCredential)
    await this.deps.tokens.save(nextToken)
    return { credential: nextCredential, token: nextToken }
  }

  async revoke(credentialId: string) {
    const credential = await this.deps.credentials.findById(credentialId)
    if (!credential) throw INTEGRATION_ERRORS.notFound("Credential")
    const latestToken = await this.deps.tokens.findLatestByCredentialId(credentialId)
    const payload = JSON.parse(this.deps.cipher.decrypt(credential.secretCiphertext)) as { accessToken: string; refreshToken: string | null }
    if (this.deps.adapter.revokeToken && latestToken) {
      await this.deps.adapter.revokeToken({ refreshToken: payload.refreshToken ?? undefined, accessToken: this.deps.cipher.decrypt(latestToken.accessTokenCiphertext) })
    }
    const revokedCredential = { ...credential, status: "revoked" as const, revokedAt: this.now(), updatedAt: this.now() }
    const revokedToken = latestToken ? revokeOAuthToken(latestToken, this.now()) : null
    await this.deps.credentials.save(revokedCredential)
    if (revokedToken) await this.deps.tokens.save(revokedToken)
    return { credential: revokedCredential, token: revokedToken }
  }
}
