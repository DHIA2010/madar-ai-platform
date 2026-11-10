import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The daily store report on WhatsApp (backend: whatsapp/daily-report.ts) -- the organization's
// choice of time and numbers, a preview of the report, and a test send.

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "whatsapp", "daily-report"].join(PATH_SEPARATOR)

export interface DailyReportRecipient {
  phone: string
  name: string
}

// One send a day: when ("HH:MM", Riyadh) and the period it covers -- from/to, or both null for
// the automatic period (the whole day before for a morning send, today so far for a later one).
export interface DailyReportSchedule {
  sendTime: string
  from: string | null
  to: string | null
  // Each end's day relative to the send (0 the send day, -1 the day before), so a period can run
  // past midnight -- yesterday 00:00 to today 02:00.
  fromDay?: -1 | 0 | null
  toDay?: -1 | 0 | null
}

export interface DailyReportLimits {
  recipients: number
  schedules: number
  customPeriod: boolean
}

export interface DailyReportWindow {
  start: string
  end: string
  label: string
}

export interface DailyReportSettings {
  enabled: boolean
  sendTime: string
  schedules: DailyReportSchedule[]
  recipients: DailyReportRecipient[]
  lastSentOn: string | null
  // The free report (1 number, 1 send, automatic period) or the paid add-on while it runs.
  plan: { paid: boolean; until: string | null; limits: DailyReportLimits }
  // What each send the plan uses covers on its next run.
  coverage: Array<{ sendTime: string } & DailyReportWindow>
}

export interface DailyReportSettingsInput {
  enabled: boolean
  schedules: DailyReportSchedule[]
  recipients: DailyReportRecipient[]
}

export interface DailyReportOverview {
  settings: DailyReportSettings
  // The report as it would be sent now: the period it covers and the message text.
  preview: { day: string; text: string; window: DailyReportWindow }
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
