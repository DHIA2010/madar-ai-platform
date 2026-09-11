"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import type { ConnectionCenterRecord, ConnectionsFilterState } from "../types"
import { ConnectionActionsMenu } from "./connection-actions-menu"
import { ConnectorLogo } from "./connector-logo"
import { SyncAllDialog } from "./sync-all-dialog"

import { cairo } from "@/components/design/fonts"

const UI_TEXT = {
  breadcrumb: "التكاملات ›",
  pageTitle: "مركز التكاملات",
  pageSubtitle:
    "أدر جميع تكاملات التسويق، المتاجر الإلكترونية، أنظمة إدارة العملاء والتحليلات في مكان واحد.",
  legacyTitle: "Connections Overview",
  searchAria: "البحث في التكاملات",
  searchPlaceholder: "البحث في التكاملات...",
  buttons: {
    newConnection: "ربط تكامل جديد",
    syncAll: "مزامنة الكل",
    syncing: "جارٍ المزامنة...",
    runSync: "مزامنة",
    viewDetails: "عرض التفاصيل",
    open: "فتح",
    cancel: "إلغاء",
  },
  sections: {
    summaryTotal: "إجمالي التكاملات",
    summaryActive: "التكاملات النشطة",
    summaryAttention: "بحاجة إلى انتباه",
    summarySyncing: "قيد المزامنة",
    tableTitle: "التكاملات",
    platform: "المنصة",
    connectedAccounts: "حسابات متصلة",
    accountLinked: "حساب متصل",
    accountCount: (count: number) => `حساب ${count}`,
    status: "الحالة",
    lastSync: "آخر مزامنة",
    nextSync: "المزامنة التالية",
    actions: "الإجراءات",
    failedLoadTitle: "تعذر تحميل التكاملات",
  },
  hints: {
    allPlatforms: "جميع المنصات المرتبطة",
    percentOfTotal: "% من إجمالي التكاملات",
    noConnections: "لا توجد تكاملات بعد",
    noIssues: "لا توجد مشاكل حالياً",
    needsReview: "تحتاج إلى مراجعة",
    noOperations: "لا توجد عمليات حالياً",
    operationsRunning: "عمليات جارية",
  },
  filters: {
    allIntegrations: "كل التكاملات",
    allStatuses: "كل الحالات",
  },
  toasts: {
    syncStarted: "بدأت المزامنة بنجاح.",
    syncFailed: "تعذر تشغيل المزامنة.",
    deleted: "تم حذف التكامل بنجاح.",
    deleteFailed: "تعذر حذف التكامل.",
  },
  empty: {
    noConnectorsTitle: "لا توجد تكاملات بعد",
    noConnectorsSubtitle: "ابدأ بربط أول تكامل لمتجرك أو منصتك الإعلانية.",
    noSearchTitle: "لا توجد نتائج",
    noSearchSubtitle: "جرّب كلمة بحث مختلفة أو امسح البحث.",
    noFilteredTitle: "لا توجد نتائج مطابقة",
    noFilteredSubtitle: "عدّل التصنيف أو الحالة لعرض التكاملات المطابقة.",
    tableNoRows: "لا توجد تكاملات مطابقة للبحث والفلاتر.",
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
  const categoryOptions = CATEGORY_OPTIONS
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

  // Four KPIs, matching the design's cards: value plus a short factual hint underneath. Every
  // hint is derived, never a placeholder -- "+2 this month" in the mock has no data behind it
  // here, so each card states something the records actually support.
  const summaryCards = useMemo(() => {
    const total = categoryFilteredRecords.length
    const active = categoryFilteredRecords.filter(
      (record) =>
        record.connection.status === "connected" ||
        record.connection.status === "valid" ||
        record.connection.status === "authorized"
    ).length
    const attention = categoryFilteredRecords.filter((record) =>
      ["Warning", "Error", "Expired Token", "Disconnected"].includes(record.healthState)
    ).length
    const syncing = categoryFilteredRecords.filter(
      (record) => record.healthState === "Running Sync" || record.connection.status === "syncing"
    ).length

    return [
      {
        label: UI_TEXT.sections.summaryTotal,
        value: total,
        hint: UI_TEXT.hints.allPlatforms,
        icon: <Layers className="size-[18px] text-[#8b5cf6]" />,
        iconClassName: "bg-[#8b5cf6]/12",
      },
      {
        label: UI_TEXT.sections.summaryActive,
        value: active,
        hint:
          total === 0
            ? UI_TEXT.hints.noConnections
            : `${Math.round((active / total) * 100)}${UI_TEXT.hints.percentOfTotal}`,
        icon: <CheckCircle2 className="size-[18px] text-[#19c98c]" />,
        iconClassName: "bg-[#19c98c]/12",
      },
      {
        label: UI_TEXT.sections.summaryAttention,
        value: attention,
        hint: attention === 0 ? UI_TEXT.hints.noIssues : UI_TEXT.hints.needsReview,
        icon: <AlertTriangle className="size-[18px] text-[#f59e0b]" />,
        iconClassName: "bg-[#f59e0b]/12",
      },
      {
        label: UI_TEXT.sections.summarySyncing,
        value: syncing,
        hint: syncing === 0 ? UI_TEXT.hints.noOperations : UI_TEXT.hints.operationsRunning,
        icon: <RefreshCcw className="size-[18px] text-[#2878ff]" />,
        iconClassName: "bg-[#2878ff]/12",
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
      toast.success(UI_TEXT.toasts.deleted)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : UI_TEXT.toasts.deleteFailed)
    } finally {
      setIsDeletingConnection(false)
    }
  }

  const handleConnectionAction = async (
    record: ConnectionCenterRecord,
    action: ConnectionActionDefinition
  ) => {
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

  const runSyncFor = async (record: ConnectionCenterRecord) => {
    const connectionId = record.connection.connectionId
    setSyncProgress((prev) => ({ ...prev, [connectionId]: "running" }))
    try {
      await runSync(connectionId)
      toast.success(UI_TEXT.toasts.syncStarted)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : UI_TEXT.toasts.syncFailed)
    } finally {
      setSyncProgress((prev) => {
        const next = { ...prev }
        delete next[connectionId]
        return next
      })
    }
  }

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      {/* Header */}
      <div className="mb-3.5 rounded-[14px] border border-[#e1e7f0] bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 text-right">
            <div className="mb-1 text-[11px] text-[#8190a8]">{UI_TEXT.breadcrumb}</div>
            <h1 className="text-[30px] font-bold leading-tight text-[#0b1738]">
              {UI_TEXT.pageTitle}
              <span className="sr-only">{UI_TEXT.legacyTitle}</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-[#71809a]">{UI_TEXT.pageSubtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Can permission="connections:create">
              {isCurrentWorkspaceArchived ? (
                <AppButton
                  className="h-11 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-bold hover:bg-[#1f66e0]"
                  disabled
                >
                  {UI_TEXT.buttons.newConnection}
                </AppButton>
              ) : (
                <Link href={ROUTES.integrationsNew}>
                  <AppButton
                    className="h-11 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-bold hover:bg-[#1f66e0]"
                    icon={<Plus className="size-4" />}
                    iconPosition="end"
                  >
                    {UI_TEXT.buttons.newConnection}
                  </AppButton>
                </Link>
              )}
            </Can>
            <AppButton
              variant="outline"
              className="h-11 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-xs font-semibold text-[#253756] hover:bg-[#f7f9fd]"
              onClick={() => setSyncAllDialogOpen(true)}
              disabled={isSyncingAll || records.length === 0}
              icon={
                isSyncingAll ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )
              }
              iconPosition="end"
            >
              {isSyncingAll ? UI_TEXT.buttons.syncing : UI_TEXT.buttons.syncAll}
            </AppButton>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-3.5 rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {UI_TEXT.sections.failedLoadTitle}: {error}
        </div>
      ) : null}

      {/* KPI row */}
      <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[14px] border border-[#e1e7f0] bg-white px-5 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  card.iconClassName
                )}
              >
                {card.icon}
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[13px] font-semibold text-[#4c5d79]">{card.label}</div>
                <div className="mt-2 text-2xl font-bold text-[#0b1738]" dir="ltr">
                  {card.value}
                </div>
                <div className="mt-1.5 text-[10px] text-[#7d8ba2]">{card.hint}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Platform cards */}
      {categoryFilteredRecords.length > 0 ? (
        <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {categoryFilteredRecords.slice(0, 6).map((record) => {
            const statusMeta = CONNECTION_STATUS_META[record.connection.status]
            return (
              <div
                key={record.connection.connectionId}
                className="flex flex-col rounded-[14px] border border-[#e1e7f0] bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <ConnectionActionsMenu
                    actions={connectionActionPolicy.getAvailableActions({
                      connection: record.connection,
                      integrationStatus: record.integrationStatus,
                      workspaceStatus: availableWorkspaces.find(
                        (workspace) => workspace.id === record.connection.workspaceId
                      )?.status,
                    })}
                    menuLabel={UI_TEXT.overflow.moreActions}
                    onActionSelect={(action) => {
                      void handleConnectionAction(record, action)
                    }}
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f8ef] px-2.5 py-1 text-[11px] font-semibold text-[#07945e]">
                    <span className="size-1.5 rounded-full bg-[#07945e]" />
                    {statusMeta?.label ?? record.connection.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb]">
                    <ConnectorLogo platformName={record.platformName} />
                  </div>
                  <div className="min-w-0 text-right text-[15px] font-bold text-[#172649]">
                    {record.platformName}
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <div className="text-[11px] text-[#7b89a1]">{UI_TEXT.sections.accountLinked}</div>
                  <div className="mt-1 text-[15px] font-bold text-[#12a56b]" dir="ltr">
                    {Math.max(record.connectedAccounts?.length ?? 0, 1)}
                  </div>
                </div>

                <Link
                  href={ROUTES.integrationsDetails(record.connection.connectionId)}
                  className="mt-3"
                >
                  <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#f4f8ff] text-[11px] font-semibold text-[#2878ff] transition-colors hover:bg-[#eaf1ff]">
                    <ArrowLeft className="size-3.5" />
                    {UI_TEXT.buttons.viewDetails}
                  </span>
                </Link>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-[16px] border border-[#e1e7f0] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 lg:flex-nowrap">
          <h2 className="shrink-0 text-[17px] font-bold text-[#0b1738]">
            {UI_TEXT.sections.tableTitle}
          </h2>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] border border-[#e1e7f0] bg-[#f7f9fd] px-3 lg:max-w-[390px]">
              <Search className="size-4 shrink-0 text-[#9aa6b8]" />
              <input
                aria-label={UI_TEXT.searchAria}
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder={UI_TEXT.searchPlaceholder}
                className="min-w-0 flex-1 border-none bg-transparent text-[11px] text-[#40506d] outline-none placeholder:text-[#9aa6b8]"
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <AppSelect
              value={activeCategory}
              onValueChange={(value) => {
                setActiveCategory(value)
                const nextPlatforms = getCategoryPlatformOptions(value, availableFilters.platforms)
                if (filters.platform !== "all" && !nextPlatforms.includes(filters.platform)) {
                  updateFilters({ platform: "all" })
                }
              }}
            >
              <AppSelectTrigger className="h-9 w-[152px] rounded-[10px] border-[#e1e7f0] bg-white px-3 text-[11px] font-medium text-[#40506d]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent className="z-[90] rounded-[10px] border-[#e1e7f0]">
                {categoryOptions.map((option) => (
                  <AppSelectItem key={option} value={option} className="text-[12px]">
                    {option === "All" ? UI_TEXT.filters.allIntegrations : option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>

            <AppSelect
              value={filters.status}
              onValueChange={(value) =>
                updateFilters({ status: value as ConnectionsFilterState["status"] })
              }
            >
              <AppSelectTrigger className="h-9 w-[152px] rounded-[10px] border-[#e1e7f0] bg-white px-3 text-[11px] font-medium text-[#40506d]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent className="z-[90] rounded-[10px] border-[#e1e7f0]">
                {statuses.map((option) => (
                  <AppSelectItem key={option} value={option} className="text-[12px]">
                    {option === "all"
                      ? UI_TEXT.filters.allStatuses
                      : (CONNECTION_STATUS_META[option]?.label ?? option)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[900px] text-center">
            <thead>
              <tr>
                {[
                  UI_TEXT.sections.platform,
                  UI_TEXT.sections.connectedAccounts,
                  UI_TEXT.sections.status,
                  UI_TEXT.sections.lastSync,
                  UI_TEXT.sections.nextSync,
                  UI_TEXT.sections.actions,
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-[#e7ecf3] px-4 py-3 text-[11px] font-semibold text-[#73819a]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td colSpan={6} className="border-b border-[#e7ecf3] px-4 py-3">
                      <AppSkeleton className="h-7 w-full" />
                    </td>
                  </tr>
                ))
              ) : categoryFilteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-[#1d2d4c]">
                      {emptyState?.title ?? UI_TEXT.empty.noConnectorsTitle}
                    </p>
                    <p className="mt-1 text-xs text-[#7b879b]">
                      {emptyState?.subtitle ?? UI_TEXT.empty.tableNoRows}
                    </p>
                  </td>
                </tr>
              ) : (
                categoryFilteredRecords.map((record) => {
                  const statusMeta = CONNECTION_STATUS_META[record.connection.status]
                  const workspaceStatus = availableWorkspaces.find(
                    (workspace) => workspace.id === record.connection.workspaceId
                  )?.status
                  const availableActions = connectionActionPolicy.getAvailableActions({
                    connection: record.connection,
                    integrationStatus: record.integrationStatus,
                    workspaceStatus,
                  })
                  const syncState = syncProgress[record.connection.connectionId]

                  return (
                    <tr
                      key={record.connection.connectionId}
                      className="transition-colors hover:bg-[#f9fbfe]"
                    >
                      <td className="border-b border-[#e7ecf3] px-4 py-3">
                        <div className="flex items-center justify-center gap-2.5">
                          <ConnectorLogo platformName={record.platformName} />
                          <span className="text-[11px] font-semibold text-[#1d2d4c]">
                            {record.platformName}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-[#e7ecf3] px-4 py-3 text-[11px] text-[#52627e]">
                        {UI_TEXT.sections.accountCount(
                          Math.max(record.connectedAccounts?.length ?? 0, 1)
                        )}
                      </td>
                      <td className="border-b border-[#e7ecf3] px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f8ef] px-3 py-1 text-[10px] font-semibold text-[#07945e]">
                          <span className="size-1.5 rounded-full bg-[#07945e]" />
                          {statusMeta?.label ?? record.connection.status}
                        </span>
                      </td>
                      <td className="border-b border-[#e7ecf3] px-4 py-3 text-[10px] text-[#61708a]">
                        <RelativeTime value={record.lastSyncAt} fallback="—" />
                      </td>
                      <td className="border-b border-[#e7ecf3] px-4 py-3 text-[11px] text-[#7b879b]">
                        <RelativeTime value={record.nextSyncAt} fallback="—" />
                      </td>
                      <td className="border-b border-[#e7ecf3] px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                            <span className="flex h-[25px] items-center rounded-[7px] border border-[#dfe6ef] bg-[#f4f7fb] px-3 text-[10px] font-semibold text-[#2878ff] transition-colors hover:bg-[#eaf1ff]">
                              {UI_TEXT.buttons.open}
                            </span>
                          </Link>
                          <AppButton
                            size="sm"
                            variant="ghost"
                            className="h-[25px] rounded-[7px] px-2 text-[10px] font-semibold text-[#2878ff] hover:bg-[#f4f7fb]"
                            disabled={Boolean(syncState)}
                            icon={
                              syncState ? <Loader2 className="size-3 animate-spin" /> : undefined
                            }
                            iconPosition="end"
                            onClick={() => void runSyncFor(record)}
                          >
                            {UI_TEXT.buttons.runSync}
                          </AppButton>
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
      </div>

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
        cancelLabel={UI_TEXT.buttons.cancel}
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
