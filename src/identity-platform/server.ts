import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { createIdentityApiServer } from "./api"
import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import { validateAwsCredentialIsolationForSecretsManager } from "./configuration/aws-credential-guard"
import { validateProductionIntegrationConfiguration } from "./configuration/production-integration-validation"

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
validateAwsCredentialIsolationForSecretsManager()
validateProductionIntegrationConfiguration()

const platform = createIdentityPlatform()
const server = createIdentityApiServer(platform)

server.listen(platform.config.port, () => {
})
