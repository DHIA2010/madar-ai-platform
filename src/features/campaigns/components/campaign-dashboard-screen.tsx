"use client"

import { useMemo, useState } from "react"
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
  FileText,
  Globe,
  type LucideIcon,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Users,
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
  type AnalysisTab,
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

type CampaignStatus = "Active" | "Paused" | "Completed" | "Draft"
type CampaignObjective = Exclude<CampaignTypeFilter, "All Objectives">

type CampaignRow = {
  id: number
  name: string
  platform: CampaignPlatform
  objective: CampaignObjective
  status: CampaignStatus
  subtitle: string
  activityDate: string
  spend: number
  revenue: number
  roas: number
  clicks: number
  conversions: number
  conversionRate: number
  ctr: number
  cpc: number
  cpa: number
  impressions: number
  cost: number
  qualityScore: number
  impressionShare: number
  searchTopImpressionRate: number
  cpm: number
  viewableImpressions: number
  viewability: number
  views: number
  viewRate: number
  watchTime: number
  averageViewDuration: number
  view25: number
  view50: number
  view75: number
  view100Completion: number
  reach: number
  frequency: number
  videoPlays: number
  threeSecondViews: number
  thruPlays: number
  addToCart: number
  checkoutStarted: number
  purchases: number
  purchaseValue: number
}

type EntityRow = CampaignRow & {
  nodeId: string
  level: AnalysisTab
  campaignId: number
  adGroupId?: string
  entityName: string
  entityDescription: string
}

type PlatformRow = {
  nodeId: string
  level: "platforms"
  platformNodeKey: PlatformNodeKey
  entityName: string
  entityDescription: string
  activeCampaigns: number
  spend: number
  revenue: number
  roas: number
  clicks: number
  conversions: number
  ctr: number
  status: string
}

type ExplorerRow = EntityRow | PlatformRow

