"use client"

import { useEffect, useMemo, useState } from "react"
import { addMonths, format, getMonth, getYear, setMonth, setYear } from "date-fns"
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Globe,
  Plug,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  StoreIcon,
  TriangleAlert,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

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
const TABLE_ALIGN_CENTER = "text-center rtl:text-center"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Date Range"
  if (!range.to) return format(range.from, "MMM d, yyyy")
  return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`
}

function getConnectionStatusClasses(status: ConnectionStatus) {
  if (status === "Connected") return "border-emerald-400/30 bg-emerald-500/12 text-emerald-300"
  if (status === "Needs Reconnect") return "border-amber-400/30 bg-amber-500/12 text-amber-300"
  if (status === "Sync Error") return "border-rose-400/30 bg-rose-500/12 text-rose-300"
  return "border-slate-500/40 bg-slate-700/25 text-slate-300"
}

function getSyncHealthClasses(health: SyncHealth) {
  if (health === "Healthy") return "text-emerald-300"
  if (health === "Warning") return "text-amber-300"
  return "text-rose-300"
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
    "bg-sky-500/20 text-sky-300",
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-rose-500/20 text-rose-300",
    "bg-indigo-500/20 text-indigo-300",
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
          className="flex h-11 w-[190px] items-center justify-between rounded-md border border-slate-700 bg-slate-900/80 px-3 text-sm text-slate-100 ring-offset-background transition-colors hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="truncate text-left">{formatDateRangeLabel(value)}</span>
          <CalendarIcon className="size-4 shrink-0 text-slate-300" />
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(27rem,calc(100vw-2rem))] rounded-[24px] border border-sky-400/15 bg-slate-950/92 p-5 text-slate-100 shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <AppButton
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </AppButton>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <AppSelect
              value={String(monthIndex)}
              onValueChange={(next) =>
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }
            >
              <AppSelectTrigger className="h-11 w-[9.25rem] rounded-full border border-slate-700/70 bg-slate-900/75 px-4 text-sm font-semibold text-slate-50 shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </AppSelectTrigger>
              <AppSelectContent
                className="rounded-2xl border border-slate-700/70 bg-slate-950/95 p-1.5 text-slate-100 shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {monthOptions.map((monthLabel, index) => (
                  <AppSelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-slate-100 focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
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
              <AppSelectTrigger className="h-11 w-[7.5rem] rounded-full border border-slate-700/70 bg-slate-900/75 px-4 text-sm font-semibold text-slate-50 shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </AppSelectTrigger>
              <AppSelectContent
                className="max-h-72 rounded-2xl border border-slate-700/70 bg-slate-950/95 p-1.5 text-slate-100 shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {yearOptions.map((yearOption) => (
                  <AppSelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-slate-100 focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
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
            className="size-10 rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35"
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
          className="rounded-[18px] bg-transparent p-0 [--cell-size:40px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-4",
            nav: "hidden",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-slate-50",
            weekdays: "mb-4 grid grid-cols-7 gap-2.5",
            weekday:
              "h-8 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500",
            week: "mt-2.5 grid grid-cols-7 gap-2.5",
            day: "rounded-full text-slate-100",
            day_button:
              "size-10 rounded-full border border-transparent bg-transparent text-sm font-medium text-slate-100 transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today: "rounded-full border border-sky-400/60 bg-transparent text-slate-50 shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-slate-950",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-slate-50",
            range_start: "rounded-full border border-sky-300 bg-sky-400 text-slate-950",
            range_end: "rounded-full border border-sky-300 bg-sky-400 text-slate-950",
            outside: "text-slate-600 opacity-40",
            disabled: "text-slate-600 opacity-35",
          }}
        />

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <AppButton
            type="button"
            size="sm"
            variant="outline"
            className="h-10 rounded-xl border-slate-700 bg-slate-900/70 px-4 text-sm font-medium text-slate-300 transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
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
            className="h-10 rounded-xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
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
        <AppCard
          className="overflow-hidden border border-slate-800/80 bg-slate-950/55"
          contentClassName="pt-0"
        >
          <div className="space-y-1">
            <p className="text-sm text-slate-400">Connected Stores</p>
            <p className="text-2xl font-semibold text-slate-100">
              {formatNumber(kpiMetrics.connectedStores)}
            </p>
            <p className="text-xs text-slate-500">Across 3 commerce platforms</p>
          </div>
        </AppCard>

        <AppCard
          className="overflow-hidden border border-slate-800/80 bg-slate-950/55"
          contentClassName="pt-0"
        >
          <div className="space-y-1">
            <p className="text-sm text-slate-400">Connected Products</p>
            <p className="text-2xl font-semibold text-slate-100">
              {formatNumber(kpiMetrics.connectedProducts)}
            </p>
            <p className="text-xs text-slate-500">Across all connected stores</p>
          </div>
        </AppCard>

        <AppCard
          className="overflow-hidden border border-slate-800/80 bg-slate-950/55"
          contentClassName="pt-0"
        >
          <div className="space-y-1">
            <p className="text-sm text-slate-400">Orders Synced</p>
            <p className="text-2xl font-semibold text-slate-100">
              {formatNumber(kpiMetrics.ordersSynced)}
            </p>
            <p className="text-xs text-slate-500">Historical orders available</p>
          </div>
        </AppCard>

        <AppCard
          className="overflow-hidden border border-slate-800/80 bg-slate-950/55"
          contentClassName="pt-0"
        >
          <div className="space-y-1">
            <p className="text-sm text-slate-400">Sync Health</p>
            <p className="text-2xl font-semibold text-slate-100">
              {kpiMetrics.syncHealth.toFixed(1)}%
            </p>
            <p
              className={`text-xs font-medium ${getSyncHealthClasses(kpiMetrics.syncHealthState as SyncHealth)}`}
            >
              {kpiMetrics.syncHealthState}
            </p>
            <p className="text-xs text-slate-500">Overall integration health</p>
          </div>
        </AppCard>
      </section>

      <AppCard
        className="overflow-hidden border border-slate-800/90 bg-slate-950/35"
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
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <button
              type="button"
              className="text-slate-200 hover:text-slate-50"
              onClick={clearStoreContext}
            >
              Stores
            </button>
            {selectedStore ? <span className="text-slate-500">&gt;</span> : null}
            {selectedStore ? <span className="text-slate-200">{selectedStore.name}</span> : null}
          </div>

          {selectedStore ? (
            <AppButton variant="outline" onClick={clearStoreContext}>
              Exit Store Context
            </AppButton>
          ) : null}
        </div>

        {noStoresExist ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-10 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/60 text-slate-300">
              <Store className="size-7" />
            </div>
            <p className="text-base font-semibold text-slate-100">Connect your first store</p>
            <p className="mt-2 text-sm text-slate-400">
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
                <AppTableRow className="border-slate-800/80 hover:bg-transparent">
                  <AppTableHead className={`${TABLE_ALIGN_START} text-slate-400`}>
                    Store
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_START} text-slate-400`}>
                    Platform
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Country
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Currency
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Products
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Orders
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Customers
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Connection Status
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Data Coverage
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_CENTER} text-slate-400`}>
                    Last Sync
                  </AppTableHead>
                  <AppTableHead className={`${TABLE_ALIGN_START} text-slate-400`}>
                    Sync Health
                  </AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {paginatedRows.length === 0 ? (
                  <AppTableRow className="border-slate-800/70">
                    <AppTableCell colSpan={11} className="py-10 text-center">
                      <p className="text-base font-semibold text-slate-100">
                        No stores match the current filters
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        Try adjusting platform, country, status, date, or search.
                      </p>
                    </AppTableCell>
                  </AppTableRow>
                ) : (
                  paginatedRows.map((store) => (
                    <AppTableRow
                      key={store.id}
                      className="border-slate-800/70 transition-colors hover:bg-slate-900/45"
                    >
                      <AppTableCell className={TABLE_ALIGN_START}>
                        <button
                          type="button"
                          className={`group flex w-full items-center gap-3 rounded-md py-1 ${TABLE_ALIGN_START} transition-colors hover:bg-slate-900/60`}
                          onClick={() => openStoreDetails(store)}
                        >
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getLogoColor(store.logoText)}`}
                          >
                            {store.logoText}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-100">{store.name}</p>
                            <p className="text-xs text-slate-400">{store.url}</p>
                          </div>
                          <ChevronRightSmall className="size-4 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_START} text-slate-200`}>
                        <span className="inline-flex items-center gap-2">
                          <PlatformIcon platform={store.platform} />
                          {store.platform}
                        </span>
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-slate-200`}>
                        {store.country}
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-slate-200`}>
                        {store.currency}
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} tabular-nums text-slate-200`}>
                        {formatNumber(store.products)}
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} tabular-nums text-slate-200`}>
                        {formatNumber(store.orders)}
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} tabular-nums text-slate-200`}>
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
                          className="inline-flex flex-col items-center text-xs text-slate-200"
                          title={getDataCoverageTooltip(store.dataCoverageLevel)}
                        >
                          <span className="text-sm font-medium text-slate-100">
                            {store.dataCoveragePercent}%
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {store.dataCoverageLevel}
                          </span>
                        </span>
                      </AppTableCell>
                      <AppTableCell className={`${TABLE_ALIGN_CENTER} text-slate-200`}>
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
          <div className="flex flex-col gap-3 rounded-[20px] border border-slate-800/80 bg-slate-950/55 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {scopedStores.length === 0
                ? "Showing 0 of 0"
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, scopedStores.length)} of ${scopedStores.length}`}
            </div>

            <div className="flex items-center gap-2">
              <AppButton
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-700 bg-slate-900/80 text-slate-200 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </AppButton>
              <span className="min-w-24 text-center text-slate-300">
                Page {currentPage} of {totalPages}
              </span>
              <AppButton
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-700 bg-slate-900/80 text-slate-200 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
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
