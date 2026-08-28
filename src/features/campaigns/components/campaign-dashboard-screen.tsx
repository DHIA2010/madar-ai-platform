"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addMonths,
  endOfMonth,
  format,
  getMonth,
  getYear,
  setMonth,
  setYear,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  Globe,
  type LucideIcon,
  MousePointerClick,
  Percent,
  Search,
  ShoppingBag,
  Store,
  TrendingUp,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCalendar,
  AppCard,
  AppPageHeader,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  type CampaignPerformancePlatformRow,
  type CampaignPerformanceRow,
  campaignPerformanceService,
  type CampaignPerformanceSummary,
} from "../services/campaign-performance.service"
import {
  CAMPAIGN_PLATFORM_HIERARCHY,
  type CampaignPlatform,
  type CampaignTypeFilter,
  type ExplorerLevel,
  type ExplorerPlatformFilter,
  getAvailableTabsForPlatforms,
  getEntityLabel,
  getMetricsColumns,
  getNextHierarchyLevel,
  type MetricColumn,
  PLATFORM_NODE_CONFIG,
  type PlatformNodeKey,
} from "./campaign-metrics"

// One row per entity level, real data from campaignPerformanceService plus the display-only
// fields (nodeId/entityName/entityDescription) the table rendering needs.
type EntityRow = CampaignPerformanceRow & {
  nodeId: string
  entityName: string
  entityDescription: string
}

// "Google" groups Google Search + Google Display into one platform-overview row (YouTube stays
// its own row) -- mirrors PLATFORM_NODE_CONFIG, computed client-side from the real per-platform
// rows the backend returns (one row per CampaignPerformancePlatform, not per node).
type GroupedPlatformRow = {
  nodeId: string
  platformNodeKey: PlatformNodeKey
  entityName: string
  entityDescription: string
  activeCampaigns: number
  spend: number
  revenue: number
  roas: number
  clicks: number
  conversions: number
  impressions: number
  ctr: number
  status: string
}

type ExplorerRow = EntityRow | GroupedPlatformRow

function isGroupedPlatformRow(row: ExplorerRow): row is GroupedPlatformRow {
  return "platformNodeKey" in row
}

const platformOptions: ExplorerPlatformFilter[] = [
  "All Platforms",
  "Google Search",
  "Google Display",
  "YouTube",
  "Meta",
  "TikTok",
  "Snapchat",
]

// Ad platforms don't have a meaningful "Completed"/"Draft" campaign status the way orders do --
// "Other" covers archived/removed/deleted and anything else real status text doesn't cleanly
// bucket into.
const statusOptions = ["All Statuses", "Active", "Paused", "Other"] as const

const objectiveOptions: CampaignTypeFilter[] = [
  "All Objectives",
  "Awareness",
  "Traffic",
  "Leads",
  "Conversions",
  "Sales",
]
const monthOptions = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const yearOptions = Array.from({ length: 21 }, (_, index) => 2018 + index)

