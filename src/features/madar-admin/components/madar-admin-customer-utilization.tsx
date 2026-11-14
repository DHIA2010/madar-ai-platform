"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppCard } from "@/components/app"

import {
  APPLICATION_LABEL,
  formatDate,
  formatRelative,
  packageLabel,
  platformAdminService,
  STORE_PLATFORM_KEY,
} from "../services"
import type { AdminCustomerUtilization } from "../types/platform-admin.types"
import { MADAR_ADMIN_KPI_TONE_CLASSNAMES } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"
import {
  formatCount,
  presetRange,
  UsageBadge,
  UTILIZATION_METRICS,
  UtilizationChart,
  type UtilizationRange,
  UtilizationRangeControl,
} from "./utilization-ui"

// One customer's usage of Madar over time: what they created in total, inside the chosen period,
// and day by day (or by week / month).
export function MadarAdminCustomerUtilization() {
  const customerId = useSearchParams().get("id")
  const [range, setRange] = useState<UtilizationRange>(() => presetRange(30))
  const [loaded, setLoaded] = useState<{ key: string; data: AdminCustomerUtilization } | null>(null)
  const [missing, setMissing] = useState(false)
  const requestKey = `${customerId}|${range.from}|${range.to}`

  useEffect(() => {
    if (!customerId) return
    let active = true
    platformAdminService
      .getCustomerUtilization(customerId, { from: range.from, to: range.to })
      .then((data) => {
        if (active) setLoaded({ key: requestKey, data })
      })
      .catch(() => {
        if (!active) return
        setMissing(true)
        toast.error("تعذر تحميل استخدام العميل.")
      })
    return () => {
      active = false
    }
  }, [customerId, range.from, range.to, requestKey])

  const backLink = (
    <Link
      href={ROUTES.madarAdminUtilization}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowRight className="size-4" />
      استخدام العملاء
    </Link>
  )

  // The previous numbers stay on screen while another period loads.
  const data = loaded?.data ?? null
  if (!customerId || (missing && data === null)) {
    return (
      <div dir="rtl" className="flex flex-col gap-4">
        {backLink}
        <AppCard className="rounded-2xl border-border/60 p-10 text-center text-sm text-muted-foreground shadow-sm">
          لم يتم العثور على العميل.
        </AppCard>
      </div>
    )
  }

  const customer = data?.customer
  const loading = loaded?.key !== requestKey

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {backLink}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{customer?.name ?? "…"}</h1>
            {customer ? <SubscriptionStatusBadge status={customer.status} /> : null}
            {customer ? <UsageBadge level={customer.usage} /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer ? (
              <>
                <span dir="ltr">{customer.owner?.email ?? "—"}</span> • سجّل في{" "}
                {formatDate(customer.createdAt)} • آخر إضافة {formatRelative(customer.lastUsedAt)} •{" "}
                <Link
                  href={ROUTES.madarAdminCustomer(customer.id)}
                  className="font-semibold text-primary hover:underline"
                >
                  ملف العميل
                </Link>
              </>
            ) : (
              "جارٍ التحميل..."
            )}
          </p>
        </div>
        <UtilizationRangeControl range={range} onChange={setRange} />
      </div>

      <div
        className={cn(
          "grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-4",
          loading && data !== null && "opacity-60"
        )}
      >
        {UTILIZATION_METRICS.map((metric) => {
          if (!customer) {
            return (
              <AppCard
                key={metric.key}
                state="loading"
                className="h-[150px] rounded-2xl border-border/60"
              />
            )
          }
          const Icon = metric.icon
          const inRange = customer.inRange[metric.key]
          return (
            <AppCard key={metric.key} className="rounded-2xl border-border/60 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl",
                    MADAR_ADMIN_KPI_TONE_CLASSNAMES[metric.tone]
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    inRange > 0 ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                  )}
                >
                  <span dir="ltr">{inRange > 0 ? `+${formatCount(inRange)}` : "0"}</span> في الفترة
                </span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCount(customer.totals[metric.key])}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {customer.lastAt[metric.key]
                  ? `آخر إضافة ${formatRelative(customer.lastAt[metric.key])}`
                  : "لم يُستخدم بعد"}
              </p>
            </AppCard>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <UtilizationChart
          title="الاستخدام عبر الوقت"
          daily={data?.daily ?? []}
          loading={data === null}
          className="lg:col-span-2"
        />

        <div className="flex flex-col gap-4">
          <AppCard
            title="الحساب"
            state={data === null ? "loading" : "idle"}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            <dl className="grid grid-cols-3 gap-3 pt-2 text-center">
              {[
                { label: "مستخدمون", value: customer?.members ?? 0 },
                { label: "فروع", value: customer?.branches ?? 0 },
                { label: "متاجر مربوطة", value: customer?.storeCount ?? 0 },
              ].map((entry) => (
                <div key={entry.label} className="rounded-xl border border-border/60 p-3">
                  <dd className="text-xl font-bold text-foreground">{formatCount(entry.value)}</dd>
                  <dt className="mt-0.5 text-xs text-muted-foreground">{entry.label}</dt>
                </div>
              ))}
            </dl>
            {customer && customer.platforms.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {customer.platforms.map((platform) => (
                  <PlatformChip key={platform} platform={STORE_PLATFORM_KEY[platform]} />
                ))}
              </div>
            ) : null}
          </AppCard>

          <AppCard
            title="التطبيقات"
            state={data === null ? "loading" : "idle"}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            {data && data.subscriptions.length === 0 ? (
              <p className="pt-2 text-sm text-muted-foreground">لم يفعّل أي تطبيق بعد.</p>
            ) : (
              <ul className="space-y-3 pt-2">
                {(data?.subscriptions ?? []).map((subscription) => (
                  <li key={subscription.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {APPLICATION_LABEL[subscription.application]}
                      </p>
                      <p className="text-xs text-muted-foreground">{packageLabel(subscription)}</p>
                    </div>
                    <SubscriptionStatusBadge status={subscription.status} />
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </div>
      </div>
    </div>
  )
}
