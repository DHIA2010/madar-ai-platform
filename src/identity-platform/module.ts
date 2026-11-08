import type { BackendModuleDefinition } from "../backend-foundation/types"

import { createIdentityPlatform } from "./bootstrap/create-identity-platform"

export function createIdentityModuleDefinition(): BackendModuleDefinition {
  const container = createIdentityPlatform()

  return {
    id: "identity",
    name: "Identity Platform",
    version: "1.2.0",
    basePath: "/",
    capabilities: ["identity", "organization", "rbac"],
    openApiPath: "src/identity-platform/openapi/openapi.json",
    healthCheck: async () => {
      const database = container.infrastructure.database
      const cache = container.infrastructure.cache
      const databaseHealth = database
        ? await database.healthCheck()
        : { ok: true, message: "memory mode" }
      const cacheHealth = cache ? await cache.healthCheck() : { ok: true, message: "memory mode" }
      const ok = databaseHealth.ok && cacheHealth.ok

      return {
        ok,
        status: ok ? "ok" : "degraded",
        details: {
          database: databaseHealth,
          cache: cacheHealth,
        },
      }
    },
  }
}
