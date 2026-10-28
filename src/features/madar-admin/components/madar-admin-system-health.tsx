"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock3, Database, RefreshCw, Server, XCircle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { formatRelative, platformAdminService, PROVIDER_LABEL } from "../services"
import type { AdminSystemHealth } from "../types/platform-admin.types"

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} يوم ${hours} ساعة`
  if (hours > 0) return `${hours} ساعة ${minutes} دقيقة`
  return `${minutes} دقيقة`
}

function StatusCard({
  title,
  ok,
  detail,
  icon: Icon,
}: {
  title: string
  ok: boolean | null
  detail: string
  icon: typeof Database
}) {
  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="size-5" />
        </span>
        {ok === null ? (
          <span className="text-xs text-muted-foreground">غير مفعل</span>
        ) : ok ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="size-4" /> يعمل
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
            <XCircle className="size-4" /> متوقف
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </AppCard>
  )
}

// The live state of Madar's own services: database, cache, the API server, queued background
// events, and sync success per provider over the last day.
export function MadarAdminSystemHealth() {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setHealth(await platformAdminService.getSystemHealth())
    } catch {
      toast.error("تعذر تحميل حالة النظام.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            حالة أنظمة مدار وخدماتها
            {health ? ` -- آخر فحص ${formatRelative(health.checkedAt)}` : ""}.
          </p>
        </div>
        <AppButton
          variant="outline"
          className="h-10 rounded-[10px] px-4"
          icon={<RefreshCw className={cn("size-4", refreshing && "animate-spin")} />}
          disabled={refreshing}
          onClick={() => void load()}
        >
          تحديث
        </AppButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="قاعدة البيانات"
          ok={health ? health.database.ok : null}
          detail={health ? `زمن الاستجابة ${health.database.latencyMs} ms` : "..."}
          icon={Database}
        />
        <StatusCard
          title="الذاكرة المؤقتة (Redis)"
          ok={health ? health.cache.ok : null}
          detail={health?.cache.ok === null ? "غير مستخدمة في هذه البيئة" : "يستقبل الطلبات"}
          icon={Server}
        />
        <StatusCard
          title="خادم الواجهة البرمجية"
          ok={health ? true : null}
          detail={
            health
              ? `يعمل منذ ${formatUptime(health.server.uptimeSeconds)} · ${health.server.memoryMb} MB`
              : "..."
          }
          icon={Server}
        />
        <StatusCard
          title="الأحداث بانتظار المعالجة"
          ok={health ? health.outbox.failed === 0 : null}
          detail={
            health
              ? `${health.outbox.pending} بانتظار · ${health.outbox.failed} فشلت${
                  health.outbox.oldestPendingAt
                    ? ` · أقدمها ${formatRelative(health.outbox.oldestPendingAt)}`
                    : ""
                }`
              : "..."
          }
          icon={Clock3}
        />
      </div>

      <AppCard
        title="المزامنة خلال آخر 24 ساعة"
        state={health === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>المزامنات</AppTableHead>
              <AppTableHead>فاشلة</AppTableHead>
              <AppTableHead>نسبة النجاح</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(health?.syncsLast24h ?? []).map((row) => (
              <AppTableRow key={row.provider}>
                <AppTableCell className="font-medium">{PROVIDER_LABEL[row.provider]}</AppTableCell>
                <AppTableCell>{row.total}</AppTableCell>
                <AppTableCell className={row.failed > 0 ? "font-semibold text-rose-600" : ""}>
                  {row.failed}
                </AppTableCell>
                <AppTableCell>
                  {row.successRate === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            row.successRate >= 95
                              ? "bg-emerald-500"
                              : row.successRate >= 80
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          )}
                          style={{ width: `${row.successRate}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold">{row.successRate}%</span>
                    </div>
                  )}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
      </AppCard>

      {health ? (
        <p className="text-xs text-muted-foreground" dir="ltr">
          Node {health.server.nodeVersion}
          {health.server.version ? ` · build ${health.server.version}` : ""} · schedule failures
          (7d): {health.scheduleFailuresLast7Days}
        </p>
      ) : null}
    </div>
  )
}
