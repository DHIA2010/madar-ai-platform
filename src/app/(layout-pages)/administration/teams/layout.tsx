import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationTeamsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="teams:view">{children}</RouteAccessGuard>
}
