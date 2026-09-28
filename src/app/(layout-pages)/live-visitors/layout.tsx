import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Same permission the underlying GET /v1/tracking/live-dashboard enforces -- hiding the
// route from someone the API would reject anyway.
export default function LiveVisitorsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="liveVisitors:view">{children}</RouteAccessGuard>
}
