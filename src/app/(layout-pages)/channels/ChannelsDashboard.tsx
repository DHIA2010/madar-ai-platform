"use client"

import { useEffect, useMemo, useState } from "react"
import { endOfMonth, startOfMonth, subDays, subMonths } from "date-fns"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Layers,
  MousePointerClick,
  Package,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/currency"

import { useWorkspace } from "@/features/workspace"

import {
  AppButton,
  AppCard,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"
import { PLATFORM_ICON, PlatformBadge } from "@/components/platform-badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import {
  channelsPerformanceService,
  type ChannelAlert,
  type ChannelHealth,
  type ChannelRow,
  type ChannelsSummary,
  type ChannelsTrendPoint,
  type StorePlatformRow,
  type TopProductRow,
} from "@/features/channels/services/channels-performance.service"

function formatPlainNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatChangePct(value: number | null) {
  if (value === null) return null
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

// Not the generic "up=good" rule -- a lower CPA is the improvement, so its color logic is
// inverted relative to every other KPI here (spend/revenue/conversions/roas where up is good).
function isGoodDelta(value: number, invert: boolean) {
  return invert ? value <= 0 : value >= 0
}

function formatRelativeTimeAr(value: string | null): string {
  if (!value) return "لم تتم المزامنة بعد"
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return "لم تتم المزامنة بعد"
  const diffMinutes = Math.floor((Date.now() - target.getTime()) / 60000)
  if (diffMinutes < 1) return "قبل لحظات"
  if (diffMinutes < 60) return `قبل ${diffMinutes} دقيقة`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `قبل ${diffHours} ساعة`
  const diffDays = Math.floor(diffHours / 24)
  return `قبل ${diffDays} يوم`
}

const HEALTH_META: Record<ChannelHealth, { label: string; tone: string }> = {
  healthy: { label: "ممتاز", tone: "text-emerald-600" },
  stale: { label: "جيد", tone: "text-amber-600" },
  failed: { label: "خطأ في الاتصال", tone: "text-rose-600" },
  never_synced: { label: "لم تتم المزامنة", tone: "text-slate-500" },
}

interface DateRangeOption {
  label: string
  startDate: string
  endDate: string
}

function getDateRangeOptions(): DateRangeOption[] {
  const today = new Date()
  const lastMonth = subMonths(today, 1)
  const toSql = (d: Date) => d.toISOString().slice(0, 10)

  return [
    { label: "أمس", startDate: toSql(subDays(today, 1)), endDate: toSql(subDays(today, 1)) },
    { label: "آخر 7 أيام", startDate: toSql(subDays(today, 6)), endDate: toSql(today) },
    { label: "آخر 30 يوماً", startDate: toSql(subDays(today, 29)), endDate: toSql(today) },
    {
      label: "هذا الشهر",
      startDate: toSql(startOfMonth(today)),
      endDate: toSql(endOfMonth(today)),
    },
    {
      label: "الشهر الماضي",
      startDate: toSql(startOfMonth(lastMonth)),
      endDate: toSql(endOfMonth(lastMonth)),
    },
    // No unbounded query on the backend (matches the Campaigns page's own "All Time" preset) --
    // 2018 is the earliest selectable year across this app's other date pickers.
    { label: "كل الوقت", startDate: toSql(new Date(2018, 0, 1)), endDate: toSql(today) },
  ]
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeOption
  onChange: (next: DateRangeOption) => void
}) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => getDateRangeOptions(), [])

  return (
    <AppPopover open={open} onOpenChange={setOpen}>
      <AppPopoverTrigger asChild>
        <AppButton variant="outline" size="sm" icon={<CalendarDays className="size-4" />}>
          {value.label}
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent align="start" className="w-48 rounded-2xl border border-border p-1.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            className={cn(
              "w-full rounded-xl px-3 py-2 text-start text-sm transition-colors hover:bg-muted",
              option.label === value.label
                ? "bg-sky-500/10 font-semibold text-sky-600"
                : "text-foreground"
            )}
            onClick={() => {
              onChange(option)
              setOpen(false)
            }}
          >
            {option.label}
          </button>
        ))}
      </AppPopoverContent>
    </AppPopover>
  )
}

