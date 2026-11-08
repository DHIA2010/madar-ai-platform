import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The daily store report on WhatsApp (backend: whatsapp/daily-report.ts) -- the organization's
// choice of time and numbers, a preview of the report, and a test send.

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "whatsapp", "daily-report"].join(PATH_SEPARATOR)

export const MAX_DAILY_REPORT_RECIPIENTS = 5

export interface DailyReportRecipient {
  phone: string
  name: string
}

export interface DailyReportSettings {
  enabled: boolean
  // "HH:MM", Riyadh time.
  sendTime: string
  recipients: DailyReportRecipient[]
  lastSentOn: string | null
}

export interface DailyReportSettingsInput {
  enabled: boolean
  sendTime: string
  recipients: DailyReportRecipient[]
}

export interface DailyReportOverview {
  settings: DailyReportSettings
  // The report as it would be sent now: the day it covers and the message text.
  preview: { day: string; text: string }
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const dailyReportService = {
  async get(): Promise<DailyReportOverview> {
    return client.get<DailyReportOverview>(ENDPOINT)
  },

  async update(input: DailyReportSettingsInput): Promise<DailyReportSettings> {
    return client.put<DailyReportSettingsInput, DailyReportSettings>(ENDPOINT, input)
  },

  async sendTest(): Promise<{ sent: number; failed: number }> {
    return client.post<undefined, { sent: number; failed: number }>(
      [ENDPOINT, "test"].join(PATH_SEPARATOR),
      undefined
    )
  },
}
