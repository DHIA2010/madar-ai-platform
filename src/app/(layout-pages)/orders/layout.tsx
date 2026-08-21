import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="orders:view">{children}</RouteAccessGuard>
}
