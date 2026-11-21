import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function BookingLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="booking:view">{children}</RouteAccessGuard>
}
