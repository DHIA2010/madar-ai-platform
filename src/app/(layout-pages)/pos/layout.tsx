import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function PosLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="pos:view">{children}</RouteAccessGuard>
}
