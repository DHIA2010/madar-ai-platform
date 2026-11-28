import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function ExpensesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="expenses:view">{children}</RouteAccessGuard>
}
