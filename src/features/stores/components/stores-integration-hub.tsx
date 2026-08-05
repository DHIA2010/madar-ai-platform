"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
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
  Activity,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Globe,
  type LucideIcon,
  Package,
  Plug,
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

type StorePlatform = "Shopify" | "Salla" | "Zid" | "WooCommerce" | "Magento" | "Custom API"
type ConnectionStatus = "Connected" | "Disconnected" | "Needs Reconnect" | "Sync Error"
type SyncHealth = "Healthy" | "Warning" | "Critical"

type StoreRow = {
  id: string
  name: string
  logoText: string
  url: string
  platform: StorePlatform
  country: string
  currency: string
  products: number
  orders: number
  customers: number
  connectionStatus: ConnectionStatus
  lastSyncLabel: string
  lastSyncAt: string
  syncHealth: SyncHealth
  syncHealthScore: number
  dataCoveragePercent: number
  dataCoverageLevel: "Complete" | "Partial" | "Limited"
}

const storesData: StoreRow[] = [
  {
    id: "st-001",
    name: "Fashion Store",
    logoText: "FS",
    url: "fashionstore.sa",
    platform: "Shopify",
    country: "Saudi Arabia",
    currency: "SAR",
    products: 3840,
    orders: 178200,
    customers: 96400,
    connectionStatus: "Connected",
    lastSyncLabel: "2 minutes ago",
    lastSyncAt: "2026-06-20T12:58:00.000Z",
    syncHealth: "Healthy",
    syncHealthScore: 99.2,
    dataCoveragePercent: 98.6,
    dataCoverageLevel: "Complete",
  },
  {
    id: "st-002",
    name: "Beauty Market",
    logoText: "BM",
    url: "beautymarket.sa",
    platform: "Salla",
    country: "Saudi Arabia",
    currency: "SAR",
    products: 2250,
    orders: 121400,
    customers: 70300,
    connectionStatus: "Connected",
    lastSyncLabel: "15 minutes ago",
    lastSyncAt: "2026-06-20T12:45:00.000Z",
    syncHealth: "Healthy",
    syncHealthScore: 98.4,
    dataCoveragePercent: 96.1,
    dataCoverageLevel: "Complete",
  },
  {
    id: "st-003",
    name: "Home Essentials",
    logoText: "HE",
    url: "homeessentials.ae",
    platform: "Zid",
    country: "UAE",
    currency: "AED",
    products: 1980,
    orders: 84200,
    customers: 52900,
    connectionStatus: "Needs Reconnect",
    lastSyncLabel: "Yesterday",
    lastSyncAt: "2026-06-19T09:00:00.000Z",
    syncHealth: "Warning",
    syncHealthScore: 84.1,
    dataCoveragePercent: 81,
    dataCoverageLevel: "Partial",
  },
  {
    id: "st-004",
    name: "Gadget Hub",
    logoText: "GH",
    url: "gadgethub.com",
    platform: "WooCommerce",
    country: "USA",
    currency: "USD",
    products: 4610,
    orders: 243500,
    customers: 128700,
    connectionStatus: "Connected",
    lastSyncLabel: "5 minutes ago",
    lastSyncAt: "2026-06-20T12:55:00.000Z",
    syncHealth: "Healthy",
    syncHealthScore: 99.5,
    dataCoveragePercent: 97.4,
    dataCoverageLevel: "Complete",
  },
  {
    id: "st-005",
    name: "Sportify KSA",
    logoText: "SK",
    url: "sportifyksa.sa",
    platform: "Magento",
    country: "Saudi Arabia",
    currency: "SAR",
    products: 2870,
    orders: 146300,
    customers: 82100,
    connectionStatus: "Sync Error",
    lastSyncLabel: "2 days ago",
    lastSyncAt: "2026-06-18T10:10:00.000Z",
    syncHealth: "Critical",
    syncHealthScore: 61.3,
    dataCoveragePercent: 56,
    dataCoverageLevel: "Limited",
  },
  {
    id: "st-006",
    name: "D2C Nutrition",
    logoText: "DN",
    url: "d2cnutrition.sa",
    platform: "Custom API",
    country: "Saudi Arabia",
    currency: "SAR",
    products: 2870,
    orders: 68500,
    customers: 41300,
    connectionStatus: "Disconnected",
    lastSyncLabel: "2 days ago",
    lastSyncAt: "2026-06-18T12:10:00.000Z",
    syncHealth: "Critical",
    syncHealthScore: 48.2,
    dataCoveragePercent: 62.4,
    dataCoverageLevel: "Limited",
  },
]

