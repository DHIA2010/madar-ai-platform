import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function CampaignsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="campaigns:view">{children}</RouteAccessGuard>
}
