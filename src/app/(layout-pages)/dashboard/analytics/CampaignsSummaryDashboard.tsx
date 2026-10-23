"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Banknote,
  Check,
  ChevronDown,
  Loader2,
  MousePointerClick,
  Percent,
  Receipt,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { AppDateRangeFilter } from "@/components/app"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  campaignPerformanceService,
  type CampaignObjectiveRow,
  type CampaignPerformancePlatformRow,
  type CampaignPerformanceSummary,
} from "@/features/campaigns/services/campaign-performance.service"
import {
  channelsPerformanceService,
  type ChannelName,
  type ChannelsTrendPoint,
} from "@/features/channels/services/channels-performance.service"

import {
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportTrendBadge,
} from "@/features/reports/components/ready-report-field"
import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  formatCurrencyCompact,
  TOOLTIP_STYLE,
} from "@/features/reports/components/chart-constants"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatPlainNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    maximumFractionDigits: 0,
  })
}

function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from, to }
}

// "Google Ads" merges the 3 Google sub-platforms (Search/Display/YouTube) into one slice, the
// same merge channels-service.ts's own StorePlatformRow/ChannelRow already does -- the Channels
// page cares about one number per real ad account connection, not per campaign sub-type.
function mergePlatformLabel(platform: CampaignPerformancePlatformRow["platform"]): string {
  if (platform === "Google Search" || platform === "Google Display" || platform === "YouTube") {
    return "Google Ads"
  }
  return platform
}

const CHANNEL_NAMES: ChannelName[] = ["Google Ads", "Meta Ads", "TikTok Ads", "Snapchat"]
const CHANNEL_LINE_COLOR: Record<ChannelName, string> = {
  "Google Ads": CHART_COLORS[6],
  "Meta Ads": CHART_COLORS[3],
  "TikTok Ads": CHART_COLORS[0],
  Snapchat: CHART_COLORS[2],
}

// The 5 KPIs every chart on this tab can be switched between -- matches the 5 KPI cards above
// exactly, so a user who learns the card labels can map them onto any chart's picker. Cost is
// always the default (never Clicks), per the explicit ask.
type CampaignKpi = "spend" | "impressions" | "clicks" | "ctr" | "cpc"
const KPI_LIST: CampaignKpi[] = ["spend", "impressions", "clicks", "ctr", "cpc"]
const KPI_LABEL_KEY: Record<CampaignKpi, string> = {
  spend: "kpis.cost",
  impressions: "kpis.impressions",
  clicks: "kpis.clicks",
  ctr: "kpis.ctr",
  cpc: "kpis.cpc",
}
const KPI_COLOR: Record<CampaignKpi, string> = {
  spend: CHART_COLORS[0],
  clicks: CHART_COLORS[1],
  ctr: CHART_COLORS[2],
  impressions: CHART_COLORS[3],
  cpc: CHART_COLORS[6],
}

function formatKpiValue(kpi: CampaignKpi, value: number, locale: Locale, currency: string): string {
  switch (kpi) {
    case "spend":
      return `${formatPlainNumber(value, locale)} ${currency}`
    case "ctr":
      return `${value.toFixed(1)}%`
    case "cpc":
      return value.toFixed(2)
    default:
      return formatPlainNumber(value, locale)
  }
}

// Always derives ratio KPIs (ctr/cpc) from already-summed numerators/denominators, never an
// average of per-row ratios -- the same correctness rule the KPI cards' own summary totals
// follow (see performance-service.ts's getSummary).
function computeKpiValue(
  kpi: CampaignKpi,
  spend: number,
  clicks: number,
  impressions: number
): number {
  switch (kpi) {
    case "spend":
      return spend
    case "impressions":
      return impressions
    case "clicks":
      return clicks
    case "ctr":
      return impressions > 0 ? (clicks / impressions) * 100 : 0
    case "cpc":
      return clicks > 0 ? spend / clicks : 0
  }
}

// Same trigger/panel hex styling as AppSearchableSelect (src/components/app/searchable-select.tsx)
// -- a bespoke dropdown rather than reusing that component directly, since it forces a search
// field on at a 5-option list and has no multi-select mode, which this KPI picker needs for the
// daily trend chart.
const KPI_DROPDOWN_TRIGGER_CLASS =
  "flex h-9 min-w-[150px] cursor-pointer items-center gap-2 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12px] font-semibold text-[#0b1738] transition-colors hover:border-[#c4d5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/35"

