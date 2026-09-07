"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, AlertTriangle, Boxes, CheckCircle2, Loader2, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSkeleton,
  RelativeTime,
} from "@/components/app"

import { Can } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import { useConnectionsCenter } from "../hooks"
import {
  CONNECTION_ACTION_IDS,
  type ConnectionActionDefinition,
  connectionActionPolicy,
} from "../services"
import type { ConnectionsFilterState, ConnectionsHealthState } from "../types"
import { ConnectionActionsMenu } from "./connection-actions-menu"
import { SyncAllDialog } from "./sync-all-dialog"

import {
  DonutBreakdown,
  KpiCard,
  PageHeading,
  SURFACE_CARD_CLASS,
  SurfaceCard,
} from "@/components/design/dashboard-surface"
import { tajawal } from "@/components/design/fonts"

const UI_TEXT = {
  pageTitle: "مركز الاتصالات",
  pageSubtitle: "تابع حالة جميع المنصات المرتبطة وزامنها من مكان واحد.",
  legacyTitle: "Connections Overview",
  searchAria: "البحث في الاتصالات",
  searchPlaceholder: "ابحث عن منصة، حساب، أو حالة...",
  buttons: {
    newConnection: "اتصال جديد",
    runSync: "مزامنة",
    details: "التفاصيل",
    open: "فتح",
    syncAll: "مزامنة الكل",
    syncing: "جارٍ المزامنة...",
  },
  sections: {
    summaryTotal: "إجمالي الاتصالات",
    summaryHealthy: "سليمة",
    summaryWarning: "تحذير",
    summarySyncing: "قيد المزامنة",
    summaryPlatforms: "المنصات",
    tableTitle: "الاتصالات",
    healthBreakdown: "حالة الاتصالات",
    healthScore: "مؤشر الصحة",
    syncActivity: "آخر نشاط المزامنة",
    latestSync: "آخر مزامنة",
    lastSync: "آخر مزامنة",
    nextSync: "المزامنة التالية",
    platform: "المنصة",
    connectedAccount: "الحساب المرتبط",
    status: "الحالة",
    health: "الصحة",
    capabilities: "القدرات",
    actions: "إجراءات",
    category: "التصنيف",
    failedLoadTitle: "تعذر تحميل الاتصالات",
    totalConnections: "إجمالي الاتصالات",
    noActivity: "لا يوجد نشاط مزامنة بعد.",
  },
  filters: {
    category: "التصنيف",
    capability: "القدرة",
    workspace: "مساحة العمل",
    platform: "المنصة",
    health: "الصحة",
    status: "الحالة",
    all: "الكل",
  },
  empty: {
    noConnectorsTitle: "لا توجد اتصالات بعد",
    noConnectorsSubtitle: "ابدأ بإنشاء أول اتصال لمتجرك أو منصتك الإعلانية.",
    noSearchTitle: "لا توجد نتائج",
    noSearchSubtitle: "جرّب كلمة بحث مختلفة أو امسح البحث.",
    noFilteredTitle: "لا توجد نتائج مطابقة",
    noFilteredSubtitle: "عدّل التصنيف أو الفلاتر لعرض الاتصالات المطابقة.",
    tableNoRows: "لا توجد اتصالات مطابقة للبحث والفلاتر.",
  },
  overflow: {
    moreActions: "إجراءات إضافية",
  },
} as const

const CATEGORY_OPTIONS = ["All", "Marketing Platforms", "Ecommerce", "CRM", "Analytics"]

const CATEGORY_PLATFORM_MAP: Record<string, string[]> = {
  All: [],
  "Marketing Platforms": ["Google Ads", "Meta Ads", "TikTok Ads", "Snapchat Ads"],
  Ecommerce: ["Salla", "Zid", "Shopify", "WooCommerce"],
  CRM: ["HubSpot", "Salesforce", "Pipedrive"],
  Analytics: ["Google Analytics 4", "PostHog", "Mixpanel"],
}

