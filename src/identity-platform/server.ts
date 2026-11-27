import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { createIdentityApiServer } from "./api"
import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import { validateAwsCredentialIsolationForSecretsManager } from "./configuration/aws-credential-guard"
import { validateProductionIntegrationConfiguration } from "./configuration/production-integration-validation"
import { SalesInvoicesService } from "./invoicing/invoices-service"
import { PosZatcaReporting } from "./pos/zatca-reporting"
import { runBillingMaintenance } from "./subscriptions/maintenance"
import { registeredAdsReportService } from "./whatsapp/ads-report"
import { registeredAdChangeTracker } from "./campaigns/ad-changes"
import { registeredBookingMessenger } from "./booking/automation"
import { registeredLoyaltyCampaigns } from "./loyalty/campaigns"
import { registeredWhatsAppCampaigns } from "./whatsapp/campaigns"
import { registeredDailyReportService } from "./whatsapp/daily-report"
import { registeredLeadAlertsService } from "./whatsapp/lead-alerts"
import { registeredBlogAgent } from "./blog/agent"
import { registeredInstagramAgent } from "./instagram/agent"
import { registeredInstagramPublisher } from "./instagram/publisher"
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

// A promise nobody awaited that then fails must not take the service down for every customer:
// record it and carry on. (Node's default is to exit.)
process.on("unhandledRejection", (reason) => {
  console.error("process.unhandled_rejection", reason)
})

// A deploy (or a scale-in) stops the task with SIGTERM. Stop taking new requests and let the ones
// in flight -- a checkout, a payment confirmation -- finish, instead of cutting them off; ECS
// force-stops the task after its own grace period if this never completes.
let shuttingDown = false
function shutDown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log("process.shutting_down", { signal })
  server.close(() => process.exit(0))
  // Idle keep-alive connections would otherwise hold the server open.
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 25_000).unref()
}
process.on("SIGTERM", () => shutDown("SIGTERM"))
process.on("SIGINT", () => shutDown("SIGINT"))

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

// The daily ads report on WhatsApp, on the same pass (whatsapp/ads-report.ts): each organization's
// report once a day, after its chosen time.
// The Booking app's WhatsApp reminders: bookings whose start has come inside the business's
// reminder window. Each is claimed before it is sent, so two tasks never remind twice.
const bookingReminderMinutes = Number(process.env.BOOKING_REMINDER_INTERVAL_MINUTES ?? "5")
const bookingMessenger = registeredBookingMessenger()
if (bookingMessenger && bookingReminderMinutes > 0) {
  const runBookingReminders = () =>
    bookingMessenger
      .runDue()
      .then((result) => {
        if (result.sent > 0) console.log("booking.reminder_pass", result)
      })
      .catch((error: unknown) => console.error("booking.reminder_pass_failed", error))
  setTimeout(runBookingReminders, 160_000).unref()
  setInterval(runBookingReminders, bookingReminderMinutes * 60_000).unref()
}

// The Loyalty app's scheduled campaigns: each one is sent once its time has come. A campaign
// is claimed before it is sent, so two tasks never send it twice.
const loyaltyCampaignMinutes = Number(process.env.LOYALTY_CAMPAIGN_INTERVAL_MINUTES ?? "2")
const loyaltyCampaigns = registeredLoyaltyCampaigns()
if (loyaltyCampaigns && loyaltyCampaignMinutes > 0) {
  const runLoyaltyCampaigns = () =>
    loyaltyCampaigns
      .runDue()
      .then((result) => {
        if (result.sent + result.failed > 0) console.log("loyalty.campaign_pass", result)
      })
      .catch((error: unknown) => console.error("loyalty.campaign_pass_failed", error))
  setTimeout(runLoyaltyCampaigns, 170_000).unref()
  setInterval(runLoyaltyCampaigns, loyaltyCampaignMinutes * 60_000).unref()
}