const campaignRows: CampaignRow[] = [
  {
    id: 1,
    name: "Saudi Search - Electronics",
    platform: "Google Search",
    objective: "Sales",
    status: "Active",
    subtitle: "High-intent acquisition campaign for premium electronics.",
    activityDate: "2026-06-04",
    spend: 41800,
    revenue: 184200,
    roas: 4.41,
    clicks: 19240,
    conversions: 1073,
    conversionRate: 5.58,
    ctr: 6.32,
    cpc: 2.17,
    cpa: 38.96,
    impressions: 304500,
    cost: 41800,
    qualityScore: 8.2,
    impressionShare: 72.4,
    searchTopImpressionRate: 56.7,
    cpm: 0,
    viewableImpressions: 0,
    viewability: 0,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 0,
    frequency: 0,
    videoPlays: 0,
    threeSecondViews: 0,
    thruPlays: 0,
    addToCart: 612,
    checkoutStarted: 421,
    purchases: 286,
    purchaseValue: 142800,
  },
  {
    id: 2,
    name: "UAE Display Prospecting",
    platform: "Google Display",
    objective: "Awareness",
    status: "Active",
    subtitle: "Broad reach programmatic display for top-funnel growth.",
    activityDate: "2026-06-07",
    spend: 22100,
    revenue: 61500,
    roas: 2.78,
    clicks: 5820,
    conversions: 214,
    conversionRate: 3.68,
    ctr: 0.78,
    cpc: 3.8,
    cpa: 103.27,
    impressions: 748900,
    cost: 22100,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 29.52,
    viewableImpressions: 498200,
    viewability: 66.5,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 388000,
    frequency: 1.93,
    videoPlays: 0,
    threeSecondViews: 0,
    thruPlays: 0,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
    purchaseValue: 0,
  },
  {
    id: 3,
    name: "YouTube Smart Watch Stories",
    platform: "YouTube",
    objective: "Traffic",
    status: "Paused",
    subtitle: "Video storytelling to drive upper-mid funnel traffic quality.",
    activityDate: "2026-06-11",
    spend: 26900,
    revenue: 90200,
    roas: 3.35,
    clicks: 7340,
    conversions: 301,
    conversionRate: 4.1,
    ctr: 1.64,
    cpc: 3.66,
    cpa: 89.37,
    impressions: 448100,
    cost: 26900,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 60.03,
    viewableImpressions: 0,
    viewability: 0,
    views: 195400,
    viewRate: 43.6,
    watchTime: 57200,
    averageViewDuration: 18.4,
    view25: 71.2,
    view50: 52.1,
    view75: 36.7,
    view100Completion: 22.8,
    reach: 280400,
    frequency: 1.6,
    videoPlays: 184200,
    threeSecondViews: 0,
    thruPlays: 0,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
    purchaseValue: 0,
  },
  {
    id: 4,
    name: "Meta Retargeting - Fashion",
    platform: "Meta",
    objective: "Sales",
    status: "Active",
    subtitle: "Conversion-focused retargeting for cart and checkout visitors.",
    activityDate: "2026-06-13",
    spend: 19300,
    revenue: 52300,
    roas: 2.71,
    clicks: 6880,
    conversions: 278,
    conversionRate: 4.04,
    ctr: 1.93,
    cpc: 2.81,
    cpa: 69.42,
    impressions: 356900,
    cost: 19300,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 54.07,
    viewableImpressions: 0,
    viewability: 0,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 148500,
    frequency: 2.4,
    videoPlays: 68500,
    threeSecondViews: 42100,
    thruPlays: 16200,
    addToCart: 512,
    checkoutStarted: 299,
    purchases: 186,
    purchaseValue: 68400,
  },
  {
    id: 5,
    name: "Meta Awareness - Home Decor",
    platform: "Meta",
    objective: "Awareness",
    status: "Completed",
    subtitle: "Broad-reach video burst campaign for seasonal collections.",
    activityDate: "2026-06-16",
    spend: 15800,
    revenue: 17900,
    roas: 1.13,
    clicks: 2110,
    conversions: 64,
    conversionRate: 3.03,
    ctr: 0.84,
    cpc: 7.49,
    cpa: 246.88,
    impressions: 603200,
    cost: 15800,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 26.19,
    viewableImpressions: 0,
    viewability: 0,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 452000,
    frequency: 1.34,
    videoPlays: 271500,
    threeSecondViews: 199400,
    thruPlays: 88200,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
    purchaseValue: 0,
  },
  {
    id: 6,
    name: "TikTok Protein Bundle Push",
    platform: "TikTok",
    objective: "Conversions",
    status: "Draft",
    subtitle: "Creator-led short-form ads for high-intent nutrition buyers.",
    activityDate: "2026-06-18",
    spend: 24700,
    revenue: 116900,
    roas: 4.73,
    clicks: 9130,
    conversions: 422,
    conversionRate: 4.62,
    ctr: 2.37,
    cpc: 2.71,
    cpa: 58.53,
    impressions: 385700,
    cost: 24700,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 64.04,
    viewableImpressions: 0,
    viewability: 0,
    views: 312500,
    viewRate: 58.2,
    watchTime: 46800,
    averageViewDuration: 11.2,
    view25: 64.1,
    view50: 44.2,
    view75: 28.7,
    view100Completion: 16.9,
    reach: 264300,
    frequency: 1.46,
    videoPlays: 302400,
    threeSecondViews: 182100,
    thruPlays: 0,
    addToCart: 233,
    checkoutStarted: 141,
    purchases: 96,
    purchaseValue: 35600,
  },
]

const platformOptions: ExplorerPlatformFilter[] = [
  "All Platforms",
  "Google Search",
  "Google Display",
  "YouTube",
  "Meta",
  "TikTok",
  "Snapchat",
  "LinkedIn",
]

const statusOptions: Array<"All Statuses" | CampaignStatus> = [
  "All Statuses",
  "Active",
  "Paused",
  "Completed",
  "Draft",
]
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

interface CampaignKpiCardData {
  label: string
  value: string
  delta: string
  trend: "up" | "down"
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
  const TrendIcon = kpi.trend === "up" ? ArrowUpRight : ArrowDownRight

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
      <div className="mt-2 flex items-center gap-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            kpi.trend === "up" ? "text-emerald-600" : "text-rose-600"
          )}
        >
          <TrendIcon className="size-3.5" />
          {kpi.delta}
        </span>
        <span className="text-muted-foreground">عن الفترة السابقة</span>
      </div>
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
  if (level === "ads") return "Search ads..."
  if (level === "keywords") return "Search keywords..."
  if (level === "audiences") return "Search audiences..."
  if (level === "placements") return "Search placements..."
  return "Search creatives..."
}

