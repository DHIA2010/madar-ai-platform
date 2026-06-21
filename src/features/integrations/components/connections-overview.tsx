"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  EllipsisVertical,
  Loader2,
  PlugZap,
  RefreshCcw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppGrid,
  AppInput,
  AppPage,
  AppSection,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSkeleton,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useConnectionsCenter } from "../hooks"
import { getCapabilityLabel } from "../services"
import type { ConnectionsFilterState, ConnectionsHealthState } from "../types"
import { getSyncIndicatorClass, SyncAllDialog, SyncAllOverlay } from "./sync-all-dialog"

const UI_TEXT = {
  pageTitle: "Connections Center",
  pageSubtitle: "Manage all marketing, ecommerce, CRM and analytics integrations from one place.",
  legacyTitle: "Connections Overview",
  searchAria: "Search connections",
  searchPlaceholder: "Search connector, account, workspace, sync status, or capability",
  buttons: {
    newConnection: "+ New Connection",
    runSync: "Run Sync",
    details: "Details",
    open: "Open",
  },
  sections: {
    summaryTotal: "Total Connections",
    summaryHealthy: "Healthy",
    summaryWarning: "Warning",
    summarySyncing: "Syncing",
    summaryPlatforms: "Platforms",
    tableTitle: "Connections Table",
    healthScore: "Health Score",
    syncActivity: "Recent Sync Activity",
    latestSync: "Latest Sync",
    lastSync: "Last Sync",
    platform: "Platform",
    connectedAccount: "Connected Accounts",
    status: "Status",
    health: "Health",
    nextSync: "Next Sync",
    primaryAction: "Primary Action",
    category: "Category",
    failedLoadTitle: "Failed to load connections",
  },
  empty: {
    noConnectorsTitle: "No connectors yet",
    noConnectorsSubtitle: "Start by creating your first integration connection.",
    noSearchTitle: "No search results",
    noSearchSubtitle: "Try a different keyword or clear the search query.",
    noFilteredTitle: "No filtered results",
    noFilteredSubtitle: "Adjust category or filter values to reveal matching connections.",
    tableNoRows: "No connections matched the selected search and filters.",
  },
  overflow: {
    reconnect: "Reconnect",
    pauseSync: "Pause Sync",
    resumeSync: "Resume Sync",
    refreshToken: "Refresh Token",
    retry: "Retry",
    history: "History",
    logs: "Logs",
    disconnect: "Disconnect",
    moreActions: "More actions",
  },
} as const

const CONNECTOR_ACCENT_CLASS: Record<string, string> = {
  "Google Ads": "from-blue-500/35 via-blue-500/20 to-transparent",
  "Google Analytics 4": "from-orange-500/35 via-orange-500/20 to-transparent",
  "Meta Ads": "from-sky-500/35 via-blue-500/20 to-transparent",
  "TikTok Ads": "from-zinc-900/35 via-red-500/20 to-transparent",
  "Snapchat Ads": "from-yellow-400/35 via-yellow-200/20 to-transparent",
  Salla: "from-emerald-500/35 via-emerald-500/20 to-transparent",
  Zid: "from-violet-500/35 via-violet-500/20 to-transparent",
}

const CAPABILITY_STYLE: Record<string, { icon: string; label: string; tone: string }> = {
  traffic: { icon: "📈", label: "Traffic", tone: "bg-sky-100/80 text-sky-800" },
  ads: { icon: "💰", label: "Ads", tone: "bg-indigo-100/80 text-indigo-800" },
  orders: { icon: "🛒", label: "Orders", tone: "bg-emerald-100/80 text-emerald-800" },
  customers: { icon: "👥", label: "Customers", tone: "bg-fuchsia-100/80 text-fuchsia-800" },
  products: { icon: "📦", label: "Products", tone: "bg-orange-100/80 text-orange-800" },
  events: { icon: "📊", label: "Analytics", tone: "bg-amber-100/80 text-amber-800" },
  campaigns: { icon: "🎯", label: "Campaigns", tone: "bg-rose-100/80 text-rose-800" },
}

const CATEGORY_OPTIONS = ["All", "Marketing Platforms", "Ecommerce", "CRM", "Analytics"]

const CATEGORY_PLATFORM_MAP: Record<string, string[]> = {
  All: [],
  "Marketing Platforms": ["Google Ads", "Meta Ads", "TikTok Ads", "Snapchat Ads"],
  Ecommerce: ["Salla", "Zid", "Shopify", "WooCommerce"],
  CRM: ["HubSpot", "Salesforce", "Pipedrive"],
  Analytics: ["Google Analytics 4", "PostHog", "Mixpanel"],
}

const SYNC_ACTIVITY: Record<
  string,
  Array<{
    name: string
    state: "completed" | "running" | "queued"
    records: string
    time: string
    progress?: number
  }>
