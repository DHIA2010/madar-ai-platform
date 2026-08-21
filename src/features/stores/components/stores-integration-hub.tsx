"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  formatDistanceToNow,
  getMonth,
  getYear,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import {
  Activity,
  CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Globe,
  Loader2,
  type LucideIcon,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Store,
  StoreIcon,
  TriangleAlert,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { useStoreContextStore } from "@/store/store-context.store"

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
  type StoreConnectionStatus,
  storeListService,
  type StorePlatform,
  type StoreRecord,
  type StoreSyncHealth,
} from "../services"

const platformOptions = ["All Platforms", "Salla", "Shopify", "Zid"]
const connectionStatusOptions = [
  "All Statuses",
  "Connected",
  "Paused",
  "Disconnected",
  "Error",
  "Pending",
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

const PAGE_SIZE = 6
const STORE_TABLE_COLUMN_WIDTHS = ["24%", "10%", "9%", "9%", "9%", "13%", "13%", "13%"]
const TABLE_ALIGN_START = "text-start rtl:text-start"
const TABLE_ALIGN_CENTER = "!text-center rtl:!text-center"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function connectionStatusLabel(status: StoreConnectionStatus): string {
  if (status === "connected") return "Connected"
  if (status === "paused") return "Paused"
  if (status === "disconnected") return "Disconnected"
  if (status === "error") return "Error"
  return "Pending"
}

function syncHealthLabel(health: StoreSyncHealth): string {
  if (health === "healthy") return "Healthy"
  if (health === "stale") return "Stale"
  if (health === "failed") return "Failed"
  return "Never Synced"
}

interface StoreKpiCardData {
  label: string
  value: string
  footnote: string
  icon: LucideIcon
  tone: "blue" | "violet" | "green" | "orange"
}

const STORE_KPI_TONE_CLASSNAMES: Record<StoreKpiCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-600",
}

