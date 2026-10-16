"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { subDays } from "date-fns"
import { useLocale, useTranslations } from "next-intl"
import { CartesianGrid, Cell, Label, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import type { DateRange } from "react-day-picker"
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Megaphone,
  MousePointerClick,
  Percent,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"

import { AppButton, AppCard, AppDateRangeFilter, RelativeTime } from "@/components/app"
import { PlatformBadge, PLATFORM_ICON } from "@/components/platform-badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import {
  campaignPerformanceService,
  type CampaignPerformancePlatformRow,
  type CampaignPerformanceRow,
  type CampaignPerformanceSummary,
} from "@/features/campaigns/services/campaign-performance.service"
import {
  PLATFORM_NODE_CONFIG,
  type PlatformNodeKey,
} from "@/features/campaigns/components/campaign-metrics"
import {
  channelsPerformanceService,
  type ChannelsTrendPoint,
} from "@/features/channels/services/channels-performance.service"
import { useConnectionsCenter } from "@/features/integrations/hooks/use-connections-center"

// Mirrors connections-overview.tsx's own CONNECTION_STATUS_META -- kept as a small local copy
// rather than importing from that file, since it isn't exported and this card only needs the
// label/className, not the rest of that component's surface. Label is resolved via t() at render
// time (keyed by `key` below) rather than stored here, since this is module scope and can't call
// the translation hook.
const CONNECTION_STATUS_META: Record<string, { key: string; className: string }> = {
  connected: { key: "connected", className: "bg-emerald-50 text-emerald-600" },
  valid: { key: "connected", className: "bg-emerald-50 text-emerald-600" },
  authorized: { key: "connected", className: "bg-emerald-50 text-emerald-600" },
  paused: { key: "paused", className: "bg-amber-50 text-amber-600" },
  disconnected: { key: "error", className: "bg-rose-50 text-rose-600" },
  error: { key: "error", className: "bg-rose-50 text-rose-600" },
  draft: { key: "draft", className: "bg-slate-50 text-slate-600" },
  syncing: { key: "syncing", className: "bg-blue-50 text-blue-600" },
}

const KPI_TONE_CLASSNAMES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
} as const

type KpiTone = keyof typeof KPI_TONE_CLASSNAMES

interface HomeKpi {
  label: string
  value: string
  unit: string
  deltaPct: number | null
  icon: typeof Wallet
  tone: KpiTone
}

// key resolved via t() at render time, same reasoning as CONNECTION_STATUS_META above.
const QUICK_ACTIONS = [
  { key: "newCampaign", icon: Megaphone, href: ROUTES.campaignsCreate },
  { key: "customReport", icon: CreditCard, href: ROUTES.reports },
  { key: "syncAllChannels", icon: RefreshCcw, href: ROUTES.integrations },
  { key: "addChannel", icon: Plus, href: ROUTES.integrationsNew },
] as const

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

function KpiCard({ kpi }: { kpi: HomeKpi }) {
  const t = useTranslations("dashboard")
  const Icon = kpi.icon
  const trend = kpi.deltaPct === null ? null : kpi.deltaPct >= 0 ? "up" : "down"
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        {kpi.value}
        {kpi.unit ? (
          <span className="ms-1 text-sm font-medium text-muted-foreground">{kpi.unit}</span>
        ) : null}
      </p>
      {trend ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              trend === "up" ? "text-emerald-600" : "text-rose-600"
            )}
          >
            <TrendIcon className="size-3.5" />
            {kpi.deltaPct !== null
              ? `${kpi.deltaPct > 0 ? "+" : ""}${kpi.deltaPct.toFixed(1)}%`
              : ""}
          </span>
          <span className="text-muted-foreground">{t("kpis.vsPreviousPeriod")}</span>
        </div>
      ) : null}
    </AppCard>
  )
}

