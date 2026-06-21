export interface DashboardMetric {
  key: string
  label: string
  value: number
}

export interface DashboardSummary {
  metrics: DashboardMetric[]
}
