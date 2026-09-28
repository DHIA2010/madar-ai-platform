import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Same underlying data/permission as audit-log -- both pages read GET /v1/audit-logs, just with
// different framing/filters.
export default function AdministrationActivityLogLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="auditLog:view">{children}</RouteAccessGuard>
}
