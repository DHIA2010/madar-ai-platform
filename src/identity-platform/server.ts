import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { createIdentityApiServer } from "./api"
import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import { validateAwsCredentialIsolationForSecretsManager } from "./configuration/aws-credential-guard"
import { validateProductionIntegrationConfiguration } from "./configuration/production-integration-validation"
import { runBillingMaintenance } from "./subscriptions/maintenance"

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

server.listen(platform.config.port, () => {})

// Billing maintenance (renewal reminders, lapsing unpaid subscriptions) runs in-process on a
// timer -- every pass is safe to run from several tasks at once (see subscriptions/maintenance.ts).
// BILLING_MAINTENANCE_INTERVAL_MINUTES=0 turns it off.
const maintenanceMinutes = Number(process.env.BILLING_MAINTENANCE_INTERVAL_MINUTES ?? "15")
const database = platform.infrastructure.database
if (database && maintenanceMinutes > 0) {
  const runMaintenance = () =>
    runBillingMaintenance({
      db: database,
      settings: platform.platformSettings,
      emailGateway: platform.emailGateway,
      appUrl: platform.config.appUrl,
    })
      .then((result) => {
        if (result.remindersSent > 0 || result.expired > 0) {
          console.log("billing.maintenance", result)
        }
      })
      .catch((error: unknown) => console.error("billing.maintenance_failed", error))
  // First pass shortly after boot (migrations and connections settle first), then on the timer.
  setTimeout(runMaintenance, 60_000).unref()
  setInterval(runMaintenance, maintenanceMinutes * 60_000).unref()
}
