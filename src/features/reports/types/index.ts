export type ReportStatus = "Ready" | "Scheduled" | "Draft"

export interface ReportsOverviewItem {
  id: string
  name: string
  owner: string
  status: ReportStatus
  updatedAt: string
  frequency: string
  summary: string
}