// WhatsApp marketing campaigns: due ones start, and sending ones go out in batches, every minute.
// Safe from several tasks at once -- each message is claimed before it is sent.
const whatsAppCampaignMinutes = Number(process.env.WHATSAPP_CAMPAIGN_INTERVAL_MINUTES ?? "1")
const whatsAppCampaigns = registeredWhatsAppCampaigns()
if (whatsAppCampaigns && whatsAppCampaignMinutes > 0) {
  const runWhatsAppCampaigns = () =>
    whatsAppCampaigns
      .runDue()
      .then((result) => {
        if (result.sent + result.failed > 0) console.log("whatsapp.campaign_pass", result)
      })
      .catch((error: unknown) => console.error("whatsapp.campaign_pass_failed", error))
  setTimeout(runWhatsAppCampaigns, 120_000).unref()
  setInterval(runWhatsAppCampaigns, whatsAppCampaignMinutes * 60_000).unref()
}

// Ad change log: every campaign and ad set the syncs saved is compared with the last pass, and
// what changed is recorded for the campaign check-up. Safe from several tasks at once (a change
// is written by the pass that moves the saved state on). AD_CHANGES_INTERVAL_MINUTES=0 turns it off.
const adChangesMinutes = Number(process.env.AD_CHANGES_INTERVAL_MINUTES ?? "30")
const adChanges = registeredAdChangeTracker()
if (adChanges && adChangesMinutes > 0) {
  const runAdChanges = () =>
    adChanges
      .capture()
      .then((result) => {
        if (result.changes > 0) console.log("campaigns.ad_changes_pass", result)
      })
      .catch((error: unknown) => console.error("campaigns.ad_changes_pass_failed", error))
  setTimeout(runAdChanges, 180_000).unref()
  setInterval(runAdChanges, adChangesMinutes * 60_000).unref()
}

// The blog agent looks every hour; it writes the week's drafts once, on Sunday morning (Riyadh).
const blogAgentMinutes = Number(process.env.BLOG_AGENT_INTERVAL_MINUTES ?? "60")
const blogAgent = registeredBlogAgent()
if (blogAgent && blogAgentMinutes > 0) {
  const runBlogAgent = () =>
    blogAgent
      .tick()
      .then((written) => {
        if (written > 0) console.log("blog_agent.week_written", { written })
      })
      .catch((error: unknown) => console.error("blog_agent.tick_failed", error))
  setTimeout(runBlogAgent, 240_000).unref()
  setInterval(runBlogAgent, blogAgentMinutes * 60_000).unref()
}

// Instagram: approved posts go out within a few minutes of their time; the agent writes the
// week's drafts on Sunday morning (Riyadh), like the blog.
const instagramPublishMinutes = Number(process.env.INSTAGRAM_PUBLISH_INTERVAL_MINUTES ?? "5")
const instagramPublisher = registeredInstagramPublisher()
if (instagramPublisher && instagramPublishMinutes > 0) {
  const runInstagramPublisher = () =>
    instagramPublisher
      .tick()
      .then((published) => {
        if (published > 0) console.log("instagram.published", { published })
      })
      .catch((error: unknown) => console.error("instagram.publish_failed", error))
  setTimeout(runInstagramPublisher, 120_000).unref()
  setInterval(runInstagramPublisher, instagramPublishMinutes * 60_000).unref()
}
const instagramAgent = registeredInstagramAgent()
if (instagramAgent && blogAgentMinutes > 0) {
  const runInstagramAgent = () =>
    instagramAgent
      .tick()
      .then((written) => {
        if (written > 0) console.log("instagram_agent.week_written", { written })
      })
      .catch((error: unknown) => console.error("instagram_agent.tick_failed", error))
  setTimeout(runInstagramAgent, 300_000).unref()
  setInterval(runInstagramAgent, blogAgentMinutes * 60_000).unref()
}

const adsReports = registeredAdsReportService()
if (adsReports && dailyReportMinutes > 0) {
  const runAdsReports = () =>
    adsReports
      .runDue()
      .then((result) => {
        if (result.organizations > 0) console.log("whatsapp.ads_report_pass", result)
      })
      .catch((error: unknown) => console.error("whatsapp.ads_report_pass_failed", error))
  setTimeout(runAdsReports, 150_000).unref()
  setInterval(runAdsReports, dailyReportMinutes * 60_000).unref()
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