function StoreKpiCard({ kpi }: { kpi: StoreKpiCardData }) {
  const Icon = kpi.icon

  return (
    <AppCard className="overflow-hidden rounded-2xl border-border/60 bg-card p-4 shadow-sm">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          STORE_KPI_TONE_CLASSNAMES[kpi.tone]
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{kpi.value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{kpi.footnote}</p>
    </AppCard>
  )
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Date Range"
  if (!range.to) return format(range.from, "MMM d, yyyy")
  return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`
}

function getConnectionStatusClasses(status: StoreConnectionStatus) {
  if (status === "connected") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-border bg-muted text-muted-foreground"
}

function getSyncHealthClasses(health: StoreSyncHealth) {
  if (health === "healthy") return "text-emerald-600"
  if (health === "stale") return "text-amber-600"
  if (health === "failed") return "text-rose-600"
  return "text-muted-foreground"
}

function getSyncHealthTooltip(health: StoreSyncHealth, lastSyncError: string | null) {
  if (health === "healthy") return "Last successful synchronization completed recently."
  if (health === "stale") return "No successful synchronization in the last 7 days."
  if (health === "failed") return lastSyncError ?? "The most recent synchronization failed."
  return "This store has not synced yet."
}

function getLogoColor(logoText: string) {
  const palettes = [
    "bg-sky-50 text-sky-600",
    "bg-emerald-50 text-emerald-600",
    "bg-amber-50 text-amber-600",
    "bg-rose-50 text-rose-600",
    "bg-indigo-50 text-indigo-600",
  ]
  return palettes[logoText.charCodeAt(0) % palettes.length]
}

function PlatformIcon({ platform }: { platform: StorePlatform }) {
  if (platform === "Shopify") return <StoreIcon className="size-4" />
  if (platform === "Salla") return <Store className="size-4" />
  return <Globe className="size-4" />
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

export function StoresIntegrationHub() {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("All Platforms")
  const [connectionStatus, setConnectionStatus] = useState("All Statuses")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [selectedStoreIdOverride, setSelectedStoreIdOverride] = useState<string | null>(null)

  const activeStore = useStoreContextStore((state) => state.activeStore)
  const setActiveStore = useStoreContextStore((state) => state.setActiveStore)
  const clearActiveStore = useStoreContextStore((state) => state.clearActiveStore)
  const loadActiveStore = useStoreContextStore((state) => state.loadActiveStore)

  useEffect(() => {
    loadActiveStore()
  }, [loadActiveStore])

  useEffect(() => {
    let cancelled = false

    async function loadStores() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const items = await storeListService.listStores()
        if (!cancelled) {
          setStores(items)
        }
      } catch (error) {
        console.error("Failed to load stores", error)
        if (!cancelled) {
          setLoadError("Couldn't load your connected stores. Please try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadStores()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedStoreId = selectedStoreIdOverride ?? activeStore?.id ?? null

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      const matchesPlatform = platform === "All Platforms" || store.platform === platform
      const matchesStatus =
        connectionStatus === "All Statuses" ||
        connectionStatusLabel(store.connectionStatus) === connectionStatus
      const matchesSearch =
        !search.trim() ||
        `${store.name} ${store.url ?? ""} ${store.platform}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())

      const matchesDateRange =
        !dateRange?.from ||
        (() => {
          if (!store.lastSyncAt) return false
          const value = new Date(store.lastSyncAt)
          return (
            value >= startOfDay(dateRange.from!) &&
            value <= endOfDay(dateRange.to ?? dateRange.from!)
          )
        })()

      return matchesPlatform && matchesStatus && matchesSearch && matchesDateRange
    })
  }, [connectionStatus, dateRange, platform, search, stores])

  const scopedStores = useMemo(() => {
    if (!selectedStoreId) return filteredStores
    return filteredStores.filter((store) => store.id === selectedStoreId)
  }, [filteredStores, selectedStoreId])

  const selectedStore = useMemo(() => {
    if (!selectedStoreId) return null
    return stores.find((store) => store.id === selectedStoreId) ?? null
  }, [selectedStoreId, stores])

  const kpiMetrics = useMemo(() => {
    const connectedStores = scopedStores.filter(
      (store) => store.connectionStatus === "connected"
    ).length
    const connectedProducts = scopedStores
      .filter((store) => store.connectionStatus === "connected")
      .reduce((sum, store) => sum + store.productCount, 0)
    const ordersSynced = scopedStores.reduce((sum, store) => sum + store.orderCount, 0)
    const customersSynced = scopedStores.reduce((sum, store) => sum + store.customerCount, 0)

    return { connectedStores, connectedProducts, ordersSynced, customersSynced }
  }, [scopedStores])

  const totalPages = Math.max(1, Math.ceil(scopedStores.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = scopedStores.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const openStoreDetails = (store: StoreRecord) => {
    setSelectedStoreIdOverride(store.id)
    setActiveStore({
      id: store.id,
      name: store.name,
      platform: store.platform,
      url: store.url ?? "",
      currency: store.currency ?? "",
    })
    setPage(1)
  }

  const clearStoreContext = () => {
    setSelectedStoreIdOverride(null)
    clearActiveStore()
    setPage(1)
  }

  const noStoresExist = !isLoading && !loadError && stores.length === 0

  return (
    <div className="space-y-4">
      <AppPageHeader
        title="Stores"
        subtitle="Connect, monitor, and analyze your commerce data sources in one hub."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            {
              label: "Connected Stores",
              value: formatNumber(kpiMetrics.connectedStores),
              footnote: `Across ${platformOptions.length - 1} commerce platforms`,
              icon: Store,
              tone: "blue",
            },
            {
              label: "Connected Products",
              value: formatNumber(kpiMetrics.connectedProducts),
              footnote: "Across all connected stores",
              icon: Package,
              tone: "violet",
            },
            {
              label: "Orders Synced",
              value: formatNumber(kpiMetrics.ordersSynced),
              footnote: "Historical orders available",
              icon: ShoppingCart,
              tone: "green",
            },
            {
              label: "Customers Synced",
              value: formatNumber(kpiMetrics.customersSynced),
              footnote: "Across all connected stores",
              icon: Activity,
              tone: "orange",
            },
          ] satisfies StoreKpiCardData[]
        ).map((kpi) => (
          <StoreKpiCard key={kpi.label} kpi={kpi} />
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
              placeholder="Search store, URL or platform..."
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
                setPlatform(next)
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
              value={connectionStatus}
              onValueChange={(next) => {
                setConnectionStatus(next)
                setPage(1)
              }}
            >
              <AppSelectTrigger className="w-[190px]">
                <AppSelectValue placeholder="Connection Status" />
              </AppSelectTrigger>
              <AppSelectContent>
                {connectionStatusOptions.map((option) => (
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
            <button
              type="button"
              className="text-foreground/90 hover:text-foreground"
              onClick={clearStoreContext}
            >
              Stores
            </button>
            {selectedStore ? <span className="text-muted-foreground">&gt;</span> : null}
            {selectedStore ? (
              <span className="text-foreground/90">{selectedStore.name}</span>
            ) : null}
          </div>

          {selectedStore ? (
            <AppButton variant="outline" onClick={clearStoreContext}>
              Exit Store Context
            </AppButton>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your connected stores...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
            {loadError}
          </div>
        ) : noStoresExist ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/60 text-muted-foreground">
              <Store className="size-7" />
            </div>
            <p className="text-base font-semibold text-foreground">Connect your first store</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Bring your commerce platform data into MADAR to unlock intelligence.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <AppTable className="min-w-[1200px]">
              <colgroup>
                {STORE_TABLE_COLUMN_WIDTHS.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <AppTableHeader>
                <AppTableRow className="border-border hover:bg-transparent">
                  <AppTableHead className={`${TABLE_ALIGN_START} text-muted-foreground`}>
                    Store
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_START} text-muted-foreground`}>
                    Platform
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Products
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Orders
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Customers
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Connection Status
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Last Sync
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_START} text-muted-foreground`}>
                    Sync Health
                  </AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {paginatedRows.length === 0 ? (
                  <AppTableRow className="border-border">
                    <AppTableCell colSpan={8} className="py-10 text-center">
                      <p className="text-base font-semibold text-foreground">
                        No stores match the current filters
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Try adjusting platform, status, date, or search.
                      </p>
                    </AppTableCell>
                  </AppTableRow>
                ) : (
                  paginatedRows.map((store) => {
                    const logoText = store.platform.slice(0, 2).toUpperCase()
                    return (
                      <AppTableRow
                        key={store.id}
                        className="border-border transition-colors hover:bg-muted"
                      >
                        <AppTableCell className={TABLE_ALIGN_START}>
                          <button
                            type="button"
                            className={`group flex w-full items-center gap-3 rounded-md py-1 ${TABLE_ALIGN_START} transition-colors hover:bg-muted`}
                            onClick={() => openStoreDetails(store)}
                          >
                            <div
                              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getLogoColor(logoText)}`}
                            >
                              {logoText}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground">{store.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {store.url ?? store.currency ?? "—"}
                              </p>
                            </div>
                            <ChevronRightSmall className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        </AppTableCell>
                        <AppTableCell className={`${TABLE_ALIGN_START} text-foreground/90`}>
                          <span className="inline-flex items-center gap-2">
                            <PlatformIcon platform={store.platform} />
                            {store.platform}
                          </span>
                        </AppTableCell>
                        <AppTableCell
                          className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                        >
                          {formatNumber(store.productCount)}
                        </AppTableCell>
                        <AppTableCell
                          className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                        >
                          {formatNumber(store.orderCount)}
                        </AppTableCell>
                        <AppTableCell
                          className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                        >
                          {formatNumber(store.customerCount)}
                        </AppTableCell>
                        <AppTableCell className={TABLE_ALIGN_CENTER}>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getConnectionStatusClasses(store.connectionStatus)}`}
                          >
                            {connectionStatusLabel(store.connectionStatus)}
                          </span>
                        </AppTableCell>
                        <AppTableCell className={`${TABLE_ALIGN_CENTER} text-foreground/90`}>
                          {store.lastSyncAt
                            ? formatDistanceToNow(new Date(store.lastSyncAt), { addSuffix: true })
                            : "Never"}
                        </AppTableCell>
                        <AppTableCell className={TABLE_ALIGN_START}>
                          <span
                            className={`inline-flex items-center gap-1.5 text-sm font-medium ${getSyncHealthClasses(store.syncHealth)}`}
                            title={getSyncHealthTooltip(store.syncHealth, store.lastSyncError)}
                          >
                            {store.syncHealth === "healthy" ? (
                              <ShieldCheck className="size-4" />
                            ) : null}
                            {store.syncHealth === "stale" ? (
                              <TriangleAlert className="size-4" />
                            ) : null}
                            {store.syncHealth === "failed" ? (
                              <ShieldAlert className="size-4" />
                            ) : null}
                            {store.syncHealth === "never_synced" ? (
                              <CheckCircle2 className="size-4 opacity-50" />
                            ) : null}
                            {syncHealthLabel(store.syncHealth)}
                          </span>
                        </AppTableCell>
                      </AppTableRow>
                    )
                  })
                )}
              </AppTableBody>
            </AppTable>
          </div>
        )}

        {!isLoading && !loadError && !noStoresExist ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              {scopedStores.length === 0
                ? "Showing 0 of 0"
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, scopedStores.length)} of ${scopedStores.length}`}
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
        ) : null}
      </AppCard>
    </div>
  )
}
