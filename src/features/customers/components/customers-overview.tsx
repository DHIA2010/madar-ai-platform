"use client"

import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppContainer,
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

import { useCustomers } from "../hooks"
import { customerListService } from "../services"
import type { CustomerFilterState, CustomerRecord, CustomerStatus } from "../types"

const STATUS_STYLE: Record<CustomerStatus, { label: string; className: string; dot: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  at_risk: { label: "At Risk", className: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  churned: { label: "Churned", className: "bg-red-100 text-red-800", dot: "bg-red-500" },
  new: { label: "New", className: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
}

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat("en-SA", { style: "decimal", maximumFractionDigits: 0 }).format(value) +
    " SAR"
  )
}

function formatDate(iso?: string): string {
  if (!iso) {
    return "—"
  }

  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor(diff / 60000)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  if (hours < 24) {
    return `${hours}h ago`
  }

  if (days < 7) {
    return `${days}d ago`
  }

  return d.toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric" })
}

function CustomerAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const colors = [
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700",
  ]

  const colorIndex = name.charCodeAt(0) % colors.length
  const colorClass = colors[colorIndex]

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        colorClass
      )}
    >
      {initials}
    </div>
  )
}

function SortHeader({
  label,
  column,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string
  column: CustomerFilterState["sortBy"]
  currentSort: CustomerFilterState["sortBy"]
  currentDir: CustomerFilterState["sortDir"]
  onSort: (column: CustomerFilterState["sortBy"]) => void
}) {
  const isActive = currentSort === column

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSort(column)}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  )
}