interface KpiCardData {
  label: string
  value: string
  unit?: string
  footnote?: string
  changePct?: number | null
  invertTrend?: boolean
  icon: LucideIcon
  tone: "blue" | "green" | "violet" | "orange" | "rose" | "indigo"
}

const KPI_TONE_CLASSNAMES: Record<KpiCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
}

function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const Icon = kpi.icon
  const formatted = kpi.changePct === undefined ? null : formatChangePct(kpi.changePct)
  const good = kpi.changePct ? isGoodDelta(kpi.changePct, Boolean(kpi.invertTrend)) : true
  const TrendIcon = good ? ArrowUpRight : ArrowDownRight

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
      {kpi.footnote ? (
        <p className="mt-2 text-xs text-muted-foreground">{kpi.footnote}</p>
      ) : formatted ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good ? "text-emerald-600" : "text-rose-600"
            )}
          >
            <TrendIcon className="size-3.5" />
            {formatted}
          </span>
          <span className="text-muted-foreground">عن الفترة السابقة</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">لا توجد بيانات كافية للمقارنة</p>
      )}
    </AppCard>
  )
}

function ChannelSparkline({ channel }: { channel: ChannelRow }) {
  const entry = PLATFORM_ICON[channel.name]
  const values = channel.sparkline.length > 0 ? channel.sparkline : [0]
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(max - min, 1)

  return (
    <div className="mt-3 h-12 w-full">
      <svg viewBox="0 0 100 30" className="h-full w-full" preserveAspectRatio="none">
        <polyline
          points={values
            .map((value, index) => {
              const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 0
              const y = 28 - ((value - min) / range) * 26
              return `${x},${y}`
            })
            .join(" ")}
          fill="none"
          stroke={entry?.hex ?? "#94a3b8"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function TrendSparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.length > 0 ? values : [0]
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)

  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none">
      <polyline
        points={points
          .map((value, index) => {
            const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 0
            const y = 28 - ((value - min) / range) * 26
            return `${x},${y}`
          })
          .join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProductThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Package className="size-4 text-muted-foreground" />
      </span>
    )
  }

  return (
    // Real, unpredictable external URLs (Salla's own S3 bucket) -- not worth configuring
    // next.config.js remote patterns for a dashboard thumbnail that already has a graceful
    // fallback on load failure.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="size-8 shrink-0 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function ChannelCard({ channel }: { channel: ChannelRow }) {
  const health = HEALTH_META[channel.health]
  const { currentOrganization } = useWorkspace()
  const currency = currentOrganization?.currency ?? "USD"

  return (
    <AppCard className="rounded-2xl border-border/60 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PlatformBadge platform={channel.name} className="size-9" iconClassName="size-[18px]" />
          <span className="font-semibold text-foreground">{channel.name}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          متصل
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">ROAS</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {channel.roas > 0 ? channel.roas.toFixed(2) : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الإيرادات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatMoney(channel.revenue, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الإنفاق</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatMoney(channel.spend, currency)}
          </p>
        </div>
      </div>

      {channel.otherCurrencies.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {channel.otherCurrencies
            .map((entry) => `+ ${formatMoney(entry.spend, entry.currency)}`)
            .join("، ")}{" "}
          (غير محول — لا يوجد سعر صرف حقيقي)
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">التحويلات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {channel.conversions.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الحملات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.campaigns}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الصحة</p>
          <p
            className={cn(
              "mt-1 flex items-center justify-center gap-1 text-sm font-semibold",
              health.tone
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {health.label}
          </p>
        </div>
      </div>

      <ChannelSparkline channel={channel} />

      <div className="mt-2 border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">
          آخر مزامنة: {formatRelativeTimeAr(channel.lastSyncedAt)}
        </p>
      </div>
    </AppCard>
  )
}

function formatAlertMessage(alert: ChannelAlert): string {
  if (alert.type === "stale_sync") {
    if (alert.minutesSinceSync === undefined) return "لم تتم المزامنة بعد"
    if (alert.minutesSinceSync >= 60) {
      return `لم تتم المزامنة منذ ${Math.floor(alert.minutesSinceSync / 60)} ساعة`
    }
    return `لم تتم المزامنة منذ ${alert.minutesSinceSync} دقيقة`
  }
  const pct = alert.changePct !== undefined ? Math.abs(alert.changePct).toFixed(0) : "0"
  return alert.type === "spend_spike"
    ? `الإنفاق أعلى من المعدل المعتاد للقناة بنسبة ${pct}%`
    : `الإنفاق أقل من المعدل المعتاد للقناة بنسبة ${pct}%`
}

export default function ChannelsDashboard() {
  const [dateRange, setDateRange] = useState<DateRangeOption>(() => getDateRangeOptions()[2])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ChannelsSummary | null>(null)
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([])
  const [trendPoints, setTrendPoints] = useState<ChannelsTrendPoint[]>([])
  const [alerts, setAlerts] = useState<ChannelAlert[]>([])
  const [storeRows, setStoreRows] = useState<StorePlatformRow[]>([])
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const params = { startDate: dateRange.startDate, endDate: dateRange.endDate }
        const [
          summaryResult,
          breakdownResult,
          trendResult,
          alertsResult,
          storesResult,
          productsResult,
        ] = await Promise.all([
          channelsPerformanceService.getSummary(params),
          channelsPerformanceService.getChannelBreakdown(params),
          channelsPerformanceService.getPerformanceTrend(params),
          channelsPerformanceService.getAlerts(),
          channelsPerformanceService.getStoresBreakdown(params),
          channelsPerformanceService.getTopProducts(params),
        ])
        if (cancelled) return
        setSummary(summaryResult)
        setChannelRows(breakdownResult.items)
        setTrendPoints(trendResult.items)
        setAlerts(alertsResult.items)
        setStoreRows(storesResult.items)
        setTopProducts(productsResult.items)
      } catch (error) {
        console.error("Failed to load channel performance", error)
        if (!cancelled) {
          setLoadError("تعذر تحميل بيانات القنوات. الرجاء المحاولة مرة أخرى.")
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [dateRange])

  const otherCurrenciesFootnote = useMemo(() => {
    if (!summary || summary.otherCurrencies.length === 0) return undefined
    return (
      summary.otherCurrencies
        .map((entry) => `+ ${formatMoney(entry.spend, entry.currency)}`)
        .join("، ") + " غير محول"
    )
  }, [summary])

  const kpiCards = useMemo<KpiCardData[]>(() => {
    if (!summary) return []
    return [
      {
        label: "القنوات النشطة",
        value: `${summary.activeChannels}`,
        footnote: `من أصل ${summary.totalChannels} قنوات`,
        icon: Layers,
        tone: "indigo",
      },
      {
        label: "متوسط CPA",
        value: formatPlainNumber(summary.cpa),
        unit: summary.currency,
        changePct: summary.cpaChangePct,
        invertTrend: true,
        icon: MousePointerClick,
        tone: "rose",
      },
      {
        label: "إجمالي التحويلات",
        value: summary.conversions.toLocaleString(),
        changePct: summary.conversionsChangePct,
        icon: Users,
        tone: "orange",
      },
      {
        label: "عائد الإنفاق الإعلاني",
        value: summary.roas.toFixed(2),
        changePct: summary.roasChangePct,
        icon: Target,
        tone: "violet",
      },
      {
        label: "إجمالي الإيرادات",
        value: formatPlainNumber(summary.revenue),
        unit: summary.currency,
        footnote: otherCurrenciesFootnote,
        changePct: summary.revenueChangePct,
        icon: TrendingUp,
        tone: "green",
      },
      {
        label: "إجمالي الإنفاق",
        value: formatPlainNumber(summary.spend),
        unit: summary.currency,
        footnote: otherCurrenciesFootnote,
        changePct: summary.spendChangePct,
        icon: Wallet,
        tone: "blue",
      },
    ]
  }, [summary, otherCurrenciesFootnote])

  const channelComparison = useMemo(
    () =>
      [...channelRows].sort((a, b) => b.roas - a.roas).map((c) => ({ name: c.name, roas: c.roas })),
    [channelRows]
  )

  const spendBreakdown = useMemo(() => {
    const totalSpend = channelRows.reduce((sum, c) => sum + c.spend, 0)
    return channelRows
      .filter((c) => c.spend > 0)
      .map((c) => ({
        channel: c.name,
        label: c.name,
        value: c.spend,
        share: totalSpend > 0 ? Math.round((c.spend / totalSpend) * 100) : 0,
        color: PLATFORM_ICON[c.name]?.hex ?? "#94a3b8",
      }))
  }, [channelRows])
  const totalSpendForChart = spendBreakdown.reduce((sum, item) => sum + item.value, 0)

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

  const connectedWithSpend = useMemo(() => channelRows.filter((c) => c.spend > 0), [channelRows])
  const bestChannel = useMemo(
    () =>
      connectedWithSpend.length > 0
        ? [...connectedWithSpend].sort((a, b) => b.roas - a.roas)[0]
        : null,
    [connectedWithSpend]
  )
  const attentionChannel = useMemo(() => {
    const withCpa = connectedWithSpend
      .map((c) => ({ ...c, cpa: c.conversions > 0 ? c.spend / c.conversions : 0 }))
      .filter((c) => c.cpa > 0)
      .sort((a, b) => b.cpa - a.cpa)
    return withCpa[0] ?? null
  }, [connectedWithSpend])
  const attentionCpaDeltaPct =
    attentionChannel && summary && summary.cpa > 0
      ? Math.round(((attentionChannel.cpa - summary.cpa) / summary.cpa) * 1000) / 10
      : null

  const comparisonChartConfig = {
    roas: { label: "ROAS", color: "var(--chart-1)" },
  } satisfies ChartConfig
  const trendChartConfig = channelRows.reduce((config, channel) => {
    config[channel.name] = {
      label: channel.name,
      color: PLATFORM_ICON[channel.name]?.hex ?? "#94a3b8",
    }
    return config
  }, {} as ChartConfig)
  const spendChartConfig = spendBreakdown.reduce(
    (config, item) => {
      config[item.channel] = { label: item.label, color: item.color }
      return config
    },
    { value: { label: "الإنفاق" } } as ChartConfig
  )

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">القنوات</h1>
          <p className="text-sm text-muted-foreground">
            نظرة عامة على أداء قنواتك التسويقية ومنصات التجارة الإلكترونية
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {loadError ? (
        <AppCard className="rounded-2xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {loadError}
        </AppCard>
      ) : null}

      {!summary && isLoading ? (
        <AppCard className="rounded-2xl border-border/60 p-8 text-center text-sm text-muted-foreground">
          جارٍ تحميل بيانات القنوات...
        </AppCard>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {kpiCards.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

          {channelRows.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {channelRows.map((channel) => (
                <ChannelCard key={channel.name} channel={channel} />
              ))}
            </div>
          ) : (
            <AppCard className="rounded-2xl border-border/60 p-8 text-center text-sm text-muted-foreground">
              لا توجد قنوات إعلانية متصلة بعد.
            </AppCard>
          )}

          {channelRows.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-3">
              <AppCard
                title="مقارنة القنوات"
                subtitle="عائد الإنفاق الإعلاني (ROAS)"
                className="rounded-2xl border-border/60 shadow-sm"
              >
                <ChartContainer config={comparisonChartConfig} className="h-64 w-full" dir="ltr">
                  <BarChart data={channelComparison} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={80}
                    />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Bar dataKey="roas" radius={[0, 6, 6, 0]}>
                      {channelComparison.map((entry) => (
                        <Cell key={entry.name} fill={PLATFORM_ICON[entry.name]?.hex ?? "#2563eb"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </AppCard>

              <AppCard title="توزيع الإنفاق" className="rounded-2xl border-border/60 shadow-sm">
                <div className="flex flex-col items-center gap-4">
                  <ChartContainer
                    config={spendChartConfig}
                    className="mx-auto aspect-square h-40 w-full"
                    dir="ltr"
                  >
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={spendBreakdown}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={45}
                        outerRadius={68}
                        strokeWidth={3}
                      >
                        {spendBreakdown.map((entry) => (
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
                                  y={(viewBox.cy ?? 0) - 6}
                                  className="fill-foreground text-lg font-bold"
                                >
                                  {formatPlainNumber(totalSpendForChart)}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy ?? 0) + 14}
                                  className="fill-muted-foreground text-[10px]"
                                >
                                  {summary?.currency ?? "USD"}
                                </tspan>
                              </text>
                            )
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="w-full space-y-1.5">
                    {spendBreakdown.map((item) => (
                      <div key={item.channel} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-foreground">{item.label}</span>
                        </div>
                        <span className="font-medium text-muted-foreground">{item.share}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </AppCard>

              <AppCard
                title="اتجاه الأداء"
                subtitle={`الإنفاق (${summary?.currency ?? "USD"})`}
                className="rounded-2xl border-border/60 shadow-sm"
              >
                <ChartContainer config={trendChartConfig} className="h-64 w-full" dir="ltr">
                  <LineChart data={trendChartData} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      width={50}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    {channelRows.map((channel) => (
                      <Line
                        key={channel.name}
                        dataKey={channel.name}
                        type="monotone"
                        stroke={PLATFORM_ICON[channel.name]?.hex ?? "#94a3b8"}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {channelRows.map((channel) => (
                    <div key={channel.name} className="flex items-center gap-1.5">
                      <span
                        className="h-0.5 w-3 rounded-full"
                        style={{ backgroundColor: PLATFORM_ICON[channel.name]?.hex ?? "#94a3b8" }}
                      />
                      {channel.name}
                    </div>
                  ))}
                </div>
              </AppCard>
            </div>
          ) : null}

          {storeRows.length > 0 ? (
            <AppCard
              title="منصات التجارة الإلكترونية"
              subtitle="أداء متجرك على مختلف المنصات"
              icon={<ShoppingCart className="size-4 text-muted-foreground" />}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <div className="overflow-x-auto">
                <AppTable>
                  <AppTableHeader>
                    <AppTableRow className="border-border hover:bg-transparent">
                      <AppTableHead className="text-left text-muted-foreground">
                        المنصة
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        عدد العملاء
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        إجمالي الطلبات
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        الإيرادات
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        متوسط قيمة الطلب
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        اتجاه الإيرادات
                      </AppTableHead>
                    </AppTableRow>
                  </AppTableHeader>
                  <AppTableBody>
                    {storeRows.map((store) => {
                      // Same brand color the sparkline in the ad-channel cards already uses,
                      // rather than a generic changePct-based green/red -- makes each platform's
                      // trend line recognizable at a glance across every widget on this page.
                      const trendColor = PLATFORM_ICON[store.platform]?.hex ?? "#94a3b8"
                      const ordersDelta = formatChangePct(store.ordersChangePct)
                      const revenueDelta = formatChangePct(store.revenueChangePct)

                      return (
                        <AppTableRow key={store.platform} className="border-border">
                          <AppTableCell className="text-left">
                            <div className="flex items-center gap-2">
                              <PlatformBadge platform={store.platform} className="size-8" />
                              <span className="font-medium text-foreground">{store.platform}</span>
                            </div>
                          </AppTableCell>
                          <AppTableCell className="text-center text-foreground">
                            {store.customers.toLocaleString()}
                          </AppTableCell>
                          <AppTableCell className="text-center">
                            <div className="font-medium text-foreground">
                              {store.orders.toLocaleString()}
                            </div>
                            {ordersDelta ? (
                              <div
                                className={cn(
                                  "text-xs",
                                  (store.ordersChangePct ?? 0) >= 0
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                                )}
                              >
                                {ordersDelta}
                              </div>
                            ) : null}
                          </AppTableCell>
                          <AppTableCell className="text-center">
                            <div className="font-medium text-foreground">
                              {formatPlainNumber(store.revenue)} SAR
                            </div>
                            {revenueDelta ? (
                              <div
                                className={cn(
                                  "text-xs",
                                  (store.revenueChangePct ?? 0) >= 0
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                                )}
                              >
                                {revenueDelta}
                              </div>
                            ) : null}
                          </AppTableCell>
                          <AppTableCell className="text-center text-foreground">
                            {formatPlainNumber(store.averageOrderValue)} SAR
                          </AppTableCell>
                          <AppTableCell>
                            <div className="flex justify-center">
                              <TrendSparkline values={store.trend} color={trendColor} />
                            </div>
                          </AppTableCell>
                        </AppTableRow>
                      )
                    })}
                  </AppTableBody>
                </AppTable>
              </div>
            </AppCard>
          ) : null}

          {topProducts.length > 0 ? (
            <AppCard
              title="أفضل المنتجات أداءً"
              icon={<Package className="size-4 text-muted-foreground" />}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <div className="overflow-x-auto">
                <AppTable>
                  <AppTableHeader>
                    <AppTableRow className="border-border hover:bg-transparent">
                      <AppTableHead className="text-left text-muted-foreground">
                        المنتج
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        الطلبات
                      </AppTableHead>
                      <AppTableHead className="!text-center text-muted-foreground">
                        الكمية المباعة
                      </AppTableHead>
                    </AppTableRow>
                  </AppTableHeader>
                  <AppTableBody>
                    {topProducts.map((product) => (
                      <AppTableRow key={product.name} className="border-border">
                        <AppTableCell className="text-left">
                          <div className="flex items-center gap-2">
                            <ProductThumbnail src={product.thumbnail} />
                            <span className="font-medium text-foreground">{product.name}</span>
                          </div>
                        </AppTableCell>
                        <AppTableCell className="text-center text-foreground">
                          {product.orders.toLocaleString()}
                        </AppTableCell>
                        <AppTableCell className="text-center text-foreground">
                          {product.quantitySold.toLocaleString()}
                        </AppTableCell>
                      </AppTableRow>
                    ))}
                  </AppTableBody>
                </AppTable>
              </div>
            </AppCard>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-4">
            <AppCard title="أفضل قناة أداء" className="rounded-2xl border-border/60 shadow-sm">
              {bestChannel ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <PlatformBadge platform={bestChannel.name} className="size-9" />
                    <span className="font-semibold text-foreground">{bestChannel.name}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">ROAS</p>
                      <p className="text-xl font-bold text-foreground">
                        {bestChannel.roas.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد بيانات كافية بعد.</p>
              )}
            </AppCard>

            <AppCard title="تحتاج إلى انتباه" className="rounded-2xl border-border/60 shadow-sm">
              {attentionChannel ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <PlatformBadge platform={attentionChannel.name} className="size-9" />
                    <span className="font-semibold text-foreground">{attentionChannel.name}</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">CPA مرتفع</p>
                  <div className="mt-1 flex items-end justify-between">
                    <p className="text-xl font-bold text-foreground">
                      {formatPlainNumber(attentionChannel.cpa)} {summary?.currency ?? "USD"}
                    </p>
                    {attentionCpaDeltaPct !== null && attentionCpaDeltaPct > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600">
                        <ArrowUpRight className="size-3.5" />
                        {attentionCpaDeltaPct.toFixed(0)}% عن المتوسط
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد بيانات كافية بعد.</p>
              )}
            </AppCard>

            <AppCard title="رؤية ذكية من مدار" className="rounded-2xl border-border/60 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <p className="text-xs leading-6 text-muted-foreground">
                    توصيات إعادة توزيع الميزانية الذكية قيد التطوير حالياً.
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    قريباً
                  </span>
                </div>
              </div>
              <AppButton variant="outline" size="sm" className="mt-3 w-full" disabled>
                عرض التحليل الكامل
              </AppButton>
            </AppCard>

            <AppCard
              title="تنبيهات"
              icon={<Bell className="size-4 text-muted-foreground" />}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              {alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map((alert, index) => (
                    <div
                      key={`${alert.channel}-${alert.type}-${index}`}
                      className="flex items-start gap-2"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          alert.severity === "error" ? "bg-rose-500" : "bg-amber-500"
                        )}
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">{alert.channel}</p>
                        <p className="text-xs text-muted-foreground">{formatAlertMessage(alert)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <p className="text-xs text-muted-foreground">جميع المؤشرات ضمن النطاق المثالي.</p>
                </div>
              )}
            </AppCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
