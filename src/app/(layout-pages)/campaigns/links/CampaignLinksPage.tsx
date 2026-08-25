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
import { toast } from "sonner"

import {
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppEmpty,
} from "@/components/app"

import { CampaignLinkForm } from "@/features/campaign-links/components/campaign-link-form"
import { CampaignLinkDetailPanel } from "@/features/campaign-links/components/campaign-link-detail-panel"
import { CampaignLinkEditDialog } from "@/features/campaign-links/components/campaign-link-edit-dialog"
import { CampaignLinksTable } from "@/features/campaign-links/components/campaign-links-table"
import { TrackingSnippetDialog } from "@/features/campaign-links/components/tracking-snippet-dialog"
import {
  IconBadge,
  type IconBadgeTone,
} from "@/features/campaign-links/components/design/icon-badge"
import { tajawal } from "@/features/campaign-links/components/design/fonts"
import {
  campaignPickerService,
  type CampaignRecord,
} from "@/features/campaign-links/services/campaign-picker.service"
import {
  linkListService,
  type CampaignLinkSummaryRecord,
} from "@/features/campaign-links/services/link-list.service"

type PeriodOption = "7" | "30" | "90"
type StatusFilter = "all" | "enabled" | "disabled"

const PERIOD_OPTIONS: Array<{ value: PeriodOption; label: string }> = [
  { value: "7", label: "آخر 7 أيام" },
  { value: "30", label: "آخر 30 يوم" },
  { value: "90", label: "آخر 90 يوم" },
]

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "كل الحالات" },
  { value: "enabled", label: "نشط" },
  { value: "disabled", label: "معطل" },
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

function formatCurrency(value: number, currency = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
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

function exportCsv(rows: CampaignLinkSummaryRecord[], campaignNameById: Record<string, string>) {
  const header = [
    "الاسم",
    "المعرف",
    "الحملة",
    "الحالة",
    "النقرات",
    "الطلبات",
    "الإيرادات",
    "تاريخ الإنشاء",
  ]
  const lines = rows.map((row) =>
    [
      row.name,
      row.displayId,
      campaignNameById[row.campaignId] ?? "",
      row.enabled ? "نشط" : "معطل",
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
}

function KpiCard({ icon, tone, title, value, changePct }: KpiCardProps) {
  const isPositive = (changePct ?? 0) >= 0
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
          {isPositive ? "+" : ""}
          {changePct.toFixed(1)}% عن الفترة السابقة
        </p>
      ) : null}
    </div>
  )
}

const TOOLBAR_TRIGGER_CLASSNAME =
  "flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm font-medium text-[#334155] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F8FAFC] focus:outline-none"

