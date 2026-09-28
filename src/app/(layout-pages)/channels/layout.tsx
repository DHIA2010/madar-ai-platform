import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Same permission the underlying GET /v1/channels/performance/* endpoints enforce -- channel
// data is part of the campaigns domain server-side, there is no separate "channels" module.
export default function ChannelsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="campaigns:view">{children}</RouteAccessGuard>
}
