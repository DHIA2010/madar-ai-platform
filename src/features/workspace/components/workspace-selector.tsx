"use client"

import { useState } from "react"
import { Building2, ChevronsUpDown } from "lucide-react"

import { AppButton, AppDialog } from "@/components/app"

import { useWorkspace } from "../hooks"
import { WorkspaceSelectorContent } from "./workspace-selector-content"

interface WorkspaceSelectorProps {
  triggerLabel?: string
  triggerAriaLabel?: string
  managerMode?: boolean
}

export function WorkspaceSelector({
  triggerLabel,
  triggerAriaLabel,
  managerMode = false,
}: WorkspaceSelectorProps = {}) {
  const { currentOrganization, currentWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)

  const resolvedLabel =
    triggerLabel ?? currentWorkspace?.name ?? currentOrganization?.name ?? "Select workspace"

  return (
    <>
      <AppButton
        type="button"
        variant="outline"
        className="min-w-[220px] max-w-full justify-between overflow-hidden [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
        onClick={() => setOpen(true)}
        icon={<Building2 className="size-4" />}
        iconPosition="start"
        aria-label={triggerAriaLabel ?? "Open workspace manager"}
      >
        <span className="block truncate whitespace-nowrap text-start">{resolvedLabel}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-70" />
      </AppButton>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={managerMode ? "Workspace Manager" : "Switch workspace"}
        description={
          managerMode
            ? "Switch, create, and manage workspaces and organizations in one place."
            : "Update organization and workspace context without leaving the current screen."
        }
        contentClassName="!left-1/2 !right-auto grid-rows-[auto_minmax(0,1fr)] w-[min(1100px,92vw)] max-w-[1100px] max-h-[85vh] overflow-hidden p-6 sm:max-w-[1100px]"
      >
        <WorkspaceSelectorContent onComplete={() => setOpen(false)} />
      </AppDialog>
    </>
  )
}
