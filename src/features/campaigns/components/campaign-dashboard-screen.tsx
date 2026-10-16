"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { format, subDays } from "date-fns"
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FileText,
  LayoutGrid,
  Lightbulb,
  type LucideIcon,
  MousePointerClick,
  Percent,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDateRangeFilter,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import {
  type CampaignPerformancePlatformRow,
  type CampaignPerformanceRow,
  campaignPerformanceService,
  type CampaignPerformanceSummary,
} from "../services/campaign-performance.service"
import {
  CAMPAIGN_PLATFORM_HIERARCHY,
  type CampaignTypeFilter,
  type ExplorerLevel,
  type ExplorerPlatformFilter,
  getAvailableTabsForPlatforms,
  getNextHierarchyLevel,
  type MetricColumn,
  PLATFORM_NODE_CONFIG,
  type PlatformNodeKey,
  translatedAnalysisTabs,
  translatedMetricsColumns,
} from "./campaign-metrics"
import { CampaignSpendDonut } from "./campaign-spend-donut"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

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

// Slice colours for the chart view, in the order the rows come back.
const DONUT_COLORS = ["#2878ff", "#1f9d55", "#8b5cf6", "#e08b00", "#e0484d", "#12a594"]

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

// Colours and radii below come from the campaigns SVG export rather than the shared
// dashboard tokens, matching the treatment the integrations surfaces already use.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FILTER_TRIGGER_CLASS =
  "h-10 w-[140px] rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"

// Shared translator shape for every module-level helper below that needs to translate -- same
// pattern as translatedCampaignStatusMeta (campaign-status.service.ts) and
// translatedPlanTierMeta (applications/services/plan-tiers.ts): these helpers can't call
// useTranslations() themselves, so the caller's `t` is threaded through instead.
type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

// Objective/status/platform filter options are this screen's own enums (not covered by
// campaign-metrics.ts's translated exports, which only cover columns/entity labels/tabs), so
// each gets a small local label-key map + translator, following the same shape as
// campaign-metrics.ts's METRIC_COLUMN_LABEL_KEYS. Brand/platform names (Google/YouTube/Meta/
// TikTok/Snapchat) are never translated -- platform options with no entry here fall through to
// the raw literal value.
const OBJECTIVE_OPTION_KEYS: Record<CampaignTypeFilter, string> = {
  "All Objectives": "allObjectives",
  Awareness: "awareness",
  Traffic: "traffic",
  Leads: "leads",
  Conversions: "conversions",
  Sales: "sales",
}

function translatedObjectiveOption(option: CampaignTypeFilter, t: CampaignsTranslator) {
  return t(
    `dashboardScreen.filters.objective.${OBJECTIVE_OPTION_KEYS[option]}` as "dashboardScreen.filters.objective.allObjectives"
  )
}

const STATUS_OPTION_KEYS: Record<(typeof statusOptions)[number], string> = {
  "All Statuses": "allStatuses",
  Active: "active",
  Paused: "paused",
  Other: "other",
}

function translatedStatusOption(option: (typeof statusOptions)[number], t: CampaignsTranslator) {
  return t(
    `dashboardScreen.filters.status.${STATUS_OPTION_KEYS[option]}` as "dashboardScreen.filters.status.allStatuses"
  )
}

// "Google Search"/"Google Display" need the surrounding words translated while "Google" itself
// stays a brand name (matches the convention already established for these two options). The
// other platforms (YouTube/Meta/TikTok/Snapchat) are pure brand names with no entry below, so
// translatedPlatformOption falls through to the raw value for them.
const PLATFORM_OPTION_KEYS: Partial<Record<ExplorerPlatformFilter, string>> = {
  "All Platforms": "allPlatforms",
  "Google Search": "googleSearch",
  "Google Display": "googleDisplay",
}

function translatedPlatformOption(option: ExplorerPlatformFilter, t: CampaignsTranslator) {
  const key = PLATFORM_OPTION_KEYS[option]
  return key
    ? t(
        `dashboardScreen.filters.platform.${key}` as "dashboardScreen.filters.platform.allPlatforms"
      )
    : option
}

