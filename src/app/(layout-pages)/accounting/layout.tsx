import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// The Accounting app: open to anyone who may read the books.
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="accounting:view">{children}</RouteAccessGuard>
}
