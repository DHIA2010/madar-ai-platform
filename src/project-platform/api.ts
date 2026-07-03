import { createProjectPlatform } from "./bootstrap/create-project-platform"
import { createProjectApiServer as createServerFromPlatform } from "./interfaces/rest/server"

export function createProjectApiServer(platform = createProjectPlatform()) {
  return createServerFromPlatform(platform)
}
