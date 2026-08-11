import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AiLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="ai:view">{children}</RouteAccessGuard>
}