export default function CampaignLinksPage() {
  const [rows, setRows] = useState<CampaignLinkSummaryRecord[]>([])
  const [previousTotals, setPreviousTotals] = useState<ReturnType<typeof sumTotals> | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
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
      setLoadError("تعذّر تحميل روابط الحملات. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
      toast.success(row.enabled ? "تم تعطيل الرابط" : "تم تفعيل الرابط")
      void loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحديث الرابط")
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRow) return
    setIsDeleting(true)
    try {
      await linkListService.archiveCampaignLink(deletingRow.id)
      toast.success("تم حذف الرابط")
      if (selectedRowId === deletingRow.id) {
        setSelectedRowId(null)
      }
      setDeletingRow(null)
      void loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الرابط")
    } finally {
      setIsDeleting(false)
    }
  }

  function handleCopyLink(row: CampaignLinkSummaryRecord) {
    const value = row.shortUrl ?? row.finalUrl
    void navigator.clipboard.writeText(value)
    toast.success("تم نسخ الرابط")
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
      dir="rtl"
      className={`${tajawal.variable} min-h-full space-y-6 bg-[#F8FAFC] p-6 font-[family-name:var(--font-tajawal)]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={<Link2 className="size-5" />} className="size-11" />
          <div>
            <h1 className="text-[20px] font-bold leading-7 text-[#172033]">منشئ الروابط</h1>
            <p className="text-sm text-[#64748B]">
              أنشئ روابط حملات قابلة للتتبع وراقب الطلبات والإيرادات المتولدة منها.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSnippetOpen(true)}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F8FAFC]"
          >
            <Code2 className="size-4" />
            تثبيت سنيبت التتبع
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={campaigns.length === 0 && !isLoading}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#4F46E5] px-5 text-sm font-medium text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" />
            إنشاء رابط جديد
          </button>
        </div>
      </div>

      {selectedRow ? (
        <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm">
          <span className="text-[#64748B]">عرض بيانات</span>
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
            إزالة
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="size-5" />}
          tone="success"
          title="إجمالي الإيرادات"
          value={formatCurrency(totals.revenue)}
          changePct={revenueChangePct}
        />
        <KpiCard
          icon={<ShoppingCart className="size-5" />}
          tone="info"
          title="إجمالي الطلبات"
          value={totals.orders}
          changePct={ordersChangePct}
        />
        <KpiCard
          icon={<MousePointerClick className="size-5" />}
          tone="violet"
          title="إجمالي النقرات"
          value={totals.clicks}
          changePct={clicksChangePct}
        />
        <KpiCard
          icon={<Link2 className="size-5" />}
          tone="warning"
          title="الروابط النشطة"
          value={totals.active}
          changePct={activeChangePct}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 flex size-4 items-center text-[#94A3B8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن حملة أو رابط..."
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white ps-9 pe-3.5 text-sm text-[#172033] shadow-[0_1px_2px_0_rgba(15,23,42,0.05)] placeholder:text-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-[3px] focus:ring-[#4F46E5]/15"
            />
          </div>

          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <button type="button" className={TOOLBAR_TRIGGER_CLASSNAME}>
                تصفية
                <Filter className="size-4" />
              </button>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end">
              {STATUS_FILTER_OPTIONS.map((option) => (
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
                {PERIOD_OPTIONS.find((option) => option.value === period)?.label}
                <Calendar className="size-4" />
              </button>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="start">
              {PERIOD_OPTIONS.map((option) => (
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
            onClick={() => exportCsv(visibleRows, campaignNameById)}
            className={TOOLBAR_TRIGGER_CLASSNAME}
          >
            تصدير
            <Download className="size-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_0_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#172033]">روابط الحملات</h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EEF2FF] px-1.5 text-xs font-medium text-[#4F46E5]">
            {visibleRows.length}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#64748B]">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل الروابط...
          </div>
        ) : loadError ? (
          <div className="p-6 text-sm text-[#EF4444]">{loadError}</div>
        ) : rows.length === 0 ? (
          <AppEmpty
            title="لا توجد روابط بعد"
            description="أنشئ أول رابط تتبع لك لتبدأ بقياس أداء حملاتك."
            actionLabel="إنشاء رابط"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : visibleRows.length === 0 ? (
          <AppEmpty title="لا توجد نتائج" description="جرّب تغيير كلمة البحث أو الفلتر." />
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
          dir="rtl"
          className={`${tajawal.variable} flex h-full flex-col font-[family-name:var(--font-tajawal)]`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                <Link2 className="size-4" />
              </span>
              <h2 className="text-[20px] font-bold leading-7 text-[#172033]">إنشاء رابط حملة</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              aria-label="إغلاق"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#172033]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {campaigns.length === 0 ? (
              <AppEmpty
                title="لا توجد حملات بعد"
                description="أنشئ حملة أولاً، ثم عد لبناء رابط تتبع لها."
              />
            ) : (
              <CampaignLinkForm
                campaigns={campaigns}
                onCreated={handleCreated}
                onCancel={() => setIsCreateOpen(false)}
              />
            )}
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
          dir="rtl"
          className={`${tajawal.variable} space-y-4 p-6 font-[family-name:var(--font-tajawal)]`}
        >
          <h2 className="text-[16px] font-bold text-[#172033]">حذف رابط الحملة؟</h2>
          <p className="text-sm text-[#64748B]">
            {deletingRow
              ? `سيتوقف "${deletingRow.name}" عن إعادة التوجيه وسيُحذف من هذه القائمة. لا يمكن التراجع عن هذا الإجراء.`
              : null}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingRow(null)}
              disabled={isDeleting}
              className="flex h-10 cursor-pointer items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#EF4444] px-4 text-sm font-medium text-white transition-colors hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              حذف
            </button>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