const CONNECTION_STATUS_META: Record<string, { icon: string; label: string; className: string }> = {
  connected: { icon: "🟢", label: "متصل", className: "bg-[#ecfdf5] text-[#10b981]" },
  valid: { icon: "🟢", label: "متصل", className: "bg-[#ecfdf5] text-[#10b981]" },
  authorized: { icon: "🟢", label: "متصل", className: "bg-[#ecfdf5] text-[#10b981]" },
  paused: { icon: "⏸", label: "متوقف", className: "bg-[#fffbeb] text-[#f59e0b]" },
  disconnected: { icon: "🔴", label: "خطأ", className: "bg-[#fef2f2] text-[#ef4444]" },
  error: { icon: "🔴", label: "خطأ", className: "bg-[#fef2f2] text-[#ef4444]" },
  draft: { icon: "⚪", label: "مسودة", className: "bg-[#f1f5f9] text-[#64748b]" },
  syncing: { icon: "⟳", label: "قيد المزامنة", className: "bg-[#eff6ff] text-[#2563eb]" },
}

const HEALTH_STATUS_META: Record<
  ConnectionsHealthState,
  { icon: string; label: string; className: string }
> = {
  Healthy: { icon: "🟢", label: "سليمة", className: "bg-[#ecfdf5] text-[#10b981]" },
  Warning: { icon: "⚠", label: "تحذير مزامنة", className: "bg-[#fffbeb] text-[#f59e0b]" },
  Error: { icon: "🔴", label: "خطأ", className: "bg-[#fef2f2] text-[#ef4444]" },
  "Expired Token": { icon: "⚠", label: "انتهت الصلاحية", className: "bg-[#fffbeb] text-[#f59e0b]" },
  Paused: { icon: "⏸", label: "متوقفة", className: "bg-[#fffbeb] text-[#f59e0b]" },
  Disconnected: { icon: "🔴", label: "غير متصلة", className: "bg-[#fef2f2] text-[#ef4444]" },
  "Running Sync": { icon: "⟳", label: "قيد المزامنة", className: "bg-[#eff6ff] text-[#2563eb]" },
  Queued: { icon: "🟡", label: "في الانتظار", className: "bg-[#ecfeff] text-[#0891b2]" },
}