// Groups the backend's per-CampaignPerformancePlatform rows into one row per PlatformNodeKey
// (e.g. "Google" combines Search + Display) -- same grouping campaign-dashboard-screen.tsx's own
// groupPlatformRows() does, reimplemented here rather than imported since that function isn't
// exported from a shared module.
function groupPlatformRows(rows: CampaignPerformancePlatformRow[]) {
  return (Object.keys(PLATFORM_NODE_CONFIG) as PlatformNodeKey[])
    .map((platformNodeKey) => {
      const allowed = PLATFORM_NODE_CONFIG[platformNodeKey].campaignPlatforms
      const subset = rows.filter((row) => allowed.includes(row.platform))
      const spend = subset.reduce((sum, row) => sum + row.spend, 0)
      const revenue = subset.reduce((sum, row) => sum + row.revenue, 0)
      const conversions = subset.reduce((sum, row) => sum + row.conversions, 0)
      const impressions = subset.reduce((sum, row) => sum + row.impressions, 0)
      const clicks = subset.reduce((sum, row) => sum + row.clicks, 0)
      const activeCampaigns = subset.reduce((sum, row) => sum + row.activeCampaigns, 0)

      return {
        hasCampaigns: subset.length > 0,
        platformNodeKey,
        spend,
        revenue,
        conversions,
        impressions,
        activeCampaigns,
        roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      }
    })
    .filter((row) => row.hasCampaigns)
}

