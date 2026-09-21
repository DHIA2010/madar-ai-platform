import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Gated on the same permission the workspace-switcher's own workspace list relies on -- this page
// and that switcher operate on the exact same records, so anyone who cannot see the switcher's
// workspace list should not see this page.
export default function WorkspacesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="workspace:view">{children}</RouteAccessGuard>
}
