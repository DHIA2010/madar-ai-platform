import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="reports:view">{children}</RouteAccessGuard>
}