function formatDuration(value: number) {
  const rounded = Math.max(0, Math.round(value))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function scaleMetric(value: number, multiplier: number, decimals = 0) {
  const scaled = value * multiplier
  if (decimals === 0) return Math.max(0, Math.round(scaled))
  return Number(scaled.toFixed(decimals))
}

function getAdGroupTemplates(platform: CampaignPlatform) {
  if (platform === "Google Search") {
    return [
      { name: "Brand Search Ad Group", description: "High-intent branded search terms" },
      { name: "Non-Brand Search Ad Group", description: "Category and competitor intent terms" },
    ]
  }

  if (platform === "Meta") {
    return [
      { name: "Lookalike Ad Set", description: "Modeled audience from top-value purchasers" },
      { name: "Retargeting Ad Set", description: "Visitors and engaged users remarketing set" },
    ]
  }

  return [
    { name: "Prospecting Ad Group", description: "New-user acquisition segment" },
    { name: "Retargeting Ad Group", description: "Warm audience conversion segment" },
  ]
}

function buildChildMetrics(row: CampaignRow, multiplier: number) {
  const spend = scaleMetric(row.spend, multiplier)
  const revenue = scaleMetric(row.revenue, multiplier)
  const clicks = scaleMetric(row.clicks, multiplier)
  const conversions = scaleMetric(row.conversions, multiplier)
  const cpa = conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0
  const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : 0
  const ctr =
    row.impressions > 0
      ? Number(((clicks / Math.max(1, scaleMetric(row.impressions, multiplier))) * 100).toFixed(2))
      : 0
  const conversionRate = clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : 0
  const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0

  return {
    spend,
    revenue,
    clicks,
    conversions,
    cpa,
    roas,
    ctr,
    conversionRate,
    cpc,
    cost: spend,
    impressions: scaleMetric(row.impressions, multiplier),
    qualityScore: Number(row.qualityScore.toFixed(1)),
    impressionShare: Number((row.impressionShare * multiplier).toFixed(1)),
    searchTopImpressionRate: Number((row.searchTopImpressionRate * multiplier).toFixed(1)),
    cpm: Number((row.cpm * multiplier).toFixed(2)),
    viewableImpressions: scaleMetric(row.viewableImpressions, multiplier),
    viewability: Number((row.viewability * multiplier).toFixed(1)),
    views: scaleMetric(row.views, multiplier),
    viewRate: Number((row.viewRate * multiplier).toFixed(1)),
    watchTime: scaleMetric(row.watchTime, multiplier),
    averageViewDuration: Number((row.averageViewDuration * multiplier).toFixed(1)),
    view25: Number((row.view25 * multiplier).toFixed(1)),
    view50: Number((row.view50 * multiplier).toFixed(1)),
    view75: Number((row.view75 * multiplier).toFixed(1)),
    view100Completion: Number((row.view100Completion * multiplier).toFixed(1)),
    reach: scaleMetric(row.reach, multiplier),
    frequency: Number((row.frequency * multiplier).toFixed(2)),
    videoPlays: scaleMetric(row.videoPlays, multiplier),
    threeSecondViews: scaleMetric(row.threeSecondViews, multiplier),
    thruPlays: scaleMetric(row.thruPlays, multiplier),
    addToCart: scaleMetric(row.addToCart, multiplier),
    checkoutStarted: scaleMetric(row.checkoutStarted, multiplier),
    purchases: scaleMetric(row.purchases, multiplier),
    purchaseValue: scaleMetric(row.purchaseValue, multiplier),
  }
}

function buildCampaignRows(rows: CampaignRow[]) {
  return rows.map<EntityRow>((row) => ({
    ...row,
    nodeId: `campaign-${row.id}`,
    level: "campaigns",
    campaignId: row.id,
    entityName: row.name,
    entityDescription: row.subtitle,
  }))
}

function buildAdGroupRows(rows: CampaignRow[]) {
  return rows.flatMap((row) => {
    const templates = getAdGroupTemplates(row.platform)
    const multipliers = [0.56, 0.44]

    return templates.map<EntityRow>((template, index) => {
      const adGroupId = `${row.id}-ag-${index + 1}`
      return {
        ...row,
        ...buildChildMetrics(row, multipliers[index]),
        nodeId: `adgroup-${adGroupId}`,
        level: "adGroups",
        campaignId: row.id,
        adGroupId,
        entityName: template.name,
        entityDescription: template.description,
      }
    })
  })
}

function buildFinalRows(
  level: Exclude<AnalysisTab, "campaigns" | "adGroups">,
  adGroups: EntityRow[]
) {
  const templatesByLevel: Record<Exclude<AnalysisTab, "campaigns" | "adGroups">, string[]> = {
    ads: ["Variant A", "Variant B"],
    keywords: ["running shoes", "wireless earbuds", "coffee maker"],
    audiences: ["High Intent", "Returning Visitors"],
    placements: ["Feed Placement", "Stories Placement"],
    creatives: ["Video Creative", "Carousel Creative"],
  }

  const descriptionsByLevel: Record<Exclude<AnalysisTab, "campaigns" | "adGroups">, string> = {
    ads: "Ad-level performance node",
    keywords: "Keyword-level performance node",
    audiences: "Audience-level performance node",
    placements: "Placement-level performance node",
    creatives: "Creative-level performance node",
  }

  const multipliersByLevel: Record<Exclude<AnalysisTab, "campaigns" | "adGroups">, number[]> = {
    ads: [0.58, 0.42],
    keywords: [0.42, 0.35, 0.23],
    audiences: [0.62, 0.38],
    placements: [0.55, 0.45],
    creatives: [0.52, 0.48],
  }

  return adGroups.flatMap((adGroup) => {
    const templates = templatesByLevel[level]
    const multipliers = multipliersByLevel[level]

    return templates.map<EntityRow>((template, index) => {
      const multiplier = multipliers[index] ?? multipliers[multipliers.length - 1]
      return {
        ...adGroup,
        ...buildChildMetrics(adGroup, multiplier),
        nodeId: `${level}-${adGroup.adGroupId}-${index + 1}`,
        level,
        entityName: `${template} ${index + 1}`,
        entityDescription: descriptionsByLevel[level],
      }
    })
  })
}

function buildPlatformRows(rows: CampaignRow[]): PlatformRow[] {
  return (Object.keys(PLATFORM_NODE_CONFIG) as PlatformNodeKey[])
    .map((platformNodeKey) => {
      const platforms = PLATFORM_NODE_CONFIG[platformNodeKey].campaignPlatforms
      const subset = rows.filter((row) => platforms.includes(row.platform))
      const activeCampaigns = subset.filter((row) => row.status === "Active").length
      const spend = subset.reduce((sum, row) => sum + row.spend, 0)
      const revenue = subset.reduce((sum, row) => sum + row.revenue, 0)
      const clicks = subset.reduce((sum, row) => sum + row.clicks, 0)
      const conversions = subset.reduce((sum, row) => sum + row.conversions, 0)
      const impressions = subset.reduce((sum, row) => sum + row.impressions, 0)

      return {
        nodeId: `platform-${platformNodeKey.toLowerCase()}`,
        level: "platforms" as const,
        platformNodeKey,
        entityName: platformNodeKey,
        entityDescription: `${subset.length} campaigns in view`,
        activeCampaigns,
        spend,
        revenue,
        roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
        clicks,
        conversions,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        status: activeCampaigns > 0 ? "Active" : "No Data",
      }
    })
    .filter((row) => row.entityDescription !== "0 campaigns in view")
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
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<ExplorerPlatformFilter>("All Platforms")
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All Statuses")
  const [objective, setObjective] = useState<CampaignTypeFilter>("All Objectives")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedPlatformNode, setSelectedPlatformNode] = useState<PlatformNodeKey | undefined>(
    undefined
  )
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | undefined>(undefined)
  const [selectedAdGroupId, setSelectedAdGroupId] = useState<string | undefined>(undefined)
  const [highlightedRowId, setHighlightedRowId] = useState<string | undefined>(undefined)

  const filteredCampaigns = useMemo(() => {
    return campaignRows.filter((campaign) => {
      const matchesPlatform = platform === "All Platforms" || campaign.platform === platform
      const matchesStatus = status === "All Statuses" || campaign.status === status
      const matchesObjective = objective === "All Objectives" || campaign.objective === objective

      const matchesDateRange =
        !dateRange?.from ||
        (() => {
          const value = new Date(campaign.activityDate)
          const from = dateRange.from
          const to = dateRange.to ?? dateRange.from
          return value >= from && value <= to
        })()

      return matchesPlatform && matchesStatus && matchesObjective && matchesDateRange
    })
  }, [dateRange, objective, platform, status])

  const platformRows = useMemo(() => buildPlatformRows(filteredCampaigns), [filteredCampaigns])

  const platformScopedCampaigns = useMemo(() => {
    if (!selectedPlatformNode) {
      return filteredCampaigns
    }

    const allowedPlatforms = PLATFORM_NODE_CONFIG[selectedPlatformNode].campaignPlatforms
    return filteredCampaigns.filter((campaign) => allowedPlatforms.includes(campaign.platform))
  }, [filteredCampaigns, selectedPlatformNode])

  const campaignNodes = useMemo(
    () => buildCampaignRows(platformScopedCampaigns),
    [platformScopedCampaigns]
  )

  const adGroupNodes = useMemo(() => {
    const scoped = selectedCampaignId
      ? platformScopedCampaigns.filter((row) => row.id === selectedCampaignId)
      : platformScopedCampaigns
    return buildAdGroupRows(scoped)
  }, [platformScopedCampaigns, selectedCampaignId])

  const selectedCampaign = selectedCampaignId
    ? platformScopedCampaigns.find((row) => row.id === selectedCampaignId)
    : undefined
  const selectedAdGroup = selectedAdGroupId
    ? adGroupNodes.find((row) => row.adGroupId === selectedAdGroupId)
    : undefined

  const finalNodes = useMemo(() => {
    if (
      currentLevel === "platforms" ||
      currentLevel === "campaigns" ||
      currentLevel === "adGroups"
    ) {
      return []
    }

    const baseAdGroups = selectedAdGroupId
      ? adGroupNodes.filter((row) => row.adGroupId === selectedAdGroupId)
      : adGroupNodes

    return buildFinalRows(currentLevel, baseAdGroups)
  }, [adGroupNodes, currentLevel, selectedAdGroupId])

  const activeRows = useMemo<ExplorerRow[]>(() => {
    if (currentLevel === "platforms") {
      return platformRows
    }

    if (currentLevel === "campaigns") {
      return campaignNodes
    }

    if (currentLevel === "adGroups") {
      return adGroupNodes
    }

    return finalNodes
  }, [adGroupNodes, campaignNodes, currentLevel, finalNodes, platformRows])

  const searchedRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return activeRows
    }

    return activeRows.filter((row) =>
      `${row.entityName} ${row.entityDescription}`.toLowerCase().includes(query)
    )
  }, [activeRows, search])

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

  const contextCampaignType = selectedCampaign?.objective ?? objective

  const columns = useMemo(
    () =>
      getMetricsColumns({
        level: currentLevel,
        campaignPlatform: contextCampaignPlatform,
        campaignType: contextCampaignType,
      }),
    [contextCampaignPlatform, contextCampaignType, currentLevel]
  )

  const kpiMetrics = useMemo(() => {
    const getNumericMetric = (row: ExplorerRow, key: string) => {
      const value = row as ExplorerRow & Record<string, unknown>
      const metric = value[key]
      return typeof metric === "number" ? metric : Number(metric ?? 0)
    }

    const spend = searchedRows.reduce((sum, row) => sum + getNumericMetric(row, "spend"), 0)
    const revenue = searchedRows.reduce((sum, row) => sum + getNumericMetric(row, "revenue"), 0)
    const conversions = searchedRows.reduce(
      (sum, row) => sum + getNumericMetric(row, "conversions"),
      0
    )
    const clicks = searchedRows.reduce((sum, row) => sum + getNumericMetric(row, "clicks"), 0)

    const activeCampaignsCount = searchedRows.reduce((sum, row) => {
      if (row.level === "platforms") {
        return sum + row.activeCampaigns
      }

      return row.status === "Active" ? sum + 1 : sum
    }, 0)

    return {
      activeCampaigns: activeCampaignsCount,
      spend,
      revenue,
      conversions,
      cpa: conversions > 0 ? spend / conversions : 0,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      roas: spend > 0 ? revenue / spend : 0,
    }
  }, [searchedRows])

  const campaignKpiCards = useMemo<CampaignKpiCardData[]>(
    () => [
      {
        label: "ROAS (متوسط)",
        value: `${kpiMetrics.roas.toFixed(2)}x`,
        delta: "+12.4%",
        trend: "up",
        icon: TrendingUp,
        tone: "blue",
      },
      {
        label: "الإنفاق",
        value: `${formatSar(kpiMetrics.spend)} SAR`,
        delta: "+18.6%",
        trend: "up",
        icon: CreditCard,
        tone: "green",
      },
      {
        label: "الإيرادات",
        value: `${formatSar(kpiMetrics.revenue)} SAR`,
        delta: "+24.7%",
        trend: "up",
        icon: FileText,
        tone: "blue",
      },
      {
        label: "التحويلات",
        value: kpiMetrics.conversions.toLocaleString(),
        delta: "+16.3%",
        trend: "up",
        icon: Users,
        tone: "orange",
      },
      {
        label: "CPA (متوسط)",
        value: `${kpiMetrics.cpa.toFixed(1)} SAR`,
        delta: "-8.2%",
        trend: "down",
        icon: Target,
        tone: "rose",
      },
      {
        label: "معدل التحويل",
        value: `${kpiMetrics.conversionRate.toFixed(2)}%`,
        delta: "+8.7%",
        trend: "up",
        icon: ShoppingCart,
        tone: "violet",
      },
    ],
    [kpiMetrics]
  )

  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = searchedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const renderMetricValue = (row: ExplorerRow, column: MetricColumn) => {
    if (column.key === "entity") {
      const platformForIcon = row.level === "platforms" ? row.platformNodeKey : row.platform
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
      if (row.level === "platforms") {
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
      return row.level === "platforms" ? row.status : row.status
    }

    const numericValue = Number((row as Record<string, number | string>)[column.key] ?? 0)

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
      if (row.level === "platforms") {
        setSelectedPlatformNode(row.platformNodeKey)
        setSelectedCampaignId(undefined)
        setSelectedAdGroupId(undefined)
        setCurrentLevel("campaigns")
        return
      }

      if (row.level === "campaigns") {
        setSelectedCampaignId(row.campaignId)
        setSelectedAdGroupId(undefined)
        setCurrentLevel("adGroups")
        return
      }

      if (row.level === "adGroups") {
        const next = getNextHierarchyLevel(row.platform, "adGroups")
        if (next) {
          setSelectedAdGroupId(row.adGroupId)
          setCurrentLevel(next)
        }
      }
    }

    const isDrillable =
      row.level === "platforms" || row.level === "campaigns" || row.level === "adGroups"
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

  const canGoBack = Boolean(selectedPlatformNode || selectedCampaignId || selectedAdGroupId)

  const handleBack = () => {
    if (selectedAdGroupId) {
      setSelectedAdGroupId(undefined)
      setCurrentLevel("adGroups")
      setPage(1)
      return
    }

    if (selectedCampaignId) {
      setSelectedCampaignId(undefined)
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
        setSelectedCampaignId(undefined)
        setSelectedAdGroupId(undefined)
        setPage(1)
      },
    },
    {
      label: "Platforms",
      onClick: () => {
        setCurrentLevel("platforms")
        setSelectedCampaignId(undefined)
        setSelectedAdGroupId(undefined)
        setPage(1)
      },
    },
    ...(selectedPlatformNode
      ? [
          {
            label: selectedPlatformNode,
            onClick: () => {
              setCurrentLevel("campaigns")
              setSelectedCampaignId(undefined)
              setSelectedAdGroupId(undefined)
              setPage(1)
            },
          },
        ]
      : []),
    ...(selectedCampaign
      ? [
          {
            label: selectedCampaign.name,
            onClick: () => {
              setCurrentLevel("adGroups")
              setSelectedAdGroupId(undefined)
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
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
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
                setSelectedCampaignId(undefined)
                setSelectedAdGroupId(undefined)
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
                {tab.key === "adGroups" && contextCampaignPlatform === "Meta"
                  ? "Ad Sets"
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
              {paginatedRows.length === 0 ? (
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
                    row.level === "platforms" ||
                    row.level === "campaigns" ||
                    row.level === "adGroups"
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
                              className={`font-semibold ${getRoasClasses(Number((row as ExplorerRow & Record<string, unknown>)["roas"] ?? 0))}`}
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
