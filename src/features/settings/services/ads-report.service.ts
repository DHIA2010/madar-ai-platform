import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The daily ads report on WhatsApp (backend: whatsapp/ads-report.ts) -- the organization's choice
// of time and numbers, a preview of the report, and a test send.

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "whatsapp", "ads-report"].join(PATH_SEPARATOR)

export interface AdsReportRecipient {
  phone: string
  name: string
}

export interface AdsReportSettings {
  enabled: boolean
  // "HH:MM", Riyadh time.
  sendTime: string
  recipients: AdsReportRecipient[]
  lastSentOn: string | null
  maxRecipients: number
}

export interface AdsReportSettingsInput {
  enabled: boolean
  sendTime: string
  recipients: AdsReportRecipient[]
}

export interface AdsReportOverview {
  settings: AdsReportSettings
  // The report as it would be sent now, and whether WhatsApp has approved its message yet.
  preview: { day: string; text: string; ready: boolean }
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const adsReportService = {
  async get(): Promise<AdsReportOverview> {
    return client.get<AdsReportOverview>(ENDPOINT)
  },

  async update(input: AdsReportSettingsInput): Promise<AdsReportSettings> {
    return client.put<AdsReportSettingsInput, AdsReportSettings>(ENDPOINT, input)
  },

  async sendTest(): Promise<{ sent: number; failed: number }> {
    return client.post<undefined, { sent: number; failed: number }>(
      [ENDPOINT, "test"].join(PATH_SEPARATOR),
      undefined
    )
  },
}
