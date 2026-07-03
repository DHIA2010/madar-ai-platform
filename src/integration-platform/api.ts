import { createIntegrationPlatform } from "./bootstrap/create-integration-platform"
import { createIntegrationApiServer as createServerFromPlatform } from "./interfaces/rest/server"

export function createIntegrationApiServer(platform = createIntegrationPlatform()) {
  return createServerFromPlatform(platform)
}

export { createIntegrationPlatform }