export default function HomeDashboard() {
  const t = useTranslations("dashboard")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 29), to: today }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CampaignPerformanceSummary | null>(null)
  const [platformRows, setPlatformRows] = useState<CampaignPerformancePlatformRow[]>([])
  const [campaignRows, setCampaignRows] = useState<CampaignPerformanceRow[]>([])
  const [trendPoints, setTrendPoints] = useState<ChannelsTrendPoint[]>([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const { records: connectionRecords, isLoading: connectionsLoading } = useConnectionsCenter()

  const startDate = dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : undefined
  const endDate = (dateRange?.to ?? dateRange?.from)?.toISOString().slice(0, 10)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const [summaryResult, platformsResult, campaignsResult, trendResult] = await Promise.all([
          campaignPerformanceService.getSummary({ startDate, endDate }),
          campaignPerformanceService.getPlatformBreakdown({ startDate, endDate }),
          campaignPerformanceService.listCampaigns({ startDate, endDate, pageSize: 100 }),
          channelsPerformanceService.getPerformanceTrend({ startDate, endDate }),
        ])

        if (cancelled) return
        setSummary(summaryResult)
        setPlatformRows(platformsResult.items)
        setCampaignRows(campaignsResult.items)
        setTrendPoints(trendResult.items)
        setLastUpdatedAt(new Date().toISOString())
      } catch (error) {
        if (cancelled) return
        // Empty string is the sentinel for "no specific message, use the generic translated
        // fallback at render time" -- t() can't be called from inside a catch handler's closure.
        setLoadError(error instanceof Error ? error.message : "")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate])

  const kpis: HomeKpi[] = useMemo(() => {
    if (!summary) return []
    return [
      {
        label: t("kpis.spend"),
        value: formatMoney(summary.spend, locale),
        unit: "SAR",
        deltaPct: summary.spendChangePct,
        icon: Wallet,
        tone: "blue",
      },
      {
        label: t("kpis.revenue"),
        value: formatMoney(summary.revenue, locale),
        unit: "SAR",
        deltaPct: summary.revenueChangePct,
        icon: TrendingUp,
        tone: "green",
      },
      {
        label: t("kpis.roas"),
        value: summary.roas.toFixed(2),
        unit: "",
        deltaPct: summary.roasChangePct,
        icon: Target,
        tone: "violet",
      },
      {
        label: t("kpis.conversions"),
        value: formatMoney(summary.conversions, locale),
        unit: "",
        deltaPct: summary.conversionsChangePct,
        icon: Users,
        tone: "orange",
      },
      {
        label: t("kpis.cpa"),
        value: formatMoney(summary.cpa, locale),
        unit: "SAR",
        deltaPct: summary.cpaChangePct,
        icon: MousePointerClick,
        tone: "rose",
      },
      {
        label: t("kpis.conversionRate"),
        value: summary.conversionRate.toFixed(1),
        unit: "%",
        deltaPct: summary.conversionRateChangePct,
        icon: Percent,
        tone: "indigo",
      },
    ]
  }, [summary, t, locale])

  const groupedPlatformRows = useMemo(() => groupPlatformRows(platformRows), [platformRows])

  const channelBreakdown = useMemo(() => {
    const totalSpend = groupedPlatformRows.reduce((sum, row) => sum + row.spend, 0)
    return groupedPlatformRows
      .filter((row) => row.spend > 0)
      .map((row) => ({
        channel: row.platformNodeKey,
        label: row.platformNodeKey,
        value: row.spend,
        share: totalSpend > 0 ? Math.round((row.spend / totalSpend) * 100) : 0,
        color: PLATFORM_ICON[row.platformNodeKey]?.hex ?? "#94a3b8",
      }))
  }, [groupedPlatformRows])
  const totalChannelSpend = channelBreakdown.reduce((sum, item) => sum + item.value, 0)

  const channelChartConfig = channelBreakdown.reduce(
    (config, item) => {
      config[item.channel] = { label: item.label, color: item.color }
      return config
    },
    { value: { label: t("charts.spendLabel") } } as ChartConfig
  )

  const trendChartData = useMemo(
    () =>
      trendPoints.map((point) => ({
        date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
          new Date(point.bucketStart)
        ),
        ...point.spendByChannel,
      })),
    [trendPoints, locale]
  )
  const trendChannelNames = useMemo(() => {
    const names = new Set<string>()
    for (const point of trendPoints) {
      for (const name of Object.keys(point.spendByChannel)) names.add(name)
    }
    return [...names]
  }, [trendPoints])
  const trendChartConfig = trendChannelNames.reduce((config, name) => {
    config[name] = { label: name, color: PLATFORM_ICON[name]?.hex ?? "#94a3b8" }
    return config
  }, {} as ChartConfig)

  const topCampaigns = useMemo(
    () => [...campaignRows].sort((a, b) => b.roas - a.roas).slice(0, 4),
    [campaignRows]
  )

  const quickActions = useMemo(
    () => QUICK_ACTIONS.map((action) => ({ ...action, label: t(`quickActions.${action.key}`) })),
    [t]
  )

  // Every card below states a real number already fetched on this page -- there is no AI
  // recommendation service wired here (the app's only "AI" service is mock data), so nothing is
  // predicted or scored. Mirrors campaign-dashboard-screen.tsx's own recommendations pattern.
  const insights = useMemo(() => {
    const cards: Array<{
      icon: typeof TrendingUp
      tone: string
      title: string
      description: string
    }> = []

    const bestRoas = [...groupedPlatformRows]
      .filter((row) => row.roas > 0)
      .sort((a, b) => b.roas - a.roas)[0]
    if (bestRoas) {
      cards.push({
        icon: TrendingUp,
        tone: "bg-emerald-50 text-emerald-600",
        title: t("insights.bestRoasTitle", { platform: bestRoas.platformNodeKey }),
        description: t("insights.bestRoasDescription", { roas: bestRoas.roas.toFixed(2) }),
      })
    }

    const dormant = groupedPlatformRows.find(
      (row) => row.activeCampaigns === 0 && row.impressions > 0
    )
    if (dormant) {
      cards.push({
        icon: RefreshCcw,
        tone: "bg-amber-50 text-amber-600",
        title: t("insights.dormantTitle", { platform: dormant.platformNodeKey }),
        description: t("insights.dormantDescription", {
          impressions: dormant.impressions.toLocaleString(locale),
        }),
      })
    }

    const weakestCtr = [...groupedPlatformRows]
      .filter((row) => row.impressions > 0)
      .sort((a, b) => a.ctr - b.ctr)[0]
    if (weakestCtr) {
      cards.push({
        icon: Target,
        tone: "bg-blue-50 text-blue-600",
        title: t("insights.weakCtrTitle"),
        description: t("insights.weakCtrDescription", {
          platform: weakestCtr.platformNodeKey,
          ctr: weakestCtr.ctr.toFixed(2),
        }),
      })
    }

    return cards
  }, [groupedPlatformRows, t, locale])

  return (
    <div className="space-y-4" dir={localeDirection(locale as Locale)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("subheading")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t("lastUpdated")} <RelativeTime value={lastUpdatedAt} fallback="—" />
          </div>
        </div>
      </div>

      {loadError !== null ? (
        <AppCard className="rounded-2xl border-destructive/40 p-5 text-sm text-destructive">
          {loadError || t("loadError")}
        </AppCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {isLoading && kpis.length === 0
          ? Array.from({ length: 6 }).map((_, index) => (
              <AppCard key={index} state="loading" className="rounded-2xl border-border/60 p-5" />
            ))
          : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
        <AppCard title={t("charts.spendTrend")} className="rounded-2xl border-border/60 shadow-sm">
          {trendChartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("empty.trend")}</p>
          ) : (
            <ChartContainer config={trendChartConfig} className="h-72 w-full" dir="ltr">
              <LineChart data={trendChartData} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} width={50} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                {trendChannelNames.map((name) => (
                  <Line
                    key={name}
                    dataKey={name}
                    type="monotone"
                    stroke={PLATFORM_ICON[name]?.hex ?? "#94a3b8"}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </AppCard>

        <AppCard
          title={t("charts.channelPerformance")}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {channelBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("empty.channel")}</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ChartContainer
                config={channelChartConfig}
                className="mx-auto aspect-square h-48 w-full"
                dir="ltr"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={channelBreakdown}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={80}
                    strokeWidth={3}
                  >
                    {channelBreakdown.map((entry) => (
                      <Cell key={entry.channel} fill={entry.color} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !("cx" in viewBox)) return null
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) - 8}
                              className="fill-foreground text-xl font-bold"
                            >
                              {totalChannelSpend.toLocaleString(locale)}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 14}
                              className="fill-muted-foreground text-xs"
                            >
                              {t("charts.totalSpend")} SAR
                            </tspan>
                          </text>
                        )
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="w-full space-y-2">
                {channelBreakdown.map((item) => (
                  <div key={item.channel} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-foreground">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{item.value.toLocaleString(locale)} SAR</span>
                      <span className="font-medium text-foreground">{item.share}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AppCard>
      </div>

      <AppCard
        title={t("campaigns.topPerforming")}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        {topCampaigns.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty.campaigns")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground">
                  <th className="pb-3 text-start font-medium">{t("campaigns.table.campaign")}</th>
                  <th className="pb-3 text-start font-medium">{t("campaigns.table.revenue")}</th>
                  <th className="pb-3 text-start font-medium">{t("campaigns.table.spend")}</th>
                  <th className="pb-3 text-start font-medium">{t("campaigns.table.roas")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topCampaigns.map((campaign) => {
                  const progress = Math.min(100, (campaign.roas / 7) * 100)
                  return (
                    <tr key={campaign.id}>
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <PlatformBadge platform={campaign.platform} className="size-8" />
                          <span className="font-medium text-foreground">{campaign.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-foreground">
                        {formatMoney(campaign.revenue, locale)} SAR
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatMoney(campaign.spend, locale)} SAR
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-10 font-medium text-foreground">
                            {campaign.roas.toFixed(2)}x
                          </span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-emerald-500"
                              style={{ width: `${progress}%` }}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AppCard>

      <AppCard className="rounded-2xl border-border/60 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{t("insights.title")}</p>
              <p className="text-sm text-muted-foreground">{t("insights.subtitle")}</p>
            </div>
          </div>
          <AppButton variant="ghost" size="sm" asChild>
            <Link href={ROUTES.campaigns}>{t("campaigns.viewAll")}</Link>
          </AppButton>
        </div>

        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("insights.empty")}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {insights.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/60 bg-background/60 p-4"
                >
                  <span
                    className={cn("flex size-9 items-center justify-center rounded-lg", item.tone)}
                  >
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
              )
            })}
          </div>
        )}
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AppCard title={t("quickActions.title")} className="rounded-2xl border-border/60 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-4 text-center transition-colors hover:bg-muted/60"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </Link>
              )
            })}
          </div>
        </AppCard>

        <AppCard title={t("integrations.title")} className="rounded-2xl border-border/60 shadow-sm">
          {connectionsLoading && connectionRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tCommon("loading")}</p>
          ) : connectionRecords.length === 0 ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">{t("integrations.empty")}</p>
              <AppButton size="sm" asChild>
                <Link href={ROUTES.integrationsNew}>{t("integrations.add")}</Link>
              </AppButton>
            </div>
          ) : (
            <div className="space-y-3">
              {connectionRecords.slice(0, 5).map((record) => {
                const statusEntry = CONNECTION_STATUS_META[record.connection.status]
                const statusLabel = statusEntry
                  ? t(`connectionStatus.${statusEntry.key}`)
                  : record.connection.status
                const statusClassName = statusEntry?.className ?? "bg-slate-50 text-slate-600"
                return (
                  <div key={record.connectorId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <PlatformBadge platform={record.platformName} className="size-8" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{record.platformName}</p>
                        <p className="text-xs text-muted-foreground">
                          <RelativeTime
                            value={record.lastSyncAt}
                            fallback={t("integrations.notSyncedYet")}
                          />
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        statusClassName
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </AppCard>
      </div>
    </div>
  )
}
