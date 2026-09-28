import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationSessionsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="sessions:view">{children}</RouteAccessGuard>
}
