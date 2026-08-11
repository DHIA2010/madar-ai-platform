import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="customers:view">{children}</RouteAccessGuard>
}
