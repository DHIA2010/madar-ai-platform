import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Gated on the same permission the GET route enforces (server.ts's /v1/pos/settings), so the
// page is not offered to someone the API would refuse -- was missing entirely before, letting the
// raw backend 403 ("Permission denied.") leak into the page instead of this Arabic empty state.
export default function CashierSettingsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="pos:view">{children}</RouteAccessGuard>
}
