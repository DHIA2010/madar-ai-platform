"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { addDays, format, startOfMonth, subDays, subMonths, endOfMonth } from "date-fns"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Eye,
  MousePointerClick,
  Target,
  Timer,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/components/app"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import { ConnectorLogo } from "@/features/integrations/components/connector-logo"
import {
  websiteAnalyticsService,
  type WebsiteAnalyticsReport,
} from "@/features/website-analytics/services/website-analytics.service"

type Translator = ReturnType<typeof useTranslations<"websiteAnalytics">>

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

// Seconds as m:ss.
function formatDuration(seconds: number) {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

// Change against the period before; nothing to compare with when that period had no visits.
function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

interface DateRangeOption {
  id: string
  label: string
  startDate: string
  endDate: string
}

const DEFAULT_RANGE_ID = "last28Days"

function getDateRangeOptions(t: Translator): DateRangeOption[] {
  const today = new Date()
  const lastMonth = subMonths(today, 1)
  // The visitor's own calendar day, not UTC's -- after midnight in Riyadh "today" is already the
  // new day.
  const toSql = (date: Date) => format(date, "yyyy-MM-dd")

  return [
    { id: "today", label: t("dateRange.today"), startDate: toSql(today), endDate: toSql(today) },
    {
      id: "yesterday",
      label: t("dateRange.yesterday"),
      startDate: toSql(subDays(today, 1)),
      endDate: toSql(subDays(today, 1)),
    },
    {
      id: "last7Days",
      label: t("dateRange.last7Days"),
      startDate: toSql(subDays(today, 6)),
      endDate: toSql(today),
    },
    {
      id: "last28Days",
      label: t("dateRange.last28Days"),
      startDate: toSql(subDays(today, 27)),
      endDate: toSql(today),
    },
    {
      id: "last90Days",
      label: t("dateRange.last90Days"),
      startDate: toSql(subDays(today, 89)),
      endDate: toSql(today),
    },
    {
      id: "thisMonth",
      label: t("dateRange.thisMonth"),
      startDate: toSql(startOfMonth(today)),
      endDate: toSql(today),
    },
    {
      id: "lastMonth",
      label: t("dateRange.lastMonth"),
      startDate: toSql(startOfMonth(lastMonth)),
      endDate: toSql(endOfMonth(lastMonth)),
    },
    {
      id: "last12Months",
      label: t("dateRange.last12Months"),
      startDate: toSql(subDays(today, 364)),
      endDate: toSql(today),
    },
  ]
}

function DateRangeFilter({
  options,
  value,
  onChange,
}: {
  options: DateRangeOption[]
  value: DateRangeOption
  onChange: (next: DateRangeOption) => void
}) {
  const [open, setOpen] = useState(false)

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
            key={option.id}
            type="button"
            className={cn(
              "w-full rounded-xl px-3 py-2 text-start text-sm transition-colors hover:bg-muted",
              option.id === value.id
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
  changePct: number | null
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
  const t = useTranslations("websiteAnalytics")
  const Icon = kpi.icon
  const good = kpi.changePct === null || kpi.changePct >= 0
  const TrendIcon = good ? ArrowUpRight : ArrowDownRight

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-xl",
          KPI_TONE_CLASSNAMES[kpi.tone]
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        <span dir="ltr">{kpi.value}</span>
        {kpi.unit ? (
          <span className="ms-1 text-sm font-medium text-muted-foreground">{kpi.unit}</span>
        ) : null}
      </p>
      {kpi.changePct === null ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("kpis.notEnoughDataToCompare")}</p>
      ) : (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good ? "text-emerald-600" : "text-rose-600"
            )}
            dir="ltr"
          >
            <TrendIcon className="size-3.5" />
            {`${kpi.changePct >= 0 ? "+" : ""}${kpi.changePct.toFixed(1)}%`}
          </span>
          <span className="text-muted-foreground">{t("kpis.changeVsPreviousPeriod")}</span>
        </div>
      )}
    </AppCard>
  )
}