const platformOptions = [
  "All Platforms",
  "Shopify",
  "Salla",
  "Zid",
  "WooCommerce",
  "Magento",
  "Custom API",
]
const countryOptions = ["All Countries", "Saudi Arabia", "UAE", "USA"]
const connectionStatusOptions = [
  "All Statuses",
  "Connected",
  "Disconnected",
  "Needs Reconnect",
  "Sync Error",
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
const STORE_TABLE_COLUMN_WIDTHS = [
  "22%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
  "7.8%",
]
const TABLE_ALIGN_START = "text-start rtl:text-start"
const TABLE_ALIGN_CENTER = "!text-center rtl:!text-center"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

interface StoreKpiCardData {
  label: string
  value: string
  footnote: ReactNode
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
      <div className="mt-2 text-xs text-muted-foreground">{kpi.footnote}</div>
    </AppCard>
  )
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Date Range"
  if (!range.to) return format(range.from, "MMM d, yyyy")
  return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`
}

function getConnectionStatusClasses(status: ConnectionStatus) {
  if (status === "Connected") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "Needs Reconnect") return "border-amber-200 bg-amber-50 text-amber-700"
  if (status === "Sync Error") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-border bg-muted text-muted-foreground"
}

function getSyncHealthClasses(health: SyncHealth) {
  if (health === "Healthy") return "text-emerald-600"
  if (health === "Warning") return "text-amber-600"
  return "text-rose-600"
}

function getSyncHealthTooltip(health: SyncHealth) {
  if (health === "Healthy") return "Last successful synchronization completed 2 minutes ago."
  if (health === "Warning") return "Synchronization delayed. Some recent data may be missing."
  return "Synchronization failed. Immediate attention required."
}

function getConnectionStatusTooltip(status: ConnectionStatus) {
  if (status === "Connected") return "Store is connected and actively sending data."
  if (status === "Needs Reconnect") return "Authentication expired. Reconnect required."
  if (status === "Disconnected")
    return "Store is currently disconnected. No new data is being received."
  return "Synchronization failed because of an API or permission issue."
}

function getDataCoverageTooltip(level: StoreRow["dataCoverageLevel"]) {
  if (level === "Complete") return "Historical data is fully synchronized."
  if (level === "Partial") return "Some historical records are still synchronizing."
  return "Only partial historical data is available."
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
  if (platform === "Zid") return <Globe className="size-4" />
  if (platform === "WooCommerce") return <Store className="size-4" />
  if (platform === "Magento") return <StoreIcon className="size-4" />
  return <Plug className="size-4" />
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
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("All Platforms")
  const [country, setCountry] = useState("All Countries")
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

  const selectedStoreId = selectedStoreIdOverride ?? activeStore?.id ?? null

  const filteredStores = useMemo(() => {
    return storesData.filter((store) => {
      const matchesPlatform = platform === "All Platforms" || store.platform === platform
      const matchesCountry = country === "All Countries" || store.country === country
      const matchesStatus =
        connectionStatus === "All Statuses" || store.connectionStatus === connectionStatus
      const matchesSearch =
        !search.trim() ||
        `${store.name} ${store.url} ${store.platform}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())

      const matchesDateRange =
        !dateRange?.from ||
        (() => {
          const value = new Date(store.lastSyncAt)
          const from = dateRange.from
          const to = dateRange.to ?? dateRange.from
          return value >= from && value <= to
        })()

      return matchesPlatform && matchesCountry && matchesStatus && matchesSearch && matchesDateRange
    })
  }, [connectionStatus, country, dateRange, platform, search])

  const scopedStores = useMemo(() => {
    if (!selectedStoreId) return filteredStores
    return filteredStores.filter((store) => store.id === selectedStoreId)
  }, [filteredStores, selectedStoreId])

  const selectedStore = useMemo(() => {
    if (!selectedStoreId) return null
    return storesData.find((store) => store.id === selectedStoreId) ?? null
  }, [selectedStoreId])

  const kpiMetrics = useMemo(() => {
    const connectedStores = scopedStores.filter(
      (store) => store.connectionStatus === "Connected"
    ).length
    const connectedProducts = scopedStores
      .filter((store) => store.connectionStatus === "Connected")
      .reduce((sum, store) => sum + store.products, 0)
    const ordersSynced = scopedStores.reduce((sum, store) => sum + store.orders, 0)
    const avgSyncHealth = scopedStores.length
      ? scopedStores.reduce((sum, store) => sum + store.syncHealthScore, 0) / scopedStores.length
      : 0

    return {
      connectedStores,
      connectedProducts,
      ordersSynced,
      syncHealth: avgSyncHealth,
      syncHealthState:
        avgSyncHealth >= 95 ? "Healthy" : avgSyncHealth >= 80 ? "Warning" : "Critical",
    }
  }, [scopedStores])

  const totalPages = Math.max(1, Math.ceil(scopedStores.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = scopedStores.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const openStoreDetails = (store: StoreRow) => {
    setSelectedStoreIdOverride(store.id)
    setActiveStore({
      id: store.id,
      name: store.name,
      platform: store.platform,
      url: store.url,
      country: store.country,
      currency: store.currency,
    })
    setPage(1)
  }

  const clearStoreContext = () => {
    setSelectedStoreIdOverride(null)
    clearActiveStore()
    setPage(1)
  }

  const noStoresExist = storesData.length === 0

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
              footnote: "Across 3 commerce platforms",
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
              label: "Sync Health",
              value: `${kpiMetrics.syncHealth.toFixed(1)}%`,
              footnote: (
                <span
                  className={cn(
                    "font-medium",
                    getSyncHealthClasses(kpiMetrics.syncHealthState as SyncHealth)
                  )}
                >
                  {kpiMetrics.syncHealthState}
                </span>
              ),
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
              value={country}
              onValueChange={(next) => {
                setCountry(next)
                setPage(1)
              }}
            >
              <AppSelectTrigger className="w-[170px]">
                <AppSelectValue placeholder="Country" />
              </AppSelectTrigger>
              <AppSelectContent>
                {countryOptions.map((option) => (
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

        {noStoresExist ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/60 text-muted-foreground">
              <Store className="size-7" />
            </div>
            <p className="text-base font-semibold text-foreground">Connect your first store</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Bring your commerce platform data into MADAR to unlock intelligence.
            </p>
            <div className="mt-5">
              <AppButton>Connect Store</AppButton>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <AppTable className="min-w-[1400px]">
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
                    Country
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-muted-foreground`}>
                    Currency
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
                    Data Coverage
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
                    <AppTableCell colSpan={11} className="py-10 text-center">
                      <p className="text-base font-semibold text-foreground">
                        No stores match the current filters
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Try adjusting platform, country, status, date, or search.
                      </p>
                    </AppTableCell>
                  </AppTableRow>
                ) : (
                  paginatedRows.map((store) => (
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
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getLogoColor(store.logoText)}`}
                          >
                            {store.logoText}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{store.name}</p>
                            <p className="text-xs text-muted-foreground">{store.url}</p>
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
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-foreground/90`}>
                        {store.country}
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-foreground/90`}>
                        {store.currency}
                      </AppTableCell>
                      <AppTableCell
                        className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                      >
                        {formatNumber(store.products)}
                      </AppTableCell>
                      <AppTableCell
                        className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                      >
                        {formatNumber(store.orders)}
                      </AppTableCell>
                      <AppTableCell
                        className={`${TABLE_ALIGN_CENTER} tabular-nums text-foreground/90`}
                      >
                        {formatNumber(store.customers)}
                      </AppTableCell>
                      <AppTableCell className={TABLE_ALIGN_CENTER}>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getConnectionStatusClasses(store.connectionStatus)}`}
                          title={getConnectionStatusTooltip(store.connectionStatus)}
                        >
                          {store.connectionStatus}
                        </span>
                      </AppTableCell>
                      <AppTableCell className={TABLE_ALIGN_CENTER}>
                        <span
                          className="inline-flex flex-col items-center text-xs text-foreground/90"
                          title={getDataCoverageTooltip(store.dataCoverageLevel)}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {store.dataCoveragePercent}%
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {store.dataCoverageLevel}
                          </span>
                        </span>
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-foreground/90`}>
                        {store.lastSyncLabel}
                      </AppTableCell>
                      <AppTableCell className={TABLE_ALIGN_START}>
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm font-medium ${getSyncHealthClasses(store.syncHealth)}`}
                          title={getSyncHealthTooltip(store.syncHealth)}
                        >
                          {store.syncHealth === "Healthy" ? (
                            <ShieldCheck className="size-4" />
                          ) : null}
                          {store.syncHealth === "Warning" ? (
                            <TriangleAlert className="size-4" />
                          ) : null}
                          {store.syncHealth === "Critical" ? (
                            <ShieldAlert className="size-4" />
                          ) : null}
                          {store.syncHealth}
                        </span>
                      </AppTableCell>
                    </AppTableRow>
                  ))
                )}
              </AppTableBody>
            </AppTable>
          </div>
        )}

        {!noStoresExist ? (
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
