import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationAuditLogLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="auditLog:view">{children}</RouteAccessGuard>
}
