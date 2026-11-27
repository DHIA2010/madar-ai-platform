import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Madar Admin → السيو: Google search numbers for madar.my (Search Console).

export interface AdminSeoStatus {
  connected: boolean
  clientEmail: string | null
  siteUrl: string | null
  connectedAt: string | null
}

export interface AdminSeoTotals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface AdminSeoRow extends AdminSeoTotals {
  key: string
  previousPosition: number | null
  previousClicks: number
}

export interface AdminSeoTracked {
  id: string
  keyword: string
  createdAt: string
  current: AdminSeoTotals | null
  previousPosition: number | null
  daily: Array<{ date: string; position: number; clicks: number; impressions: number }>
}

export interface AdminSeoReport {
  status: "ready"
  siteUrl: string
  range: { startDate: string; endDate: string }
  previousRange: { startDate: string; endDate: string }
  totals: AdminSeoTotals
  previousTotals: AdminSeoTotals
  daily: Array<{ date: string } & AdminSeoTotals>
  queries: AdminSeoRow[]
  pages: AdminSeoRow[]
  tracked: AdminSeoTracked[]
  fetchedAt: string
}

export interface AdminSeoReportQuery {
  startDate: string
  endDate?: string
  country?: string
  device?: "mobile" | "desktop" | "tablet"
}

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "seo"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const seoAdminService = {
  status(): Promise<AdminSeoStatus> {
    return client.get(`${ENDPOINT}/status`)
  },
  connect(key: string): Promise<AdminSeoStatus> {
    return client.post(`${ENDPOINT}/connect`, { key })
  },
  disconnect(): Promise<unknown> {
    return client.post(`${ENDPOINT}/disconnect`, {})
  },
  report(query: AdminSeoReportQuery): Promise<AdminSeoReport | { status: "not_connected" }> {
    const params = new URLSearchParams({ startDate: query.startDate })
    if (query.endDate) params.set("endDate", query.endDate)
    if (query.country) params.set("country", query.country)
    if (query.device) params.set("device", query.device)
    return client.get(`${ENDPOINT}/report?${params.toString()}`)
  },
  addKeywords(keywords: string[]): Promise<{ added: number }> {
    return client.post(`${ENDPOINT}/keywords`, { keywords })
  },
  removeKeyword(id: string): Promise<unknown> {
    return client.delete(`${ENDPOINT}/keywords/${id}`)
  },
}
