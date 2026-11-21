import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function LoyaltyLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="loyalty:view">{children}</RouteAccessGuard>
}
