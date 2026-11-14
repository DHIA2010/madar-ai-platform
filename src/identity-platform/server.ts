import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { createIdentityApiServer } from "./api"
import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import { validateAwsCredentialIsolationForSecretsManager } from "./configuration/aws-credential-guard"
import { validateProductionIntegrationConfiguration } from "./configuration/production-integration-validation"
import { SalesInvoicesService } from "./invoicing/invoices-service"
import { PosZatcaReporting } from "./pos/zatca-reporting"
import { runBillingMaintenance } from "./subscriptions/maintenance"
import { registeredDailyReportService } from "./whatsapp/daily-report"
import { registeredLeadAlertsService } from "./whatsapp/lead-alerts"
import { ZatcaDevicesService } from "./zatca/zatca-devices-service"

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

// ZATCA: every signed sale and return is reported right after it is saved; this retries whatever
// didn't go through then (ZATCA down, network) well inside ZATCA's 24-hour window. Safe to run
// from several tasks at once -- each document is claimed before it is sent.
// ZATCA_REPORTING_INTERVAL_MINUTES=0 turns it off.
const zatcaReportingMinutes = Number(process.env.ZATCA_REPORTING_INTERVAL_MINUTES ?? "5")
if (database && zatcaReportingMinutes > 0) {
  const zatcaReporting = new PosZatcaReporting(database, new ZatcaDevicesService(database))
  const runZatcaReporting = () =>
    zatcaReporting
      .reportPending()
      .then((result) => {
        if (result.reported + result.rejected + result.failed > 0) {
          console.log("zatca.reporting_pass", result)
        }
      })
      .catch((error: unknown) => console.error("zatca.reporting_pass_failed", error))
  setTimeout(runZatcaReporting, 90_000).unref()
  setInterval(runZatcaReporting, zatcaReportingMinutes * 60_000).unref()

  // The Invoicing app's documents still waiting for ZATCA (clearance or reporting).
  const salesInvoices = new SalesInvoicesService(database, new ZatcaDevicesService(database))
  const runSalesZatca = () =>
    salesInvoices
      .submitPending()
      .then((sent) => {
        if (sent > 0) console.log("invoicing.zatca_pass", { sent })
      })
      .catch((error: unknown) => console.error("invoicing.zatca_pass_failed", error))
  setTimeout(runSalesZatca, 100_000).unref()
  setInterval(runSalesZatca, zatcaReportingMinutes * 60_000).unref()
}

// The daily store report on WhatsApp: every few minutes, sends it to each organization whose chosen
// time has come today (whatsapp/daily-report.ts). Safe from several tasks at once -- each day is
// claimed before sending. WHATSAPP_DAILY_REPORT_INTERVAL_MINUTES=0 turns it off.
const dailyReportMinutes = Number(process.env.WHATSAPP_DAILY_REPORT_INTERVAL_MINUTES ?? "5")
const dailyReports = registeredDailyReportService()
if (dailyReports && dailyReportMinutes > 0) {
  const runDailyReports = () =>
    dailyReports
      .runDue()
      .then((result) => {
        if (result.organizations > 0) console.log("whatsapp.daily_report_pass", result)
      })
      .catch((error: unknown) => console.error("whatsapp.daily_report_pass_failed", error))
  setTimeout(runDailyReports, 120_000).unref()
  setInterval(runDailyReports, dailyReportMinutes * 60_000).unref()
}

// The team's lead alerts on WhatsApp go out directly (no template, so Meta doesn't cap them) for 24
// hours after a number last wrote to Madar's number. Every few minutes, each number whose 24 hours
// are running out is asked to tap a button (whatsapp/lead-alerts.ts). Safe from several tasks at
// once -- a reminder is claimed before it is sent. WHATSAPP_LEAD_ALERT_REMINDER_INTERVAL_MINUTES=0
// turns it off.
const leadAlertReminderMinutes = Number(
  process.env.WHATSAPP_LEAD_ALERT_REMINDER_INTERVAL_MINUTES ?? "5"
)
const leadAlerts = registeredLeadAlertsService()
if (leadAlerts && leadAlertReminderMinutes > 0) {
  const runLeadAlertReminders = () =>
    leadAlerts
      .remindDue()
      .then((reminded) => {
        if (reminded > 0) console.log("whatsapp.lead_alert_reminder_pass", { reminded })
      })
      .catch((error: unknown) => console.error("whatsapp.lead_alert_reminder_pass_failed", error))
  setTimeout(runLeadAlertReminders, 130_000).unref()
  setInterval(runLeadAlertReminders, leadAlertReminderMinutes * 60_000).unref()
}
