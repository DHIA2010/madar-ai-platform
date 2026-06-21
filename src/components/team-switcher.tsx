"use client"

import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { WorkspaceSelector } from "@/features/workspace"

export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <WorkspaceSelector />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
