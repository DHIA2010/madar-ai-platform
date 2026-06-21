import { DashboardProvider } from "../providers"
import { DashboardCanvas } from "./dashboard-canvas"

export function DashboardScreen() {
  return (
    <DashboardProvider>
      <DashboardCanvas />
    </DashboardProvider>
  )
}
