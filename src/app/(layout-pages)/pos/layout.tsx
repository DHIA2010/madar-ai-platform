import type { Metadata } from "next"
import type { ReactNode } from "react"

import { RouteAccessGuard } from "@/features/authentication/components"

// Scoped to this one route segment -- not the whole app -- so "Add to Home Screen" gives a
// standalone offline-capable POS shortcut (see public/pos-manifest.json, public/pos-sw.js)
// without PWA-ifying the rest of the dashboard.
export const metadata: Metadata = {
  manifest: "/pos-manifest.json",
}

export default function PosLayout({ children }: { children: ReactNode }) {
  return <RouteAccessGuard permission="pos:view">{children}</RouteAccessGuard>
}