function getDateRangePresets(): Array<{ label: string; range: DateRange }> {
  const today = new Date()
  const lastMonth = subMonths(today, 1)

  return [
    { label: "Yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Last 7 Days", range: { from: subDays(today, 6), to: today } },
    { label: "Last 30 Days", range: { from: subDays(today, 29), to: today } },
    { label: "This Month", range: { from: startOfMonth(today), to: endOfMonth(today) } },
    { label: "Last Month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
    // Matches the earliest selectable year in the calendar's year dropdown (see yearOptions
    // above) -- there's no unbounded "no start date" query on the backend, so "all time" is
    // expressed as the widest real range the picker allows rather than an empty filter.
    { label: "All Time", range: { from: new Date(yearOptions[0], 0, 1), to: today } },
  ]
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatSar(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatChangePct(value: number | null) {
  if (value === null) return null
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

interface CampaignKpiCardData {
  label: string
  value: string
  changePct: number | null
  icon: LucideIcon
  tone: "blue" | "green" | "orange" | "rose" | "violet"
}

const KPI_TONE_CLASSNAMES: Record<CampaignKpiCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
}

function CampaignKpiCard({ kpi }: { kpi: CampaignKpiCardData }) {
  const Icon = kpi.icon
  const changeLabel = formatChangePct(kpi.changePct)
  const trend = (kpi.changePct ?? 0) >= 0 ? "up" : "down"
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight

  return (
    <AppCard className="overflow-hidden rounded-2xl border-border/60 bg-card p-4 shadow-sm">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          KPI_TONE_CLASSNAMES[kpi.tone]
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{kpi.value}</p>
      {changeLabel ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              trend === "up" ? "text-emerald-600" : "text-rose-600"
            )}
          >
            <TrendIcon className="size-3.5" />
            {changeLabel}
          </span>
          <span className="text-muted-foreground">عن الفترة السابقة</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">الفترة الحالية</p>
      )}
    </AppCard>
  )
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Date Range"
  if (!range.to) return format(range.from, "MMM d, yyyy")
  return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`
}

function getRoasClasses(roas: number) {
  if (roas >= 4) return "text-emerald-300"
  if (roas >= 2.5) return "text-sky-300"
  if (roas > 0) return "text-amber-300"
  return "text-muted-foreground"
}

function PlatformIcon({ platform }: { platform: CampaignPlatform | PlatformNodeKey }) {
  if (platform === "Google" || platform === "Google Search" || platform === "Google Display") {
    return <Globe className="size-4" />
  }

  if (platform === "YouTube") {
    return <TrendingUp className="size-4" />
  }

  if (platform === "Meta") {
    return <ShoppingBag className="size-4" />
  }

  return <Store className="size-4" />
}

function getSearchPlaceholder(level: ExplorerLevel) {
  if (level === "platforms") return "Search platforms..."
  if (level === "campaigns") return "Search campaigns..."
  if (level === "adGroups") return "Search ad groups..."
  if (level === "keywords") return "Search keywords..."
  return "Search ads..."
}

function formatDuration(value: number) {
  const rounded = Math.max(0, Math.round(value))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

// Loose substring match on whatever raw status/objective text each platform actually returns --
// same reasoning as the backend's bucketCampaignStatus/bucketCampaignObjective (see
// identity-platform/campaigns/performance-service.ts): no platform's exact vocabulary is fully
// confirmed against live data yet, so a shared bucket is what lets one filter work everywhere.
function bucketStatus(rawStatus: string): "Active" | "Paused" | "Other" {
  const text = rawStatus.toLowerCase()
  if (text.includes("enable") || text.includes("active")) return "Active"
  if (text.includes("pause") || text.includes("disable")) return "Paused"
  return "Other"
}

function bucketObjective(rawObjective: string | null): CampaignTypeFilter {
  if (!rawObjective) return "Sales"
  const text = rawObjective.toLowerCase()
  if (text.includes("aware") || text.includes("reach") || text.includes("brand")) return "Awareness"
  if (text.includes("lead")) return "Leads"
  if (text.includes("sale") || text.includes("purchase") || text.includes("shop")) return "Sales"
  if (text.includes("conversion")) return "Conversions"
  if (text.includes("traffic") || text.includes("click")) return "Traffic"
  return "Sales"
}

function toEntityRow(row: CampaignPerformanceRow): EntityRow {
  return {
    ...row,
    nodeId: row.id,
    entityName: row.name,
    entityDescription: row.activityDate
      ? `Last active ${row.activityDate} · ${row.status}`
      : row.status,
  }
}

// Groups the backend's per-CampaignPerformancePlatform rows (Google Search/Display/YouTube/
// Meta/TikTok/Snapchat, one each) into one row per PlatformNodeKey ("Google" combines Search +
// Display) -- matches the product's original platform-overview hierarchy.
function groupPlatformRows(rows: CampaignPerformancePlatformRow[]): GroupedPlatformRow[] {
  return (
    (Object.keys(PLATFORM_NODE_CONFIG) as PlatformNodeKey[])
      .map((platformNodeKey) => {
        const allowed = PLATFORM_NODE_CONFIG[platformNodeKey].campaignPlatforms
        const subset = rows.filter((row) => allowed.includes(row.platform))
        const spend = subset.reduce((sum, row) => sum + row.spend, 0)
        const revenue = subset.reduce((sum, row) => sum + row.revenue, 0)
        const clicks = subset.reduce((sum, row) => sum + row.clicks, 0)
        const conversions = subset.reduce((sum, row) => sum + row.conversions, 0)
        const impressions = subset.reduce((sum, row) => sum + row.impressions, 0)
        const activeCampaigns = subset.reduce((sum, row) => sum + row.activeCampaigns, 0)

        return {
          hasCampaigns: subset.length > 0,
          row: {
            nodeId: `platform-${platformNodeKey.toLowerCase()}`,
            platformNodeKey,
            entityName: platformNodeKey,
            entityDescription: `${activeCampaigns} active campaigns`,
            activeCampaigns,
            spend,
            revenue,
            roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
            clicks,
            conversions,
            impressions,
            ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
            // Same "Active"/"Paused"/"No Data" logic as the backend's getPlatformBreakdown --
            // this node can aggregate multiple underlying platform rows (e.g. Google Search +
            // Display), so it's recomputed here rather than copied from a single row's status.
            // "No Data" only when there are truly zero campaigns, not just zero *active* ones --
            // a platform with real, paused campaigns must never look like nothing was synced.
            status: activeCampaigns > 0 ? "Active" : subset.length > 0 ? "Paused" : "No Data",
          },
        }
      })
      // hasCampaigns, not "activeCampaigns > 0 || spend > 0" -- a real, connected platform with
      // real (paused, or currently zero-spend) campaigns must still show up here, or it becomes
      // unreachable through the drill-down UI entirely. The backend already only returns
      // platforms with real campaign rows, so this is a defense-in-depth check, not the primary
      // filter.
      .filter((entry) => entry.hasCampaigns)
      .map((entry) => entry.row)
  )
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value?.from ?? new Date())
  const [rangeAnchor, setRangeAnchor] = useState<Date | undefined>(undefined)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  return (
    <AppPopover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDisplayMonth(value?.from ?? new Date())
          setRangeAnchor(value?.from && !value?.to ? value.from : undefined)
        } else {
          setRangeAnchor(undefined)
        }
      }}
    >
      <AppPopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-[220px] items-center justify-between rounded-md border border-border bg-muted/60 px-3 text-sm text-foreground ring-offset-background transition-colors hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="truncate text-left">{formatDateRangeLabel(value)}</span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <AppButton
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </AppButton>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <AppSelect
              value={String(monthIndex)}
              onValueChange={(next) =>
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }
            >
              <AppSelectTrigger className="h-9 w-[7.75rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </AppSelectTrigger>
              <AppSelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {monthOptions.map((monthLabel, index) => (
                  <AppSelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {monthLabel}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>

            <AppSelect
              value={String(yearValue)}
              onValueChange={(next) => setDisplayMonth((current) => setYear(current, Number(next)))}
            >
              <AppSelectTrigger className="h-9 w-[6rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </AppSelectTrigger>
              <AppSelectContent
                position="popper"
                className="max-h-56 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {yearOptions.map((yearOption) => (
                  <AppSelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {yearOption}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>

          <AppButton
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </AppButton>
        </div>

        <AppCalendar
          mode="range"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={(next, selectedDay) => {
            if (!selectedDay) {
              onChange(next)
              return
            }

            if (!rangeAnchor) {
              onChange({ from: selectedDay, to: undefined })
              setRangeAnchor(selectedDay)
              return
            }

            const from = selectedDay < rangeAnchor ? selectedDay : rangeAnchor
            const to = selectedDay < rangeAnchor ? rangeAnchor : selectedDay

            onChange({ from, to })
            setRangeAnchor(undefined)
            setOpen(false)
          }}
          numberOfMonths={1}
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          captionLayout="label"
          formatters={{ formatWeekdayName: (date) => format(date, "EEE") }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-foreground",
            weekdays: "mb-1.5 grid grid-cols-7 gap-1.5",
            weekday:
              "h-6 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            week: "mt-1.5 grid grid-cols-7 gap-1.5",
            day: "rounded-full text-foreground",
            day_button:
              "size-8 rounded-full border border-transparent bg-transparent text-xs font-medium text-foreground transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today:
              "rounded-full border border-sky-400/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-foreground",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-foreground",
            range_start: "rounded-full border border-sky-300 bg-sky-400 text-foreground",
            range_end: "rounded-full border border-sky-300 bg-sky-400 text-foreground",
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {getDateRangePresets().map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => {
                onChange(preset.range)
                setRangeAnchor(undefined)
                setDisplayMonth(preset.range.from ?? new Date())
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <AppButton
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange(undefined)
              setRangeAnchor(undefined)
              setDisplayMonth(new Date())
              setOpen(false)
            }}
          >
            Clear Date
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-400 px-3.5 text-sm font-semibold text-foreground shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
            onClick={() => {
              const today = new Date()
              onChange({ from: today, to: today })
              setRangeAnchor(undefined)
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            Today
          </AppButton>
        </div>
      </AppPopoverContent>
    </AppPopover>
  )
}

export function CampaignDashboardScreen() {
  const [page, setPage] = useState(1)
  const [currentLevel, setCurrentLevel] = useState<ExplorerLevel>("platforms")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<ExplorerPlatformFilter>("All Platforms")
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All Statuses")
  const [objective, setObjective] = useState<CampaignTypeFilter>("All Objectives")
  // Pre-selected, not left empty -- the backend always scopes to a real date window (defaults
  // to the last 30 days when none is sent), so the picker must show that honestly instead of
  // implying "all data" while secretly filtering to 30 days behind the scenes. Matches the
  // "Last 30 Days" preset exactly (see getDateRangePresets) so clicking that preset explicitly
  // is a no-op against this initial state.
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 29), to: today }
  })
  const [selectedPlatformNode, setSelectedPlatformNode] = useState<PlatformNodeKey | undefined>(
    undefined
  )
  const [selectedCampaign, setSelectedCampaign] = useState<EntityRow | undefined>(undefined)
  const [selectedAdGroup, setSelectedAdGroup] = useState<EntityRow | undefined>(undefined)
  const [highlightedRowId, setHighlightedRowId] = useState<string | undefined>(undefined)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CampaignPerformanceSummary | null>(null)
  const [platformRows, setPlatformRows] = useState<CampaignPerformancePlatformRow[]>([])
  const [campaignRows, setCampaignRows] = useState<CampaignPerformanceRow[]>([])
  const [adGroupRows, setAdGroupRows] = useState<CampaignPerformanceRow[]>([])
  const [leafRows, setLeafRows] = useState<CampaignPerformanceRow[]>([])

  // Debounced so typing in the search box doesn't refetch (or re-filter a large fetched set) on
  // every keystroke -- platform/status/objective/date changes are discrete select interactions
  // where an immediate refetch is fine.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const startDate = dateRange?.from ? dateRange.from.toISOString().slice(0, 10) : undefined
  const endDate = (dateRange?.to ?? dateRange?.from)?.toISOString().slice(0, 10)

  // Fetches the account-wide KPI summary + platform breakdown (real period-over-period deltas)
  // whenever the date range OR any of platform/status/objective/search changes, and whichever
  // level-specific rows the current drill-down position needs. KPI cards always reflect the
  // account-wide summary regardless of drill level -- matches how Orders/Stores KPI strips
  // already work in this app, and keeps the real period-over-period delta computation
  // meaningful (ad-group/ad-level rows have no comparable "previous period" of their own).
  //
  // All 4 filters are sent to every call below -- previously only startDate/endDate were sent,
  // so the summary/platform-breakdown numbers never changed when platform/status/objective/
  // search were touched, and the backend never even saw those filters to apply them. `search`
  // is already debounced above specifically so it's safe to include here without a refetch per
  // keystroke.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      const commonParams = {
        startDate,
        endDate,
        platform: platform === "All Platforms" ? undefined : platform,
        status: status === "All Statuses" ? undefined : status,
        objective: objective === "All Objectives" ? undefined : objective,
        search: search.trim() || undefined,
      }

      try {
        const [summaryResult, platformsResult] = await Promise.all([
          campaignPerformanceService.getSummary(commonParams),
          campaignPerformanceService.getPlatformBreakdown(commonParams),
        ])
        if (cancelled) return
        setSummary(summaryResult)
        setPlatformRows(platformsResult.items)

        if (currentLevel === "campaigns") {
          const result = await campaignPerformanceService.listCampaigns({
            ...commonParams,
            pageSize: 200,
          })
          if (!cancelled) setCampaignRows(result.items)
        } else if (currentLevel === "adGroups" && selectedCampaign) {
          const result = await campaignPerformanceService.listAdGroups(
            selectedCampaign.id,
            commonParams
          )
          if (!cancelled) setAdGroupRows(result.items)
        } else if ((currentLevel === "ads" || currentLevel === "keywords") && selectedAdGroup) {
          const result = await campaignPerformanceService.listAdsOrKeywords(
            selectedAdGroup.id,
            currentLevel,
            commonParams
          )
          if (!cancelled) setLeafRows(result.items)
        }
      } catch (error) {
        console.error("Failed to load campaign performance", error)
        if (!cancelled) {
          setLoadError(
            "Couldn't load campaign performance from your connected ad accounts. Please try again."
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
  }, [
    currentLevel,
    selectedCampaign,
    selectedAdGroup,
    startDate,
    endDate,
    platform,
    status,
    objective,
    search,
  ])

  const filteredPlatformRows = useMemo(
    () => platformRows.filter((row) => platform === "All Platforms" || row.platform === platform),
    [platformRows, platform]
  )
  const groupedPlatformRows = useMemo(
    () => groupPlatformRows(filteredPlatformRows),
    [filteredPlatformRows]
  )

  const applyCommonFilters = (rows: CampaignPerformanceRow[]) =>
    rows.filter((row) => {
      if (platform !== "All Platforms" && row.platform !== platform) return false
      if (status !== "All Statuses" && bucketStatus(row.status) !== status) return false
      if (objective !== "All Objectives" && bucketObjective(row.objective) !== objective) {
        return false
      }
      if (search.trim()) {
        const needle = search.trim().toLowerCase()
        if (!row.name.toLowerCase().includes(needle)) return false
      }
      return true
    })

  const campaignsLevelRows = useMemo(() => {
    const scoped = selectedPlatformNode
      ? campaignRows.filter((row) =>
          PLATFORM_NODE_CONFIG[selectedPlatformNode].campaignPlatforms.includes(row.platform)
        )
      : campaignRows
    return applyCommonFilters(scoped).map(toEntityRow)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyCommonFilters closes over platform/status/objective/search, already deps below
  }, [campaignRows, selectedPlatformNode, platform, status, objective, search])

  const adGroupsLevelRows = useMemo(
    () => applyCommonFilters(adGroupRows).map(toEntityRow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adGroupRows, platform, status, objective, search]
  )

  const leafLevelRows = useMemo(
    () => applyCommonFilters(leafRows).map(toEntityRow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafRows, platform, status, objective, search]
  )

  const searchedRows = useMemo<ExplorerRow[]>(() => {
    if (currentLevel === "platforms") {
      if (!search.trim()) return groupedPlatformRows
      const needle = search.trim().toLowerCase()
      return groupedPlatformRows.filter((row) => row.entityName.toLowerCase().includes(needle))
    }
    if (currentLevel === "campaigns") return campaignsLevelRows
    if (currentLevel === "adGroups") return adGroupsLevelRows
    return leafLevelRows
  }, [
    adGroupsLevelRows,
    campaignsLevelRows,
    currentLevel,
    groupedPlatformRows,
    leafLevelRows,
    search,
  ])

  const contextPlatforms = useMemo(() => {
    if (selectedCampaign) {
      return [selectedCampaign.platform]
    }

    if (selectedPlatformNode) {
      return PLATFORM_NODE_CONFIG[selectedPlatformNode].campaignPlatforms
    }

    return []
  }, [selectedCampaign, selectedPlatformNode])

  const availableTabs = useMemo(
    () => getAvailableTabsForPlatforms(contextPlatforms),
    [contextPlatforms]
  )

  const contextCampaignPlatform = useMemo(() => {
    if (selectedCampaign) {
      return selectedCampaign.platform
    }

    if (contextPlatforms.length === 1) {
      return contextPlatforms[0]
    }

    return undefined
  }, [contextPlatforms, selectedCampaign])

  const contextCampaignType = selectedCampaign
    ? bucketObjective(selectedCampaign.objective)
    : objective

  const columns = useMemo(
    () =>
      getMetricsColumns({
        level: currentLevel,
        campaignPlatform: contextCampaignPlatform,
        campaignType: contextCampaignType,
      }),
    [contextCampaignPlatform, contextCampaignType, currentLevel]
  )

  const campaignKpiCards = useMemo<CampaignKpiCardData[]>(() => {
    if (!summary) return []
    return [
      {
        label: "مرات الظهور",
        value: summary.impressions.toLocaleString(),
        changePct: summary.impressionsChangePct,
        icon: Eye,
        tone: "violet",
      },
      {
        label: "النقرات",
        value: summary.clicks.toLocaleString(),
        changePct: summary.clicksChangePct,
        icon: MousePointerClick,
        tone: "orange",
      },
      {
        label: "نسبة النقر إلى الظهور",
        value: `${summary.ctr.toFixed(2)}%`,
        changePct: summary.ctrChangePct,
        icon: Percent,
        tone: "rose",
      },
      {
        label: "الإنفاق",
        value: `${formatSar(summary.spend)} SAR`,
        changePct: summary.spendChangePct,
        icon: CreditCard,
        tone: "green",
      },
      {
        label: "الإيرادات",
        value: `${formatSar(summary.revenue)} SAR`,
        changePct: summary.revenueChangePct,
        icon: FileText,
        tone: "blue",
      },
      {
        label: "ROAS (متوسط)",
        value: `${summary.roas.toFixed(2)}x`,
        changePct: summary.roasChangePct,
        icon: TrendingUp,
        tone: "blue",
      },
    ]
  }, [summary])

  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = searchedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const renderMetricValue = (row: ExplorerRow, column: MetricColumn) => {
    if (column.key === "entity") {
      const platformForIcon = isGroupedPlatformRow(row) ? row.platformNodeKey : row.platform
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-foreground">
            <PlatformIcon platform={platformForIcon} />
            <span className="font-medium">{row.entityName}</span>
          </div>
          <p className="text-xs text-muted-foreground">{row.entityDescription}</p>
        </div>
      )
    }

    if (column.key === "platform") {
      if (isGroupedPlatformRow(row)) {
        return row.platformNodeKey
      }

      return (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <PlatformIcon platform={row.platform} />
          <span>{row.platform}</span>
        </div>
      )
    }

    if (column.key === "status") {
      return row.status
    }

    const numericValue = Number(
      (row as unknown as Record<string, number | string>)[column.key] ?? 0
    )

    if (column.kind === "currency") {
      return formatCurrency(numericValue)
    }

    if (column.kind === "ratio") {
      return numericValue > 0 ? `${numericValue.toFixed(2)}x` : "-"
    }

    if (column.kind === "percent") {
      return `${numericValue.toFixed(2)}%`
    }

    if (column.kind === "duration") {
      return formatDuration(numericValue)
    }

    return numericValue.toLocaleString()
  }

  const navigateToRow = (row: ExplorerRow) => {
    const drill = () => {
      if (currentLevel === "platforms" && isGroupedPlatformRow(row)) {
        setSelectedPlatformNode(row.platformNodeKey)
        setSelectedCampaign(undefined)
        setSelectedAdGroup(undefined)
        setCurrentLevel("campaigns")
        return
      }

      if (currentLevel === "campaigns" && !isGroupedPlatformRow(row)) {
        setSelectedCampaign(row)
        setSelectedAdGroup(undefined)
        setCurrentLevel("adGroups")
        return
      }

      if (currentLevel === "adGroups" && !isGroupedPlatformRow(row)) {
        const next = getNextHierarchyLevel(row.platform, "adGroups")
        if (next) {
          setSelectedAdGroup(row)
          setCurrentLevel(next)
        }
      }
    }

    const isDrillable =
      currentLevel === "platforms" || currentLevel === "campaigns" || currentLevel === "adGroups"
    if (!isDrillable) {
      return
    }

    setHighlightedRowId(row.nodeId)
    setTimeout(() => {
      setHighlightedRowId(undefined)
      drill()
      setPage(1)
    }, 180)
  }

  const canGoBack = Boolean(selectedPlatformNode || selectedCampaign || selectedAdGroup)

  const handleBack = () => {
    if (selectedAdGroup) {
      setSelectedAdGroup(undefined)
      setCurrentLevel("adGroups")
      setPage(1)
      return
    }

    if (selectedCampaign) {
      setSelectedCampaign(undefined)
      setCurrentLevel("campaigns")
      setPage(1)
      return
    }

    if (selectedPlatformNode) {
      setSelectedPlatformNode(undefined)
      setCurrentLevel("platforms")
      setPage(1)
    }
  }

  const breadcrumbItems = [
    {
      label: "Overview",
      onClick: () => {
        setCurrentLevel("platforms")
        setSelectedPlatformNode(undefined)
        setSelectedCampaign(undefined)
        setSelectedAdGroup(undefined)
        setPage(1)
      },
    },
    {
      label: "Platforms",
      onClick: () => {
        setCurrentLevel("platforms")
        setSelectedCampaign(undefined)
        setSelectedAdGroup(undefined)
        setPage(1)
      },
    },
    ...(selectedPlatformNode
      ? [
          {
            label: selectedPlatformNode,
            onClick: () => {
              setCurrentLevel("campaigns")
              setSelectedCampaign(undefined)
              setSelectedAdGroup(undefined)
              setPage(1)
            },
          },
        ]
      : []),
    ...(selectedCampaign
      ? [
          {
            label: selectedCampaign.entityName,
            onClick: () => {
              setCurrentLevel("adGroups")
              setSelectedAdGroup(undefined)
              setPage(1)
            },
          },
        ]
      : []),
    ...(selectedAdGroup
      ? [
          {
            label: selectedAdGroup.entityName,
            onClick: () => {
              setCurrentLevel("adGroups")
              setPage(1)
            },
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <AppPageHeader
        title="Campaigns"
        subtitle="Manage, monitor and optimize your marketing campaigns from one place."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" dir="rtl">
        {campaignKpiCards.map((kpi) => (
          <CampaignKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>

      <AppCard
        className="overflow-hidden border border-border bg-card"
        contentClassName="space-y-4 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-[280px] max-w-lg">
            <AppSearchInput
              startIcon={<Search className="size-4" />}
              placeholder={getSearchPlaceholder(currentLevel)}
              className="h-11"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <DateRangeFilter
              value={dateRange}
              onChange={(next) => {
                setDateRange(next)
                setPage(1)
              }}
            />

            <AppSelect
              value={platform}
              onValueChange={(next) => {
                setPlatform(next as ExplorerPlatformFilter)
                setCurrentLevel("platforms")
                setSelectedPlatformNode(undefined)
                setSelectedCampaign(undefined)
                setSelectedAdGroup(undefined)
                setPage(1)
              }}
            >
              <AppSelectTrigger className="w-[170px]">
                <AppSelectValue placeholder="Platform" />
              </AppSelectTrigger>
              <AppSelectContent>
                {platformOptions.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>

            <AppSelect
              value={status}
              onValueChange={(next) => {
                setStatus(next as (typeof statusOptions)[number])
                setPage(1)
              }}
            >
              <AppSelectTrigger className="w-[170px]">
                <AppSelectValue placeholder="Campaign Status" />
              </AppSelectTrigger>
              <AppSelectContent>
                {statusOptions.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>

            <AppSelect
              value={objective}
              onValueChange={(next) => {
                setObjective(next as CampaignTypeFilter)
                setPage(1)
              }}
            >
              <AppSelectTrigger className="w-[190px]">
                <AppSelectValue placeholder="Campaign Objective" />
              </AppSelectTrigger>
              <AppSelectContent>
                {objectiveOptions.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AppButton
              type="button"
              size="sm"
              variant="outline"
              className="border-border bg-muted/60 text-muted-foreground hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              disabled={!canGoBack}
              onClick={handleBack}
            >
              Back
            </AppButton>

            {breadcrumbItems.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-muted-foreground">&gt;</span> : null}
                <button
                  type="button"
                  className="text-foreground/90 hover:text-foreground"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableTabs.map((tab) => {
            const platformAllowsTab = contextCampaignPlatform
              ? CAMPAIGN_PLATFORM_HIERARCHY[contextCampaignPlatform].tabs.includes(tab.key)
              : true

            const contextAllowsTab =
              tab.key === "campaigns"
                ? Boolean(selectedPlatformNode)
                : tab.key === "adGroups"
                  ? Boolean(selectedCampaign)
                  : Boolean(selectedAdGroup)

            const disabledReason = !platformAllowsTab
              ? "Keyword analysis is only available for Search campaigns."
              : !contextAllowsTab
                ? `Drill down to ${getEntityLabel(tab.key, contextCampaignPlatform).toLowerCase()} context first.`
                : undefined

            const isActive = currentLevel === tab.key

            return (
              <AppButton
                key={tab.key}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                className={
                  isActive
                    ? "bg-sky-400 text-foreground hover:bg-sky-300"
                    : "border-border bg-muted/60 text-muted-foreground hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
                }
                disabled={!platformAllowsTab || !contextAllowsTab}
                title={disabledReason}
                onClick={() => {
                  if (!platformAllowsTab || !contextAllowsTab) {
                    return
                  }
                  setCurrentLevel(tab.key)
                  setPage(1)
                }}
              >
                {tab.key === "adGroups"
                  ? CAMPAIGN_PLATFORM_HIERARCHY[contextCampaignPlatform ?? "Google Search"]
                      .adGroupLabel
                  : tab.label}
              </AppButton>
            )
          })}
        </div>

        <div className="overflow-x-auto">
          <AppTable className="min-w-[1280px]">
            <AppTableHeader>
              <AppTableRow className="border-border hover:bg-transparent">
                {columns.map((column) => (
                  <AppTableHead
                    key={column.key}
                    className={
                      column.key === "entity"
                        ? "w-[26%] text-left text-muted-foreground"
                        : "!text-center text-muted-foreground"
                    }
                  >
                    {column.label}
                  </AppTableHead>
                ))}
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {isLoading ? (
                <AppTableRow className="border-border">
                  <AppTableCell colSpan={columns.length} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">Loading campaign performance...</p>
                  </AppTableCell>
                </AppTableRow>
              ) : loadError ? (
                <AppTableRow className="border-border">
                  <AppTableCell colSpan={columns.length} className="py-10 text-center">
                    <p className="text-sm text-rose-600">{loadError}</p>
                  </AppTableCell>
                </AppTableRow>
              ) : paginatedRows.length === 0 ? (
                <AppTableRow className="border-border">
                  <AppTableCell colSpan={columns.length} className="py-10 text-center">
                    <p className="text-base font-semibold text-foreground">
                      No performance data matches the selected filters
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Adjust platform, status, objective, hierarchy level, or date range to explore
                      another slice.
                    </p>
                  </AppTableCell>
                </AppTableRow>
              ) : (
                paginatedRows.map((row) => {
                  const isDrillable =
                    currentLevel === "platforms" ||
                    currentLevel === "campaigns" ||
                    currentLevel === "adGroups"
                  const isHighlighted = highlightedRowId === row.nodeId

                  return (
                    <AppTableRow
                      key={row.nodeId}
                      className={`${isDrillable ? "cursor-pointer" : "cursor-default"} border-border transition-colors hover:bg-muted ${isHighlighted ? "bg-muted/60" : ""}`}
                      onClick={() => navigateToRow(row)}
                    >
                      {columns.map((column) => (
                        <AppTableCell
                          key={`${row.nodeId}-${column.key}`}
                          className={
                            column.key === "entity"
                              ? "text-left"
                              : "text-center tabular-nums text-foreground/90"
                          }
                        >
                          {column.key === "roas" ? (
                            <span
                              className={`font-semibold ${getRoasClasses(Number((row as unknown as Record<string, unknown>)["roas"] ?? 0))}`}
                            >
                              {renderMetricValue(row, column)}
                            </span>
                          ) : (
                            renderMetricValue(row, column)
                          )}
                        </AppTableCell>
                      ))}
                    </AppTableRow>
                  )
                })
              )}
            </AppTableBody>
          </AppTable>
        </div>

        <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            {searchedRows.length === 0
              ? "Showing 0 of 0"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, searchedRows.length)} of ${searchedRows.length}`}
          </div>

          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              size="sm"
              className="rounded-xl border-border bg-muted/60 text-foreground/90 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </AppButton>
            <span className="min-w-24 text-center text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <AppButton
              variant="outline"
              size="sm"
              className="rounded-xl border-border bg-muted/60 text-foreground/90 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </AppButton>
          </div>
        </div>
      </AppCard>

      <AppCard
        title="AI Campaign Recommendations"
        subtitle="Reserved space for the upcoming AI optimization widget."
        className="overflow-hidden border border-dashed border-border bg-card"
      >
        <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Coming soon.
        </div>
      </AppCard>
    </div>
  )
}