// A ranked list with a bar behind each row: the longest bar is the first row's.
function BarList({
  rows,
  total,
  emptyLabel,
}: {
  rows: Array<{ key: string; label: string; value: number }>
  total: number
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="relative overflow-hidden rounded-lg">
          <div
            className="absolute inset-y-0 start-0 rounded-lg bg-sky-500/10"
            style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
          />
          <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="truncate font-medium text-foreground">{row.label}</span>
            <span className="flex shrink-0 items-center gap-2" dir="ltr">
              <span className="text-xs text-muted-foreground">
                {total > 0 ? `${Math.min((row.value / total) * 100, 100).toFixed(0)}%` : ""}
              </span>
              <span className="font-semibold text-foreground">{formatNumber(row.value)}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DataTable({
  headers,
  rows,
  emptyLabel,
  labelDir = "auto",
}: {
  headers: [string, string, string?]
  rows: Array<{ key: string; label: string; hint?: string; values: number[] }>
  emptyLabel: string
  // "ltr" for page paths, which read left to right even when they hold Arabic words.
  labelDir?: "auto" | "ltr"
}) {
  const locale = useLocale() as Locale
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }
  // Paths and source names are Latin text on an Arabic page: each reads in its own direction but
  // stays on the page's side of the column.
  const align = localeDirection(locale) === "rtl" ? "text-right" : "text-left"
  const columns = headers[2]
    ? "grid-cols-[minmax(0,1fr)_5rem_5rem]"
    : "grid-cols-[minmax(0,1fr)_5rem]"

  return (
    <div>
      <div
        className={cn(
          "grid gap-2 border-b border-border/60 pb-2 text-xs font-semibold text-muted-foreground",
          columns
        )}
      >
        <span>{headers[0]}</span>
        <span className="text-center">{headers[1]}</span>
        {headers[2] ? <span className="text-center">{headers[2]}</span> : null}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className={cn(
            "grid items-center gap-2 border-b border-border/40 py-2.5 text-sm last:border-b-0",
            columns
          )}
        >
          <span className="min-w-0">
            <span
              className={cn("block truncate font-medium text-foreground", align)}
              dir={labelDir}
            >
              {row.label}
            </span>
            {row.hint ? (
              <span className={cn("block truncate text-xs text-muted-foreground", align)} dir="ltr">
                {row.hint}
              </span>
            ) : null}
          </span>
          {row.values.map((value, index) => (
            <span key={index} className="text-center font-semibold text-foreground" dir="ltr">
              {formatNumber(value)}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

// GA4's own names (always English) -> this page's wording.
const CHANNEL_KEYS: Record<string, string> = {
  Direct: "direct",
  "Organic Search": "organicSearch",
  "Paid Search": "paidSearch",
  "Organic Social": "organicSocial",
  "Paid Social": "paidSocial",
  "Organic Video": "organicVideo",
  "Paid Video": "paidVideo",
  "Organic Shopping": "organicShopping",
  "Paid Shopping": "paidShopping",
  "Paid Other": "paidOther",
  "Cross-network": "crossNetwork",
  Email: "email",
  Referral: "referral",
  Display: "display",
  Affiliates: "affiliates",
  SMS: "sms",
  Audio: "audio",
  "Mobile Push Notifications": "push",
  Unassigned: "unassigned",
}

const DEVICE_KEYS: Record<string, string> = {
  desktop: "desktop",
  mobile: "mobile",
  tablet: "tablet",
  "smart tv": "smartTv",
}

const EVENT_KEYS: Record<string, string> = {
  page_view: "pageView",
  session_start: "sessionStart",
  first_visit: "firstVisit",
  user_engagement: "userEngagement",
  scroll: "scroll",
  click: "click",
  form_start: "formStart",
  form_submit: "formSubmit",
  file_download: "fileDownload",
  view_search_results: "viewSearchResults",
  video_start: "videoStart",
  generate_lead: "generateLead",
  sign_up: "signUp",
  login: "login",
  view_item: "viewItem",
  add_to_cart: "addToCart",
  begin_checkout: "beginCheckout",
  purchase: "purchase",
}

const NOT_SET = "(not set)"

type TrendMetric = "users" | "sessions" | "pageViews"
const TREND_METRICS: TrendMetric[] = ["users", "sessions", "pageViews"]

// GA4 leaves out days nobody visited; the chart shows them as zero.
function fillDays(report: WebsiteAnalyticsReport) {
  const byDate = new Map(report.daily.map((day) => [day.date, day]))
  const days: WebsiteAnalyticsReport["daily"] = []
  const end = new Date(`${report.range.endDate}T00:00:00`)
  for (
    let cursor = new Date(`${report.range.startDate}T00:00:00`);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    const date = format(cursor, "yyyy-MM-dd")
    days.push(byDate.get(date) ?? { date, users: 0, sessions: 0, pageViews: 0 })
  }
  return days
}

export default function WebsiteAnalyticsPage() {
  const t = useTranslations("websiteAnalytics")
  const locale = useLocale() as Locale
  const dateRangeOptions = useMemo(() => getDateRangeOptions(t), [t])
  const [dateRangeId, setDateRangeId] = useState(DEFAULT_RANGE_ID)
  const dateRange =
    dateRangeOptions.find((option) => option.id === dateRangeId) ?? dateRangeOptions[0]
  const { startDate, endDate } = dateRange

  const [report, setReport] = useState<WebsiteAnalyticsReport | null>(null)
  const [notConnected, setNotConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<"reconnect" | "failed" | null>(null)
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("users")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const result = await websiteAnalyticsService.getInsights({ startDate, endDate })
        if (cancelled) return
        if (result.status === "not_connected") {
          setNotConnected(true)
          setReport(null)
        } else {
          setNotConnected(false)
          setReport(result)
        }
      } catch (error) {
        console.error("Failed to load website analytics", error)
        if (!cancelled) {
          setReport(null)
          setLoadError(
            error instanceof AppError && error.code === "GOOGLE_ANALYTICS_RECONNECT_REQUIRED"
              ? "reconnect"
              : "failed"
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate])

  const kpiCards = useMemo<KpiCardData[]>(() => {
    if (!report) return []
    const { totals, previousTotals: previous } = report
    return [
      {
        label: t("kpis.users"),
        value: formatNumber(totals.users),
        changePct: changePct(totals.users, previous.users),
        icon: Users,
        tone: "blue",
      },
      {
        label: t("kpis.sessions"),
        value: formatNumber(totals.sessions),
        changePct: changePct(totals.sessions, previous.sessions),
        icon: Waypoints,
        tone: "indigo",
      },
      {
        label: t("kpis.pageViews"),
        value: formatNumber(totals.pageViews),
        changePct: changePct(totals.pageViews, previous.pageViews),
        icon: Eye,
        tone: "violet",
      },
      {
        label: t("kpis.engagementRate"),
        value: formatPercent(totals.engagementRate),
        changePct: changePct(totals.engagementRate, previous.engagementRate),
        icon: MousePointerClick,
        tone: "green",
      },
      {
        label: t("kpis.averageSessionDuration"),
        value: formatDuration(totals.averageSessionDuration),
        unit: t("kpis.minutes"),
        changePct: changePct(totals.averageSessionDuration, previous.averageSessionDuration),
        icon: Timer,
        tone: "orange",
      },
      {
        label: t("kpis.keyEvents"),
        value: formatNumber(totals.keyEvents),
        changePct: changePct(totals.keyEvents, previous.keyEvents),
        icon: Target,
        tone: "rose",
      },
    ]
  }, [report, t])

  const trendData = useMemo(() => {
    if (!report) return []
    const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
    return fillDays(report).map((day) => ({
      ...day,
      label: dayFormat.format(new Date(`${day.date}T00:00:00`)),
    }))
  }, [report, locale])

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" })
    } catch {
      return null
    }
  }, [locale])

  const trendChartConfig = {
    [trendMetric]: { label: t(`trend.${trendMetric}` as "trend.users"), color: "var(--chart-1)" },
  } satisfies ChartConfig

  const sourceLabel = (source: string, medium: string) => {
    if (source === "(direct)") return t("channels.direct")
    if (source === NOT_SET) return t("notSet")
    return medium && medium !== NOT_SET && medium !== "(none)" ? `${source} / ${medium}` : source
  }

  return (
    <div className="space-y-4" dir={localeDirection(locale)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {report ? t("subtitleProperty", { property: report.property.name }) : t("subtitle")}
          </p>
        </div>
        {notConnected ? null : (
          <DateRangeFilter
            options={dateRangeOptions}
            value={dateRange}
            onChange={(next) => setDateRangeId(next.id)}
          />
        )}
      </div>

      {notConnected ? (
        <AppCard className="rounded-2xl border-border/60 p-10 shadow-sm">
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
            <ConnectorLogo platformName="Google Analytics 4" className="size-12" />
            <div>
              <p className="text-lg font-bold text-foreground">{t("connect.title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("connect.description")}</p>
            </div>
            <AppButton asChild>
              <Link href={ROUTES.integrationsNew}>{t("connect.action")}</Link>
            </AppButton>
          </div>
        </AppCard>
      ) : null}

      {loadError ? (
        <AppCard className="rounded-2xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{loadError === "reconnect" ? t("reconnect.message") : t("loadError")}</span>
            {loadError === "reconnect" ? (
              <AppButton asChild variant="outline" size="sm">
                <Link href={ROUTES.integrations}>{t("reconnect.action")}</Link>
              </AppButton>
            ) : null}
          </div>
        </AppCard>
      ) : null}

      {!report && !notConnected && isLoading ? (
        <AppCard className="rounded-2xl border-border/60 p-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </AppCard>
      ) : null}

      {report ? (
        <div className={cn("space-y-4 transition-opacity", isLoading && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {kpiCards.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

          <AppCard
            title={t("trend.title")}
            subtitle={t("trend.subtitle")}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            <div className="mb-3 flex">
              <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
                {TREND_METRICS.map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                      metric === trendMetric
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setTrendMetric(metric)}
                  >
                    {t(`trend.${metric}` as "trend.users")}
                  </button>
                ))}
              </div>
            </div>
            <ChartContainer config={trendChartConfig} className="h-72 w-full" dir="ltr">
              <LineChart data={trendData} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  width={50}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Line
                  dataKey={trendMetric}
                  type="monotone"
                  stroke={`var(--color-${trendMetric})`}
                  strokeWidth={2}
                  dot={trendData.length <= 2}
                />
              </LineChart>
            </ChartContainer>
          </AppCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <AppCard
              title={t("pages.title")}
              subtitle={t("pages.subtitle")}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <DataTable
                headers={[t("pages.page"), t("pages.views"), t("pages.users")]}
                rows={report.pages.map((page) => ({
                  key: page.path,
                  label: page.path || NOT_SET,
                  values: [page.pageViews, page.users],
                }))}
                emptyLabel={t("empty")}
                labelDir="ltr"
              />
            </AppCard>

            <AppCard
              title={t("sources.title")}
              subtitle={t("sources.subtitle")}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <DataTable
                headers={[t("sources.source"), t("sources.sessions"), t("sources.users")]}
                rows={report.sources.map((source) => ({
                  key: `${source.source}/${source.medium}`,
                  label: sourceLabel(source.source, source.medium),
                  values: [source.sessions, source.users],
                }))}
                emptyLabel={t("empty")}
              />
            </AppCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <AppCard
              title={t("channels.title")}
              subtitle={t("channels.subtitle")}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <BarList
                rows={report.channels.map((entry) => ({
                  key: entry.channel,
                  label: CHANNEL_KEYS[entry.channel]
                    ? t(`channels.${CHANNEL_KEYS[entry.channel]}` as "channels.direct")
                    : entry.channel === NOT_SET
                      ? t("notSet")
                      : entry.channel,
                  value: entry.sessions,
                }))}
                total={report.totals.sessions}
                emptyLabel={t("empty")}
              />
            </AppCard>

            <AppCard
              title={t("countries.title")}
              subtitle={t("countries.subtitle")}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <BarList
                rows={report.countries.map((entry) => ({
                  key: entry.countryCode ?? entry.country,
                  label:
                    (entry.countryCode ? regionNames?.of(entry.countryCode) : null) ??
                    (entry.country === NOT_SET || !entry.country ? t("notSet") : entry.country),
                  value: entry.users,
                }))}
                total={report.totals.users}
                emptyLabel={t("empty")}
              />
            </AppCard>

            <AppCard
              title={t("devices.title")}
              subtitle={t("devices.subtitle")}
              className="rounded-2xl border-border/60 shadow-sm"
            >
              <BarList
                rows={report.devices.map((entry) => ({
                  key: entry.device,
                  label: DEVICE_KEYS[entry.device]
                    ? t(`devices.${DEVICE_KEYS[entry.device]}` as "devices.mobile")
                    : entry.device,
                  value: entry.users,
                }))}
                total={report.totals.users}
                emptyLabel={t("empty")}
              />
            </AppCard>
          </div>

          <AppCard
            title={t("events.title")}
            subtitle={t("events.subtitle")}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            <DataTable
              headers={[t("events.event"), t("events.count")]}
              rows={report.events.map((event) => ({
                key: event.name,
                label: EVENT_KEYS[event.name]
                  ? t(`events.names.${EVENT_KEYS[event.name]}` as "events.names.pageView")
                  : event.name,
                hint: EVENT_KEYS[event.name] ? event.name : undefined,
                values: [event.count],
              }))}
              emptyLabel={t("empty")}
            />
          </AppCard>

          <p className="text-xs text-muted-foreground">{t("sourceNote")}</p>
        </div>
      ) : null}
    </div>
  )
}
