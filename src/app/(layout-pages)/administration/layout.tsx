import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="users:view">{children}</RouteAccessGuard>
}
