import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Nested inside orders/layout.tsx's own orders:view guard -- creating an order needs that PLUS
// orders:manage specifically (see system-roles.ts: only owner/admin get it, same as pos:manage).
export default function OrdersNewLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="orders:manage">{children}</RouteAccessGuard>
}
