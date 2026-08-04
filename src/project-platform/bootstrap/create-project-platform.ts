import { randomUUID } from "node:crypto"

import {
  createIdentityPlatform,
  type IdentityPlatformContainer,
} from "../../identity-platform/bootstrap/create-identity-platform"
import { loadIdentityPlatformConfig } from "../../identity-platform/configuration"
import { PostgresDatabase } from "../../identity-platform/infrastructure/postgres/database"

import { createInMemoryProjectRepositories } from "../infrastructure/storage/in-memory"
import { createPostgresProjectRepositories } from "../infrastructure/postgres/repositories"
import { ProjectPlatformService } from "../service"

export function createProjectPlatform(
  options: {
    mode?: "memory" | "postgres"
    identity?: IdentityPlatformContainer
  } = {}
) {
  const mode = options.mode ?? "memory"
  const identity =
    options.identity ??
    createIdentityPlatform({ mode: mode === "memory" ? "memory" : "production" })
  const repositories =
    mode === "postgres"
      ? createPostgresProjectRepositories(PostgresDatabase.fromConfig(loadIdentityPlatformConfig()))
      : createInMemoryProjectRepositories()

  return {
    id: randomUUID(),
    identity,
    services: {
      projects: new ProjectPlatformService({ repositories }),
    },
  }
}
