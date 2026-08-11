"use client"

import { AppEmpty } from "@/components/app"

import { Can } from "./can"

export function RouteAccessGuard({
  permission,
  children,
}: {
  permission: string
  children: React.ReactNode
}) {
  return (
    <Can
      permission={permission}
      fallback={
        <AppEmpty
          title="Access restricted"
          description="You don't have permission to view this section. Contact your administrator if you think this is a mistake."
        />
      }
    >
      {children}
    </Can>
  )
}
