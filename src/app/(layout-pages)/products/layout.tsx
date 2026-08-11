import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="products:view">{children}</RouteAccessGuard>
}
