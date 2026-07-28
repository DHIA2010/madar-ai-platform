import { randomUUID } from "node:crypto"

import { AesSecretCipher } from "../infrastructure/crypto/aes-secret-cipher"
import { createInMemoryIntegrationRepositories } from "../infrastructure/storage/in-memory"
import { ConnectorRegistry } from "../application/registry/connector-registry"
import { CapabilityRegistry } from "../application/registry/capability-registry"
import { ExecutionEngineRegistry } from "../execution"
import { LocalExecutionEngine, createLocalExecutionManifest } from "../execution"
import { ExecutionDispatcher, ExecutionBus } from "../execution"
import { ExecutionRuntime } from "../execution"
import { IntegrationPlatformService } from "../service"

class NullOAuthAdapter {
  connectorId = "integration-platform"
  buildAuthorizationUrl(input: { state: string; codeChallenge?: string; redirectUri: string; scopes: string[]; offlineAccess: boolean }) {
    const url = new URL(input.redirectUri)
    url.searchParams.set("state", input.state)
    url.searchParams.set("scope", input.scopes.join(" "))
    if (input.codeChallenge) url.searchParams.set("code_challenge", input.codeChallenge)
    if (input.offlineAccess) url.searchParams.set("access_type", "offline")
    return url.toString()
  }
  async exchangeCode(input: { code: string; redirectUri: string; codeVerifier?: string }) {
    return { accessToken: `access_${input.code}`, refreshToken: `refresh_${input.code}`, expiresInSeconds: 3600, scopes: ["offline_access"], providerAccountId: "provider-account", providerAccountEmail: "provider@example.com" }
  }
  async refreshAccessToken(input: { refreshToken: string }) {
    return { accessToken: `refreshed_${input.refreshToken}`, refreshToken: input.refreshToken, expiresInSeconds: 3600, scopes: ["offline_access"] }
  }
}

export function createIntegrationPlatform() {
  const registry = new ConnectorRegistry()
  const metadataRegistry = registry.getMetadataRegistry()
  const capabilityRegistry = new CapabilityRegistry(metadataRegistry)
  const executionEngines = new ExecutionEngineRegistry()
  executionEngines.register(new LocalExecutionEngine(), createLocalExecutionManifest())
  const executionDispatcher = new ExecutionDispatcher(executionEngines)
  const executionBus = new ExecutionBus({ dispatcher: executionDispatcher })
  const executionRuntime = new ExecutionRuntime({ registry: executionEngines, dispatcher: executionDispatcher, bus: executionBus })
  return {
    id: randomUUID(),
    registry,
    metadataRegistry,
    capabilityRegistry,
    executionEngines,
    executionBus,
    executionDispatcher,
    executionRuntime,
    services: {
      integrations: new IntegrationPlatformService({
        repositories: createInMemoryIntegrationRepositories(),
        registry,
        oauth: {
          cipher: new AesSecretCipher(randomUUID()),
          adapter: new NullOAuthAdapter() as never,
        },
      }),
    },
  }
}
