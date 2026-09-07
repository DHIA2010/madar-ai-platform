"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog } from "@/components/app"

import { CONNECTION_ACTION_IDS, connectionActionPolicy } from "../services"
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
  const runnableRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          connectionActionPolicy.getAction(
            {
              connection: record.connection,
              integrationStatus: record.integrationStatus,
            },
            CONNECTION_ACTION_IDS.RUN_SYNC
          ).enabled
      ),
    [records]
  )

  const syncStats = useMemo(() => {
    const disabledConnections = records.filter(
      (record) =>
        !runnableRecords.some(
          (candidate) => candidate.connection.connectionId === record.connection.connectionId
        )
    )
    const currentlySyncing = records.filter((r) => r.connection.status === "syncing").length

    return {
      total: runnableRecords.length,
      disabled: disabledConnections.length,
      syncing: currentlySyncing,
      estimatedDuration: Math.ceil(runnableRecords.length / 3) * 2,
    }
  }, [records, runnableRecords])

  const executeSyncAll = async () => {
    if (syncStats.total === 0) {
      toast.info("No connections to sync")
      onOpenChange(false)
      return
    }

    onSyncStart()

    try {
      const activeConnections = runnableRecords.map((record) => record.connection.connectionId)

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
      <p className="text-[12.5px] leading-6 text-[#8098b4]">
        This will trigger synchronization for every active connection in the current workspace.
      </p>

      <div className="space-y-3 rounded-xl border border-[#e8edf3] bg-[#f8fafc] p-4">
        <div className="flex justify-between">
          <span className="text-sm text-[#334155]">Total active connections</span>
          <span className="font-bold text-[#0d1b3e]">{syncStats.total}</span>
        </div>
        {syncStats.syncing > 0 && (
          <div className="flex justify-between">
            <span className="text-sm text-[#f59e0b]">Currently syncing</span>
            <span className="font-bold text-[#f59e0b]">{syncStats.syncing}</span>
          </div>
        )}
        {syncStats.disabled > 0 && (
          <div className="flex justify-between">
            <span className="text-sm text-[#8098b4]">Skipped (disabled/paused)</span>
            <span className="font-bold text-[#8098b4]">{syncStats.disabled}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-[#e8edf3] pt-3">
          <span className="text-sm text-[#334155]">Estimated duration</span>
          <span className="font-bold text-[#0d1b3e]">~{syncStats.estimatedDuration} minutes</span>
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
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-xs">
      <div className="flex flex-col items-center gap-2">
        {syncState === "queued" && (
          <>
            <div className="animate-spin rounded-full border-2 border-[#f59e0b] border-l-transparent p-3" />
            <span className="text-xs font-semibold text-[#f59e0b]">Queued</span>
          </>
        )}
        {syncState === "running" && (
          <>
            <Loader2 className="size-6 animate-spin text-[#2563eb]" />
            <span className="text-xs font-semibold text-[#2563eb]">Syncing...</span>
          </>
        )}
        {syncState === "completed" && (
          <>
            <CheckCircle2 className="size-6 text-[#10b981]" />
            <span className="text-xs font-semibold text-[#10b981]">Completed</span>
          </>
        )}
        {syncState === "failed" && (
          <>
            <AlertTriangle className="size-6 text-[#ef4444]" />
            <span className="text-xs font-semibold text-[#ef4444]">Failed</span>
          </>
        )}
      </div>
    </div>
  )
}

export function getSyncIndicatorClass(syncState?: SyncState) {
  if (!syncState) return "from-slate-400/30 to-transparent"
  if (syncState === "queued") return "bg-[#f59e0b]"
  if (syncState === "running") return "bg-[#2563eb]"
  if (syncState === "completed") return "bg-[#10b981]"
  if (syncState === "failed") return "bg-[#ef4444]"
  return "from-slate-400/30 to-transparent"
}
