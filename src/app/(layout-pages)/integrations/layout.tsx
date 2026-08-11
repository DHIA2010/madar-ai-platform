import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="connections:view">{children}</RouteAccessGuard>
}
