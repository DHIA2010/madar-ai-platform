"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, PlugZap, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import {
  AppCard,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { formatRelative, platformAdminService, PROVIDER_LABEL } from "../services"
import type { AdminIntegrations } from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

const CATEGORY_LABEL = { ads: "إعلانات", analytics: "تحليلات", ecommerce: "متاجر" } as const

// Integration health across every customer, per provider: how many connections, how many in
// error, and how their syncs did in the last 24 hours -- plus the latest failures to look into.
export function MadarAdminIntegrations() {
  const [data, setData] = useState<AdminIntegrations | null>(null)

  useEffect(() => {
    platformAdminService
      .getIntegrations()
      .then(setData)
      .catch(() => toast.error("تعذر تحميل التكاملات."))
  }, [])

  const providers = data?.providers ?? []
  const totals = providers.reduce(
    (sum, provider) => ({
      connected: sum.connected + provider.connected,
      errored: sum.errored + provider.errored,
      syncs: sum.syncs + provider.syncsLast24h,
      failed: sum.failed + provider.failedSyncsLast24h,
    }),
    { connected: 0, errored: 0, syncs: 0, failed: 0 }
  )
  const kpis: MadarAdminKpi[] = [
    {
      label: "اتصالات نشطة",
      value: String(totals.connected),
      deltaPct: null,
      icon: PlugZap,
      tone: "green",
    },
    {
      label: "اتصالات بها خطأ",
      value: String(totals.errored),
      deltaPct: null,
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "مزامنات آخر 24 ساعة",
      value: String(totals.syncs),
      deltaPct: null,
      icon: RefreshCw,
      tone: "blue",
    },
    {
      label: "نسبة نجاح المزامنة",
      value:
        totals.syncs === 0
          ? "—"
          : `${Math.round(((totals.syncs - totals.failed) / totals.syncs) * 100)}%`,
      deltaPct: null,
      icon: CheckCircle2,
      tone: "violet",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">التكاملات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          صحة تكاملات المنصة لدى جميع العملاء: الاتصالات والمزامنة لكل منصة.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppCard
        title="المنصات"
        state={data === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>النوع</AppTableHead>
              <AppTableHead>الاتصالات</AppTableHead>
              <AppTableHead>متصل</AppTableHead>
              <AppTableHead>خطأ</AppTableHead>
              <AppTableHead>مزامنات 24 ساعة</AppTableHead>
              <AppTableHead>فاشلة</AppTableHead>
              <AppTableHead>آخر مزامنة</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {providers.map((provider) => (
              <AppTableRow key={provider.provider}>
                <AppTableCell className="font-medium text-foreground">
                  {PROVIDER_LABEL[provider.provider]}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {CATEGORY_LABEL[provider.category]}
                </AppTableCell>
                <AppTableCell>{provider.total}</AppTableCell>
                <AppTableCell className="text-emerald-600">{provider.connected}</AppTableCell>
                <AppTableCell className={provider.errored > 0 ? "font-semibold text-rose-600" : ""}>
                  {provider.errored}
                </AppTableCell>
                <AppTableCell>{provider.syncsLast24h}</AppTableCell>
                <AppTableCell
                  className={provider.failedSyncsLast24h > 0 ? "font-semibold text-rose-600" : ""}
                >
                  {provider.failedSyncsLast24h}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatRelative(provider.lastSyncAt)}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
      </AppCard>

      <AppCard
        title="آخر المزامنات الفاشلة"
        state={data === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>الخطأ</AppTableHead>
              <AppTableHead>الوقت</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(data?.recentFailures ?? []).map((failure, index) => (
              <AppTableRow key={`${failure.connectionId}-${index}`}>
                <AppTableCell className="font-medium">
                  {PROVIDER_LABEL[failure.provider]}
                </AppTableCell>
                <AppTableCell>{failure.organizationName}</AppTableCell>
                <AppTableCell className="max-w-[420px] text-xs text-rose-600">
                  <span className="line-clamp-2" dir="auto">
                    {failure.errorMessage ?? "—"}
                  </span>
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatRelative(failure.failedAt)}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {data !== null && data.recentFailures.length === 0 ? (
          <AppTableEmpty
            title="لا توجد مزامنات فاشلة"
            description="جميع المزامنات الأخيرة ناجحة."
          />
        ) : null}
      </AppCard>
    </div>
  )
}
