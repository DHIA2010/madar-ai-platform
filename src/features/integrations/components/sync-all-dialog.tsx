"use client"

import { useMemo } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Info,
  Loader2,
  RefreshCcw,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { CONNECTION_ACTION_IDS, connectionActionPolicy } from "../services"
import type { ConnectionCenterRecord } from "../types"
import { ConnectorLogo } from "./connector-logo"

import { cairo } from "@/components/design/fonts"

// Only the statuses a runnable connection can actually be in; anything else falls through
// to the neutral label rather than being asserted as active.
const ROW_STATUS: Record<string, { label: string; className: string; dot: string }> = {
  connected: { label: "نشط", className: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  valid: { label: "نشط", className: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  authorized: { label: "نشط", className: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  syncing: {
    label: "قيد المزامنة",
    className: "bg-[#eef4ff] text-[#2878ff]",
    dot: "bg-[#2878ff]",
  },
  paused: { label: "متوقف", className: "bg-[#fffbeb] text-[#e08b00]", dot: "bg-[#e08b00]" },
}

function rowStatus(status: string) {
  return (
    ROW_STATUS[status] ?? {
      label: "جاهز للمزامنة",
      className: "bg-[#eef2f8] text-[#5b6b85]",
      dot: "bg-[#95a4bd]",
    }
  )
}

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
      toast.info("لا توجد تكاملات قابلة للمزامنة")
      onOpenChange(false)
      return
    }

    onSyncStart()
    // The dialog promises "تعمل في الخلفية", so it closes as soon as the run is kicked off
    // rather than holding the user on a modal until every connection finishes. The async
    // work below keeps running; only the modal content unmounts.
    onOpenChange(false)

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
        toast.success(`تمت مزامنة ${results.completed} تكاملات بنجاح.`)
      } else {
        toast.error(`اكتمل ${results.completed} وفشل ${results.failed}`, {
          action: {
            label: "إعادة محاولة الفاشلة",
            onClick: () => retryFailedSyncs(results.failedIds),
          },
        })
      }
    } catch (err) {
      toast.error("تعذّرت مزامنة التكاملات. حاول مرة أخرى.")
      console.error("Sync all error:", err)
    } finally {
      onSyncEnd()
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
      toast.success(`تمت مزامنة ${completed} تكاملات بنجاح.`)
    } else {
      toast.error(`اكتمل ${completed} وفشل ${failed}`)
    }

    onSyncEnd()
  }

  const summaryCards = [
    {
      icon: Database,
      tint: "text-[#2878ff]",
      fill: "bg-[#eaf1ff]",
      value: String(syncStats.total),
      label: "عدد التكاملات النشطة",
    },
    {
      icon: Clock,
      tint: "text-[#1f9d55]",
      fill: "bg-[#e9f8ef]",
      // A rough estimate from the connection count, not a measured figure -- the wording
      // says "حوالي" because that is all it can honestly claim.
      value: `حوالي ${syncStats.estimatedDuration} دقيقة`,
      label: "المدة المتوقعة",
    },
    {
      icon: Zap,
      tint: "text-[#8b5cf6]",
      fill: "bg-[#f3eeff]",
      value: "تعمل في الخلفية",
      label: "يمكنك مواصلة العمل أثناء المزامنة.",
    },
  ]

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      contentClassName={cn(cairo.className, "max-w-[52rem] gap-0 rounded-[20px] p-0")}
    >
      {/* The dialog portals to the body, so it does not inherit the integrations page's own
          dir="rtl" wrapper -- it has to declare direction and font for itself. */}
      <div dir="rtl" className="space-y-5 p-6 text-right md:p-7">
        {/* RTL: the icon+title group is written first so it lands on the right, close left. */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf1ff]">
              <RefreshCcw className="size-5 text-[#2878ff]" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-[20px] font-extrabold leading-tight text-[#0b1738]">
                مزامنة جميع التكاملات
              </h2>
              <p className="text-[12.5px] leading-6 text-[#6b7b96]">
                سيتم تشغيل المزامنة لجميع التكاملات النشطة في مساحة العمل الحالية.
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="إغلاق"
            className="-m-1 shrink-0 cursor-pointer rounded-lg p-1 text-[#95a4bd] transition-colors hover:bg-[#f2f5fa] hover:text-[#0b1738] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid divide-y divide-[#eef2f8] rounded-[16px] border border-[#e1e7f0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {summaryCards.map((card) => (
            <div key={card.label} className="flex items-center gap-3 px-5 py-4">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[12px]",
                  card.fill
                )}
              >
                <card.icon className={cn("size-5", card.tint)} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold leading-tight text-[#0b1738]">
                  {card.value}
                </p>
                <p className="mt-1 text-[11.5px] leading-[18px] text-[#6b7b96]">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-[14px] font-extrabold text-[#0b1738]">
            التكاملات التي سيتم مزامنتها
          </h3>

          {runnableRecords.length === 0 ? (
            <div className="rounded-[16px] border border-[#e1e7f0] px-5 py-8 text-center text-[12.5px] text-[#6b7b96]">
              لا توجد تكاملات نشطة قابلة للمزامنة في مساحة العمل الحالية.
            </div>
          ) : (
            <div className="divide-y divide-[#eef2f8] rounded-[16px] border border-[#e1e7f0]">
              {runnableRecords.map((record) => {
                const status = rowStatus(record.connection.status)
                return (
                  <div
                    key={record.connection.connectionId}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ConnectorLogo
                        platformName={record.platformName}
                        className="size-11 shrink-0 rounded-[12px] border border-[#eef2f8] bg-white p-2"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-extrabold text-[#0b1738]">
                          {record.connectedAccount}
                        </p>
                        <p className="truncate text-[11.5px] text-[#6b7b96]">
                          {record.platformName}
                        </p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold",
                        status.className
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RTL: the icon is written first so it lands on the right of the notice. */}
        <div className="flex items-start gap-3 rounded-[14px] border border-[#cfe0ff] bg-[#eef4ff] px-4 py-3.5">
          <Info className="size-5 shrink-0 text-[#2878ff]" />
          <div>
            <p className="text-[12.5px] font-extrabold text-[#2878ff]">معلومة مهمة</p>
            <p className="mt-1 text-[12px] leading-5 text-[#6b7b96]">
              ستقوم المزامنة بتحديث أحدث البيانات بما في ذلك المنتجات، الطلبات، العملاء وغيرها.
            </p>
          </div>
        </div>

        {/* RTL + justify-end: both actions sit at the left, cancel to the right of start. */}
        <div className="flex items-center justify-end gap-3">
          <AppButton
            variant="outline"
            className="h-11 min-w-[120px] rounded-[12px] border-[#e1e7f0] bg-white px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
            onClick={() => onOpenChange(false)}
            disabled={isSyncing}
          >
            إلغاء
          </AppButton>
          <AppButton
            className="h-11 min-w-[170px] rounded-[12px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
            onClick={() => void executeSyncAll()}
            disabled={isSyncing || syncStats.total === 0}
            loading={isSyncing}
            icon={<RefreshCcw className="size-4 shrink-0" />}
            iconPosition="end"
          >
            {isSyncing ? "جارٍ البدء..." : "بدء المزامنة"}
          </AppButton>
        </div>
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