// Raw ad-platform status text (enabled/active/paused/removed/ended) -- a different vocabulary
// than the internal CampaignStatus enum CampaignStatusBadge/translatedCampaignStatusMeta cover
// (draft/scheduled/active/paused/completed/archived), so this stays its own small translated map
// rather than reusing those.
const STATUS_PILL_KEYS: Record<string, { key: string; className: string }> = {
  active: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  enabled: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  paused: { key: "paused", className: "bg-[#fff7e6] text-[#e08b00]" },
  removed: { key: "removed", className: "bg-[#fdeeee] text-[#e0484d]" },
  ended: { key: "ended", className: "bg-[#eef2f8] text-[#5b6b85]" },
}

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

// Mirrors campaign-list-table.tsx/campaign-details-view.tsx's locale-aware number/currency
// helpers in this same feature: Arabic numerals are forced to Western digits via -u-nu-latn so
// they match the plain numbers coming from the backend, and the currency amount gets a trailing
// "ر.س" (Arabic) or a leading "SAR " (English).
function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale)).format(value)
}

function formatCurrency(value: number, locale: Locale) {
  const amount = new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
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
  blue: "bg-[#eef4ff] text-[#2878ff]",
  green: "bg-[#e9f8ef] text-[#1f9d55]",
  orange: "bg-[#fff3e3] text-[#e08b00]",
  rose: "bg-[#fdeeee] text-[#e0484d]",
  violet: "bg-[#f3eeff] text-[#8b5cf6]",
}

function CampaignKpiCard({ kpi }: { kpi: CampaignKpiCardData }) {
  const t = useTranslations("campaigns")
  const Icon = kpi.icon
  const changeLabel = formatChangePct(kpi.changePct)
  const trend = (kpi.changePct ?? 0) >= 0 ? "up" : "down"
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight

  return (
    <div className={cn(PANEL, "p-4")}>
      {/* RTL: the label/value block is written first so it lands on the right, icon left. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[11.5px] leading-[18px]", MUTED)}>{kpi.label}</p>
          <p className={cn("mt-1.5 text-[20px] font-extrabold leading-tight", HEADING)}>
            {kpi.value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>

      {/* The export draws a sparkline here. There is no per-metric time series on the
          campaigns service -- only the period totals and their deltas -- so the card shows
          the real change instead of a trend line it would have to invent. */}
      <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[#f1f4f9] pt-2.5">
        {changeLabel ? (
          <>
            <span className={cn("text-[10.5px]", MUTED)}>
              {t("dashboardScreen.kpis.comparedToPreviousPeriod")}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-bold",
                trend === "up" ? "text-[#1f9d55]" : "text-[#e0484d]"
              )}
            >
              {changeLabel}
              <TrendIcon className="size-3" />
            </span>
          </>
        ) : (
          <span className={cn("text-[10.5px]", MUTED)}>
            {t("dashboardScreen.kpis.noPreviousPeriod")}
          </span>
        )}
      </div>
    </div>
  )
}

function getRoasClasses(roas: number) {
  if (roas >= 4) return "text-[#1f9d55]"
  if (roas >= 2.5) return "text-[#2878ff]"
  if (roas > 0) return "text-[#e08b00]"
  return "text-[#95a4bd]"
}

