"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCheckbox,
  AppConfirmDialog,
  AppDialog,
  AppInput,
  AppSearchableSelect,
} from "@/components/app"

import { Can } from "@/features/authentication"

import { useCustomers } from "../hooks"
import { customerListService } from "../services/customer-list.service"
import type {
  BulkImportRow,
  CustomerPlatform,
  CustomerRecord,
  CustomerSegment,
  CustomerStatus,
} from "../types"

import { type Locale, localeDirection } from "@/i18n/locales"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

type CustomersTranslator = ReturnType<typeof useTranslations<"customers">>

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    maximumFractionDigits: 0,
  })
}
function formatAmount(value: number, locale: Locale): string {
  return `${amountFormatter(locale).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

function dateFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
function formatDate(value: string | null, locale: Locale): string {
  return value ? dateFormatter(locale).format(new Date(value)) : "—"
}

function getStatusMeta(
  t: CustomersTranslator
): Record<CustomerStatus, { label: string; bg: string; text: string; dot: string }> {
  return {
    new: {
      label: t("status.new"),
      bg: "bg-[#eff6ff]",
      text: "text-[#2563eb]",
      dot: "bg-[#2563eb]",
    },
    active: {
      label: t("status.active"),
      bg: "bg-[#f0fdf4]",
      text: "text-[#16a34a]",
      dot: "bg-[#16a34a]",
    },
    at_risk: {
      label: t("status.at_risk"),
      bg: "bg-[#fff7ed]",
      text: "text-[#c2410c]",
      dot: "bg-[#c2410c]",
    },
    churned: {
      label: t("status.churned"),
      bg: "bg-[#fef2f2]",
      text: "text-[#dc2626]",
      dot: "bg-[#dc2626]",
    },
    inactive: {
      label: t("status.inactive"),
      bg: "bg-[#f4f6fa]",
      text: "text-[#5b6b85]",
      dot: "bg-[#8098b4]",
    },
  }
}

function getSegmentMeta(
  t: CustomersTranslator
): Record<CustomerSegment, { label: string; bg: string; text: string }> {
  return {
    VIP: { label: t("segment.vip"), bg: "bg-[#f5f0ff]", text: "text-[#7c3aed]" },
    Loyal: { label: t("segment.loyal"), bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
    "One Time": { label: t("segment.oneTime"), bg: "bg-[#f4f6fa]", text: "text-[#5b6b85]" },
    New: { label: t("segment.new"), bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  }
}

function getPlatformLabel(t: CustomersTranslator): Record<CustomerPlatform, string> {
  return {
    Salla: t("platform.salla"),
    Shopify: t("platform.shopify"),
    Zid: t("platform.zid"),
    Madar: t("platform.madar"),
  }
}

function toCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n")
  // A leading BOM so Excel (the realistic destination for this file) opens Arabic text as UTF-8
  // instead of guessing a legacy codepage and mangling it.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportCustomersCsv(
  records: CustomerRecord[],
  t: CustomersTranslator,
  locale: Locale,
  statusMeta: Record<CustomerStatus, { label: string }>,
  segmentMeta: Record<CustomerSegment, { label: string }>,
  platformLabel: Record<CustomerPlatform, string>
) {
  const header = [
    t("csv.headerName"),
    t("csv.headerEmail"),
    t("csv.headerPhone"),
    t("csv.headerPlatform"),
    t("csv.headerStatus"),
    t("csv.headerSegment"),
    t("csv.headerLtv"),
    t("csv.headerOrderCount"),
    t("csv.headerLastPurchase"),
    t("csv.headerAccountBalance"),
  ]
  const rows = records.map((record) => [
    record.name,
    record.email,
    record.phone ?? "",
    platformLabel[record.platform],
    statusMeta[record.status].label,
    segmentMeta[record.segment].label,
    String(record.lifetimeValue),
    String(record.totalOrders),
    formatDate(record.lastPurchaseAt, locale),
    record.accountBalance !== null ? String(record.accountBalance) : "",
  ])
  downloadCsv(t("csv.exportFilename"), [header, ...rows])
}

function downloadImportTemplateCsv(t: CustomersTranslator) {
  downloadCsv(t("csv.templateFilename"), [
    ["name", "phone", "email", "region"],
    [t("csv.templateExampleName"), "0501234567", "ahmed@example.com", t("csv.templateExampleCity")],
  ])
}

// A small RFC4180-ish parser -- handles quoted fields (so a name containing a comma still reads
// as one cell) without pulling in a CSV library for four columns.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

// Maps by header name (case-insensitive) rather than fixed column order, so a file with the
// columns in a different order still imports correctly.
function csvToImportRows(text: string): BulkImportRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const columnIndex = (name: string) => header.indexOf(name)
  const nameIndex = columnIndex("name")
  const phoneIndex = columnIndex("phone")
  const emailIndex = columnIndex("email")
  const regionIndex = columnIndex("region")

  return rows.slice(1).map((cells) => ({
    name: nameIndex >= 0 ? (cells[nameIndex] ?? "").trim() : "",
    phone: phoneIndex >= 0 ? cells[phoneIndex]?.trim() || null : null,
    email: emailIndex >= 0 ? cells[emailIndex]?.trim() || null : null,
    region: regionIndex >= 0 ? cells[regionIndex]?.trim() || null : null,
  }))
}

const PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  )
}

const AVATAR_COLORS = [
  "bg-[#eef1f6] text-[#5b6b85]",
  "bg-[#eff6ff] text-[#2563eb]",
  "bg-[#f0fdf4] text-[#16a34a]",
  "bg-[#fffbeb] text-[#b45309]",
  "bg-[#fef2f2] text-[#dc2626]",
  "bg-[#f5f0ff] text-[#7c3aed]",
]
function avatarColor(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

// Real daily counts of customers created on each of the last `days` days, oldest first -- no
// fabricated series, every point comes straight from the same createdAt timestamps already
// loaded for the list (used for both the sparklines and the trend badges below).
function dailyCreatedCounts(records: CustomerRecord[], days: number): number[] {
  const buckets = new Array(days).fill(0) as number[]
  const now = Date.now()
  for (const record of records) {
    const createdAt = new Date(record.createdAt).getTime()
    if (Number.isNaN(createdAt)) continue
    const dayIndex = days - 1 - Math.floor((now - createdAt) / DAY_MS)
    if (dayIndex >= 0 && dayIndex < days) buckets[dayIndex] += 1
  }
  return buckets
}

function countCreatedWithin(records: CustomerRecord[], maxAgeDays: number, minAgeDays = 0): number {
  const now = Date.now()
  return records.filter((record) => {
    const createdAt = new Date(record.createdAt).getTime()
    if (Number.isNaN(createdAt)) return false
    const ageDays = (now - createdAt) / DAY_MS
    return ageDays >= minAgeDays && ageDays < maxAgeDays
  }).length
}

// null means "not enough history to say" -- shown as no badge at all rather than a manufactured
// percentage (a previous-window count of zero can't honestly produce a growth rate).
function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 1)
  const width = 100
  const height = 28
  const stepX = points.length > 1 ? width / (points.length - 1) : 0
  const coords = points.map((point, index) => `${index * stepX},${height - (point / max) * height}`)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={`M0,${height} L${coords.join(" ")} L${width},${height} Z`}
        fill={color}
        opacity="0.12"
      />
    </svg>
  )
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const isUp = value >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold",
        isUp ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
      )}
    >
      {isUp ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  )
}

function CustomerAvatar({ name }: { name: string }) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
        avatarColor(name)
      )}
    >
      {initialsOf(name)}
    </div>
  )
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="grid min-w-[150px] gap-1">
      <span className={cn("text-[11px] font-semibold", HEADING)}>{label}</span>
      <AppSearchableSelect
        value={value}
        onChange={(next) => onChange(next as T)}
        options={options}
        ariaLabel={label}
        triggerClassName="h-10"
      />
    </div>
  )
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Users className="size-10 text-[#c7cedb]" />
      <div>
        <p className={cn("text-[13px] font-bold", HEADING)}>{message}</p>
        <p className={cn("mt-1 text-[12px]", MUTED)}>{hint}</p>
      </div>
    </div>
  )
}

export function CustomersOverview() {
  const t = useTranslations("customers")
  const locale = useLocale() as Locale
  const { records, isLoading, error, refetch } = useCustomers()

  const statusMeta = useMemo(() => getStatusMeta(t), [t])
  const segmentMeta = useMemo(() => getSegmentMeta(t), [t])
  const platformLabel = useMemo(() => getPlatformLabel(t), [t])

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<CustomerStatus | "all">("all")
  const [segment, setSegment] = useState<CustomerSegment | "all">("all")
  const [platform, setPlatform] = useState<CustomerPlatform | "all">("all")
  const [page, setPage] = useState(1)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null)
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const statusCounts = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          acc[record.status] += 1
          return acc
        },
        { new: 0, active: 0, at_risk: 0, churned: 0, inactive: 0 } satisfies Record<
          CustomerStatus,
          number
        >
      ),
    [records]
  )
  const totalCustomers = records.length

  const dailySeries = useMemo(() => dailyCreatedCounts(records, 14), [records])
  const newLast30 = countCreatedWithin(records, 30)
  const newPrev30 = countCreatedWithin(records, 60, 30)
  const newTrend = percentChange(newLast30, newPrev30)
  const totalPrev30 = Math.max(0, totalCustomers - newLast30)
  const totalTrend = percentChange(totalCustomers, totalPrev30)
  const activePercent =
    totalCustomers > 0 ? Math.round((statusCounts.active / totalCustomers) * 100) : 0

  const summaryCards: Array<{
    key: "total" | CustomerStatus
    title: string
    value: number
    insight: string
    icon: typeof Users
    accent: string
    trend?: number | null
    showSparkline?: boolean
  }> = [
    {
      key: "total",
      title: t("summary.totalTitle"),
      value: totalCustomers,
      insight: t("summary.totalInsight"),
      icon: Users,
      accent: "#2563eb",
      trend: totalTrend,
      showSparkline: true,
    },
    {
      key: "active",
      title: t("summary.activeTitle"),
      value: statusCounts.active,
      insight:
        totalCustomers > 0
          ? t("summary.activeInsightWithBase", { total: totalCustomers, percent: activePercent })
          : t("summary.activeInsightEmpty"),
      icon: Activity,
      accent: "#16a34a",
    },
    {
      key: "at_risk",
      title: t("summary.atRiskTitle"),
      value: statusCounts.at_risk,
      insight: t("summary.atRiskInsight"),
      icon: AlertTriangle,
      accent: "#c2410c",
    },
    {
      key: "new",
      title: t("summary.newTitle"),
      value: statusCounts.new,
      insight: t("summary.newInsight"),
      icon: Sparkles,
      accent: "#2563eb",
      trend: newTrend,
      showSparkline: true,
    },
  ]

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const filtered = records.filter((record) => {
      const matchesSearch =
        !needle ||
        `${record.name} ${record.email} ${record.phone ?? ""} ${record.id}`
          .toLowerCase()
          .includes(needle)
      const matchesStatus = status === "all" || record.status === status
      const matchesSegment = segment === "all" || record.segment === segment
      const matchesPlatform = platform === "all" || record.platform === platform

      return matchesSearch && matchesStatus && matchesSegment && matchesPlatform
    })

    // Fixed sort (newest last-purchase first) -- the mockup has no column-sort affordance, unlike
    // the previous English-language table.
    return [...filtered].sort((a, b) =>
      (b.lastPurchaseAt ?? "").localeCompare(a.lastPurchaseAt ?? "")
    )
  }, [platform, records, search, segment, status])

  const hasActiveFilters =
    search !== "" || status !== "all" || segment !== "all" || platform !== "all"

  const resetFilters = () => {
    setSearch("")
    setStatus("all")
    setSegment("all")
    setPlatform("all")
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedRecords = filteredRecords.slice(pageStart, pageStart + PAGE_SIZE)

  const confirmDelete = async () => {
    if (!deletingCustomer) return
    setIsDeleting(true)
    try {
      await customerListService.deleteCustomer(deletingCustomer.id)
      toast.success(t("toasts.deleted", { name: deletingCustomer.name }))
      setDeletingCustomer(null)
      void refetch()
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      const details =
        error && typeof error === "object" && "details" in error
          ? (error.details as { accountBalance?: number } | undefined)
          : undefined
      if (code === "CUSTOMER_HAS_NONZERO_BALANCE" && typeof details?.accountBalance === "number") {
        toast.error(
          t("toasts.deleteBlockedBalance", {
            amount: formatAmount(details.accountBalance, locale),
          })
        )
      } else {
        toast.error(t("toasts.deleteFailed"))
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
            <Users className="size-5" />
          </span>
          <div>
            <h1 className={cn("text-[20px] font-extrabold", HEADING)}>{t("heading")}</h1>
            <p className={cn("text-[12.5px]", MUTED)}>{t("subheading")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="outline"
            icon={<Download className="size-4" />}
            className="h-10 gap-1.5 rounded-[10px] border-[#e8edf3] px-3.5 text-[12.5px] font-semibold text-[#5b6b85]"
            disabled={filteredRecords.length === 0}
            onClick={() =>
              exportCustomersCsv(filteredRecords, t, locale, statusMeta, segmentMeta, platformLabel)
            }
          >
            {t("export")}
          </AppButton>
          <AppButton
            variant="outline"
            icon={<Upload className="size-4" />}
            className="h-10 gap-1.5 rounded-[10px] border-[#e8edf3] px-3.5 text-[12.5px] font-semibold text-[#5b6b85]"
            onClick={() => setIsImportOpen(true)}
          >
            {t("import")}
          </AppButton>
          <Can permission="customers:create">
            <AppButton
              icon={<Plus className="size-4" />}
              className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => setIsAddOpen(true)}
            >
              {t("addCustomer")}
            </AppButton>
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          const isSelected = card.key === "total" ? status === "all" : status === card.key
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setPage(1)
                setStatus(card.key === "total" ? "all" : card.key)
              }}
              className={cn(
                "flex flex-col rounded-[16px] border bg-white p-4 text-right transition-colors",
                isSelected ? "border-[#2563eb]" : "border-[#e8edf3] hover:border-[#c7d9ff]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: `${card.accent}1a`, color: card.accent }}
                >
                  <Icon className="size-4" />
                </span>
                <TrendBadge value={card.trend ?? null} />
              </div>
              <p className={cn("mt-3 text-[11.5px] font-semibold", MUTED)}>{card.title}</p>
              <p
                className="mt-0.5 text-[26px] font-extrabold leading-none"
                style={{ color: card.accent }}
              >
                {card.value}
              </p>
              <p className={cn("mt-1.5 text-[10.5px] leading-4", MUTED)}>{card.insight}</p>
              {card.showSparkline ? (
                <div className="mt-2">
                  <Sparkline points={dailySeries} color={card.accent} />
                </div>
              ) : (
                <div className="mt-2 h-8" />
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="grid min-w-[240px] flex-1 gap-1">
              <span className={cn("text-[11px] font-semibold", HEADING)}>{t("searchLabel")}</span>
              <div className="relative">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
                <AppInput
                  aria-label={t("searchAriaLabel")}
                  placeholder={t("searchPlaceholder")}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  className={cn(FIELD_CLASS, "w-full ps-9")}
                />
              </div>
            </div>

            <FilterSelect
              label={t("statusLabel")}
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              options={[
                { value: "all", label: t("allStatuses") },
                ...(Object.keys(statusMeta) as CustomerStatus[]).map((key) => ({
                  value: key,
                  label: statusMeta[key].label,
                })),
              ]}
            />
            <FilterSelect
              label={t("segmentLabel")}
              value={segment}
              onChange={(value) => {
                setSegment(value)
                setPage(1)
              }}
              options={[
                { value: "all", label: t("allSegments") },
                ...(Object.keys(segmentMeta) as CustomerSegment[]).map((key) => ({
                  value: key,
                  label: segmentMeta[key].label,
                })),
              ]}
            />
            <FilterSelect
              label={t("platformLabel")}
              value={platform}
              onChange={(value) => {
                setPlatform(value)
                setPage(1)
              }}
              options={[
                { value: "all", label: t("allPlatforms") },
                ...(Object.keys(platformLabel) as CustomerPlatform[]).map((key) => ({
                  value: key,
                  label: platformLabel[key],
                })),
              ]}
            />
          </div>

          {hasActiveFilters ? (
            <AppButton
              variant="outline"
              icon={<X className="size-3.5" />}
              className="h-10 shrink-0 gap-1.5 rounded-[10px] border-[#e8edf3] px-3 text-[12.5px] font-semibold text-[#5b6b85]"
              onClick={resetFilters}
            >
              {t("clearFilters")}
            </AppButton>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[#e8edf3] bg-white">
        {isLoading ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            {t("loadingCustomers")}
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#dc2626]">{error}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-[11.5px] font-semibold text-[#8098b4]">
                    <th className="px-4 py-3">{t("table.columns.customer")}</th>
                    <th className="px-4 py-3 text-center">{t("table.columns.contact")}</th>
                    <th className="px-4 py-3">{t("table.columns.status")}</th>
                    <th className="px-4 py-3">{t("table.columns.segment")}</th>
                    <th className="px-4 py-3">{t("table.columns.platform")}</th>
                    <th className="px-4 py-3">{t("table.columns.ltv")}</th>
                    <th className="px-4 py-3">{t("table.columns.walletBalance")}</th>
                    <th className="px-4 py-3">{t("table.columns.orderCount")}</th>
                    <th className="px-4 py-3">{t("table.columns.lastPurchase")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => (
                    <CustomerRow
                      key={record.id}
                      record={record}
                      onEdit={setEditingCustomer}
                      onDelete={setDeletingCustomer}
                    />
                  ))}
                </tbody>
              </table>
              {paginatedRecords.length === 0 ? (
                records.length === 0 ? (
                  <EmptyState message={t("emptyNoSync.message")} hint={t("emptyNoSync.hint")} />
                ) : (
                  <EmptyState message={t("emptyNoMatch.message")} hint={t("emptyNoMatch.hint")} />
                )
              ) : null}
            </div>

            {filteredRecords.length > 0 ? (
              <div className="flex items-center justify-between border-t border-[#e8edf3] px-4 py-3">
                <p className={cn("text-[11.5px]", MUTED)}>
                  {t("pagination.showingRange", {
                    from: pageStart + 1,
                    to: Math.min(pageStart + PAGE_SIZE, filteredRecords.length),
                    total: filteredRecords.length,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <AppButton
                    variant="outline"
                    className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                    disabled={currentPage === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label={t("pagination.previous")}
                  >
                    <ChevronLeft className="size-4 rtl:rotate-180" />
                  </AppButton>
                  <span className={cn("text-[11.5px]", MUTED)}>
                    {currentPage} / {totalPages}
                  </span>
                  <AppButton
                    variant="outline"
                    className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label={t("pagination.next")}
                  >
                    <ChevronRight className="size-4 rtl:rotate-180" />
                  </AppButton>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AddCustomerDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onCreated={() => {
          setIsAddOpen(false)
          void refetch()
        }}
      />

      <ImportCustomersDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => void refetch()}
      />

      {editingCustomer ? (
        <EditCustomerDialog
          customer={editingCustomer}
          onOpenChange={(open) => {
            if (!open) setEditingCustomer(null)
          }}
          onSaved={() => {
            setEditingCustomer(null)
            void refetch()
          }}
        />
      ) : null}

      {deletingCustomer ? (
        <AppConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open && !isDeleting) setDeletingCustomer(null)
          }}
          contentClassName={cn(
            "w-[92vw] max-w-[26rem] rounded-[16px] p-5",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
          title={
            <span className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("deleteDialog.title")}
            </span>
          }
          description={
            <span className={cn("text-[12.5px]", MUTED)}>
              {t("deleteDialog.description", { name: deletingCustomer.name })}
            </span>
          }
          confirmLabel={
            isDeleting ? t("deleteDialog.confirmingLabel") : t("deleteDialog.confirmLabel")
          }
          cancelLabel={t("deleteDialog.cancelLabel")}
          confirmTone="destructive"
          loading={isDeleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeletingCustomer(null)}
        />
      ) : null}
    </div>
  )
}

function CustomerRow({
  record,
  onEdit,
  onDelete,
}: {
  record: CustomerRecord
  onEdit: (record: CustomerRecord) => void
  onDelete: (record: CustomerRecord) => void
}) {
  const router = useRouter()
  const t = useTranslations("customers")
  const locale = useLocale() as Locale
  const statusMeta = getStatusMeta(t)[record.status]
  const segmentMeta = getSegmentMeta(t)[record.segment]
  // Only a native ("Madar") customer has a real wallet statement to show -- a synced storefront
  // customer has no account of their own here, so their row has nothing further to open; every
  // real data point they have (LTV, orders, status, segment) is already on the row itself.
  const isNative = record.platform === "Madar"

  return (
    <tr
      onClick={isNative ? () => router.push(ROUTES.customerStatement(record.id)) : undefined}
      className={cn(
        "border-b border-[#f1f4f9] text-[12.5px] last:border-b-0",
        isNative && "cursor-pointer hover:bg-[#fafbfd]"
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CustomerAvatar name={record.name} />
          <div className="min-w-0">
            <p className={cn("truncate text-[13px] font-bold", HEADING)}>{record.name}</p>
            <p className={cn("truncate text-[10.5px]", MUTED)}>#{record.id.slice(0, 8)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="min-w-0">
          {record.phone ? (
            <p className="flex items-center justify-center gap-1 text-[12px]" dir="ltr">
              <Phone className="size-3 text-[#8098b4]" />
              {record.phone}
            </p>
          ) : (
            <p className={cn("text-[12px]", MUTED)}>{record.email || "—"}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            statusMeta.bg,
            statusMeta.text
          )}
        >
          <span className={cn("size-1.5 rounded-full", statusMeta.dot)} />
          {statusMeta.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
            segmentMeta.bg,
            segmentMeta.text
          )}
        >
          {segmentMeta.label}
        </span>
      </td>
      <td className={cn("px-4 py-3 text-[12px]", MUTED)}>{getPlatformLabel(t)[record.platform]}</td>
      <td className={cn("px-4 py-3 text-[12.5px] font-bold", HEADING)}>
        {formatAmount(record.lifetimeValue, locale)}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-[12.5px] font-bold",
          record.accountBalance === null || record.accountBalance === 0
            ? HEADING
            : record.accountBalance > 0
              ? "text-[#16a34a]"
              : "text-[#dc2626]"
        )}
      >
        {record.accountBalance !== null ? formatAmount(record.accountBalance, locale) : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Activity className="size-3.5 text-[#8098b4]" />
          <span className={cn("text-[12.5px]", HEADING)}>{record.totalOrders}</span>
        </div>
      </td>
      <td className={cn("px-4 py-3 text-[12px]", MUTED)}>
        {formatDate(record.lastPurchaseAt, locale)}
      </td>
      <td className="px-4 py-3">
        {isNative ? (
          <div className="flex items-center gap-1.5">
            <AppButton
              variant="outline"
              icon={<FileText className="size-3.5" />}
              className="h-8 gap-1.5 whitespace-nowrap rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#2563eb]"
              onClick={(event) => {
                event.stopPropagation()
                router.push(ROUTES.customerStatement(record.id))
              }}
            >
              {t("table.statement")}
            </AppButton>
            <Can permission="customers:edit">
              <AppButton
                variant="outline"
                aria-label={t("table.editAriaLabel", { name: record.name })}
                className="size-8 shrink-0 rounded-[8px] border-[#e8edf3] p-0 text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#2563eb]"
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit(record)
                }}
              >
                <Pencil className="size-3.5" />
              </AppButton>
            </Can>
            <Can permission="customers:delete">
              <AppButton
                variant="outline"
                aria-label={t("table.deleteAriaLabel", { name: record.name })}
                className="size-8 shrink-0 rounded-[8px] border-[#e8edf3] p-0 text-[#5b6b85] hover:border-[#fecaca] hover:text-[#dc2626]"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(record)
                }}
              >
                <Trash2 className="size-3.5" />
              </AppButton>
            </Can>
          </div>
        ) : null}
      </td>
    </tr>
  )
}

// B2B identity + Saudi National Address -- same fields AddCustomerDialog and EditCustomerDialog
// both need, kept as plain strings here (empty string, not null) since that's what a controlled
// <input> wants; trimToBusinessInfoInput() below converts back to the null-when-blank shape the
// API expects.
interface BusinessInfoDraft {
  isBusinessCustomer: boolean
  vatNumber: string
  commercialRegistration: string
  buildingNumber: string
  secondaryNumber: string
  street: string
  city: string
  district: string
  postalCode: string
  countryCode: string
}

const EMPTY_BUSINESS_INFO: BusinessInfoDraft = {
  isBusinessCustomer: false,
  vatNumber: "",
  commercialRegistration: "",
  buildingNumber: "",
  secondaryNumber: "",
  street: "",
  city: "",
  district: "",
  postalCode: "",
  countryCode: "SA",
}

function businessInfoFromCustomer(customer: CustomerRecord): BusinessInfoDraft {
  return {
    isBusinessCustomer: customer.isBusinessCustomer,
    vatNumber: customer.vatNumber ?? "",
    commercialRegistration: customer.commercialRegistration ?? "",
    buildingNumber: customer.buildingNumber ?? "",
    secondaryNumber: customer.secondaryNumber ?? "",
    street: customer.street ?? "",
    city: customer.city ?? "",
    district: customer.district ?? "",
    postalCode: customer.postalCode ?? "",
    countryCode: customer.countryCode ?? "SA",
  }
}

function trimBusinessInfoInput(draft: BusinessInfoDraft) {
  return {
    isBusinessCustomer: draft.isBusinessCustomer,
    vatNumber: draft.vatNumber.trim() || null,
    commercialRegistration: draft.commercialRegistration.trim() || null,
    buildingNumber: draft.buildingNumber.trim() || null,
    secondaryNumber: draft.secondaryNumber.trim() || null,
    street: draft.street.trim() || null,
    city: draft.city.trim() || null,
    district: draft.district.trim() || null,
    postalCode: draft.postalCode.trim() || null,
    countryCode: draft.countryCode.trim() || null,
  }
}

function BusinessInfoFields({
  value,
  onChange,
}: {
  value: BusinessInfoDraft
  onChange: (next: BusinessInfoDraft) => void
}) {
  const t = useTranslations("customers")
  const setField = (field: keyof BusinessInfoDraft) => (event: { target: { value: string } }) =>
    onChange({ ...value, [field]: event.target.value })

  return (
    <div className="flex flex-col gap-3 border-t border-[#eef1f6] pt-3">
      {/* A big, clearly-clickable toggle panel -- not a bare checkbox next to a label -- so it
          reads as a real on/off switch for "does this customer need B2B/tax fields at all",
          rather than one more form field easy to miss. */}
      <label
        className={cn(
          "flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border px-3.5 py-3 transition-colors",
          value.isBusinessCustomer
            ? "border-[#2563eb] bg-[#eff6ff]"
            : "border-[#e8edf3] bg-[#fafbfd] hover:border-[#c7d3e3]"
        )}
      >
        <span className="flex flex-col gap-0.5">
          <span className={cn("text-[13px] font-bold", HEADING)}>
            {t("businessInfo.toggleTitle")}
          </span>
          <span className={cn("text-[11px]", MUTED)}>{t("businessInfo.toggleHint")}</span>
        </span>
        <AppCheckbox
          className="size-5"
          checked={value.isBusinessCustomer}
          onCheckedChange={(checked) =>
            onChange({ ...value, isBusinessCustomer: checked === true })
          }
        />
      </label>

      {value.isBusinessCustomer ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.commercialRegistration")}
              </label>
              <AppInput
                value={value.commercialRegistration}
                onChange={setField("commercialRegistration")}
                placeholder="0000000000"
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.vatNumber")}
              </label>
              <AppInput
                value={value.vatNumber}
                onChange={setField("vatNumber")}
                placeholder="300000000000003"
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.buildingNumber")}
              </label>
              <AppInput
                value={value.buildingNumber}
                onChange={setField("buildingNumber")}
                placeholder="0000"
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.secondaryNumber")}
              </label>
              <AppInput
                value={value.secondaryNumber}
                onChange={setField("secondaryNumber")}
                placeholder="0000"
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.postalCode")}
              </label>
              <AppInput
                value={value.postalCode}
                onChange={setField("postalCode")}
                placeholder="00000"
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.street")}
              </label>
              <AppInput
                value={value.street}
                onChange={setField("street")}
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.city")}
              </label>
              <AppInput
                value={value.city}
                onChange={setField("city")}
                placeholder={t("businessInfo.cityPlaceholder")}
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
            <div>
              <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("businessInfo.district")}
              </label>
              <AppInput
                value={value.district}
                onChange={setField("district")}
                placeholder={t("businessInfo.districtPlaceholder")}
                className={cn(FIELD_CLASS, "h-11 w-full")}
              />
            </div>
          </div>

          <div className="w-1/3 pe-1.5">
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("businessInfo.countryCode")}
            </label>
            <AppInput
              value={value.countryCode}
              onChange={setField("countryCode")}
              placeholder="SA"
              className={cn(FIELD_CLASS, "h-11 w-full")}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const t = useTranslations("customers")
  const locale = useLocale() as Locale
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [region, setRegion] = useState("")
  const [notes, setNotes] = useState("")
  const [businessInfo, setBusinessInfo] = useState<BusinessInfoDraft>(EMPTY_BUSINESS_INFO)
  const [isSaving, setIsSaving] = useState(false)

  const reset = () => {
    setName("")
    setPhone("")
    setEmail("")
    setRegion("")
    setNotes("")
    setBusinessInfo(EMPTY_BUSINESS_INFO)
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("toasts.nameRequired"))
      return
    }
    setIsSaving(true)
    try {
      await customerListService.createCustomer({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        region: region.trim() || null,
        ...trimBusinessInfoInput(businessInfo),
      })
      toast.success(t("toasts.created"))
      reset()
      onCreated()
    } catch {
      toast.error(t("toasts.createFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!isSaving) onOpenChange(next)
      }}
      contentClassName={cn(
        "w-[92vw] max-w-[45rem] rounded-[16px] p-5",
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
      )}
      title={
        <span className={cn("text-[16px] font-extrabold", HEADING)}>{t("addDialog.title")}</span>
      }
      description={<span className={cn("text-[12px]", MUTED)}>{t("addDialog.description")}</span>}
      footer={
        <>
          <AppButton
            className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={isSaving}
            onClick={() => void submit()}
          >
            {isSaving ? t("addDialog.saving") : t("addDialog.save")}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            {t("addDialog.cancel")}
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("addDialog.fullName")} <span className="text-[#dc2626]">*</span>
          </label>
          <AppInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("addDialog.fullNamePlaceholder")}
            className={cn(FIELD_CLASS, "h-11 w-full")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("addDialog.phone")}
            </label>
            <AppInput
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05xxxxxxxx"
              className={cn(FIELD_CLASS, "h-11 w-full text-left")}
            />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("addDialog.email")}
            </label>
            <AppInput
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className={cn(FIELD_CLASS, "h-11 w-full text-left")}
            />
          </div>
        </div>
        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("addDialog.address")}
          </label>
          <AppInput
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder={t("addDialog.addressPlaceholder")}
            className={cn(FIELD_CLASS, "h-11 w-full")}
          />
        </div>
        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("addDialog.notes")}
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className={cn(
              FIELD_CLASS,
              "h-auto w-full resize-none px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
            )}
          />
        </div>

        <BusinessInfoFields value={businessInfo} onChange={setBusinessInfo} />
      </div>
    </AppDialog>
  )
}

function ImportCustomersDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const t = useTranslations("customers")
  const locale = useLocale() as Locale
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkImportRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{
    created: number
    skipped: Array<{ row: number; reason: string }>
  } | null>(null)

  const reset = () => {
    setFileName(null)
    setRows([])
    setResult(null)
  }

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    const text = await file.text()
    setRows(csvToImportRows(text))
  }

  const submit = async () => {
    if (rows.length === 0) {
      toast.error(t("toasts.importFileRequired"))
      return
    }
    setIsImporting(true)
    try {
      const outcome = await customerListService.bulkImportCustomers(rows)
      setResult(outcome)
      if (outcome.created > 0) {
        toast.success(t("toasts.imported", { count: outcome.created }))
        onImported()
      }
    } catch {
      toast.error(t("toasts.importFailed"))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (isImporting) return
        if (!next) reset()
        onOpenChange(next)
      }}
      contentClassName={cn(
        "w-[92vw] max-w-[30rem] rounded-[16px] p-5",
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
      )}
      title={
        <span className={cn("text-[16px] font-extrabold", HEADING)}>{t("importDialog.title")}</span>
      }
      description={
        <span className={cn("text-[12px]", MUTED)}>{t("importDialog.description")}</span>
      }
      footer={
        <>
          <AppButton
            className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={isImporting || rows.length === 0}
            onClick={() => void submit()}
          >
            {isImporting
              ? t("importDialog.importing")
              : `${t("import")} ${rows.length > 0 ? `(${rows.length})` : ""}`}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
          >
            {t("importDialog.close")}
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-[#c7d3e3] bg-[#fafbfd] px-4 py-6 text-center hover:border-[#93a6c9]">
          <Upload className="size-5 text-[#2563eb]" />
          <span className={cn("text-[12px] font-semibold", HEADING)}>
            {fileName ?? t("importDialog.dropLabel")}
          </span>
          <span className={cn("text-[10.5px]", MUTED)}>
            {rows.length > 0
              ? t("importDialog.rowsFound", { count: rows.length })
              : t("importDialog.columnsHint")}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ""
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => downloadImportTemplateCsv(t)}
          className="self-start text-[11.5px] font-semibold text-[#2563eb] hover:underline"
        >
          {t("importDialog.downloadTemplate")}
        </button>

        {result ? (
          <div className="rounded-[10px] border border-[#e8edf3] p-3">
            <p className={cn("text-[12.5px] font-bold", HEADING)}>
              {t("importDialog.resultCreated", { count: result.created })}
              {result.skipped.length > 0
                ? t("importDialog.resultSkippedSuffix", { count: result.skipped.length })
                : ""}
            </p>
            {result.skipped.length > 0 ? (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {result.skipped.map((entry) => (
                  <li key={entry.row} className={cn("text-[11px]", MUTED)}>
                    {t("importDialog.skippedRowLabel", {
                      row: entry.row + 1,
                      reason: entry.reason,
                    })}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppDialog>
  )
}

function EditCustomerDialog({
  customer,
  onOpenChange,
  onSaved,
}: {
  customer: CustomerRecord
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useTranslations("customers")
  const locale = useLocale() as Locale
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [email, setEmail] = useState(customer.email)
  const [region, setRegion] = useState(customer.region ?? "")
  const [businessInfo, setBusinessInfo] = useState<BusinessInfoDraft>(
    businessInfoFromCustomer(customer)
  )
  const [isSaving, setIsSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("toasts.nameRequired"))
      return
    }
    setIsSaving(true)
    try {
      // Only what actually changed -- an edit is a partial PATCH, not a full re-create.
      const input: Record<string, string | null | boolean> = {}
      const trimmedName = name.trim()
      if (trimmedName !== customer.name) input.name = trimmedName
      const trimmedPhone = phone.trim() || null
      if (trimmedPhone !== customer.phone) input.phone = trimmedPhone
      const trimmedEmail = email.trim() || null
      if (trimmedEmail !== (customer.email || null)) input.email = trimmedEmail
      const trimmedRegion = region.trim() || null
      if (trimmedRegion !== customer.region) input.region = trimmedRegion

      const nextBusinessInfo = trimBusinessInfoInput(businessInfo)
      const previousBusinessInfo = trimBusinessInfoInput(businessInfoFromCustomer(customer))
      for (const key of Object.keys(nextBusinessInfo) as Array<keyof typeof nextBusinessInfo>) {
        if (nextBusinessInfo[key] !== previousBusinessInfo[key]) input[key] = nextBusinessInfo[key]
      }

      await customerListService.updateCustomer(customer.id, input)
      toast.success(t("toasts.updated"))
      onSaved()
    } catch {
      toast.error(t("toasts.updateFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppDialog
      open={true}
      onOpenChange={(next) => {
        if (!isSaving) onOpenChange(next)
      }}
      contentClassName={cn(
        "w-[92vw] max-w-[45rem] rounded-[16px] p-5",
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
      )}
      title={
        <span className={cn("text-[16px] font-extrabold", HEADING)}>{t("editDialog.title")}</span>
      }
      description={<span className={cn("text-[12px]", MUTED)}>{customer.name}</span>}
      footer={
        <>
          <AppButton
            className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={isSaving}
            onClick={() => void submit()}
          >
            {isSaving ? t("editDialog.saving") : t("editDialog.save")}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            {t("editDialog.cancel")}
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("addDialog.fullName")} <span className="text-[#dc2626]">*</span>
          </label>
          <AppInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("addDialog.fullNamePlaceholder")}
            className={cn(FIELD_CLASS, "h-11 w-full")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("addDialog.phone")}
            </label>
            <AppInput
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05xxxxxxxx"
              className={cn(FIELD_CLASS, "h-11 w-full text-left")}
            />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("addDialog.email")}
            </label>
            <AppInput
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className={cn(FIELD_CLASS, "h-11 w-full text-left")}
            />
          </div>
        </div>
        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("addDialog.address")}
          </label>
          <AppInput
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder={t("addDialog.addressPlaceholder")}
            className={cn(FIELD_CLASS, "h-11 w-full")}
          />
        </div>

        <BusinessInfoFields value={businessInfo} onChange={setBusinessInfo} />
      </div>
    </AppDialog>
  )
}
