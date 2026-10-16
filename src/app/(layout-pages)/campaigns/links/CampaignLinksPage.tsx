"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Calendar,
  Check,
  Code2,
  Download,
  Filter,
  Link2,
  Loader2,
  MousePointerClick,
  Plus,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { localeDirection, type Locale } from "@/i18n/locales"
import {
  AppButton,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppEmpty,
} from "@/components/app"
import { PlatformBadge } from "@/components/platform-badge"

import { CampaignLinkForm } from "@/features/campaign-links/components/campaign-link-form"
import { CampaignLinkDetailPanel } from "@/features/campaign-links/components/campaign-link-detail-panel"
import { CampaignLinkEditDialog } from "@/features/campaign-links/components/campaign-link-edit-dialog"
import { CampaignLinksTable } from "@/features/campaign-links/components/campaign-links-table"
import { TrackingSnippetDialog } from "@/features/campaign-links/components/tracking-snippet-dialog"
import {
  IconBadge,
  type IconBadgeTone,
} from "@/features/campaign-links/components/design/icon-badge"
import { cairo } from "@/components/design/fonts"
import {
  campaignPickerService,
  type CampaignPlatform,
  type CampaignRecord,
} from "@/features/campaign-links/services/campaign-picker.service"
import {
  linkListService,
  type CampaignLinkSummaryRecord,
} from "@/features/campaign-links/services/link-list.service"

type PeriodOption = "7" | "30" | "90"
type StatusFilter = "all" | "enabled" | "disabled"

type CampaignLinksPageTranslator = ReturnType<typeof useTranslations<"campaignLinks.page">>

function getPeriodOptions(
  t: CampaignLinksPageTranslator
): Array<{ value: PeriodOption; label: string }> {
  return [
    { value: "7", label: t("periods.last7Days") },
    { value: "30", label: t("periods.last30Days") },
    { value: "90", label: t("periods.last90Days") },
  ]
}

function getStatusFilterOptions(
  t: CampaignLinksPageTranslator
): Array<{ value: StatusFilter; label: string }> {
  return [
    { value: "all", label: t("statusFilters.all") },
    { value: "enabled", label: t("statusFilters.enabled") },
    { value: "disabled", label: t("statusFilters.disabled") },
  ]
}

// The 4 ad platforms campaigns can be imported from (CAMPAIGN_PLATFORMS in
// identity-platform/campaigns/types.ts). Badge keys match PLATFORM_ICON's own keys.
// Brand names -- identical in both locales, so they're plain data rather than translation keys.
const CAMPAIGN_PLATFORM_LABELS: Record<CampaignPlatform, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  snapchat_ads: "Snapchat",
  tiktok_ads: "TikTok Ads",
}

const CAMPAIGN_PLATFORM_OPTIONS: CampaignPlatform[] = [
  "google_ads",
  "meta_ads",
  "snapchat_ads",
  "tiktok_ads",
]

