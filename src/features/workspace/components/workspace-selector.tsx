"use client"

import { useState } from "react"
import { Building2, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { useWorkspace } from "../hooks"
import { WorkspaceSelectorContent } from "./workspace-selector-content"

interface WorkspaceSelectorProps {
  triggerLabel?: string
  triggerAriaLabel?: string
  managerMode?: boolean
  compact?: boolean
}

export function WorkspaceSelector({
  triggerLabel,
  triggerAriaLabel,
  managerMode = false,
  compact = false,
}: WorkspaceSelectorProps = {}) {
  const { currentOrganization, currentWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)

  const resolvedLabel =
    triggerLabel ?? currentWorkspace?.name ?? currentOrganization?.name ?? "Select workspace"

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={triggerAriaLabel ?? "Open workspace manager"}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-3 py-2.5 text-start transition-colors hover:bg-sidebar-accent"
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs text-muted-foreground">Account manager</span>
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              {resolvedLabel}
            </span>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
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
      )}

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