function CustomerRowSkeleton() {
  return (
    <AppTableRow className="h-16">
      {Array.from({ length: 9 }).map((_, index) => (
        <AppTableCell key={`skel-cell-${index}`}>
          <AppSkeleton className="h-4 w-24" />
        </AppTableCell>
      ))}
    </AppTableRow>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const ALL_SENTINEL = "__all__"

  const mapped = options.map((opt) => ({
    ...opt,
    selectValue: opt.value === "" ? ALL_SENTINEL : opt.value,
  }))

  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <AppSelect
        value={value === "" ? ALL_SENTINEL : value}
        onValueChange={(v) => onChange(v === ALL_SENTINEL ? "" : v)}
      >
        <AppSelectTrigger className="h-9 min-w-[140px] rounded-xl border bg-background text-sm shadow-sm">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="z-[90] min-w-[160px] rounded-xl border border-border/80 bg-popover p-1 shadow-xl"
        >
          {mapped.map((option) => (
            <AppSelectItem
              key={option.selectValue}
              value={option.selectValue}
              className="rounded-md px-2 py-1.5 text-sm"
            >
              {option.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    </div>
  )
}

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const meta = STATUS_STYLE[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Users className="size-10 text-muted-foreground/40" />
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters</p>
      </div>
    </div>
  )
}

function buildStatusCountMap(records: CustomerRecord[]): Record<CustomerStatus, number> {
  return records.reduce(
    (acc, record) => {
      acc[record.status] += 1
      return acc
    },
    {
      active: 0,
      inactive: 0,
      at_risk: 0,
      churned: 0,
      new: 0,
    } satisfies Record<CustomerStatus, number>
  )
}

function calculateNewCustomerTrend(records: CustomerRecord[]): number | null {
  const now = Date.now()
  const windowMs = 30 * 24 * 60 * 60 * 1000
  const recentStart = now - windowMs
  const previousStart = now - windowMs * 2

  let recentCount = 0
  let previousCount = 0

  for (const record of records) {
    const createdAtMs = new Date(record.createdAt).getTime()
    if (Number.isNaN(createdAtMs)) {
      continue
    }

    if (createdAtMs >= recentStart && createdAtMs <= now) {
      recentCount += 1
      continue
    }

    if (createdAtMs >= previousStart && createdAtMs < recentStart) {
      previousCount += 1
    }
  }

  if (previousCount === 0) {
    return null
  }

  return Math.round(((recentCount - previousCount) / previousCount) * 100)
}

export function CustomersOverview() {
  const {
    records,
    total,
    page,
    pageSize,
    hasNextPage,
    hasPrevPage,
    filters,
    availableFilters,
    updateFilters,
    resetFilters,
  } = useCustomers()

  const isLoading = false

  const summaryRecords = customerListService.listCustomers({
    ...filters,
    status: "all",
    page: 1,
    pageSize: 500,
  }).records
  const summaryStatusCounts = buildStatusCountMap(summaryRecords)
  const totalCustomers = summaryRecords.length
  const activeCustomers = summaryStatusCounts.active
  const activePercent =
    totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0
  const newCustomerTrend = calculateNewCustomerTrend(summaryRecords)

  const summaryCards: Array<{
    key: "total" | CustomerStatus
    title: string
    value: number
    insight: string
    icon: typeof Users
    accentClassName: string
    trendPct?: number | null
  }> = [
    {
      key: "total",
      title: "Total Customers",
      value: totalCustomers,
      insight: "All registered customers",
      icon: Users,
      accentClassName: "text-indigo-600",
    },
    {
      key: "active",
      title: "Active Customers",
      value: activeCustomers,
      insight:
        totalCustomers > 0 ? `${activePercent}% of customer base` : "No active customers yet",
      icon: Activity,
      accentClassName: "text-emerald-600",
    },
    {
      key: "at_risk",
      title: "At Risk",
      value: summaryStatusCounts.at_risk,
      insight: "Needs immediate attention",
      icon: AlertTriangle,
      accentClassName: "text-orange-600",
    },
    {
      key: "new",
      title: "New (30 Days)",
      value: summaryStatusCounts.new,
      insight: "Recently acquired customer",
      icon: Sparkles,
      accentClassName: "text-sky-600",
      trendPct: newCustomerTrend,
    },
  ]

  const handleSort = (column: CustomerFilterState["sortBy"]) => {
    if (filters.sortBy === column) {
      updateFilters({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" })
    } else {
      updateFilters({ sortBy: column, sortDir: "desc" })
    }
  }

  const statusOptions = availableFilters.statuses.map((s) => ({
    value: s,
    label: s === "all" ? "All Statuses" : (STATUS_STYLE[s as CustomerStatus]?.label ?? s),
  }))

  const segmentOptions = [
    { value: "", label: "All Segments" },
    ...availableFilters.segments.filter(Boolean).map((s) => ({ value: s, label: s })),
  ]

  const sourceOptions = [
    { value: "", label: "All Sources" },
    ...availableFilters.sources.filter(Boolean).map((s) => ({ value: s, label: s })),
  ]

  const channelOptions = [
    { value: "", label: "All Channels" },
    ...availableFilters.channels.filter(Boolean).map((s) => ({ value: s, label: s })),
  ]

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.segment !== "" ||
    filters.source !== "" ||
    filters.channel !== ""

  const totalPages = Math.ceil(total / pageSize)
  const pageStart = (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, total)

  return (
    <AppPage className="gap-8">
      <AppContainer>
        <AppSection className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-border/70 bg-card px-2.5 py-2 text-indigo-500">
              <Users className="size-4.5" />
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Customers</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Manage customer profiles, engagement, and lifecycle across all connected channels.
              </p>
            </div>
          </div>
        </AppSection>

        <AppSection className="space-y-7">
          <AppGrid variant={4}>
            {summaryCards.map((card) => {
              const Icon = card.icon
              const isSelected =
                card.key === "total" ? filters.status === "all" : filters.status === card.key

              return (
                <button
                  key={card.key}
                  type="button"
                  aria-label={`Filter customers by ${card.title}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (card.key === "total") {
                      resetFilters()
                      return
                    }

                    updateFilters({ status: card.key })
                  }}
                  className={cn(
                    "group relative flex h-full min-h-[150px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card px-4 py-4 text-left transition-colors",
                    "hover:border-blue-400/30 hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    isSelected && "border-blue-400/50 bg-background ring-1 ring-blue-400/25"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 top-0 h-px bg-border/70",
                      isSelected && "bg-blue-400/70"
                    )}
                  />

                  <div className="flex min-h-8 items-center justify-between gap-3">
                    <div
                      className={cn(
                        "inline-flex items-center justify-center rounded-md border border-border/70 bg-muted/30 p-1.5",
                        card.accentClassName
                      )}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    {card.trendPct !== undefined && card.trendPct !== null ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          card.trendPct >= 0
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-rose-500/10 text-rose-300"
                        )}
                      >
                        <TrendingUp className={cn("size-3", card.trendPct < 0 && "rotate-180")} />
                        {card.trendPct >= 0 ? `+${card.trendPct}%` : `${card.trendPct}%`}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="h-5 w-16" />
                    )}
                  </div>

                  <div className="mt-4 flex flex-1 flex-col justify-end space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {card.title}
                    </p>
                    <p
                      className={cn(
                        "text-4xl font-semibold leading-none tracking-tight",
                        card.accentClassName
                      )}
                    >
                      {card.value}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">{card.insight}</p>
                  </div>
                </button>
              )
            })}
          </AppGrid>
        </AppSection>

        <AppSection className="space-y-5">
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-1 flex-wrap items-end gap-3">
                <div className="grid min-w-0 flex-1 gap-1" style={{ minWidth: 240 }}>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <AppInput
                      aria-label="Search customers"
                      placeholder="Name, email, phone, or customer ID"
                      className="h-9 w-full rounded-xl border bg-background pl-9 pr-8 text-sm shadow-sm"
                      value={filters.search}
                      onChange={(e) => updateFilters({ search: e.target.value })}
                    />
                    {filters.search ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => updateFilters({ search: "" })}
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={statusOptions}
                  onChange={(v) => updateFilters({ status: v as CustomerFilterState["status"] })}
                />
                <FilterSelect
                  label="Segment"
                  value={filters.segment}
                  options={segmentOptions}
                  onChange={(v) => updateFilters({ segment: v })}
                />
                <FilterSelect
                  label="Source"
                  value={filters.source}
                  options={sourceOptions}
                  onChange={(v) => updateFilters({ source: v })}
                />
                <FilterSelect
                  label="Channel"
                  value={filters.channel}
                  options={channelOptions}
                  onChange={(v) => updateFilters({ channel: v })}
                />
              </div>

              {hasActiveFilters ? (
                <AppButton
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg"
                  onClick={resetFilters}
                >
                  Clear filters
                </AppButton>
              ) : null}
            </div>
          </div>
        </AppSection>

        <AppSection className="space-y-5">
          <AppCard>
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>
                    <SortHeader
                      label="Customer"
                      column="name"
                      currentSort={filters.sortBy}
                      currentDir={filters.sortDir}
                      onSort={handleSort}
                    />
                  </AppTableHead>
                  <AppTableHead className="hidden md:table-cell">Contact</AppTableHead>
                  <AppTableHead className="hidden sm:table-cell">Status</AppTableHead>
                  <AppTableHead className="hidden lg:table-cell">Segment</AppTableHead>
                  <AppTableHead className="hidden lg:table-cell">Source</AppTableHead>
                  <AppTableHead>
                    <SortHeader
                      label="LTV"
                      column="ltv"
                      currentSort={filters.sortBy}
                      currentDir={filters.sortDir}
                      onSort={handleSort}
                    />
                  </AppTableHead>
                  <AppTableHead>
                    <SortHeader
                      label="Orders"
                      column="orders"
                      currentSort={filters.sortBy}
                      currentDir={filters.sortDir}
                      onSort={handleSort}
                    />
                  </AppTableHead>
                  <AppTableHead className="hidden xl:table-cell">
                    <SortHeader
                      label="Last Activity"
                      column="lastActivity"
                      currentSort={filters.sortBy}
                      currentDir={filters.sortDir}
                      onSort={handleSort}
                    />
                  </AppTableHead>
                  <AppTableHead className="text-right">Action</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <CustomerRowSkeleton key={`skel-${i}`} />
                    ))
                  : records.map((record) => (
                      <CustomerRow key={record.customerId} record={record} />
                    ))}
                {!isLoading && records.length === 0 ? (
                  <AppTableRow>
                    <AppTableCell colSpan={9}>
                      <EmptyState message="No customers matched your filters" />
                    </AppTableCell>
                  </AppTableRow>
                ) : null}
              </AppTableBody>
            </AppTable>

            {total > 0 ? (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {pageStart}–{pageEnd} of {total} customers
                </p>
                <div className="flex items-center gap-2">
                  <AppButton
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={!hasPrevPage}
                    onClick={() => updateFilters({ page: page - 1 })}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </AppButton>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <AppButton
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    disabled={!hasNextPage}
                    onClick={() => updateFilters({ page: page + 1 })}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </AppButton>
                </div>
              </div>
            ) : null}
          </AppCard>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}

function CustomerRow({ record }: { record: CustomerRecord }) {
  return (
    <AppTableRow className="h-16 cursor-pointer transition-colors hover:bg-muted/30">
      <AppTableCell>
        <div className="flex items-center gap-2.5">
          <CustomerAvatar name={record.name} />
          <div className="min-w-0">
            <Link
              href={ROUTES.customersDetails(record.customerId)}
              className="block truncate text-sm font-medium text-foreground hover:text-indigo-600"
            >
              {record.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{record.customerId}</p>
          </div>
        </div>
      </AppTableCell>
      <AppTableCell className="hidden md:table-cell">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{record.email}</p>
          {record.phone ? (
            <p className="truncate text-xs text-muted-foreground">{record.phone}</p>
          ) : null}
        </div>
      </AppTableCell>
      <AppTableCell className="hidden sm:table-cell">
        <CustomerStatusBadge status={record.status} />
      </AppTableCell>
      <AppTableCell className="hidden lg:table-cell">
        <AppBadge className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
          {record.segment}
        </AppBadge>
      </AppTableCell>
      <AppTableCell className="hidden lg:table-cell">
        <p className="text-xs text-muted-foreground">{record.source}</p>
        <p className="text-xs text-muted-foreground/70">{record.acquisitionChannel}</p>
      </AppTableCell>
      <AppTableCell>
        <p className="text-sm font-medium">{formatCurrency(record.lifetimeValue)}</p>
      </AppTableCell>
      <AppTableCell>
        <div className="flex items-center gap-1">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-sm">{record.totalOrders}</span>
        </div>
      </AppTableCell>
      <AppTableCell className="hidden xl:table-cell">
        <p className="text-xs text-muted-foreground">{formatDate(record.lastActivityAt)}</p>
      </AppTableCell>
      <AppTableCell>
        <div className="flex justify-end">
          <Link href={ROUTES.customersDetails(record.customerId)}>
            <AppButton size="sm" variant="outline" className="h-8 text-xs">
              View 360
            </AppButton>
          </Link>
        </div>
      </AppTableCell>
    </AppTableRow>
  )
}
