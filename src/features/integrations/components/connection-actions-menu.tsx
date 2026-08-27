"use client"

import { useState } from "react"
import { EllipsisVertical, Pause, Play, RefreshCcw, RotateCcw, Trash2, Unplug } from "lucide-react"

import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "@/components/app"

import type {
  ConnectionActionDefinition,
  ConnectionActionIcon,
} from "../services/connection-action-policy"

function renderActionIcon(icon: ConnectionActionIcon) {
  switch (icon) {
    case "run_sync":
      return <RefreshCcw className="size-4" />
    case "reconnect":
      return <RotateCcw className="size-4" />
    case "pause":
      return <Pause className="size-4" />
    case "resume":
      return <Play className="size-4" />
    case "retry":
      return <RefreshCcw className="size-4" />
    case "disconnect":
      return <Unplug className="size-4" />
    case "delete":
      return <Trash2 className="size-4" />
    default:
      return null
  }
}

interface ConnectionActionsMenuProps {
  actions: ConnectionActionDefinition[]
  menuLabel: string
  onActionSelect: (action: ConnectionActionDefinition) => void
}

export function ConnectionActionsMenu({
  actions,
  menuLabel,
  onActionSelect,
}: ConnectionActionsMenuProps) {
  const [open, setOpen] = useState(false)

  if (actions.length === 0) {
    return null
  }

  const primaryActions = actions.filter((action) => !action.destructive)
  const destructiveActions = actions.filter((action) => action.destructive)

  return (
    <AppDropdownMenu open={open} onOpenChange={setOpen}>
      <AppDropdownMenuTrigger asChild>
        <AppButton
          size="sm"
          variant="outline"
          className="h-8 w-8 rounded-md p-0"
          aria-label={menuLabel}
        >
          <EllipsisVertical className="size-4" />
        </AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="w-52">
        {primaryActions.map((action) => (
          <AppDropdownMenuItem
            key={action.id}
            disabled={!action.enabled}
            onSelect={(event) => {
              // preventDefault stops Radix from returning focus to the trigger before the
              // confirm dialog (rendered outside this dropdown) can open; closing the menu
              // explicitly via setOpen(false) below is what actually releases Radix's
              // disableOutsidePointerEvents lock on <body> -- without it, preventDefault alone
              // leaves this modal layer permanently "open" and the whole page stays unclickable
              // until a refresh.
              event.preventDefault()
              setOpen(false)
              if (action.enabled) {
                onActionSelect(action)
              }
            }}
          >
            <span className="mr-2 inline-flex">{renderActionIcon(action.icon)}</span>
            {action.label}
          </AppDropdownMenuItem>
        ))}
        {primaryActions.length > 0 && destructiveActions.length > 0 ? (
          <AppDropdownMenuSeparator />
        ) : null}
        {destructiveActions.map((action) => (
          <AppDropdownMenuItem
            key={action.id}
            className="text-red-600 focus:text-red-700"
            disabled={!action.enabled}
            onSelect={(event) => {
              // preventDefault stops Radix from returning focus to the trigger before the
              // confirm dialog (rendered outside this dropdown) can open; closing the menu
              // explicitly via setOpen(false) below is what actually releases Radix's
              // disableOutsidePointerEvents lock on <body> -- without it, preventDefault alone
              // leaves this modal layer permanently "open" and the whole page stays unclickable
              // until a refresh.
              event.preventDefault()
              setOpen(false)
              if (action.enabled) {
                onActionSelect(action)
              }
            }}
          >
            <span className="mr-2 inline-flex">{renderActionIcon(action.icon)}</span>
            {action.label}
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  )
}