> = {
  "Google Analytics 4": [
    { name: "Traffic Imported", state: "completed", records: "1.2M records", time: "2 min ago" },
    {
      name: "Events Processed",
      state: "running",
      records: "Syncing...",
      time: "Now",
      progress: 62,
    },
    { name: "Conversions Imported", state: "queued", records: "Queued", time: "Now" },
  ],
  "Google Ads": [
    { name: "Campaigns Imported", state: "completed", records: "428 records", time: "1 min ago" },
    {
      name: "Audience Updated",
      state: "running",
      records: "Syncing...",
      time: "Now",
      progress: 48,
    },
    { name: "Conversions Imported", state: "completed", records: "312 records", time: "3 min ago" },
  ],
  "Meta Ads": [
    { name: "Campaigns Imported", state: "completed", records: "284 records", time: "2 min ago" },
    { name: "Audience Updated", state: "completed", records: "312 records", time: "4 min ago" },
    { name: "Catalog Updated", state: "queued", records: "Queued", time: "Now" },
  ],
  "TikTok Ads": [
    { name: "Audience Updated", state: "completed", records: "120 records", time: "1 min ago" },
    {
      name: "Campaigns Imported",
      state: "running",
      records: "Syncing...",
      time: "Now",
      progress: 37,
    },
    { name: "Conversions Imported", state: "queued", records: "Queued", time: "Now" },
  ],
  "Snapchat Ads": [
    { name: "Conversions Imported", state: "completed", records: "52K records", time: "2 min ago" },
    {
      name: "Audience Updated",
      state: "running",
      records: "Syncing...",
      time: "Now",
      progress: 55,
    },
    { name: "Campaigns Imported", state: "queued", records: "Queued", time: "Now" },
  ],
  Salla: [
    { name: "Orders Imported", state: "completed", records: "845 records", time: "1 min ago" },
    { name: "Customers Synced", state: "completed", records: "312 records", time: "4 min ago" },
    {
      name: "Products Updated",
      state: "running",
      records: "Syncing...",
      time: "Now",
      progress: 69,
    },
    { name: "Inventory Updated", state: "completed", records: "1,240 records", time: "8 min ago" },
  ],
  Zid: [
    { name: "Products Updated", state: "completed", records: "18 records", time: "2 min ago" },
    { name: "Catalog Updated", state: "running", records: "Syncing...", time: "Now", progress: 31 },
    { name: "Customers Synced", state: "queued", records: "Queued", time: "Now" },
  ],
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-800",
  valid: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  disconnected: "bg-red-100 text-red-800",
  syncing: "bg-sky-100 text-sky-800",
  draft: "bg-slate-100 text-slate-700",
  authorized: "bg-zinc-100 text-zinc-700",
  error: "bg-red-100 text-red-800",
}

const HEALTH_BADGE_CLASS: Record<string, string> = {
  Healthy: "bg-emerald-100 text-emerald-800",
  Warning: "bg-orange-100 text-orange-800",
  Paused: "bg-yellow-100 text-yellow-800",
  Disconnected: "bg-red-100 text-red-800",
  "Running Sync": "bg-sky-100 text-sky-800",
  Queued: "bg-blue-100 text-blue-800",
  "Expired Token": "bg-amber-100 text-amber-800",
  Error: "bg-red-100 text-red-800",
}

const CONNECTION_STATUS_META: Record<string, { icon: string; label: string; className: string }> = {
  connected: { icon: "🟢", label: "Connected", className: "bg-emerald-100 text-emerald-800" },
  valid: { icon: "🟢", label: "Connected", className: "bg-emerald-100 text-emerald-800" },
  authorized: { icon: "🟢", label: "Connected", className: "bg-emerald-100 text-emerald-800" },
  paused: { icon: "⏸", label: "Paused", className: "bg-yellow-100 text-yellow-800" },
  disconnected: { icon: "🔴", label: "Error", className: "bg-red-100 text-red-800" },
  error: { icon: "🔴", label: "Error", className: "bg-red-100 text-red-800" },
  draft: { icon: "⚪", label: "Draft", className: "bg-slate-100 text-slate-700" },
  syncing: { icon: "⟳", label: "Syncing", className: "bg-sky-100 text-sky-800" },
}

const HEALTH_STATUS_META: Record<
  ConnectionsHealthState,
  { icon: string; label: string; className: string }
