import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="pos:view">{children}</RouteAccessGuard>
}
