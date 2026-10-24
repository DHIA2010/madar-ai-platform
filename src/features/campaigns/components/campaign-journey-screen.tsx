"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { subDays } from "date-fns"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import { AppDateRangeFilter } from "@/components/app"

import {
  type CampaignJourneyRow,
  campaignPerformanceService,
} from "../services/campaign-performance.service"
import { CampaignModuleNav } from "./campaign-module-nav"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

// Same visual tokens as campaign-dashboard-screen.tsx in this feature (not shared dashboard
// tokens -- see that file's own comment on why).
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale)).format(Math.round(value))
}

function formatCurrency(value: number, locale: Locale) {
  const amount = new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

const STATUS_PILL_KEYS: Record<string, { key: string; className: string }> = {
  active: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  enabled: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  paused: { key: "paused", className: "bg-[#fff7e6] text-[#e08b00]" },
  removed: { key: "removed", className: "bg-[#fdeeee] text-[#e0484d]" },
  ended: { key: "ended", className: "bg-[#eef2f8] text-[#5b6b85]" },
}

type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

function statusPill(status: string, t: CampaignsTranslator) {
  const entry = STATUS_PILL_KEYS[status.toLowerCase()]
  if (!entry) {
    return { label: status, className: "bg-[#eef2f8] text-[#5b6b85]" }
  }
  return {
    label: t(`dashboardScreen.statusPill.${entry.key}` as "dashboardScreen.statusPill.active"),
    className: entry.className,
  }
}

// This screen is the "journey" from ad spend to a real matched sale -- it reads
// GET /v1/campaigns/performance/journey (CampaignJourneyService), joining each ad-platform
// campaign's spend/impressions/clicks against orders Zid/Salla/Shopify actually matched to it
// (see OrderAttributionService). A row with no campaignId is an ad-platform campaign that hasn't
// been imported into Madar's shared campaigns table yet (no sales side to join); a row with
// platform === null is the reverse -- real matched orders with no ad-KPI row in this date range.
export function CampaignJourneyScreen() {
  const t = useTranslations("campaigns")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 29), to: today }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<CampaignJourneyRow[]>([])

  const startDate = dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : undefined
  const endDate = (dateRange?.to ?? dateRange?.from)?.toISOString().slice(0, 10)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const result = await campaignPerformanceService.getJourney({ startDate, endDate })
        if (!cancelled) setRows(result.items)
      } catch (error) {
        console.error("Failed to load campaign journey", error)
        if (!cancelled) setLoadError(t("journeyScreen.loadError"))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, t])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          spend: acc.spend + row.spend,
          revenue: acc.revenue + row.revenue,
          orders: acc.orders + row.orders,
        }),
        { spend: 0, revenue: 0, orders: 0 }
      ),
    [rows]
  )
  const unmatchedCount = rows.filter((row) => row.campaignId === null && row.spend > 0).length

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("journeyScreen.title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("journeyScreen.subtitle")}</p>
          </div>
          <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        <CampaignModuleNav />

        <section className="grid gap-3.5 sm:grid-cols-3">
          <div className={cn(PANEL, "p-4")}>
            <p className={cn("text-[11.5px]", MUTED)}>{t("metrics.columns.spend")}</p>
            <p className={cn("mt-1.5 text-[20px] font-extrabold", HEADING)}>
              {formatCurrency(totals.spend, locale)}
            </p>
          </div>
          <div className={cn(PANEL, "p-4")}>
            <p className={cn("text-[11.5px]", MUTED)}>{t("journeyScreen.kpis.orders")}</p>
            <p className={cn("mt-1.5 text-[20px] font-extrabold", HEADING)}>
              {formatNumber(totals.orders, locale)}
            </p>
          </div>
          <div className={cn(PANEL, "p-4")}>
            <p className={cn("text-[11.5px]", MUTED)}>{t("metrics.columns.revenue")}</p>
            <p className={cn("mt-1.5 text-[20px] font-extrabold", HEADING)}>
              {formatCurrency(totals.revenue, locale)}
            </p>
          </div>
        </section>

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "campaign", label: t("metrics.entity.campaign"), align: "text-right" },
                    { key: "status", label: t("metrics.columns.status") },
                    { key: "spend", label: t("metrics.columns.spend") },
                    { key: "impressions", label: t("metrics.columns.impressions") },
                    { key: "clicks", label: t("metrics.columns.clicks") },
                    { key: "ctr", label: t("metrics.columns.ctr") },
                    { key: "orders", label: t("journeyScreen.kpis.orders") },
                    { key: "revenue", label: t("metrics.columns.revenue") },
                    { key: "roas", label: t("metrics.columns.roas") },
                    { key: "cpa", label: t("metrics.columns.cpa") },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "border-b border-[#eef2f8] px-3 py-3 text-[11px] font-semibold",
                        MUTED,
                        column.align ?? "text-center"
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center">
                      <p className={cn("text-[12.5px]", MUTED)}>
                        {t("dashboardScreen.loadingPerformance")}
                      </p>
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center">
                      <p className="text-[12.5px] text-[#e0484d]">{loadError}</p>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <p className={cn("text-[13.5px] font-bold", HEADING)}>
                        {t("journeyScreen.emptyTitle")}
                      </p>
                      <p className={cn("mt-2 text-[12px]", MUTED)}>
                        {t("journeyScreen.emptyDescription")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => {
                    const pill = statusPill(row.status, t)
                    return (
                      <tr
                        key={`${row.campaignId ?? "unmatched"}:${index}`}
                        className="border-b border-[#f4f7fb] hover:bg-[#f8fafd]"
                      >
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex items-center justify-start gap-2.5">
                            {row.platform ? (
                              <PlatformBadge
                                platform={row.platform}
                                className="size-8"
                                iconClassName="size-4"
                              />
                            ) : null}
                            <div className="min-w-0 text-right">
                              <p className={cn("truncate text-[12.5px] font-bold", HEADING)}>
                                {row.name}
                              </p>
                              {row.campaignId === null && row.spend > 0 ? (
                                <p className={cn("truncate text-[11px]", MUTED)}>
                                  {t("journeyScreen.notImportedHint")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                              pill.className
                            )}
                          >
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {formatCurrency(row.spend, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {formatNumber(row.impressions, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {formatNumber(row.clicks, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {row.ctr.toFixed(2)}%
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {formatNumber(row.orders, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {formatCurrency(row.revenue, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-center font-bold text-[#334155]">
                          {row.roas > 0 ? `${row.roas.toFixed(2)}x` : "-"}
                        </td>
                        <td className="px-3 py-3.5 text-center tabular-nums text-[#334155]">
                          {row.cpa > 0 ? formatCurrency(row.cpa, locale) : "-"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && unmatchedCount > 0 ? (
            <p className={cn("mt-3 text-[11.5px]", MUTED)}>
              {t("journeyScreen.unmatchedHint", { count: unmatchedCount })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
