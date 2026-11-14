import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Same permission the underlying GET /v1/integrations/google-analytics/insights enforces.
export default function WebsiteAnalyticsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="dashboard:view">{children}</RouteAccessGuard>
}
