import { RouteAccessGuard } from "@/features/authentication/components"

import SettingsDashboard from "./SettingsDashboard"

// Gated the same way every sibling settings section already is (cashier/taxes/workspaces/etc.) --
// this general-settings page was the one section with no route guard at all, so denying a role
// "settings" access had no effect: the page opened fully anyway.
export default function Page() {
  return (
    <RouteAccessGuard permission="settings:view">
      <SettingsDashboard />
    </RouteAccessGuard>
  )
}
