"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { subDays } from "date-fns"
import { Search } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { toLocalDay } from "@/lib/local-day"
import { cn } from "@/lib/utils"

import { AppDateRangeFilter, AppSearchInput } from "@/components/app"

import {
  type CampaignPerformanceRow,
  campaignPerformanceService,
} from "../services/campaign-performance.service"
import { CampaignModuleNav } from "./campaign-module-nav"
import { campaignStatusBucket, campaignStatusPill } from "./campaign-status-pill"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

// Same visual tokens as the other campaign screens in this feature.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

type StatusFilter = "all" | "active" | "paused" | "other"
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "paused", "other"]

function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function formatNumber(value: number, locale: Locale, digits = 0) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: digits }).format(
    value
  )
}

// Money in the campaign's own currency, never converted.
function formatMoney(value: number, currency: string | null | undefined, locale: Locale) {
  const amount = formatNumber(value, locale, value < 100 ? 2 : 0)
  const code = currency ?? "SAR"
  if (code === "SAR") return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
  return locale === "ar" ? `${amount} ${code}` : `${code} ${amount}`
}

// The campaigns list: every campaign on the connected ad platforms with its real numbers for the
// chosen period (GET /v1/campaigns/performance/campaigns) -- the same rows the dashboard drills
// into, laid out flat so one can be found by name, platform or state.
export function CampaignListScreen() {
  const t = useTranslations("campaigns")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 29), to: today }
  })
  const [rows, setRows] = useState<CampaignPerformanceRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [platformFilter, setPlatformFilter] = useState<string>("all")

  const startDate = dateRange?.from ? toLocalDay(dateRange.from) : undefined
  const endDay = dateRange?.to ?? dateRange?.from
  const endDate = endDay ? toLocalDay(endDay) : undefined

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(false)
      try {
        const result = await campaignPerformanceService.listCampaigns({
          startDate,
          endDate,
          pageSize: 200,
        })
        if (!cancelled) setRows(result.items)
      } catch (error) {
        console.error("Failed to load the campaigns list", error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate])

  const platforms = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.platform))].sort(),
    [rows]
  )
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: 0, active: 0, paused: 0, other: 0 }
    for (const row of rows ?? []) {
      result.all += 1
      result[campaignStatusBucket(row.status)] += 1
    }
    return result
  }, [rows])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (rows ?? [])
      .filter((row) => statusFilter === "all" || campaignStatusBucket(row.status) === statusFilter)
      .filter((row) => platformFilter === "all" || row.platform === platformFilter)
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .sort((a, b) => b.spend - a.spend)
  }, [rows, search, statusFilter, platformFilter])

  const columns = [
    { key: "campaign", label: t("metrics.entity.campaign"), align: "text-start" },
    { key: "status", label: t("metrics.columns.status") },
    { key: "spend", label: t("metrics.columns.spend") },
    { key: "impressions", label: t("metrics.columns.impressions") },
    { key: "clicks", label: t("metrics.columns.clicks") },
    { key: "ctr", label: t("metrics.columns.ctr") },
    { key: "results", label: t("checkupScreen.columns.results") },
    { key: "cpa", label: t("checkupScreen.columns.costPerResult") },
  ]

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("listScreen.title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("listScreen.realSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <CampaignModuleNav />

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-semibold transition-colors",
                    statusFilter === filter
                      ? "border-[#1d4fd8] bg-[#1d4fd8] text-white"
                      : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0]"
                  )}
                >
                  {t(`listScreen.filters.${filter}` as "listScreen.filters.all")}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      statusFilter === filter ? "bg-white/20" : "bg-[#eef2f8]"
                    )}
                  >
                    {counts[filter]}
                  </span>
                </button>
              ))}
            </div>
            <div className="w-full lg:w-[340px]">
              <AppSearchInput
                startIcon={<Search className="size-4 text-[#95a4bd]" />}
                placeholder={t("listScreen.searchPlaceholder")}
                className="h-11 rounded-[10px] border-[#e1e7f0] bg-white text-[13px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {platforms.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["all", ...platforms].map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setPlatformFilter(platform)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors",
                    platformFilter === platform
                      ? "border-[#1d4fd8] bg-[#eef4ff] text-[#1d4fd8]"
                      : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0]"
                  )}
                >
                  {platform === "all" ? (
                    t("listScreen.allPlatforms")
                  ) : (
                    <>
                      <PlatformBadge
                        platform={platform}
                        className="size-5"
                        iconClassName="size-3"
                      />
                      {platform}
                    </>
                  )}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-center">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "border-b border-[#eef2f8] px-3 py-3 text-[11.5px] font-semibold",
                        MUTED,
                        column.align ?? "text-center"
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn("transition-opacity", isLoading && rows && "opacity-60")}>
                {loadError ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center">
                      <p className="text-[12.5px] text-[#e0484d]">{t("listScreen.loadError")}</p>
                    </td>
                  </tr>
                ) : rows === null ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center">
                      <p className={cn("text-[12.5px]", MUTED)}>
                        {t("dashboardScreen.loadingPerformance")}
                      </p>
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-14 text-center">
                      <p className={cn("text-[14px] font-bold", HEADING)}>
                        {rows.length === 0
                          ? t("listScreen.emptyTitle")
                          : t("listScreen.noMatchTitle")}
                      </p>
                      <p className={cn("mt-2 text-[12.5px]", MUTED)}>
                        {rows.length === 0
                          ? t("listScreen.emptyDescription")
                          : t("listScreen.noMatchDescription")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const pill = campaignStatusPill(row.status, t)
                    return (
                      <tr key={row.id} className="border-b border-[#f4f7fb] hover:bg-[#f8fafd]">
                        <td className="px-3 py-3.5 text-start">
                          <div className="flex items-center gap-3">
                            <PlatformBadge
                              platform={row.platform}
                              className="size-9"
                              iconClassName="size-[18px]"
                            />
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "max-w-[340px] truncate text-[13px] font-bold",
                                  HEADING
                                )}
                              >
                                {row.name}
                              </p>
                              <p className={cn("text-[11.5px]", MUTED)}>{row.platform}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              pill.className
                            )}
                          >
                            {pill.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {formatMoney(row.spend, row.currency, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {formatNumber(row.impressions, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {formatNumber(row.clicks, locale)}
                        </td>
                        <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {formatNumber(row.ctr, locale, 2)}%
                        </td>
                        <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {formatNumber(row.conversions, locale, 1)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
                          {row.conversions > 0 ? formatMoney(row.cpa, row.currency, locale) : "—"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
