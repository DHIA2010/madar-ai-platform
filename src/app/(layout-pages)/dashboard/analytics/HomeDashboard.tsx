"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { subDays } from "date-fns"
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
// label/className, not the rest of that component's surface.
const CONNECTION_STATUS_META: Record<string, { label: string; className: string }> = {
  connected: { label: "متصل", className: "bg-emerald-50 text-emerald-600" },
  valid: { label: "متصل", className: "bg-emerald-50 text-emerald-600" },
  authorized: { label: "متصل", className: "bg-emerald-50 text-emerald-600" },
  paused: { label: "متوقف", className: "bg-amber-50 text-amber-600" },
  disconnected: { label: "خطأ", className: "bg-rose-50 text-rose-600" },
  error: { label: "خطأ", className: "bg-rose-50 text-rose-600" },
  draft: { label: "مسودة", className: "bg-slate-50 text-slate-600" },
  syncing: { label: "قيد المزامنة", className: "bg-blue-50 text-blue-600" },
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

const quickActions = [
  { label: "إنشاء حملة جديدة", icon: Megaphone, href: ROUTES.campaignsCreate },
  { label: "تقرير مخصص", icon: CreditCard, href: ROUTES.reports },
  { label: "مزامنة جميع القنوات", icon: RefreshCcw, href: ROUTES.integrations },
  { label: "إضافة قناة جديدة", icon: Plus, href: ROUTES.integrationsNew },
]

function formatMoney(value: number) {
  return new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(value)
}

function KpiCard({ kpi }: { kpi: HomeKpi }) {
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
          <span className="text-muted-foreground">عن الفترة السابقة</span>
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
        setLoadError(error instanceof Error ? error.message : "تعذر تحميل بيانات لوحة التحكم.")
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
        label: "إجمالي الإنفاق",
        value: formatMoney(summary.spend),
        unit: "SAR",
        deltaPct: summary.spendChangePct,
        icon: Wallet,
        tone: "blue",
      },
      {
        label: "إجمالي الإيرادات",
        value: formatMoney(summary.revenue),
        unit: "SAR",
        deltaPct: summary.revenueChangePct,
        icon: TrendingUp,
        tone: "green",
      },
      {
        label: "ROAS",
        value: summary.roas.toFixed(2),
        unit: "",
        deltaPct: summary.roasChangePct,
        icon: Target,
        tone: "violet",
      },
      {
        label: "إجمالي التحويلات",
        value: formatMoney(summary.conversions),
        unit: "",
        deltaPct: summary.conversionsChangePct,
        icon: Users,
        tone: "orange",
      },
      {
        label: "متوسط CPA",
        value: formatMoney(summary.cpa),
        unit: "SAR",
        deltaPct: summary.cpaChangePct,
        icon: MousePointerClick,
        tone: "rose",
      },
      {
        label: "معدل التحويل",
        value: summary.conversionRate.toFixed(1),
        unit: "%",
        deltaPct: summary.conversionRateChangePct,
        icon: Percent,
        tone: "indigo",
      },
    ]
  }, [summary])

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
    { value: { label: "الإنفاق" } } as ChartConfig
  )

  const trendChartData = useMemo(
    () =>
      trendPoints.map((point) => ({
        date: new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" }).format(
          new Date(point.bucketStart)
        ),
        ...point.spendByChannel,
      })),
    [trendPoints]
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
        title: `${bestRoas.platformNodeKey} يحقق أفضل عائد`,
        description: `بمعدل ${bestRoas.roas.toFixed(2)}x عائد على الإنفاق في هذه الفترة.`,
      })
    }

    const dormant = groupedPlatformRows.find(
      (row) => row.activeCampaigns === 0 && row.impressions > 0
    )
    if (dormant) {
      cards.push({
        icon: RefreshCcw,
        tone: "bg-amber-50 text-amber-600",
        title: `لا حملات نشطة على ${dormant.platformNodeKey}`,
        description: `${dormant.impressions.toLocaleString()} ظهور مسجّل دون أي حملة نشطة حالياً.`,
      })
    }

    const weakestCtr = [...groupedPlatformRows]
      .filter((row) => row.impressions > 0)
      .sort((a, b) => a.ctr - b.ctr)[0]
    if (weakestCtr) {
      cards.push({
        icon: Target,
        tone: "bg-blue-50 text-blue-600",
        title: "فرصة لتحسين الاستهداف",
        description: `${weakestCtr.platformNodeKey} يسجل أدنى معدل نقر (${weakestCtr.ctr.toFixed(2)}%).`,
      })
    }

    return cards
  }, [groupedPlatformRows])

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الرئيسية</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على أداء متجرك التسويقي</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            آخر تحديث: <RelativeTime value={lastUpdatedAt} fallback="—" />
          </div>
        </div>
      </div>

      {loadError ? (
        <AppCard className="rounded-2xl border-destructive/40 p-5 text-sm text-destructive">
          {loadError}
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
        <AppCard
          title="اتجاه الإنفاق حسب القناة"
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {trendChartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              لا توجد بيانات كافية لهذه الفترة.
            </p>
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

        <AppCard title="الأداء حسب القناة" className="rounded-2xl border-border/60 shadow-sm">
          {channelBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
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
                              {totalChannelSpend.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 14}
                              className="fill-muted-foreground text-xs"
                            >
                              SAR إجمالي الإنفاق
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
                      <span>{item.value.toLocaleString()} SAR</span>
                      <span className="font-medium text-foreground">{item.share}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AppCard>
      </div>

      <AppCard title="أفضل الحملات أداءً" className="rounded-2xl border-border/60 shadow-sm">
        {topCampaigns.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            لا توجد حملات لهذه الفترة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground">
                  <th className="pb-3 text-start font-medium">الحملة</th>
                  <th className="pb-3 text-start font-medium">الإيرادات</th>
                  <th className="pb-3 text-start font-medium">الإنفاق</th>
                  <th className="pb-3 text-start font-medium">ROAS</th>
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
                      <td className="py-3 text-foreground">{formatMoney(campaign.revenue)} SAR</td>
                      <td className="py-3 text-muted-foreground">
                        {formatMoney(campaign.spend)} SAR
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
              <p className="font-semibold text-foreground">ملاحظات على أدائك</p>
              <p className="text-sm text-muted-foreground">
                نقاط محسوبة مباشرة من أرقام حسابك الحالية
              </p>
            </div>
          </div>
          <AppButton variant="ghost" size="sm" asChild>
            <Link href={ROUTES.campaigns}>عرض الحملات</Link>
          </AppButton>
        </div>

        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            لا توجد بيانات كافية لعرض ملاحظات لهذه الفترة.
          </p>
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
        <AppCard title="إجراءات سريعة" className="rounded-2xl border-border/60 shadow-sm">
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

        <AppCard title="حالة التكاملات" className="rounded-2xl border-border/60 shadow-sm">
          {connectionsLoading && connectionRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : connectionRecords.length === 0 ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">لا توجد تكاملات متصلة بعد.</p>
              <AppButton size="sm" asChild>
                <Link href={ROUTES.integrationsNew}>إضافة تكامل</Link>
              </AppButton>
            </div>
          ) : (
            <div className="space-y-3">
              {connectionRecords.slice(0, 5).map((record) => {
                const statusMeta = CONNECTION_STATUS_META[record.connection.status] ?? {
                  label: record.connection.status,
                  className: "bg-slate-50 text-slate-600",
                }
                return (
                  <div key={record.connectorId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <PlatformBadge platform={record.platformName} className="size-8" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{record.platformName}</p>
                        <p className="text-xs text-muted-foreground">
                          <RelativeTime value={record.lastSyncAt} fallback="لم تتم المزامنة بعد" />
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        statusMeta.className
                      )}
                    >
                      {statusMeta.label}
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
