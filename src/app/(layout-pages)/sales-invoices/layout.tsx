import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function SalesInvoicesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="invoicing:view">{children}</RouteAccessGuard>
}