function getHealthVisuals(
  healthState: ConnectionsHealthState,
  backendScore?: number,
  backendLabel?: string
) {
  if (typeof backendScore === "number") {
    const bounded = Math.max(0, Math.min(100, Math.round(backendScore)))
    const textClass =
      bounded >= 80 ? "text-emerald-700" : bounded >= 50 ? "text-amber-700" : "text-red-700"
    const barColor = bounded >= 80 ? "#10B981" : bounded >= 50 ? "#F59E0B" : "#EF4444"
    return {
      score: bounded,
      label: backendLabel ?? (bounded >= 80 ? "Healthy" : bounded >= 50 ? "Degraded" : "Unhealthy"),
      barColor,
      textClass,
    }
  }

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
      <div className={cn(commonClassName, "relative")} aria-label="Meta Ads logo">
        <Image src={ASSETS.platforms.meta} alt="Meta Ads" fill className="object-contain p-0.5" />
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
      <div className={cn(commonClassName, "relative")} aria-label="Salla logo">
        <Image src={ASSETS.platforms.salla} alt="Salla" fill className="object-contain p-0.5" />
      </div>
    )
  }

  if (platformName === "Shopify") {
    return (
      <div className={cn(commonClassName, "relative")} aria-label="Shopify logo">
        <Image src={ASSETS.platforms.shopify} alt="Shopify" fill className="object-contain p-0.5" />
      </div>
    )
  }

  if (platformName === "Zid") {
    return (
      <div className={cn(commonClassName, "relative")} aria-label="Zid logo">
        <Image src={ASSETS.platforms.zid} alt="Zid" fill className="object-contain p-0.5" />
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

export function ConnectionsOverview() {
  const router = useRouter()
  const { availableWorkspaces, currentWorkspace } = useWorkspace()
  const isCurrentWorkspaceArchived = currentWorkspace?.status === "archived"
  const {
    isLoading,
    error,
    filteredRecords,
    filters,
    availableFilters,
    updateFilters,
    connect,
    disconnect,
    deleteConnection,
    pauseSync,
    resumeSync,
    retrySync,
    runSync,
    records,
  } = useConnectionsCenter()
  const [activeCategory, setActiveCategory] = useState("All")
  const [syncAllDialogOpen, setSyncAllDialogOpen] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    connectionId: string
    action: ConnectionActionDefinition
  } | null>(null)
  const [isDeletingConnection, setIsDeletingConnection] = useState(false)
  const [syncProgress, setSyncProgress] = useState<
    Record<string, "queued" | "running" | "completed" | "failed">
  >({})

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get("google_oauth") !== "connected") {
      return
    }

    if (!params.get("google_connection_id")) {
      return
    }

    const query = params.toString()
    router.replace(query.length > 0 ? `${ROUTES.integrationsNew}?${query}` : ROUTES.integrationsNew)
  }, [router])

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

    // Icon tint pairs come from the dashboard design's KPI row: a 42px rounded tile in a pale
    // wash of the icon's own colour.
    return [
      {
        label: UI_TEXT.sections.summaryTotal,
        value: categoryFilteredRecords.length,
        icon: <Boxes className="size-5 text-[#7c3aed]" />,
        iconClassName: "bg-[#f5f3ff]",
      },
      {
        label: UI_TEXT.sections.summaryHealthy,
        value: healthyCount,
        icon: <CheckCircle2 className="size-5 text-[#10b981]" />,
        iconClassName: "bg-[#ecfdf5]",
      },
      {
        label: UI_TEXT.sections.summaryWarning,
        value: warningCount,
        icon: <AlertTriangle className="size-5 text-[#f59e0b]" />,
        iconClassName: "bg-[#fffbeb]",
      },
      {
        label: UI_TEXT.sections.summarySyncing,
        value: syncingCount,
        icon: <RefreshCcw className="size-5 text-[#2563eb]" />,
        iconClassName: "bg-[#eff6ff]",
      },
      {
        label: UI_TEXT.sections.summaryPlatforms,
        value: platformCount,
        icon: <Activity className="size-5 text-[#0d9488]" />,
        iconClassName: "bg-[#f0fdfa]",
      },
    ]
  }, [categoryFilteredRecords])

  const requestDeleteConnection = (connectionId: string, action: ConnectionActionDefinition) => {
    setPendingDeleteAction({ connectionId, action })
    setDeleteDialogOpen(true)
  }

  const confirmDeleteConnection = async () => {
    if (!pendingDeleteAction || isDeletingConnection) {
      return
    }

    setIsDeletingConnection(true)
    try {
      await deleteConnection(pendingDeleteAction.connectionId)
      setDeleteDialogOpen(false)
      setPendingDeleteAction(null)
      toast.success("Connection deleted successfully.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete connection."
      toast.error(message)
    } finally {
      setIsDeletingConnection(false)
    }
  }

  const handleConnectionAction = async (
    record: (typeof categoryFilteredRecords)[number],
    action: ConnectionActionDefinition
  ) => {
    if (action.requiresConfirmation) {
      requestDeleteConnection(record.connection.connectionId, action)
      return
    }

    switch (action.id) {
      case CONNECTION_ACTION_IDS.RECONNECT:
        await connect(record.connection.connectionId)
        return
      case CONNECTION_ACTION_IDS.PAUSE_SYNC:
        await pauseSync(record)
        return
      case CONNECTION_ACTION_IDS.RESUME_SYNC:
        await resumeSync(record)
        return
      case CONNECTION_ACTION_IDS.RETRY:
        await retrySync(record)
        return
      case CONNECTION_ACTION_IDS.DISCONNECT:
        await disconnect(record.connection.connectionId)
        return
      case CONNECTION_ACTION_IDS.DELETE_CONNECTION:
        requestDeleteConnection(record.connection.connectionId, action)
        return
      default:
        return
    }
  }

  // Health mix for the donut. Colours are meaning-bearing here (green healthy, amber warning,
  // red error) rather than positional, so each entry carries its own.
  const healthBreakdown = (() => {
    const tones: Record<string, string> = {
      Healthy: "#10b981",
      Warning: "#f59e0b",
      "Running Sync": "#2563eb",
      Queued: "#0891b2",
      Paused: "#f59e0b",
      "Expired Token": "#f59e0b",
      Error: "#ef4444",
      Disconnected: "#ef4444",
    }
    const labels: Record<string, string> = {
      Healthy: "سليمة",
      Warning: "تحذير",
      "Running Sync": "قيد المزامنة",
      Queued: "في الانتظار",
      Paused: "متوقفة",
      "Expired Token": "انتهت الصلاحية",
      Error: "خطأ",
      Disconnected: "غير متصلة",
    }
    const counts = new Map<string, number>()
    for (const record of categoryFilteredRecords) {
      counts.set(record.healthState, (counts.get(record.healthState) ?? 0) + 1)
    }
    const total = categoryFilteredRecords.length
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([state, value]) => ({
        label: labels[state] ?? state,
        value,
        share: total === 0 ? 0 : Math.round((value / total) * 1000) / 10,
        color: tones[state] ?? "#64748b",
      }))
  })()

  // The most recent sync runs across every connection, newest first -- the same events the old
  // per-card lists showed, collapsed into one feed so the table below can stay dense.
  const recentActivity = categoryFilteredRecords
    .flatMap((record) =>
      (record.integrationStatus.recentEvents ?? []).slice(0, 3).map((event) => ({
        key: `${record.connection.connectionId}-${event.eventId}`,
        platformName: record.platformName,
        action: event.action,
        message: event.message,
        timestamp: event.timestamp,
        failed: event.action === "sync.failed",
      }))
    )
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 6)

  const filterSelects = [
    {
      label: UI_TEXT.filters.category,
      value: activeCategory,
      options: categoryOptions,
      onChange: (value: string) => {
        setActiveCategory(value)
        const nextPlatforms = getCategoryPlatformOptions(value, availableFilters.platforms)
        if (filters.platform !== "all" && !nextPlatforms.includes(filters.platform)) {
          updateFilters({ platform: "all" })
        }
      },
    },
    {
      label: UI_TEXT.filters.capability,
      value: filters.capability,
      options: capabilityOptions,
      onChange: (value: string) =>
        updateFilters({ capability: value as ConnectionsFilterState["capability"] }),
    },
    {
      label: UI_TEXT.filters.workspace,
      value: filters.workspace,
      options: workspaceOptions,
      onChange: (value: string) => updateFilters({ workspace: value }),
    },
    {
      label: UI_TEXT.filters.platform,
      value: filters.platform,
      options: platformOptions,
      onChange: (value: string) => updateFilters({ platform: value }),
    },
    {
      label: UI_TEXT.filters.health,
      value: filters.health,
      options: healthStatuses,
      onChange: (value: string) =>
        updateFilters({ health: value as ConnectionsFilterState["health"] }),
    },
    {
      label: UI_TEXT.filters.status,
      value: filters.status,
      options: statuses,
      onChange: (value: string) =>
        updateFilters({ status: value as ConnectionsFilterState["status"] }),
    },
  ]

  return (
    <div className={cn(tajawal.className, "bg-[#f1f5f9] px-[22px] py-5")} dir="rtl">
      <PageHeading
        title={UI_TEXT.pageTitle}
        subtitle={UI_TEXT.pageSubtitle}
        actions={
          <>
            <AppButton
              size="sm"
              variant="outline"
              className="h-10 rounded-lg border-[#e8edf3] bg-white px-4 text-[12.5px] text-[#334155] hover:bg-[#f8fafc]"
              onClick={() => setSyncAllDialogOpen(true)}
              disabled={isSyncingAll || records.length === 0}
            >
              {isSyncingAll ? (
                <>
                  <Loader2 className="ml-2 size-4 animate-spin" />
                  {UI_TEXT.buttons.syncing}
                </>
              ) : (
                <>
                  <RefreshCcw className="ml-2 size-4" />
                  {UI_TEXT.buttons.syncAll}
                </>
              )}
            </AppButton>
            <Can permission="connections:create">
              {isCurrentWorkspaceArchived ? (
                <AppButton
                  size="sm"
                  className="h-10 rounded-lg bg-[#2563eb] px-4 text-[12.5px] hover:bg-[#1d4ed8]"
                  disabled
                >
                  {UI_TEXT.buttons.newConnection}
                </AppButton>
              ) : (
                <Link href={ROUTES.integrationsNew}>
                  <AppButton
                    size="sm"
                    className="h-10 rounded-lg bg-[#2563eb] px-4 text-[12.5px] hover:bg-[#1d4ed8]"
                  >
                    {UI_TEXT.buttons.newConnection}
                  </AppButton>
                </Link>
              )}
            </Can>
          </>
        }
      />

      {/* Filters */}
      <div className={cn(SURFACE_CARD_CLASS, "mb-3 grid gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6")}>
        {filterSelects.map((select) => (
          <label key={select.label} className="grid min-w-0 gap-1">
            <span className="text-[11px] font-semibold text-[#8098b4]">{select.label}</span>
            <AppSelect value={select.value} onValueChange={select.onChange}>
              <AppSelectTrigger className="h-9 w-full rounded-lg border border-[#e8edf3] bg-white px-3 text-[12.5px] text-[#334155] hover:bg-[#f8fafc]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent className="z-[90] max-h-72 rounded-lg border border-[#e8edf3]">
                {select.options.map((option) => (
                  <AppSelectItem key={option} value={option} className="text-[12.5px]">
                    {option === "all" || option === "All" ? UI_TEXT.filters.all : option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </label>
        ))}
      </div>

      {error ? (
        <div className="mb-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {UI_TEXT.sections.failedLoadTitle}: {error}
        </div>
      ) : null}

      {/* KPI row */}
      <div className="mb-3 flex flex-wrap items-stretch gap-3">
        {summaryCards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconClassName={card.iconClassName}
            className="min-w-[180px]"
          />
        ))}
      </div>

      {/* Health mix + activity feed. RTL grid: the first child lands rightmost. */}
      <div className="mb-3.5 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div className={cn(SURFACE_CARD_CLASS, "px-5 py-[18px]")}>
          <div className="mb-3.5 text-sm font-bold text-[#0d1b3e]">
            {UI_TEXT.sections.healthBreakdown}
          </div>
          <DonutBreakdown
            entries={healthBreakdown}
            total={categoryFilteredRecords.length}
            centerLabel={UI_TEXT.sections.totalConnections}
            emptyLabel={UI_TEXT.empty.tableNoRows}
          />
        </div>

        <SurfaceCard title={UI_TEXT.sections.syncActivity}>
          {recentActivity.length === 0 ? (
            <div className="px-[18px] py-8 text-center text-xs text-[#8098b4]">
              {UI_TEXT.sections.noActivity}
            </div>
          ) : (
            recentActivity.map((activity, index) => (
              <div
                key={activity.key}
                className={cn(
                  "flex items-center gap-3 px-[18px] py-2.5",
                  index < recentActivity.length - 1 && "border-b border-[#e8edf3]"
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    activity.failed ? "bg-[#ef4444]" : "bg-[#10b981]"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-[#0d1b3e]">
                    {activity.platformName} · {activity.action}
                  </div>
                  <div className="truncate text-[11px] text-[#8098b4]">{activity.message}</div>
                </div>
                <span className="shrink-0 text-[11px] text-[#8098b4]">
                  <RelativeTime value={activity.timestamp} fallback="-" />
                </span>
              </div>
            ))
          )}
        </SurfaceCard>
      </div>

      {/* Connections table */}
      <SurfaceCard title={`${UI_TEXT.sections.tableTitle} (${categoryFilteredRecords.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right">
            <thead>
              <tr className="border-b border-[#e8edf3] bg-[#f8fafc]">
                {[
                  UI_TEXT.sections.platform,
                  UI_TEXT.sections.connectedAccount,
                  UI_TEXT.sections.status,
                  UI_TEXT.sections.health,
                  UI_TEXT.sections.lastSync,
                  UI_TEXT.sections.nextSync,
                  UI_TEXT.sections.actions,
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-2.5 text-[11px] font-semibold text-[#8098b4]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-[#e8edf3]">
                    <td colSpan={7} className="px-4 py-3">
                      <AppSkeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : categoryFilteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[#8098b4]">
                    {emptyState?.subtitle ?? UI_TEXT.empty.tableNoRows}
                  </td>
                </tr>
              ) : (
                categoryFilteredRecords.map((record, index) => {
                  const healthVisuals = getHealthVisuals(
                    record.healthState,
                    record.healthScore,
                    record.healthLabel
                  )
                  const statusMeta = CONNECTION_STATUS_META[record.connection.status]
                  const healthMeta = HEALTH_STATUS_META[record.healthState]
                  const syncState = syncProgress[record.connection.connectionId]
                  const isSyncing = syncState && syncState !== "completed" && syncState !== "failed"
                  const workspaceStatus = availableWorkspaces.find(
                    (workspace) => workspace.id === record.connection.workspaceId
                  )?.status
                  const runSyncAction = connectionActionPolicy.getAction(
                    {
                      connection: record.connection,
                      integrationStatus: record.integrationStatus,
                      workspaceStatus,
                    },
                    CONNECTION_ACTION_IDS.RUN_SYNC
                  )
                  const availableActions = connectionActionPolicy.getAvailableActions({
                    connection: record.connection,
                    integrationStatus: record.integrationStatus,
                    workspaceStatus,
                  })

                  const handleRunSync = async () => {
                    const connectionId = record.connection.connectionId
                    setSyncProgress((prev) => ({ ...prev, [connectionId]: "running" }))
                    try {
                      await runSync(connectionId)
                      toast.success("بدأت المزامنة بنجاح.")
                    } catch (error) {
                      const message =
                        error instanceof Error ? error.message : "تعذر تشغيل المزامنة."
                      toast.error(message)
                    } finally {
                      setSyncProgress((prev) => {
                        const next = { ...prev }
                        delete next[connectionId]
                        return next
                      })
                    }
                  }

                  return (
                    <tr
                      key={record.connection.connectionId}
                      className={cn(
                        "transition-colors hover:bg-[#f8fafc]",
                        index < categoryFilteredRecords.length - 1 && "border-b border-[#e8edf3]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <ConnectorLogo platformName={record.platformName} />
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] font-bold text-[#0d1b3e]">
                              {record.platformName}
                            </div>
                            <div className="truncate text-[11px] text-[#8098b4]">
                              {record.workspaceName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-[#334155]">
                        {record.connectedAccount || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            statusMeta?.className ?? "bg-[#f1f5f9] text-[#64748b]"
                          )}
                        >
                          {statusMeta?.label ?? record.connection.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              healthMeta?.className ?? "bg-[#f1f5f9] text-[#64748b]"
                            )}
                          >
                            {healthMeta?.label ?? record.healthState}
                          </span>
                          <span className="text-[11px] font-bold text-[#0d1b3e]" dir="ltr">
                            {healthVisuals.score}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[#8098b4]">
                        <RelativeTime value={record.lastSyncAt} fallback="-" />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[#8098b4]">
                        <RelativeTime value={record.nextSyncAt} fallback="-" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <AppButton
                            size="sm"
                            className="h-8 rounded-lg bg-[#2563eb] px-3 text-[11px] hover:bg-[#1d4ed8]"
                            disabled={!runSyncAction.enabled || Boolean(isSyncing)}
                            onClick={() => void handleRunSync()}
                          >
                            {isSyncing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              UI_TEXT.buttons.runSync
                            )}
                          </AppButton>
                          <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                            <AppButton
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg border-[#e8edf3] px-3 text-[11px] text-[#334155] hover:bg-[#f8fafc]"
                            >
                              {UI_TEXT.buttons.details}
                            </AppButton>
                          </Link>
                          <ConnectionActionsMenu
                            actions={availableActions}
                            menuLabel={UI_TEXT.overflow.moreActions}
                            onActionSelect={(action) => {
                              void handleConnectionAction(record, action)
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

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

      <AppConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingConnection) {
            setDeleteDialogOpen(open)
            if (!open) {
              setPendingDeleteAction(null)
            }
          }
        }}
        title={pendingDeleteAction?.action.confirmation?.title ?? ""}
        description={pendingDeleteAction?.action.confirmation?.description ?? ""}
        cancelLabel="إلغاء"
        confirmLabel={pendingDeleteAction?.action.confirmation?.confirmLabel ?? ""}
        confirmTone="destructive"
        loading={isDeletingConnection}
        onCancel={() => {
          if (!isDeletingConnection) {
            setDeleteDialogOpen(false)
            setPendingDeleteAction(null)
          }
        }}
        onConfirm={() => {
          void confirmDeleteConnection()
        }}
      />
    </div>
  )
}
