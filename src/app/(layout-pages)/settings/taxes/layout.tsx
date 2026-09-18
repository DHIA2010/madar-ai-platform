import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function TaxesLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="tax:view">{children}</RouteAccessGuard>
}
