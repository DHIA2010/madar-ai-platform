import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { createProjectApiServer } from "./api"
import { createProjectPlatform } from "./bootstrap/create-project-platform"

function loadRuntimeEnvironment() {
  const cwd = process.cwd()
  const envLocalPath = resolve(cwd, ".env.local")
  const envPath = resolve(cwd, ".env")

  // Load local overrides first because process.loadEnvFile does not overwrite existing variables.
  if (existsSync(envLocalPath)) {
    process.loadEnvFile(envLocalPath)
  }

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

loadRuntimeEnvironment()

const platform = createProjectPlatform({ mode: "postgres" })
const server = createProjectApiServer(platform)
const port = Number(process.env.PROJECT_PLATFORM_PORT ?? 4001)

server.listen(port, () => {})
