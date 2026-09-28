import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationRolesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="roles:view">{children}</RouteAccessGuard>
}