> = {
  Healthy: { icon: "🟢", label: "Healthy", className: "bg-emerald-100 text-emerald-800" },
  Warning: { icon: "⚠", label: "Sync Warning", className: "bg-orange-100 text-orange-800" },
  Error: { icon: "🔴", label: "Error", className: "bg-red-100 text-red-800" },
  "Expired Token": { icon: "⚠", label: "Token Expired", className: "bg-amber-100 text-amber-800" },
  Paused: { icon: "⏸", label: "Paused", className: "bg-yellow-100 text-yellow-800" },
  Disconnected: { icon: "🔴", label: "Disconnected", className: "bg-red-100 text-red-800" },
  "Running Sync": { icon: "⟳", label: "Sync Running", className: "bg-sky-100 text-sky-800" },
  Queued: { icon: "🟡", label: "Sync Queued", className: "bg-blue-100 text-blue-800" },
}

function formatRelativeDate(timestamp?: string): string {
  if (!timestamp) {
    return "Never"
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const absoluteDiffMs = Math.abs(diffMs)
  const minutes = Math.floor(absoluteDiffMs / 60000)
  const hours = Math.floor(absoluteDiffMs / 3600000)
  const days = Math.floor(absoluteDiffMs / 86400000)

  if (diffMs >= 0) {
    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes} min ago`
    if (hours < 6) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`

    const sameDay = now.toDateString() === date.toDateString()
    if (sameDay) {
      return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`
    }

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (yesterday.toDateString() === date.toDateString()) {
      return "Yesterday"
    }

    if (days < 7) {
      return `${days} days ago`
    }
  } else {
    if (minutes < 60) return `In ${minutes} min`
    if (hours < 24) return `In ${hours}h`
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getHealthVisuals(healthState: ConnectionsHealthState) {
  switch (healthState) {
    case "Healthy":
      return { score: 98, label: "Excellent", barColor: "#10B981", textClass: "text-emerald-700" }
    case "Running Sync":
      return { score: 88, label: "Good", barColor: "#0EA5E9", textClass: "text-sky-700" }
    case "Queued":
      return { score: 76, label: "Good", barColor: "#3B82F6", textClass: "text-blue-700" }
    case "Warning":
      return { score: 62, label: "Warning", barColor: "#F59E0B", textClass: "text-amber-700" }
    case "Paused":
      return { score: 54, label: "Warning", barColor: "#EAB308", textClass: "text-yellow-700" }
    case "Expired Token":
      return { score: 38, label: "Critical", barColor: "#F97316", textClass: "text-orange-700" }
    case "Disconnected":
      return { score: 28, label: "Critical", barColor: "#F43F5E", textClass: "text-rose-700" }
    case "Error":
      return { score: 18, label: "Critical", barColor: "#EF4444", textClass: "text-red-700" }
    default:
      return { score: 50, label: "Warning", barColor: "#F59E0B", textClass: "text-amber-700" }
  }
}

function statusBadge(label: string, className: string, icon?: string) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </span>
  )
}

function activityStateTone(state: "completed" | "running" | "queued") {
  if (state === "completed") {
    return { icon: "✓", className: "text-emerald-700" }
  }
  if (state === "running") {
    return { icon: "⟳", className: "text-sky-700" }
  }
  return { icon: "•", className: "text-amber-700" }
}

function getActivityDetailLine(activity: {
  state: "completed" | "running" | "queued"
  records: string
  time: string
}) {
  if (activity.state === "running") {
    return "Running now"
  }

  if (activity.state === "queued") {
    return activity.time.toLowerCase() === "now" ? "Queued now" : `Queued • ${activity.time}`
  }

  return `${activity.records} • ${activity.time}`
}

function getStatusItems(status: string, healthState: ConnectionsHealthState) {
  const primary = CONNECTION_STATUS_META[status] ?? {
    icon: "⚪",
    label: status,
    className: "bg-slate-100 text-slate-700",
  }

  const items = [primary]
  if (healthState !== "Healthy") {
    items.push(HEALTH_STATUS_META[healthState])
  }

  return items
}

function getCategoryPlatformOptions(category: string, platforms: string[]) {
  if (category === "All") {
    return platforms
  }

  const allowedPlatforms = CATEGORY_PLATFORM_MAP[category] ?? []
  return platforms.filter((platform) => allowedPlatforms.includes(platform))
}

function getEmptyState(
  recordsCount: number,
  searchQuery: string,
  hasNonDefaultFilters: boolean
): { title: string; subtitle: string } | null {
  if (recordsCount > 0) {
    return null
  }

  if (searchQuery.trim()) {
    return {
      title: UI_TEXT.empty.noSearchTitle,
      subtitle: UI_TEXT.empty.noSearchSubtitle,
    }
  }

  if (hasNonDefaultFilters) {
    return {
      title: UI_TEXT.empty.noFilteredTitle,
      subtitle: UI_TEXT.empty.noFilteredSubtitle,
    }
  }

  return {
    title: UI_TEXT.empty.noConnectorsTitle,
    subtitle: UI_TEXT.empty.noConnectorsSubtitle,
  }
}

function ConnectorLogo({ platformName }: { platformName: string }) {
  const commonClassName = "size-10 rounded-lg border border-white/70 bg-white p-1 shadow-sm"

  if (platformName === "Google Analytics 4") {
    return (
      <div className={commonClassName} aria-label="Google Analytics 4 logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <circle cx="10" cy="28" r="5" fill="#F9AB00" />
          <rect x="16" y="12" width="8" height="21" rx="4" fill="#F9AB00" />
          <rect x="26" y="4" width="8" height="29" rx="4" fill="#E37400" />
        </svg>
      </div>
    )
  }

  if (platformName === "Google Ads") {
    return (
      <div className={commonClassName} aria-label="Google Ads logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <path
            d="M14 5a5 5 0 0 1 6.5 2L31 25a5 5 0 1 1-8.7 5L11.8 12A5 5 0 0 1 14 5Z"
            fill="#4285F4"
          />
          <path
            d="M8 10a5 5 0 0 1 6.9 1.8l8.7 14.9a5 5 0 1 1-8.7 5L6.3 17.8A5 5 0 0 1 8 10Z"
            fill="#34A853"
          />
          <circle cx="8" cy="30" r="5" fill="#FBBC04" />
        </svg>
      </div>
    )
  }

  if (platformName === "Meta Ads") {
    return (
      <div className={commonClassName} aria-label="Meta Ads logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <path
            d="M5 24c2.3-9.3 5.8-13.9 10.5-13.9C20.1 10.1 22.6 24 27 24c2.2 0 3.3-2 4-6"
            fill="none"
            stroke="#0A66FF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  if (platformName === "TikTok Ads") {
    return (
      <div className={commonClassName} aria-label="TikTok Ads logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <path d="M17 7v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#25F4EE" strokeWidth="3.2" />
          <path d="M19 7v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#FE2C55" strokeWidth="3.2" />
          <path d="M18 6v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#111827" strokeWidth="3.2" />
        </svg>
      </div>
    )
  }

  if (platformName === "Snapchat Ads") {
    return (
      <div className={commonClassName} aria-label="Snapchat Ads logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <rect x="2" y="2" width="32" height="32" rx="8" fill="#FFFC00" />
          <path
            d="M18 8c3.2 0 5.8 2.5 5.8 5.6v3c0 .9.3 1.7 1 2.2.7.5 1.7.8 1.7 1.6 0 .9-1 .9-1.8 1.1-.6.2-1.1.6-1.4 1.1-.5.8-1.8 1.2-3.1 1.2-.8 0-1.2.2-1.5.6l-.7 1h-1l-.7-1c-.3-.4-.7-.6-1.5-.6-1.3 0-2.6-.4-3.1-1.2-.3-.5-.8-.9-1.4-1.1-.8-.2-1.8-.2-1.8-1.1 0-.8 1-.9 1.7-1.6.7-.5 1-1.3 1-2.2v-3C12.2 10.5 14.8 8 18 8Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="1.2"
          />
        </svg>
      </div>
    )
  }

  if (platformName === "Salla") {
    return (
      <div className={commonClassName} aria-label="Salla logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <rect x="6" y="10" width="24" height="20" rx="4" fill="#10B981" />
          <path d="M12 14a6 6 0 0 1 12 0" fill="none" stroke="#ECFDF5" strokeWidth="2.4" />
          <path d="M18 18c2.2 0 4 1.8 4 4v2h-8v-2c0-2.2 1.8-4 4-4Z" fill="#ECFDF5" />
        </svg>
      </div>
    )
  }

  if (platformName === "Zid") {
    return (
      <div className={commonClassName} aria-label="Zid logo">
        <svg viewBox="0 0 36 36" className="size-full" role="img" aria-hidden="true">
          <rect x="4" y="4" width="28" height="28" rx="8" fill="#7C3AED" />
          <path
            d="M11 12h14l-11 12h11"
            fill="none"
            stroke="#F5F3FF"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={cn(
        commonClassName,
        "flex items-center justify-center text-xs font-semibold text-muted-foreground"
      )}
    >
      {platformName.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ConnectionCardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <AppSkeleton className="h-10 w-10 rounded-lg" />
        <AppSkeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <AppSkeleton className="h-4 w-36" />
        <AppSkeleton className="h-3 w-28" />
      </div>
      <AppSkeleton className="h-2 w-full" />
      <div className="flex gap-2">
        <AppSkeleton className="h-6 w-20 rounded-full" />
        <AppSkeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex gap-2">
        <AppSkeleton className="h-8 w-24 rounded-md" />
        <AppSkeleton className="h-8 w-20 rounded-md" />
        <AppSkeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  )
}

const filterLabelByKey: Record<keyof Omit<ConnectionsFilterState, "search">, string> = {
  status: UI_TEXT.sections.status,
  health: UI_TEXT.sections.health,
  platform: UI_TEXT.sections.platform,
  workspace: "Workspace",
  capability: "Capability",
}

function FilterSelect({
  value,
  options,
  onChange,
  label,
  searchable = false,
  searchPlaceholder = "Search options",
  renderOption,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  label: string
  searchable?: boolean
  searchPlaceholder?: string
  renderOption?: (option: string) => React.ReactNode
}) {
  const [query, setQuery] = useState("")

  const scopedOptions = useMemo(() => {
    if (!searchable || !query.trim()) {
      return options
    }

    const needle = query.trim().toLowerCase()
    return options.filter((option) => option.toLowerCase().includes(needle))
  }, [options, query, searchable])

  return (
    <label className="relative z-0 grid min-w-0 gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <AppSelect value={value} onValueChange={onChange}>
        <AppSelectTrigger className="h-10 w-full rounded-xl border bg-background px-3 text-sm shadow-sm transition-colors hover:border-foreground/20 focus-visible:border-indigo-400 focus-visible:ring-indigo-100 data-[state=open]:z-40 data-[state=open]:border-indigo-400 data-[state=open]:shadow-md">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[90] max-h-72 w-[--radix-select-trigger-width] min-w-[220px] overflow-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-xl"
        >
          {searchable ? (
            <div className="px-1 pb-1">
              <AppInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              />
            </div>
          ) : null}
          {scopedOptions.map((option) => (
            <AppSelectItem
              key={option}
              value={option}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              {renderOption ? renderOption(option) : option}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    </label>
  )
}

export function ConnectionsOverview() {
  const {
    isLoading,
    error,
    filteredRecords,
    filters,
    availableFilters,
    updateFilters,
    connect,
    disconnect,
    pauseSync,
    resumeSync,
    refreshToken,
    retrySync,
    runSync,
    records,
  } = useConnectionsCenter()
  const [activeCategory, setActiveCategory] = useState("All")
  const [syncAllDialogOpen, setSyncAllDialogOpen] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncProgress, setSyncProgress] = useState<
    Record<string, "queued" | "running" | "completed" | "failed">
  >({})

  const statuses = [
    "all",
    "draft",
    "authorized",
    "connected",
    "valid",
    "paused",
    "disconnected",
    "error",
  ]
  const healthStatuses = [
    "all",
    "Healthy",
    "Warning",
    "Error",
    "Expired Token",
    "Paused",
    "Disconnected",
    "Running Sync",
    "Queued",
  ]
  const workspaceOptions = ["all", ...availableFilters.workspaces]
  const capabilityOptions = ["all", ...availableFilters.capabilities]
  const categoryOptions = CATEGORY_OPTIONS
  const categoryScopedPlatforms = useMemo(
    () => getCategoryPlatformOptions(activeCategory, availableFilters.platforms),
    [activeCategory, availableFilters.platforms]
  )
  const platformOptions = ["all", ...categoryScopedPlatforms]
  const categoryFilteredRecords = useMemo(() => {
    if (activeCategory === "All") {
      return filteredRecords
    }

    const allowedPlatforms = CATEGORY_PLATFORM_MAP[activeCategory] ?? []
    return filteredRecords.filter((record) => allowedPlatforms.includes(record.platformName))
  }, [activeCategory, filteredRecords])

  const emptyState = getEmptyState(
    categoryFilteredRecords.length,
    "",
    filters.platform !== "all" ||
      filters.workspace !== "all" ||
      filters.capability !== "all" ||
      filters.status !== "all" ||
      filters.health !== "all" ||
      activeCategory !== "All"
  )

  const summaryCards = useMemo(() => {
    const healthyCount = categoryFilteredRecords.filter(
      (record) => record.healthState === "Healthy"
    ).length
    const warningCount = categoryFilteredRecords.filter(
      (record) => record.healthState === "Warning"
    ).length
    const syncingCount = categoryFilteredRecords.filter(
      (record) => record.healthState === "Running Sync" || record.connection.status === "syncing"
    ).length
    const platformCount = new Set(categoryFilteredRecords.map((record) => record.platformName)).size

    return [
      {
        label: UI_TEXT.sections.summaryTotal,
        value: categoryFilteredRecords.length,
        icon: <Boxes className="size-4 text-violet-600" />,
      },
      {
        label: UI_TEXT.sections.summaryHealthy,
        value: healthyCount,
        icon: <CheckCircle2 className="size-4 text-emerald-600" />,
      },
      {
        label: UI_TEXT.sections.summaryWarning,
        value: warningCount,
        icon: <AlertTriangle className="size-4 text-orange-500" />,
      },
      {
        label: UI_TEXT.sections.summarySyncing,
        value: syncingCount,
        icon: <RefreshCcw className="size-4 text-sky-600" />,
      },
      {
        label: UI_TEXT.sections.summaryPlatforms,
        value: platformCount,
        icon: <Activity className="size-4 text-indigo-600" />,
      },
    ]
  }, [categoryFilteredRecords])

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <div className="flex items-start gap-3">
            <div className="rounded-xl border bg-card p-2 shadow-sm">
              <PlugZap className="size-5 text-indigo-600" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                {UI_TEXT.pageTitle}
                <span className="sr-only">{UI_TEXT.legacyTitle}</span>
              </h1>
              <p className="text-sm text-muted-foreground">{UI_TEXT.pageSubtitle}</p>
            </div>
          </div>
        </AppSection>

        <AppSection>
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="relative z-10 grid flex-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <FilterSelect
                  label={UI_TEXT.sections.category}
                  value={activeCategory}
                  options={categoryOptions}
                  onChange={(value) => {
                    const nextCategory = value
                    setActiveCategory(nextCategory)

                    const nextPlatforms = getCategoryPlatformOptions(
                      nextCategory,
                      availableFilters.platforms
                    )
                    if (filters.platform !== "all" && !nextPlatforms.includes(filters.platform)) {
                      updateFilters({ platform: "all" })
                    }
                  }}
                />
                <FilterSelect
                  label={filterLabelByKey.capability}
                  value={filters.capability}
                  options={capabilityOptions}
                  onChange={(value) =>
                    updateFilters({ capability: value as ConnectionsFilterState["capability"] })
                  }
                />
                <FilterSelect
                  label={filterLabelByKey.workspace}
                  value={filters.workspace}
                  options={workspaceOptions}
                  onChange={(value) => updateFilters({ workspace: value })}
                />
                <FilterSelect
                  label={filterLabelByKey.platform}
                  value={filters.platform}
                  options={platformOptions}
                  searchable
                  searchPlaceholder="Search platform"
                  renderOption={(option) =>
                    option === "all" ? (
                      option
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="scale-75">
                          <ConnectorLogo platformName={option} />
                        </span>
                        <span>{option}</span>
                      </span>
                    )
                  }
                  onChange={(value) => updateFilters({ platform: value })}
                />
                <FilterSelect
                  label={filterLabelByKey.health}
                  value={filters.health}
                  options={healthStatuses}
                  onChange={(value) =>
                    updateFilters({ health: value as ConnectionsFilterState["health"] })
                  }
                />
                <FilterSelect
                  label={filterLabelByKey.status}
                  value={filters.status}
                  options={statuses}
                  onChange={(value) =>
                    updateFilters({ status: value as ConnectionsFilterState["status"] })
                  }
                />
              </div>

              <div className="flex shrink-0 gap-2">
                <AppButton
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-lg px-4 shadow-sm"
                  onClick={() => setSyncAllDialogOpen(true)}
                  disabled={isSyncingAll || records.length === 0}
                  title={records.length === 0 ? "No connections to sync" : "Sync all connections"}
                >
                  {isSyncingAll ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="mr-2 size-4" />
                      Sync All
                    </>
                  )}
                </AppButton>
                <Link href={ROUTES.integrationsNew}>
                  <AppButton size="sm" className="h-10 rounded-lg px-4 shadow-sm">
                    {UI_TEXT.buttons.newConnection}
                  </AppButton>
                </Link>
              </div>
            </div>
          </div>
        </AppSection>

        {error ? (
          <AppSection>
            <AppCard title={UI_TEXT.sections.failedLoadTitle} subtitle={error} state="error" />
          </AppSection>
        ) : null}

        <AppSection className="mt-14">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/15"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  {card.icon}
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
              </div>
            ))}
          </div>
        </AppSection>

        <AppSection className="mt-14">
          {emptyState && !isLoading ? (
            <AppCard title={emptyState.title} subtitle={emptyState.subtitle} state="empty" />
          ) : null}

          <SyncAllDialog
            open={syncAllDialogOpen}
            onOpenChange={setSyncAllDialogOpen}
            records={records}
            isSyncing={isSyncingAll}
            onSyncStart={() => setIsSyncingAll(true)}
            onSyncEnd={() => {
              setIsSyncingAll(false)
              setSyncProgress({})
            }}
            onRunSync={runSync}
          />

          <AppGrid variant={3}>
            {isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <ConnectionCardSkeleton key={`skeleton-${index}`} />
                ))
              : categoryFilteredRecords.map((record) => {
                  const healthVisuals = getHealthVisuals(record.healthState)
                  const accentClass =
                    CONNECTOR_ACCENT_CLASS[record.platformName] ??
                    "from-slate-400/30 to-transparent"
                  const statusItems = getStatusItems(record.connection.status, record.healthState)
                  const syncActivity = SYNC_ACTIVITY[record.platformName] ?? [
                    {
                      name: "Records Imported",
                      state: "completed" as const,
                      records: "120 records",
                      time: "2 min ago",
                    },
                    {
                      name: "Retry Queue",
                      state: "running" as const,
                      records: "Syncing...",
                      time: "Now",
                      progress: 45,
                    },
                    {
                      name: "Customers Synced",
                      state: "queued" as const,
                      records: "Queued",
                      time: "Now",
                    },
                  ]
                  const syncState = syncProgress[record.connection.connectionId]
                  const isSyncing = syncState && syncState !== "completed" && syncState !== "failed"

                  return (
                    <AppCard
                      key={record.connection.connectionId}
                      className={cn(
                        "group relative rounded-2xl border-border/70 bg-card/90 shadow-sm transition-all duration-300",
                        syncState && "opacity-75",
                        !isSyncing && "hover:-translate-y-0.5 hover:shadow-lg"
                      )}
                    >
                      <div
                        className={cn(
                          "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r transition-all duration-300",
                          getSyncIndicatorClass(syncState) || accentClass
                        )}
                      />

                      <SyncAllOverlay syncState={syncState} />

                      <div className="space-y-5 text-sm">
                        <div className="flex flex-col items-end gap-1">
                          {statusItems.map((item) => (
                            <div key={`${record.connection.connectionId}-${item.label}`}>
                              {statusBadge(item.label, item.className, item.icon)}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border bg-background/70 p-3">
                          <ConnectorLogo platformName={record.platformName} />
                          <div className="space-y-1">
                            <div className="text-base font-semibold leading-none">
                              {record.platformName}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {record.connectedAccounts.length} Accounts Connected
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl bg-muted/35 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {UI_TEXT.sections.latestSync}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {formatRelativeDate(record.lastSyncAt)}
                          </p>
                        </div>

                        <div className="space-y-2 rounded-xl border bg-background/70 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {UI_TEXT.sections.syncActivity}
                          </p>
                          <div className="space-y-2">
                            {syncActivity.map((item) => {
                              const tone = activityStateTone(item.state)
                              return (
                                <div
                                  key={`${record.connection.connectionId}-${item.name}`}
                                  className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={cn("text-xs font-semibold", tone.className)}>
                                      {tone.icon}
                                    </span>
                                    <span className="text-xs font-medium text-foreground">
                                      {item.name}
                                    </span>
                                  </div>
                                  <p className="mt-1 pl-4 text-xs text-muted-foreground" dir="ltr">
                                    {getActivityDetailLine(item)}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border bg-background/70 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {UI_TEXT.sections.healthScore}
                            </p>
                            <p className={cn("text-lg font-semibold", healthVisuals.textClass)}>
                              {healthVisuals.score}%
                            </p>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${healthVisuals.score}%`,
                                backgroundColor: healthVisuals.barColor,
                              }}
                            />
                          </div>
                          <p className={cn("text-xs font-medium", healthVisuals.textClass)}>
                            {healthVisuals.label}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {record.capabilities.map((capability) => {
                            const capabilityStyle = CAPABILITY_STYLE[capability] ?? {
                              icon: "⚙️",
                              label: getCapabilityLabel(capability),
                              tone: "bg-slate-100 text-slate-800",
                            }

                            return (
                              <span
                                key={`${record.connection.connectionId}-${capability}`}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  capabilityStyle.tone
                                )}
                              >
                                <span aria-hidden="true">{capabilityStyle.icon}</span>
                                {capabilityStyle.label}
                              </span>
                            )
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <AppButton
                            size="sm"
                            className="h-8 rounded-md px-3 shadow-sm transition-all hover:shadow"
                            onClick={() => void runSync(record.connection.connectionId)}
                          >
                            {UI_TEXT.buttons.runSync}
                          </AppButton>

                          <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                            <AppButton
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-md px-3 transition-colors"
                            >
                              {UI_TEXT.buttons.details}
                            </AppButton>
                          </Link>

                          <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                            <AppButton
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-md px-3 transition-colors"
                            >
                              Add another account
                            </AppButton>
                          </Link>

                          <AppDropdownMenu>
                            <AppDropdownMenuTrigger asChild>
                              <AppButton
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 rounded-md p-0"
                                aria-label={UI_TEXT.overflow.moreActions}
                              >
                                <EllipsisVertical className="size-4" />
                              </AppButton>
                            </AppDropdownMenuTrigger>
                            <AppDropdownMenuContent align="end" className="w-44">
                              <AppDropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void connect(record.connection.connectionId)
                                }}
                              >
                                {UI_TEXT.overflow.reconnect}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void pauseSync(record)
                                }}
                              >
                                {UI_TEXT.overflow.pauseSync}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void resumeSync(record)
                                }}
                              >
                                {UI_TEXT.overflow.resumeSync}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void refreshToken(record.connection.connectionId)
                                }}
                              >
                                {UI_TEXT.overflow.refreshToken}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void retrySync(record)
                                }}
                              >
                                {UI_TEXT.overflow.retry}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuSeparator />
                              <AppDropdownMenuItem asChild>
                                <Link
                                  href={ROUTES.integrationsHistory(record.connection.connectionId)}
                                >
                                  {UI_TEXT.overflow.history}
                                </Link>
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem asChild>
                                <Link
                                  href={`${ROUTES.integrationsDetails(record.connection.connectionId)}#logs`}
                                >
                                  {UI_TEXT.overflow.logs}
                                </Link>
                              </AppDropdownMenuItem>
                              <AppDropdownMenuSeparator />
                              <AppDropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onSelect={(event) => {
                                  event.preventDefault()
                                  void disconnect(record.connection.connectionId)
                                }}
                              >
                                {UI_TEXT.overflow.disconnect}
                              </AppDropdownMenuItem>
                            </AppDropdownMenuContent>
                          </AppDropdownMenu>
                        </div>
                      </div>
                    </AppCard>
                  )
                })}
          </AppGrid>
        </AppSection>

        <AppSection className="mt-16">
          <AppCard title={UI_TEXT.sections.tableTitle}>
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>{UI_TEXT.sections.platform}</AppTableHead>
                  <AppTableHead>{UI_TEXT.sections.connectedAccount}</AppTableHead>
                  <AppTableHead>{UI_TEXT.sections.status}</AppTableHead>
                  <AppTableHead>{UI_TEXT.sections.health}</AppTableHead>
                  <AppTableHead>{UI_TEXT.sections.lastSync}</AppTableHead>
                  <AppTableHead>{UI_TEXT.sections.nextSync}</AppTableHead>
                  <AppTableHead className="text-right">
                    {UI_TEXT.sections.primaryAction}
                  </AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {categoryFilteredRecords.map((record) => (
                  <AppTableRow
                    key={`row-${record.connection.connectionId}`}
                    className="h-16 transition-colors hover:bg-muted/40"
                  >
                    <AppTableCell>
                      <div className="flex items-center gap-3">
                        <ConnectorLogo platformName={record.platformName} />
                        <span className="font-medium">{record.platformName}</span>
                      </div>
                    </AppTableCell>
                    <AppTableCell className="font-medium text-foreground/90">
                      {record.connectedAccounts.length} Accounts Connected
                    </AppTableCell>
                    <AppTableCell>
                      {statusBadge(
                        (
                          CONNECTION_STATUS_META[record.connection.status] ?? {
                            label: record.connection.status,
                            className:
                              STATUS_BADGE_CLASS[record.connection.status] ??
                              "bg-slate-100 text-slate-700",
                            icon: "⚪",
                          }
                        ).label,
                        (
                          CONNECTION_STATUS_META[record.connection.status] ?? {
                            className:
                              STATUS_BADGE_CLASS[record.connection.status] ??
                              "bg-slate-100 text-slate-700",
                          }
                        ).className,
                        (CONNECTION_STATUS_META[record.connection.status] ?? { icon: "⚪" }).icon
                      )}
                    </AppTableCell>
                    <AppTableCell>
                      {statusBadge(
                        HEALTH_STATUS_META[record.healthState]?.label ?? record.healthState,
                        HEALTH_STATUS_META[record.healthState]?.className ??
                          HEALTH_BADGE_CLASS[record.healthState] ??
                          "bg-slate-100 text-slate-700",
                        HEALTH_STATUS_META[record.healthState]?.icon
                      )}
                    </AppTableCell>
                    <AppTableCell>{formatRelativeDate(record.lastSyncAt)}</AppTableCell>
                    <AppTableCell>{formatRelativeDate(record.nextSyncAt)}</AppTableCell>
                    <AppTableCell>
                      <div className="flex justify-end">
                        <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                          <AppButton size="sm" variant="outline" className="h-8">
                            {UI_TEXT.buttons.open}
                          </AppButton>
                        </Link>
                      </div>
                    </AppTableCell>
                  </AppTableRow>
                ))}
                {!isLoading && categoryFilteredRecords.length === 0 ? (
                  <AppTableRow>
                    <AppTableCell colSpan={7} className="text-center text-muted-foreground">
                      {UI_TEXT.empty.tableNoRows}
                    </AppTableCell>
                  </AppTableRow>
                ) : null}
              </AppTableBody>
            </AppTable>
          </AppCard>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