function KpiDropdown({
  selected,
  multi,
  onChange,
}: {
  selected: CampaignKpi[]
  multi: boolean
  onChange: (next: CampaignKpi[]) => void
}) {
  const t = useTranslations("dashboard.campaignsSummary")
  const [open, setOpen] = useState(false)

  function handlePick(kpi: CampaignKpi) {
    if (!multi) {
      onChange([kpi])
      setOpen(false)
      return
    }
    if (selected.includes(kpi)) {
      if (selected.length === 1) return
      onChange(selected.filter((item) => item !== kpi))
    } else {
      onChange([...selected, kpi])
    }
  }

  const triggerLabel =
    selected.length === 1
      ? t(KPI_LABEL_KEY[selected[0]])
      : t("kpis.multipleSelected", { count: selected.length })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={KPI_DROPDOWN_TRIGGER_CLASS}>
          <span className="min-w-0 flex-1 truncate text-right">{triggerLabel}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[#95a4bd] transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="start"
        sideOffset={6}
        className="w-[180px] rounded-[14px] border-[#e1e7f0] p-1.5 shadow-[0_12px_32px_rgba(11,23,56,0.12)]"
      >
        <div className="flex flex-col gap-0.5">
          {KPI_LIST.map((kpi) => {
            const active = selected.includes(kpi)
            return (
              <button
                key={kpi}
                type="button"
                onClick={() => handlePick(kpi)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-right text-[12.5px] transition-colors",
                  active
                    ? "bg-[#eaf1ff] font-bold text-[#0b1738]"
                    : "text-[#0b1738] hover:bg-[#f4f7fc]"
                )}
              >
                {t(KPI_LABEL_KEY[kpi])}
                {active ? (
                  <Check className="size-3.5 shrink-0 text-[#2878ff]" strokeWidth={3} />
                ) : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function CampaignsSummaryDashboard() {
  const t = useTranslations("dashboard.campaignsSummary")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange)

  const [summary, setSummary] = useState<CampaignPerformanceSummary | null>(null)
  const [platforms, setPlatforms] = useState<CampaignPerformancePlatformRow[]>([])
  const [objectives, setObjectives] = useState<CampaignObjectiveRow[]>([])
  const [trend, setTrend] = useState<ChannelsTrendPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [trendKpis, setTrendKpis] = useState<CampaignKpi[]>(["spend"])
  const [platformKpi, setPlatformKpi] = useState<CampaignKpi>("spend")
  const [objectiveKpi, setObjectiveKpi] = useState<CampaignKpi>("spend")
  const [platformTrendKpi, setPlatformTrendKpi] = useState<CampaignKpi>("spend")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      const range = dateRange?.from
        ? { from: dateRange.from, to: dateRange.to ?? dateRange.from }
        : defaultRange()
      const params = {
        startDate: range.from!.toISOString().slice(0, 10),
        endDate: range.to!.toISOString().slice(0, 10),
      }
      try {
        const [summaryRes, platformsRes, objectivesRes, trendRes] = await Promise.all([
          campaignPerformanceService.getSummary(params),
          campaignPerformanceService.getPlatformBreakdown(params),
          campaignPerformanceService.getObjectiveBreakdown(params),
          channelsPerformanceService.getPerformanceTrend(params),
        ])
        if (cancelled) return
        setSummary(summaryRes)
        setPlatforms(platformsRes.items)
        setObjectives(objectivesRes.items)
        setTrend(trendRes.items)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [dateRange])

  function bucketLabel(bucketStart: string): string {
    return new Date(bucketStart).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      day: "numeric",
      month: "short",
    })
  }

  const trendData = trend.map((point) => {
    const spend = CHANNEL_NAMES.reduce((sum, name) => sum + (point.spendByChannel[name] ?? 0), 0)
    const clicks = CHANNEL_NAMES.reduce((sum, name) => sum + (point.clicksByChannel[name] ?? 0), 0)
    const impressions = CHANNEL_NAMES.reduce(
      (sum, name) => sum + (point.impressionsByChannel[name] ?? 0),
      0
    )
    return {
      label: bucketLabel(point.bucketStart),
      spend,
      impressions,
      clicks,
      ctr: computeKpiValue("ctr", spend, clicks, impressions),
      cpc: computeKpiValue("cpc", spend, clicks, impressions),
    }
  })

  const platformTrendData = trend.map((point) => {
    const row: Record<string, string | number> = { label: bucketLabel(point.bucketStart) }
    for (const name of CHANNEL_NAMES) {
      row[name] = computeKpiValue(
        platformTrendKpi,
        point.spendByChannel[name] ?? 0,
        point.clicksByChannel[name] ?? 0,
        point.impressionsByChannel[name] ?? 0
      )
    }
    return row
  })

  const platformBreakdown = (() => {
    const totals = new Map<string, { spend: number; impressions: number; clicks: number }>()
    for (const row of platforms) {
      const label = mergePlatformLabel(row.platform)
      const existing = totals.get(label) ?? { spend: 0, impressions: 0, clicks: 0 }
      existing.spend += row.spend
      existing.impressions += row.impressions
      existing.clicks += row.clicks
      totals.set(label, existing)
    }
    const rows = [...totals.entries()].map(([label, row]) => ({
      label,
      value: computeKpiValue(platformKpi, row.spend, row.clicks, row.impressions),
    }))
    const total = rows.reduce((sum, row) => sum + row.value, 0)
    return rows
      .map((row) => ({ ...row, percentage: total > 0 ? (row.value / total) * 100 : 0 }))
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value)
  })()

  const objectiveBreakdown = (() => {
    const total = objectives.reduce((sum, row) => sum + row[objectiveKpi], 0)
    return objectives
      .map((row) => ({
        objective: row.objective,
        value: row[objectiveKpi],
        percentage: total > 0 ? (row[objectiveKpi] / total) * 100 : 0,
      }))
      .sort((left, right) => right.value - left.value)
  })()

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-4")}>
        <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {isLoading || !summary ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
            <ReadyReportKpiCard
              label={t("kpis.cost")}
              value={`${formatPlainNumber(summary.spend, locale)} ${currency}`}
              icon={Banknote}
              tone="rose"
              trailing={<ReadyReportTrendBadge changePercent={summary.spendChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.impressions")}
              value={formatPlainNumber(summary.impressions, locale)}
              icon={Receipt}
              tone="violet"
              trailing={<ReadyReportTrendBadge changePercent={summary.impressionsChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.clicks")}
              value={formatPlainNumber(summary.clicks, locale)}
              icon={MousePointerClick}
              tone="blue"
              trailing={<ReadyReportTrendBadge changePercent={summary.clicksChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.ctr")}
              value={`${summary.ctr.toFixed(1)}%`}
              icon={Percent}
              tone="emerald"
              trailing={<ReadyReportTrendBadge changePercent={summary.ctrChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.cpc")}
              value={summary.cpc.toFixed(2)}
              icon={Wallet}
              tone="amber"
              trailing={<ReadyReportTrendBadge changePercent={summary.cpcChangePct} />}
            />
          </div>

          <div className={cn(PANEL, "p-4")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("trendTitle")}</h3>
              <KpiDropdown selected={trendKpis} multi onChange={setTrendKpis} />
            </div>
            {trendData.length === 0 ? (
              <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <defs>
                      {trendKpis.map((kpi) => (
                        <linearGradient
                          key={kpi}
                          id={`campaignsTrendFill-${kpi}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={KPI_COLOR[kpi]} stopOpacity={0.26} />
                          <stop offset="100%" stopColor={KPI_COLOR[kpi]} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value: number) => formatCurrencyCompact(value)}
                      tick={AXIS_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(
                        value: number,
                        name: string,
                        props: { dataKey?: string | number }
                      ) => [
                        formatKpiValue(
                          (props.dataKey as CampaignKpi) ?? "spend",
                          value,
                          locale,
                          currency
                        ),
                        name,
                      ]}
                    />
                    {trendKpis.length > 1 ? <Legend wrapperStyle={{ fontSize: 11.5 }} /> : null}
                    {trendKpis.map((kpi) => (
                      <Area
                        key={kpi}
                        type="monotone"
                        dataKey={kpi}
                        name={t(KPI_LABEL_KEY[kpi])}
                        stroke={KPI_COLOR[kpi]}
                        strokeWidth={2}
                        fill={`url(#campaignsTrendFill-${kpi})`}
                        dot={{ r: 3, fill: KPI_COLOR[kpi], strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn(PANEL, "p-4")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("platformsTitle")}</h3>
                <KpiDropdown
                  selected={[platformKpi]}
                  multi={false}
                  onChange={(next) => setPlatformKpi(next[0])}
                />
              </div>
              {platformBreakdown.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {platformBreakdown.map((row, index) => (
                    <div key={row.label} className="flex items-center gap-2 text-[12px]">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className={cn("min-w-0 flex-1 truncate font-semibold", HEADING)}>
                        {row.label}
                      </span>
                      <span className={cn("shrink-0 font-bold", HEADING)}>
                        {row.percentage.toFixed(0)}%
                      </span>
                      <span className={cn("shrink-0 w-24 text-right", MUTED)}>
                        {formatKpiValue(platformKpi, row.value, locale, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={cn(PANEL, "p-4")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("objectivesTitle")}</h3>
                <KpiDropdown
                  selected={[objectiveKpi]}
                  multi={false}
                  onChange={(next) => setObjectiveKpi(next[0])}
                />
              </div>
              {objectiveBreakdown.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {objectiveBreakdown.map((row) => (
                    <div key={row.objective} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className={cn("font-semibold", HEADING)}>
                          {t(`objectives.${row.objective}`)}
                        </span>
                        <span className={cn("font-bold", HEADING)}>
                          {row.percentage.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1f4f9]">
                        <div
                          className="h-full rounded-full bg-[#2878ff]"
                          style={{ width: `${Math.min(row.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={cn(PANEL, "p-4")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("platformTrendTitle")}</h3>
              <KpiDropdown
                selected={[platformTrendKpi]}
                multi={false}
                onChange={(next) => setPlatformTrendKpi(next[0])}
              />
            </div>
            {platformTrendData.length === 0 ? (
              <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={platformTrendData}
                    margin={{ top: 8, right: 4, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value: number) => formatCurrencyCompact(value)}
                      tick={AXIS_TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [
                        formatKpiValue(platformTrendKpi, value, locale, currency),
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11.5 }} />
                    {CHANNEL_NAMES.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stroke={CHANNEL_LINE_COLOR[name]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
