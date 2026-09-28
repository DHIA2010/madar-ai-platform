import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

export default function AdministrationInvitationsLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="invitations:view">{children}</RouteAccessGuard>
}
