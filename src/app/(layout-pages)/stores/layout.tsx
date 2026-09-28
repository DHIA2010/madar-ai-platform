import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function StoresLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="stores:view">{children}</RouteAccessGuard>
}
