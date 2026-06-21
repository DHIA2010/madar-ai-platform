"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog } from "@/components/app"

import type { ConnectionCenterRecord } from "../types"

interface SyncAllDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: ConnectionCenterRecord[]
  onSyncStart: () => void
  onSyncEnd: () => void
  isSyncing: boolean
  onRunSync: (connectionId: string) => Promise<ConnectionCenterRecord>
}

type SyncState = "queued" | "running" | "completed" | "failed"

export function SyncAllDialog({
  open,
  onOpenChange,
  records,
  onSyncStart,
  onSyncEnd,
  isSyncing,
  onRunSync,
}: SyncAllDialogProps) {
  const syncStats = useMemo(() => {
    const activeConnections = records.filter(
      (r) => r.connection.status !== "draft" && r.connection.status !== "disconnected"
    )
    const disabledConnections = records.filter(
      (r) =>
        r.connection.status === "draft" ||
        r.connection.status === "disconnected" ||
        r.connection.status === "paused"
    )
    const currentlySyncing = records.filter((r) => r.connection.status === "syncing").length

    return {
      total: activeConnections.length,
      disabled: disabledConnections.length,
      syncing: currentlySyncing,
      estimatedDuration: Math.ceil(activeConnections.length / 3) * 2,
    }
  }, [records])

  const executeSyncAll = async () => {
    if (syncStats.total === 0) {
      toast.info("No connections to sync")
      onOpenChange(false)
      return
    }

    onSyncStart()

    try {
      const activeConnections = records
        .filter(
          (r) =>
            r.connection.status !== "draft" &&
            r.connection.status !== "disconnected" &&
            r.connection.status !== "paused"
        )
        .map((r) => r.connection.connectionId)

      const CONCURRENCY_LIMIT = 3
      const results = { completed: 0, failed: 0, failedIds: [] as string[] }

      // Mark all as queued initially
      // Process connections with concurrency limit
      for (let i = 0; i < activeConnections.length; i += CONCURRENCY_LIMIT) {
        const batch = activeConnections.slice(i, i + CONCURRENCY_LIMIT)

        await Promise.all(
          batch.map(async (connectionId) => {
            try {
              await onRunSync(connectionId)
              results.completed++
            } catch {
              results.failed++
              results.failedIds.push(connectionId)
            }
          })
        )
      }

      // Show completion toast
      if (results.failed === 0) {
        toast.success(`All ${results.completed} connections synchronized successfully.`)
      } else {
        toast.error(`${results.completed} completed, ${results.failed} failed`, {
          action: {
            label: "Retry Failed",
            onClick: () => retryFailedSyncs(results.failedIds),
          },
        })
      }
    } catch (err) {
      toast.error("Sync all failed. Please try again.")
      console.error("Sync all error:", err)
    } finally {
      onSyncEnd()
      onOpenChange(false)
    }
  }

  const retryFailedSyncs = async (connectionIds: string[]) => {
    if (connectionIds.length === 0) return

    onSyncStart()

    let completed = 0
    let failed = 0

    for (const connectionId of connectionIds) {
      try {
        await onRunSync(connectionId)
        completed++
      } catch {
        failed++
      }
    }

    if (failed === 0) {
      toast.success(`All ${completed} connections synchronized successfully.`)
    } else {
      toast.error(`${completed} completed, ${failed} failed`)
    }

    onSyncEnd()
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Sync all connections?">
      <p className="text-sm text-muted-foreground">
        This will trigger synchronization for every active connection in the current workspace.
      </p>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex justify-between">
          <span className="text-sm font-medium">Total active connections</span>
          <span className="font-semibold">{syncStats.total}</span>
        </div>
        {syncStats.syncing > 0 && (
          <div className="flex justify-between">
            <span className="text-sm font-medium text-amber-700">Currently syncing</span>
            <span className="font-semibold text-amber-700">{syncStats.syncing}</span>
          </div>
        )}
        {syncStats.disabled > 0 && (
          <div className="flex justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Skipped (disabled/paused)
            </span>
            <span className="font-semibold text-muted-foreground">{syncStats.disabled}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-3">
          <span className="text-sm font-medium">Estimated duration</span>
          <span className="font-semibold">~{syncStats.estimatedDuration} minutes</span>
        </div>
      </div>

      <div className="flex gap-2">
        <AppButton variant="outline" onClick={() => onOpenChange(false)} disabled={isSyncing}>
          Cancel
        </AppButton>
        <AppButton
          onClick={() => void executeSyncAll()}
          disabled={isSyncing || syncStats.total === 0}
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Starting Sync...
            </>
          ) : (
            "Start Sync"
          )}
        </AppButton>
      </div>
    </AppDialog>
  )
}

interface SyncAllOverlayProps {
  syncState?: SyncState
}

export function SyncAllOverlay({ syncState }: SyncAllOverlayProps) {
  if (!syncState) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/40 backdrop-blur-xs">
      <div className="flex flex-col items-center gap-2">
        {syncState === "queued" && (
          <>
            <div className="rounded-full border-2 border-amber-400 border-l-transparent p-3 animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Queued</span>
          </>
        )}
        {syncState === "running" && (
          <>
            <Loader2 className="size-6 text-sky-500 animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Syncing...</span>
          </>
        )}
        {syncState === "completed" && (
          <>
            <CheckCircle2 className="size-6 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">Completed</span>
          </>
        )}
        {syncState === "failed" && (
          <>
            <AlertTriangle className="size-6 text-red-500" />
            <span className="text-xs font-medium text-red-700">Failed</span>
          </>
        )}
      </div>
    </div>
  )
}

export function getSyncIndicatorClass(syncState?: SyncState) {
  if (!syncState) return "from-slate-400/30 to-transparent"
  if (syncState === "queued") return "bg-amber-400"
  if (syncState === "running") return "bg-sky-400"
  if (syncState === "completed") return "bg-emerald-400"
  if (syncState === "failed") return "bg-red-400"
  return "from-slate-400/30 to-transparent"
}
