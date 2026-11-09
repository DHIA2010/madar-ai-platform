import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function WhatsAppSettingsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="settings:view">{children}</RouteAccessGuard>
}
