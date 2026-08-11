import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="dashboard:view">{children}</RouteAccessGuard>
}