function getSearchPlaceholder(level: ExplorerLevel, t: CampaignsTranslator) {
  if (level === "platforms") return t("dashboardScreen.searchPlaceholder.platforms")
  if (level === "campaigns") return t("dashboardScreen.searchPlaceholder.campaigns")
  if (level === "adGroups") return t("dashboardScreen.searchPlaceholder.adGroups")
  if (level === "keywords") return t("dashboardScreen.searchPlaceholder.keywords")
  return t("dashboardScreen.searchPlaceholder.ads")
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

function toEntityRow(row: CampaignPerformanceRow, t: CampaignsTranslator): EntityRow {
  const statusLabel = statusPill(row.status, t).label
  return {
    ...row,
    nodeId: row.id,
    entityName: row.name,
    entityDescription: row.activityDate
      ? t("dashboardScreen.entityDescription.withActivity", {
          status: statusLabel,
          date: row.activityDate,
        })
      : statusLabel,
  }
}

// Groups the backend's per-CampaignPerformancePlatform rows (Google Search/Display/YouTube/
// Meta/TikTok/Snapchat, one each) into one row per PlatformNodeKey ("Google" combines Search +
// Display) -- matches the product's original platform-overview hierarchy.
function groupPlatformRows(
  rows: CampaignPerformancePlatformRow[],
  t: CampaignsTranslator
): GroupedPlatformRow[] {
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
            entityDescription: t("dashboardScreen.entityDescription.activeCampaignsCount", {
              count: activeCampaigns,
            }),
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

export function CampaignDashboardScreen() {
  const t = useTranslations("campaigns")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewMode, setViewMode] = useState<"table" | "chart">("table")
  const [currentLevel, setCurrentLevel] = useState<ExplorerLevel>("platforms")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<ExplorerPlatformFilter>("All Platforms")
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All Statuses")
  const [objective, setObjective] = useState<CampaignTypeFilter>("All Objectives")
  // Pre-selected, not left empty -- the backend always scopes to a real date window (defaults
  // to the last 30 days when none is sent), so the picker must show that honestly instead of
  // implying "all data" while secretly filtering to 30 days behind the scenes. Matches the
  // "Last 30 Days" preset exactly (see AppDateRangeFilter) so clicking that preset explicitly
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
          setLoadError(t("dashboardScreen.loadError"))
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
    t,
  ])

  const filteredPlatformRows = useMemo(
    () => platformRows.filter((row) => platform === "All Platforms" || row.platform === platform),
    [platformRows, platform]
  )
  const groupedPlatformRows = useMemo(
    () => groupPlatformRows(filteredPlatformRows, t),
    [filteredPlatformRows, t]
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
    return applyCommonFilters(scoped).map((row) => toEntityRow(row, t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyCommonFilters closes over platform/status/objective/search, already deps below
  }, [campaignRows, selectedPlatformNode, platform, status, objective, search, t])

  const adGroupsLevelRows = useMemo(
    () => applyCommonFilters(adGroupRows).map((row) => toEntityRow(row, t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adGroupRows, platform, status, objective, search, t]
  )

  const leafLevelRows = useMemo(
    () => applyCommonFilters(leafRows).map((row) => toEntityRow(row, t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafRows, platform, status, objective, search, t]
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

  // getAvailableTabsForPlatforms above only decides WHICH tabs are available (filtering logic
  // specific to this screen) -- the actual displayed label for each comes from here, the
  // translated counterpart of the same ANALYSIS_TABS list.
  const translatedTabs = useMemo(() => translatedAnalysisTabs(t), [t])

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
      translatedMetricsColumns(
        {
          level: currentLevel,
          campaignPlatform: contextCampaignPlatform,
          campaignType: contextCampaignType,
        },
        t
      ),
    [contextCampaignPlatform, contextCampaignType, currentLevel, t]
  )

  const campaignKpiCards = useMemo<CampaignKpiCardData[]>(() => {
    if (!summary) return []
    return [
      {
        label: t("metrics.columns.impressions"),
        value: formatNumber(summary.impressions, locale),
        changePct: summary.impressionsChangePct,
        icon: Eye,
        tone: "violet",
      },
      {
        label: t("metrics.columns.clicks"),
        value: formatNumber(summary.clicks, locale),
        changePct: summary.clicksChangePct,
        icon: MousePointerClick,
        tone: "orange",
      },
      {
        label: t("metrics.columns.ctr"),
        value: `${summary.ctr.toFixed(2)}%`,
        changePct: summary.ctrChangePct,
        icon: Percent,
        tone: "rose",
      },
      {
        label: t("metrics.columns.spend"),
        value: formatCurrency(summary.spend, locale),
        changePct: summary.spendChangePct,
        icon: CreditCard,
        tone: "green",
      },
      {
        label: t("metrics.columns.revenue"),
        value: formatCurrency(summary.revenue, locale),
        changePct: summary.revenueChangePct,
        icon: FileText,
        tone: "blue",
      },
      {
        label: t("metrics.columns.roas"),
        value: `${summary.roas.toFixed(2)}x`,
        changePct: summary.roasChangePct,
        icon: TrendingUp,
        tone: "blue",
      },
    ]
  }, [summary, t, locale])

  const totalPages = Math.max(1, Math.ceil(searchedRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = searchedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Spend by row for the chart view -- the same real rows the table shows, not a separate
  // series. Rows with no spend are dropped so the donut has nothing empty to draw.
  const spendDistribution = useMemo(
    () =>
      searchedRows
        .map((row, index) => ({
          label: row.entityName,
          value: Number((row as unknown as Record<string, unknown>).spend ?? 0),
          color: DONUT_COLORS[index % DONUT_COLORS.length],
        }))
        .filter((slice) => slice.value > 0),
    [searchedRows]
  )

  // Every recommendation below is a statement about a number already on this page. There is
  // no AI recommendation service for campaigns, so nothing here is predicted or scored --
  // each card names the platform and the figure that triggered it.
  const recommendations = useMemo(() => {
    const rows = groupedPlatformRows.filter((row) => row.impressions > 0 || row.spend > 0)
    if (rows.length === 0) return []

    const cards: Array<{
      key: string
      title: string
      body: string
      icon: LucideIcon
      className: string
      iconClassName: string
    }> = []

    const bestRoas = [...rows].filter((row) => row.roas > 0).sort((a, b) => b.roas - a.roas)[0]
    if (bestRoas) {
      cards.push({
        key: "budget",
        title: t("dashboardScreen.recommendations.budget.title", { entity: bestRoas.entityName }),
        body: t("dashboardScreen.recommendations.budget.body", {
          entity: bestRoas.entityName,
          roas: bestRoas.roas.toFixed(2),
        }),
        icon: TrendingUp,
        className: "border-[#bfe8cf] bg-[#f2fbf6]",
        iconClassName: "bg-[#e9f8ef] text-[#1f9d55]",
      })
    }

    const dormant = rows.find((row) => row.activeCampaigns === 0 && row.impressions > 0)
    if (dormant) {
      cards.push({
        key: "reactivate",
        title: t("dashboardScreen.recommendations.reactivate.title", {
          entity: dormant.entityName,
        }),
        body: t("dashboardScreen.recommendations.reactivate.body", {
          entity: dormant.entityName,
          impressions: formatNumber(dormant.impressions, locale),
        }),
        icon: RefreshCcw,
        className: "border-[#f7ddab] bg-[#fffaf0]",
        iconClassName: "bg-[#fff3e3] text-[#e08b00]",
      })
    }

    const weakestCtr = [...rows]
      .filter((row) => row.impressions > 0)
      .sort((a, b) => a.ctr - b.ctr)[0]
    if (weakestCtr) {
      cards.push({
        key: "targeting",
        title: t("dashboardScreen.recommendations.targeting.title"),
        body: t("dashboardScreen.recommendations.targeting.body", {
          entity: weakestCtr.entityName,
          ctr: weakestCtr.ctr.toFixed(2),
        }),
        icon: Target,
        className: "border-[#e1e7f0] bg-white",
        iconClassName: "bg-[#eef4ff] text-[#2878ff]",
      })
    }

    return cards
  }, [groupedPlatformRows, t, locale])

  // Exports exactly what is on screen -- the current columns, the current filters, the rows
  // the table is showing -- so the file and the page can never disagree.
  const handleExport = () => {
    const header = columns.map((column) => column.label)
    const body = searchedRows.map((row) =>
      columns.map((column) => {
        if (column.key === "entity") return row.entityName
        const value = (row as unknown as Record<string, unknown>)[column.key]
        return value === undefined || value === null ? "" : String(value)
      })
    )
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `campaigns-${format(new Date(), "yyyy-MM-dd")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const renderMetricValue = (row: ExplorerRow, column: MetricColumn) => {
    if (column.key === "entity") {
      const platformForIcon = isGroupedPlatformRow(row) ? row.platformNodeKey : row.platform
      return (
        // RTL: the badge is written first so it lands to the right of the name, and
        // justify-start is the right-hand edge here -- justify-end would push the whole
        // cell to the left, away from its right-aligned column header.
        <div className="flex items-center justify-start gap-2.5">
          <PlatformBadge platform={platformForIcon} className="size-8" iconClassName="size-4" />
          <div className="min-w-0 text-right">
            <p className={cn("truncate text-[12.5px] font-bold", HEADING)}>{row.entityName}</p>
            <p className={cn("truncate text-[11px]", MUTED)}>{row.entityDescription}</p>
          </div>
        </div>
      )
    }

    if (column.key === "platform") {
      if (isGroupedPlatformRow(row)) {
        return row.platformNodeKey
      }

      return (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <PlatformBadge platform={row.platform} className="size-6" iconClassName="size-3.5" />
          <span>{row.platform}</span>
        </div>
      )
    }

    if (column.key === "status") {
      const pill = statusPill(row.status, t)
      return (
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
            pill.className
          )}
        >
          {pill.label}
        </span>
      )
    }

    if (column.key === "roas") {
      const roas = Number((row as unknown as Record<string, number>).roas ?? 0)
      return (
        <span className={cn("font-bold", getRoasClasses(roas))}>
          {roas > 0 ? `${roas.toFixed(2)}x` : "-"}
        </span>
      )
    }

    const numericValue = Number(
      (row as unknown as Record<string, number | string>)[column.key] ?? 0
    )

    if (column.kind === "currency") {
      return formatCurrency(numericValue, locale)
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

    return formatNumber(numericValue, locale)
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

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, actions left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("dashboardScreen.title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("dashboardScreen.subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AppButton
              variant="outline"
              className="h-10 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
              icon={<Download className="size-4" />}
              iconPosition="end"
              disabled={searchedRows.length === 0}
              onClick={handleExport}
            >
              {tCommon("export")}
            </AppButton>
            <AppDateRangeFilter
              value={dateRange}
              onChange={(next) => {
                setDateRange(next)
                setPage(1)
              }}
            />
          </div>
        </div>

        <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {campaignKpiCards.map((kpi) => (
            <CampaignKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <div className={cn(PANEL, "space-y-4 p-4 md:p-5")}>
          {/* RTL: search first so it sits on the right, view toggle last so it sits left. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full md:w-[380px] lg:w-[420px]">
              <AppSearchInput
                startIcon={<Search className="size-4 text-[#95a4bd]" />}
                placeholder={getSearchPlaceholder(currentLevel, t)}
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] placeholder:text-[#95a4bd]"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <AppSelect
                value={objective}
                onValueChange={(next) => {
                  setObjective(next as CampaignTypeFilter)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={FILTER_TRIGGER_CLASS}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {objectiveOptions.map((option) => (
                    <AppSelectItem key={option} value={option}>
                      {translatedObjectiveOption(option, t)}
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
                <AppSelectTrigger className={FILTER_TRIGGER_CLASS}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {statusOptions.map((option) => (
                    <AppSelectItem key={option} value={option}>
                      {translatedStatusOption(option, t)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>

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
                <AppSelectTrigger className={FILTER_TRIGGER_CLASS}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {platformOptions.map((option) => (
                    <AppSelectItem key={option} value={option}>
                      {translatedPlatformOption(option, t)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="ms-auto flex items-center gap-1 rounded-[10px] bg-[#f2f5fa] p-1">
              {(
                [
                  { key: "table", label: t("dashboardScreen.viewMode.table"), icon: LayoutGrid },
                  { key: "chart", label: t("dashboardScreen.viewMode.chart"), icon: BarChart3 },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[12px] font-semibold transition-colors",
                    viewMode === option.key
                      ? "bg-white text-[#0b1738] shadow-[0_1px_3px_rgba(11,23,56,0.12)]"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                  onClick={() => setViewMode(option.key)}
                >
                  <option.icon className="size-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* The drill-down is not in the export but is the page's real navigation: without
              it the platform rows lead nowhere. Kept, restyled to the new surface. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[#f1f4f9] pt-3.5">
            <AppButton
              type="button"
              variant="outline"
              className="h-8 rounded-[8px] border-[#e1e7f0] bg-white px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
              disabled={!canGoBack}
              onClick={handleBack}
            >
              {tCommon("back")}
            </AppButton>

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
                ? t("dashboardScreen.tabs.disabledReason.keywordsRequireSearch")
                : !contextAllowsTab
                  ? t("dashboardScreen.tabs.disabledReason.selectHigherLevelFirst")
                  : undefined

              const isActive = currentLevel === tab.key
              const label =
                translatedTabs.find((entry) => entry.key === tab.key)?.label ?? tab.label

              return (
                <button
                  key={tab.key}
                  type="button"
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                    isActive
                      ? "bg-[#2878ff] text-white"
                      : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
                    !platformAllowsTab || !contextAllowsTab
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer"
                  )}
                  disabled={!platformAllowsTab || !contextAllowsTab}
                  title={disabledReason}
                  onClick={() => {
                    if (!platformAllowsTab || !contextAllowsTab) return
                    setCurrentLevel(tab.key)
                    setPage(1)
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {viewMode === "chart" ? (
            <div className="rounded-[12px] border border-[#eef2f8] p-5">
              {isLoading ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                  {t("dashboardScreen.loadingPerformance")}
                </p>
              ) : spendDistribution.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                  {t("dashboardScreen.chart.noSpendData")}
                </p>
              ) : (
                <>
                  <h3 className={cn("mb-4 text-[14px] font-extrabold", HEADING)}>
                    {t("dashboardWidgets.spendDistributionCard.title")}
                  </h3>
                  <CampaignSpendDonut distribution={spendDistribution} />
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-center">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] px-3 py-3 text-[11px] font-semibold",
                          MUTED,
                          column.key === "entity" ? "text-right" : "text-center"
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
                      <td colSpan={columns.length} className="py-10 text-center">
                        <p className={cn("text-[12.5px]", MUTED)}>
                          {t("dashboardScreen.loadingPerformance")}
                        </p>
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan={columns.length} className="py-10 text-center">
                        <p className="text-[12.5px] text-[#e0484d]">{loadError}</p>
                      </td>
                    </tr>
                  ) : paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-12 text-center">
                        <p className={cn("text-[13.5px] font-bold", HEADING)}>
                          {t("dashboardScreen.table.emptyTitle")}
                        </p>
                        <p className={cn("mt-2 text-[12px]", MUTED)}>
                          {t("dashboardScreen.table.emptyDescription")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => {
                      const isDrillable =
                        currentLevel === "platforms" ||
                        currentLevel === "campaigns" ||
                        currentLevel === "adGroups"
                      const isHighlighted = highlightedRowId === row.nodeId

                      return (
                        <tr
                          key={row.nodeId}
                          className={cn(
                            "border-b border-[#f4f7fb] transition-colors hover:bg-[#f8fafd]",
                            isDrillable ? "cursor-pointer" : "cursor-default",
                            isHighlighted && "bg-[#f2f6fd]"
                          )}
                          onClick={() => navigateToRow(row)}
                        >
                          {columns.map((column) => (
                            <td
                              key={`${row.nodeId}-${column.key}`}
                              className={cn(
                                "px-3 py-3.5 text-[12.5px]",
                                column.key === "entity"
                                  ? "text-right"
                                  : "text-center tabular-nums text-[#334155]"
                              )}
                            >
                              {renderMetricValue(row, column)}
                            </td>
                          ))}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === "table" ? (
            <div className="flex flex-col gap-3 border-t border-[#f1f4f9] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
              {/* RTL: the count and page-size sit on the right, the pager on the left. */}
              <div className="flex items-center gap-3">
                <span className={cn("text-[12px]", MUTED)}>
                  {searchedRows.length === 0
                    ? t("dashboardScreen.pagination.noResults")
                    : t("dashboardScreen.pagination.rangeSummary", {
                        start: (currentPage - 1) * pageSize + 1,
                        end: Math.min(currentPage * pageSize, searchedRows.length),
                        total: searchedRows.length,
                      })}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>
                    {t("listTable.pagination.rowsPerPage")}
                  </span>
                  <AppSelect
                    value={String(pageSize)}
                    onValueChange={(next) => {
                      setPageSize(Number(next))
                      setPage(1)
                    }}
                  >
                    <AppSelectTrigger className="h-9 w-[74px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {[10, 25, 50].map((option) => (
                        <AppSelectItem key={option} value={String(option)}>
                          {option}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label={t("dashboardScreen.pagination.previousPage")}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </button>
                <span
                  className={cn(
                    "flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-[#2878ff] bg-white px-2 text-[12px] font-bold",
                    "text-[#2878ff]"
                  )}
                >
                  {currentPage}
                </span>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("dashboardScreen.pagination.nextPage")}
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("dashboardScreen.recommendations.heading")}
            </h2>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[11px] font-extrabold text-[#2878ff]">
              AI
            </span>
          </div>

          {/* RTL: the derived cards are written first so they sit on the right. */}
          <div className="mt-4 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
            {recommendations.length === 0 ? (
              <div className="rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] px-5 py-8 text-center">
                <p className={cn("text-[12.5px]", MUTED)}>
                  {t("dashboardScreen.recommendations.emptyState")}
                </p>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {recommendations.map((card) => (
                  <div key={card.key} className={cn("rounded-[12px] border p-4", card.className)}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={cn("text-[12.5px] font-extrabold leading-5", HEADING)}>
                        {card.title}
                      </p>
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          card.iconClassName
                        )}
                      >
                        <card.icon className="size-4" />
                      </span>
                    </div>
                    <p className={cn("mt-2 text-[11.5px] leading-[19px]", MUTED)}>{card.body}</p>
                    <AppButton
                      asChild
                      variant="outline"
                      className="mt-3.5 h-9 w-full rounded-[10px] border-[#e1e7f0] bg-white text-[12px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                    >
                      <Link href={ROUTES.ai}>
                        {t("dashboardScreen.recommendations.viewDetails")}
                      </Link>
                    </AppButton>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-[12px] border border-[#e1e7f0] bg-gradient-to-l from-[#eef4ff] to-[#fbfcff] p-5">
              <span className="flex size-11 items-center justify-center rounded-full bg-white text-[#e08b00] shadow-[0_4px_12px_rgba(11,23,56,0.08)]">
                <Lightbulb className="size-5" />
              </span>
              <h3 className={cn("mt-3.5 text-[13.5px] font-extrabold leading-5", HEADING)}>
                {t("dashboardScreen.aiPromo.title")}
              </h3>
              <p className={cn("mt-2 text-[11.5px] leading-[19px]", MUTED)}>
                {t("dashboardScreen.aiPromo.description")}
              </p>
              <AppButton
                asChild
                className="mt-4 h-10 w-full rounded-[10px] bg-[#2878ff] text-[12.5px] font-semibold text-white hover:bg-[#1f66e0]"
              >
                <Link href={ROUTES.ai}>
                  <span className="flex items-center justify-center gap-2">
                    {t("dashboardScreen.aiPromo.viewRecommendations")}
                    <Sparkles className="size-4" />
                  </span>
                </Link>
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
