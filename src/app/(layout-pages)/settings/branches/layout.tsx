import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Gated on the same permission the workspace-switcher's own workspace list relies on -- a branch
// is a workspace, so anyone who cannot see the switcher's workspace list should not see this page.
export default function BranchesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="workspace:view">{children}</RouteAccessGuard>
}
