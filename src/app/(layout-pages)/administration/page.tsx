import { RouteAccessGuard } from "@/features/authentication/components"
import { AdministrationDashboardScreen } from "@/features/administration"

export default function Page() {
  return (
    <RouteAccessGuard permission="users:view">
      <AdministrationDashboardScreen />
    </RouteAccessGuard>
  )
}
