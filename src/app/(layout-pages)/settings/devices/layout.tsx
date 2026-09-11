import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Gated on the same permission the GET route enforces, so the page is not offered to someone
// the API would refuse.
export default function DeviceSettingsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="pos:view">{children}</RouteAccessGuard>
}
