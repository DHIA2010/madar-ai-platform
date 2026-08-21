"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
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
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  RelativeTime,
} from "@/components/app"

import { useCustomers } from "../hooks"
import type { CustomerPlatform, CustomerRecord, CustomerSegment, CustomerStatus } from "../types"

const STATUS_STYLE: Record<CustomerStatus, { label: string; className: string; dot: string }> = {
  new: { label: "New", className: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  at_risk: { label: "At Risk", className: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  churned: { label: "Churned", className: "bg-red-100 text-red-800", dot: "bg-red-500" },
  inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
}

const SEGMENT_STYLE: Record<CustomerSegment, string> = {
  VIP: "bg-violet-100 text-violet-800",
  Loyal: "bg-indigo-100 text-indigo-800",
  "One Time": "bg-muted text-muted-foreground",
  New: "bg-sky-100 text-sky-800",
}

type SortBy = "name" | "ltv" | "orders" | "lastPurchase" | "createdAt"

const PAGE_SIZE = 10

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat("en-SA", { style: "decimal", maximumFractionDigits: 0 }).format(value) +
    " SAR"
  )
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

  const colorIndex = (name.charCodeAt(0) || 0) % colors.length
  const colorClass = colors[colorIndex]

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        colorClass
      )}
    >
      {initials || "?"}
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
  column: SortBy
  currentSort: SortBy
  currentDir: "asc" | "desc"
  onSort: (column: SortBy) => void
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
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <AppSelect value={value} onValueChange={(v) => onChange(v as T)}>
        <AppSelectTrigger className="h-9 min-w-[140px] rounded-xl border bg-background text-sm shadow-sm">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="z-[90] min-w-[160px] rounded-xl border border-border/80 bg-popover p-1 shadow-xl"
        >
          {options.map((option) => (
            <AppSelectItem
              key={option.value}
              value={option.value}
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

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Users className="size-10 text-muted-foreground/40" />
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
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
    { new: 0, active: 0, at_risk: 0, churned: 0, inactive: 0 } satisfies Record<
      CustomerStatus,
      number
    >
  )
}

export function CustomersOverview() {
  const { records, isLoading, error } = useCustomers()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<CustomerStatus | "all">("all")
  const [segment, setSegment] = useState<CustomerSegment | "All Segments">("All Segments")
  const [platform, setPlatform] = useState<CustomerPlatform | "All Platforms">("All Platforms")
  const [sortBy, setSortBy] = useState<SortBy>("lastPurchase")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)

  const statusCounts = buildStatusCountMap(records)
  const totalCustomers = records.length
  const activePercent =
    totalCustomers > 0 ? Math.round((statusCounts.active / totalCustomers) * 100) : 0

  const summaryCards: Array<{
    key: "total" | CustomerStatus
    title: string
    value: number
    insight: string
    icon: typeof Users
    accentClassName: string
  }> = [
    {
      key: "total",
      title: "Total Customers",
      value: totalCustomers,
      insight: "Across all connected stores",
      icon: Users,
      accentClassName: "text-indigo-600",
    },
    {
      key: "active",
      title: "Active Customers",
      value: statusCounts.active,
      insight:
        totalCustomers > 0 ? `${activePercent}% of customer base` : "No active customers yet",
      icon: Activity,
      accentClassName: "text-emerald-600",
    },
    {
      key: "at_risk",
      title: "At Risk",
      value: statusCounts.at_risk,
      insight: "No purchase in 90-180 days",
      icon: AlertTriangle,
      accentClassName: "text-orange-600",
    },
    {
      key: "new",
      title: "New",
      value: statusCounts.new,
      insight: "Joined in the last 30 days",
      icon: Sparkles,
      accentClassName: "text-sky-600",
    },
  ]

  const filteredRecords = useMemo(() => {
    const needle = search.toLowerCase().trim()

    const filtered = records.filter((record) => {
      const matchesSearch =
        !needle ||
        `${record.name} ${record.email} ${record.phone ?? ""} ${record.id}`
          .toLowerCase()
          .includes(needle)
      const matchesStatus = status === "all" || record.status === status
      const matchesSegment = segment === "All Segments" || record.segment === segment
      const matchesPlatform = platform === "All Platforms" || record.platform === platform

      return matchesSearch && matchesStatus && matchesSegment && matchesPlatform
    })

    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return dir * a.name.localeCompare(b.name)
        case "ltv":
          return dir * (a.lifetimeValue - b.lifetimeValue)
        case "orders":
          return dir * (a.totalOrders - b.totalOrders)
        case "lastPurchase":
          return dir * (a.lastPurchaseAt ?? "").localeCompare(b.lastPurchaseAt ?? "")
        case "createdAt":
          return dir * a.createdAt.localeCompare(b.createdAt)
        default:
          return 0
      }
    })
  }, [platform, records, search, segment, sortBy, sortDir, status])

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(column)
      setSortDir("desc")
    }
  }

  const hasActiveFilters =
    search !== "" || status !== "all" || segment !== "All Segments" || platform !== "All Platforms"

  const resetFilters = () => {
    setSearch("")
    setStatus("all")
    setSegment("All Segments")
    setPlatform("All Platforms")
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedRecords = filteredRecords.slice(pageStart, pageStart + PAGE_SIZE)

  const statusOptions: Array<{ value: CustomerStatus | "all"; label: string }> = [
    { value: "all", label: "All Statuses" },
    ...(Object.keys(STATUS_STYLE) as CustomerStatus[]).map((s) => ({
      value: s,
      label: STATUS_STYLE[s].label,
    })),
  ]
  const segmentOptions: Array<{ value: CustomerSegment | "All Segments"; label: string }> = [
    { value: "All Segments", label: "All Segments" },
    { value: "VIP", label: "VIP" },
    { value: "Loyal", label: "Loyal" },
    { value: "One Time", label: "One Time" },
    { value: "New", label: "New" },
  ]
  const platformOptions: Array<{ value: CustomerPlatform | "All Platforms"; label: string }> = [
    { value: "All Platforms", label: "All Platforms" },
    { value: "Salla", label: "Salla" },
    { value: "Shopify", label: "Shopify" },
    { value: "Zid", label: "Zid" },
  ]

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
                Real customer records synced from your connected commerce stores.
              </p>
            </div>
          </div>
        </AppSection>

        <AppSection className="space-y-7">
          <AppGrid variant={4}>
            {summaryCards.map((card) => {
              const Icon = card.icon
              const isSelected = card.key === "total" ? status === "all" : status === card.key

              return (
                <button
                  key={card.key}
                  type="button"
                  aria-label={`Filter customers by ${card.title}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setPage(1)
                    if (card.key === "total") {
                      setStatus("all")
                      return
                    }
                    setStatus(card.key)
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
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                    />
                    {search ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setSearch("")}
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <FilterSelect
                  label="Status"
                  value={status}
                  options={statusOptions}
                  onChange={(v) => {
                    setStatus(v)
                    setPage(1)
                  }}
                />
                <FilterSelect
                  label="Segment"
                  value={segment}
                  options={segmentOptions}
                  onChange={(v) => {
                    setSegment(v)
                    setPage(1)
                  }}
                />
                <FilterSelect
                  label="Platform"
                  value={platform}
                  options={platformOptions}
                  onChange={(v) => {
                    setPlatform(v)
                    setPage(1)
                  }}
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
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading customers from your connected stores...
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center text-sm text-rose-700">{error}</div>
            ) : (
              <>
                <AppTable>
                  <AppTableHeader>
                    <AppTableRow>
                      <AppTableHead>
                        <SortHeader
                          label="Customer"
                          column="name"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </AppTableHead>
                      <AppTableHead className="hidden md:table-cell">Contact</AppTableHead>
                      <AppTableHead className="hidden sm:table-cell">Status</AppTableHead>
                      <AppTableHead className="hidden lg:table-cell">Segment</AppTableHead>
                      <AppTableHead className="hidden lg:table-cell">Platform</AppTableHead>
                      <AppTableHead>
                        <SortHeader
                          label="LTV"
                          column="ltv"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </AppTableHead>
                      <AppTableHead>
                        <SortHeader
                          label="Orders"
                          column="orders"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </AppTableHead>
                      <AppTableHead className="hidden xl:table-cell">
                        <SortHeader
                          label="Last Purchase"
                          column="lastPurchase"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </AppTableHead>
                      <AppTableHead className="text-right">Action</AppTableHead>
                    </AppTableRow>
                  </AppTableHeader>
                  <AppTableBody>
                    {paginatedRecords.map((record) => (
                      <CustomerRow key={record.id} record={record} />
                    ))}
                    {paginatedRecords.length === 0 ? (
                      <AppTableRow>
                        <AppTableCell colSpan={9}>
                          {records.length === 0 ? (
                            <EmptyState
                              message="No customers synced yet"
                              hint="Connect a commerce store and run a sync to see customers here."
                            />
                          ) : (
                            <EmptyState
                              message="No customers matched your filters"
                              hint="Try adjusting your search or filters"
                            />
                          )}
                        </AppTableCell>
                      </AppTableRow>
                    ) : null}
                  </AppTableBody>
                </AppTable>

                {filteredRecords.length > 0 ? (
                  <div className="flex items-center justify-between border-t px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRecords.length)} of{" "}
                      {filteredRecords.length} customers
                    </p>
                    <div className="flex items-center gap-2">
                      <AppButton
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        disabled={currentPage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-4" />
                      </AppButton>
                      <span className="text-xs text-muted-foreground">
                        {currentPage} / {totalPages}
                      </span>
                      <AppButton
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                        disabled={currentPage === totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-4" />
                      </AppButton>
                    </div>
                  </div>
                ) : null}
              </>
            )}
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
              href={ROUTES.customersDetails(record.id)}
              className="block truncate text-sm font-medium text-foreground hover:text-indigo-600"
            >
              {record.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{record.id}</p>
          </div>
        </div>
      </AppTableCell>
      <AppTableCell className="hidden md:table-cell">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{record.email || "—"}</p>
          {record.phone ? (
            <p className="truncate text-xs text-muted-foreground">{record.phone}</p>
          ) : null}
        </div>
      </AppTableCell>
      <AppTableCell className="hidden sm:table-cell">
        <CustomerStatusBadge status={record.status} />
      </AppTableCell>
      <AppTableCell className="hidden lg:table-cell">
        <AppBadge className={cn("rounded-full px-2 py-0.5 text-xs", SEGMENT_STYLE[record.segment])}>
          {record.segment}
        </AppBadge>
      </AppTableCell>
      <AppTableCell className="hidden lg:table-cell">
        <p className="text-xs text-muted-foreground">{record.platform}</p>
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
        <p className="text-xs text-muted-foreground">
          <RelativeTime value={record.lastPurchaseAt ?? undefined} fallback="—" />
        </p>
      </AppTableCell>
      <AppTableCell>
        <div className="flex justify-end">
          <Link href={ROUTES.customersDetails(record.id)}>
            <AppButton size="sm" variant="outline" className="h-8 text-xs">
              View 360
            </AppButton>
          </Link>
        </div>
      </AppTableCell>
    </AppTableRow>
  )
}