function periodToRange(period: PeriodOption) {
  const end = new Date()
  const days = Number(period)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

function previousPeriodRange(period: PeriodOption) {
  const days = Number(period)
  const end = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCurrency(value: number, locale: Locale): string {
  const amount = formatMoney(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

// No previous-period baseline (previous === 0) is treated as a full increase when there's any
// current activity, rather than hiding the badge -- a real change did happen, there's just
// nothing to divide by.
function computeChangePct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

function sumTotals(rows: CampaignLinkSummaryRecord[]) {
  return rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + (row.clicks ?? 0),
      orders: acc.orders + (row.ordersCount ?? 0),
      revenue: acc.revenue + (row.revenue ?? 0),
      active: acc.active + (row.enabled ? 1 : 0),
    }),
    { clicks: 0, orders: 0, revenue: 0, active: 0 }
  )
}

function exportCsv(
  rows: CampaignLinkSummaryRecord[],
  campaignNameById: Record<string, string>,
  t: CampaignLinksPageTranslator
) {
  const header = [
    t("csv.name"),
    t("csv.id"),
    t("csv.campaign"),
    t("csv.status"),
    t("csv.clicks"),
    t("csv.orders"),
    t("csv.revenue"),
    t("csv.createdAt"),
  ]
  const lines = rows.map((row) =>
    [
      row.name,
      row.displayId,
      campaignNameById[row.campaignId] ?? "",
      row.enabled ? t("statusFilters.enabled") : t("statusFilters.disabled"),
      String(row.clicks ?? 0),
      String(row.ordersCount ?? 0),
      String(row.revenue ?? 0),
      row.createdAt,
    ]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(",")
  )
  const csv = [header.join(","), ...lines].join("\n")
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `campaign-links-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

interface KpiCardProps {
  icon: React.ReactNode
  tone: IconBadgeTone
  title: string
  value: React.ReactNode
  changePct: number | null
  t: CampaignLinksPageTranslator
}

function KpiCard({ icon, tone, title, value, changePct, t }: KpiCardProps) {
  const isPositive = (changePct ?? 0) >= 0
  const changeLabel =
    changePct !== null
      ? t("changeFromPreviousPeriod", {
          sign: isPositive ? "+" : "",
          value: changePct.toFixed(1),
        })
      : null
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_2px_0_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#64748B]">{title}</p>
          <p className="mt-2 text-2xl font-bold text-[#172033]">{value}</p>
        </div>
        <IconBadge icon={icon} tone={tone} className="size-11 shrink-0 rounded-full" />
      </div>
      {changePct !== null ? (
        <p
          className={
            isPositive
              ? "mt-3 flex items-center gap-1 text-xs font-medium text-[#10B981]"
              : "mt-3 flex items-center gap-1 text-xs font-medium text-[#EF4444]"
          }
        >
          {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {changeLabel}
        </p>
      ) : null}
    </div>
  )
}

const TOOLBAR_TRIGGER_CLASSNAME =
  "flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm font-medium text-[#334155] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F8FAFC] focus:outline-none"

export default function CampaignLinksPage() {
  const t = useTranslations("campaignLinks.page")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const [rows, setRows] = useState<CampaignLinkSummaryRecord[]>([])
  const [previousTotals, setPreviousTotals] = useState<ReturnType<typeof sumTotals> | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [importingPlatform, setImportingPlatform] = useState<CampaignPlatform | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodOption>("30")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSnippetOpen, setIsSnippetOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<CampaignLinkSummaryRecord | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<CampaignLinkSummaryRecord | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [deletingRow, setDeletingRow] = useState<CampaignLinkSummaryRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [summary, previousSummary, campaignList] = await Promise.all([
        linkListService.getCampaignLinksSummary(periodToRange(period)),
        linkListService.getCampaignLinksSummary(previousPeriodRange(period)),
        campaignPickerService.listCampaigns(),
      ])
      setRows(summary)
      setPreviousTotals(sumTotals(previousSummary))
      setCampaigns(campaignList)
    } catch (error) {
      console.error("Failed to load campaign links", error)
      setLoadError(t("loadError"))
    } finally {
      setIsLoading(false)
    }
  }, [period, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const periodOptions = useMemo(() => getPeriodOptions(t), [t])
  const statusFilterOptions = useMemo(() => getStatusFilterOptions(t), [t])

  const campaignNameById = useMemo(
    () => Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.displayName])),
    [campaigns]
  )

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId) ?? null,
    [rows, selectedRowId]
  )

  // The KPI cards reflect the whole list by default, but narrow to a single link's numbers
  // once one is selected -- clicking a row both opens its detail panel and filters these.
  const totals = useMemo(() => sumTotals(selectedRow ? [selectedRow] : rows), [rows, selectedRow])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch =
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.displayId.toLowerCase().includes(query) ||
        (campaignNameById[row.campaignId] ?? "").toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "enabled" ? row.enabled : !row.enabled)
      return matchesSearch && matchesStatus
    })
  }, [rows, search, statusFilter, campaignNameById])

  function handleCreated() {
    setIsCreateOpen(false)
    void loadData()
  }

  // Campaigns synced from an ad platform live in that platform's own tables -- they only become
  // linkable once imported into the campaigns table this picker reads (GET /v1/campaigns).
  // Importing is idempotent (upsert per external campaign id), so re-running is safe.
  async function handleImportCampaigns(platform: CampaignPlatform) {
    setImportingPlatform(platform)
    try {
      const result = await campaignPickerService.importCampaignsFromPlatform(platform)
      if (result.imported === 0) {
        toast.info(t("toasts.importNone", { platform: CAMPAIGN_PLATFORM_LABELS[platform] }))
        return
      }
      toast.success(
        t("toasts.importSuccess", {
          count: result.imported,
          platform: CAMPAIGN_PLATFORM_LABELS[platform],
        })
      )
      const campaignList = await campaignPickerService.listCampaigns()
      setCampaigns(campaignList)
    } catch (error) {
      console.error("Failed to import campaigns", error)
      toast.error(t("toasts.importError"))
    } finally {
      setImportingPlatform(null)
    }
  }

  function handleOpenDetail(row: CampaignLinkSummaryRecord) {
    setSelectedRowId(row.id)
    setDetailRow(row)
    setIsDetailOpen(true)
  }

  function handleDetailOpenChange(open: boolean) {
    setIsDetailOpen(open)
    if (!open) {
      setSelectedRowId(null)
    }
  }

  function handleEdit(row: CampaignLinkSummaryRecord) {
    setEditingRow(row)
    setIsEditOpen(true)
  }

  function handleSaved() {
    setIsEditOpen(false)
    void loadData()
  }

  async function handleToggleEnabled(row: CampaignLinkSummaryRecord) {
    try {
      await linkListService.setCampaignLinkEnabled(row.id, !row.enabled)
      toast.success(row.enabled ? t("toasts.linkDisabled") : t("toasts.linkEnabled"))
      void loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.toggleError"))
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRow) return
    setIsDeleting(true)
    try {
      await linkListService.archiveCampaignLink(deletingRow.id)
      toast.success(t("toasts.linkDeleted"))
      if (selectedRowId === deletingRow.id) {
        setSelectedRowId(null)
      }
      setDeletingRow(null)
      void loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.deleteError"))
    } finally {
      setIsDeleting(false)
    }
  }

  function handleCopyLink(row: CampaignLinkSummaryRecord) {
    const value = row.shortUrl ?? row.finalUrl
    void navigator.clipboard.writeText(value)
    toast.success(t("toasts.linkCopied"))
  }

  const revenueChangePct = previousTotals
    ? computeChangePct(totals.revenue, previousTotals.revenue)
    : null
  const ordersChangePct = previousTotals
    ? computeChangePct(totals.orders, previousTotals.orders)
    : null
  const clicksChangePct = previousTotals
    ? computeChangePct(totals.clicks, previousTotals.clicks)
    : null
  const activeChangePct = previousTotals
    ? computeChangePct(totals.active, previousTotals.active)
    : null

  return (
    <div
      dir={localeDirection(locale)}
      className={`${cairo.variable} min-h-full space-y-6 bg-[#F8FAFC] p-6 font-[family-name:var(--font-cairo)]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<Link2 className="size-5" />} className="size-11" />
          <div>
            <h1 className="text-[20px] font-bold leading-7 text-[#172033]">{t("title")}</h1>
            <p className="text-sm text-[#64748B]">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSnippetOpen(true)}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F8FAFC]"
          >
            <Code2 className="size-4" />
            {t("installSnippetButton")}
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            // Deliberately enabled with zero campaigns: the dialog is where campaigns get
            // imported from a connected ad platform, so disabling it here used to block the only
            // route out of the "no campaigns yet" state.
            disabled={isLoading}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#4F46E5] px-5 text-sm font-medium text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" />
            {t("createLinkButton")}
          </button>
        </div>
      </div>

      {selectedRow ? (
        <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm">
          <span className="text-[#64748B]">{t("viewingData")}</span>
          <span className="font-medium text-[#172033]">{selectedRow.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedRowId(null)
              setIsDetailOpen(false)
            }}
            className="ms-auto flex cursor-pointer items-center gap-1 text-[#64748B] hover:text-[#172033]"
          >
            <X className="size-3.5" />
            {t("removeSelection")}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="size-5" />}
          tone="success"
          title={t("kpis.totalRevenue")}
          value={formatCurrency(totals.revenue, locale)}
          changePct={revenueChangePct}
          t={t}
        />
        <KpiCard
          icon={<ShoppingCart className="size-5" />}
          tone="info"
          title={t("kpis.totalOrders")}
          value={totals.orders}
          changePct={ordersChangePct}
          t={t}
        />
        <KpiCard
          icon={<MousePointerClick className="size-5" />}
          tone="violet"
          title={t("kpis.totalClicks")}
          value={totals.clicks}
          changePct={clicksChangePct}
          t={t}
        />
        <KpiCard
          icon={<Link2 className="size-5" />}
          tone="warning"
          title={t("kpis.activeLinks")}
          value={totals.active}
          changePct={activeChangePct}
          t={t}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 flex size-4 items-center text-[#94A3B8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white ps-9 pe-3.5 text-sm text-[#172033] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] placeholder:text-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-[3px] focus:ring-[#4F46E5]/15"
            />
          </div>

          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <button type="button" className={TOOLBAR_TRIGGER_CLASSNAME}>
                {t("filterButton")}
                <Filter className="size-4" />
              </button>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end">
              {statusFilterOptions.map((option) => (
                <AppDropdownMenuItem
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.value === statusFilter ? (
                    <Check className="size-4 text-[#4F46E5]" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {option.label}
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <button type="button" className={TOOLBAR_TRIGGER_CLASSNAME}>
                {periodOptions.find((option) => option.value === period)?.label}
                <Calendar className="size-4" />
              </button>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="start">
              {periodOptions.map((option) => (
                <AppDropdownMenuItem key={option.value} onClick={() => setPeriod(option.value)}>
                  {option.value === period ? (
                    <Check className="size-4 text-[#4F46E5]" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {option.label}
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenuContent>
          </AppDropdownMenu>

          <button
            type="button"
            onClick={() => exportCsv(visibleRows, campaignNameById, t)}
            className={TOOLBAR_TRIGGER_CLASSNAME}
          >
            {tCommon("export")}
            <Download className="size-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_0_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#172033]">{t("sectionTitle")}</h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EEF2FF] px-1.5 text-xs font-medium text-[#4F46E5]">
            {visibleRows.length}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#64748B]">
            <Loader2 className="size-4 animate-spin" />
            {t("loadingLinks")}
          </div>
        ) : loadError ? (
          <div className="p-6 text-sm text-[#EF4444]">{loadError}</div>
        ) : rows.length === 0 ? (
          <AppEmpty
            title={t("emptyNoLinks.title")}
            description={t("emptyNoLinks.description")}
            actionLabel={t("emptyNoLinks.action")}
            onAction={() => setIsCreateOpen(true)}
          />
        ) : visibleRows.length === 0 ? (
          <AppEmpty
            title={t("emptyNoResults.title")}
            description={t("emptyNoResults.description")}
          />
        ) : (
          <CampaignLinksTable
            rows={visibleRows}
            campaignNameById={campaignNameById}
            selectedRowId={selectedRowId}
            onOpenDetail={handleOpenDetail}
            onEdit={handleEdit}
            onToggleEnabled={(row) => void handleToggleEnabled(row)}
            onDelete={setDeletingRow}
            onCopyLink={handleCopyLink}
          />
        )}
      </div>

      <AppDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        showCloseButton={false}
        contentClassName="w-[1040px] max-w-[95vw] max-h-[92vh] rounded-[20px] border border-[#E2E8F0] bg-white p-0 shadow-xl"
      >
        <div
          dir={localeDirection(locale)}
          className={`${cairo.variable} flex h-full flex-col font-[family-name:var(--font-cairo)]`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                <Link2 className="size-4" />
              </span>
              <h2 className="text-[20px] font-bold leading-7 text-[#172033]">
                {t("createDialog.title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              aria-label={t("createDialog.close")}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#172033]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {/* Importing is always reachable, not only while the campaign list is empty. A
                merchant who imports one platform still needs the other three, and hiding these
                once the first import succeeds left no route to them at all. */}
            <div
              className={
                campaigns.length === 0
                  ? "rounded-2xl border border-dashed border-[#E2E8F0] p-6 text-center"
                  : "rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-3"
              }
            >
              {campaigns.length === 0 ? (
                <>
                  <h3 className="text-[15px] font-bold text-[#172033]">
                    {t("createDialog.noCampaignsTitle")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-[#64748B]">
                    {t("createDialog.noCampaignsDescription")}
                  </p>
                </>
              ) : (
                <p className="text-[13px] font-medium text-[#64748B]">
                  {t("createDialog.importFromOtherPlatform")}
                </p>
              )}

              <div
                className={
                  campaigns.length === 0
                    ? "mt-5 flex flex-wrap items-center justify-center gap-2"
                    : "mt-3 flex flex-wrap items-center gap-2"
                }
              >
                {CAMPAIGN_PLATFORM_OPTIONS.map((platform) => (
                  <AppButton
                    key={platform}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={importingPlatform !== null}
                    loading={importingPlatform === platform}
                    onClick={() => void handleImportCampaigns(platform)}
                    icon={
                      <PlatformBadge
                        platform={CAMPAIGN_PLATFORM_LABELS[platform]}
                        className="size-5"
                        iconClassName="size-3"
                      />
                    }
                  >
                    {CAMPAIGN_PLATFORM_LABELS[platform]}
                  </AppButton>
                ))}
              </div>
            </div>

            {campaigns.length > 0 ? (
              <div className="mt-6">
                <CampaignLinkForm
                  campaigns={campaigns}
                  onCreated={handleCreated}
                  onCancel={() => setIsCreateOpen(false)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </AppDialog>

      <TrackingSnippetDialog open={isSnippetOpen} onOpenChange={setIsSnippetOpen} />

      <CampaignLinkDetailPanel
        link={detailRow}
        open={isDetailOpen}
        onOpenChange={handleDetailOpenChange}
      />

      <CampaignLinkEditDialog
        link={editingRow}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={handleSaved}
      />

      <AppDialog
        open={deletingRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null)
        }}
        showCloseButton={false}
        contentClassName="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      >
        <div
          dir={localeDirection(locale)}
          className={`${cairo.variable} space-y-4 p-6 font-[family-name:var(--font-cairo)]`}
        >
          <h2 className="text-[16px] font-bold text-[#172033]">{t("deleteDialog.title")}</h2>
          <p className="text-sm text-[#64748B]">
            {deletingRow ? t("deleteDialog.description", { name: deletingRow.name }) : null}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingRow(null)}
              disabled={isDeleting}
              className="flex h-10 cursor-pointer items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#EF4444] px-4 text-sm font-medium text-white transition-colors hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("deleteDialog.confirm")}
            </button>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
