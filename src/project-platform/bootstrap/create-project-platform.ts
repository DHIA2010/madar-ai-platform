import { randomUUID } from "node:crypto"

import { createInMemoryProjectRepositories } from "../infrastructure/storage/in-memory"
import { ProjectPlatformService } from "../service"

export function createProjectPlatform() {
  return {
    id: randomUUID(),
    services: {
      projects: new ProjectPlatformService({ repositories: createInMemoryProjectRepositories() }),
    },
  }
}
