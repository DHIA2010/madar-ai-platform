import AnalyticsDashboard from "./AnalyticsDashboard"
import { DashboardProvider } from "@/features/dashboard/providers"

export default function Page() {
  return (
    <DashboardProvider>
      <AnalyticsDashboard />
    </DashboardProvider>
  )
}
