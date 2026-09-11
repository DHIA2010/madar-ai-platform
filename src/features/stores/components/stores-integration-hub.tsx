"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import { ar } from "date-fns/locale"
import {
  CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Loader2,
  type LucideIcon,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  StoreIcon,
  TriangleAlert,
  Users,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { useStoreContextStore } from "@/store/store-context.store"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCalendar,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import {
  type StoreConnectionStatus,
  storeListService,
  type StorePlatform,
  type StoreRecord,
  type StoreSyncHealth,
} from "../services"

import { cairo } from "@/components/design/fonts"

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

// Colours and radii from the stores SVG export, matching the treatment the campaigns and
// integrations surfaces already use.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FILTER_TRIGGER_CLASS =
  "h-10 w-[150px] rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"

// The filter values are the tokens the filtering runs on, so only their display is localised.
const FILTER_LABEL_AR: Record<string, string> = {
  "All Platforms": "جميع المنصات",
  "All Statuses": "جميع الحالات",
  Salla: "Salla",
  Shopify: "Shopify",
  Zid: "Zid",
  Connected: "متصل",
  Pending: "قيد الانتظار",
  Paused: "متوقف",
  Disconnected: "غير متصل",
  Error: "خطأ",
}

const CONNECTION_PILL_AR: Record<
  StoreConnectionStatus,
  { label: string; className: string; dot: string }
> = {
  connected: { label: "متصل", className: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  pending: { label: "قيد الانتظار", className: "bg-[#eef2f8] text-[#5b6b85]", dot: "bg-[#95a4bd]" },
  paused: { label: "متوقف", className: "bg-[#fff7e6] text-[#e08b00]", dot: "bg-[#e08b00]" },
  disconnected: {
    label: "غير متصل",
    className: "bg-[#eef2f8] text-[#5b6b85]",
    dot: "bg-[#95a4bd]",
  },
  error: { label: "خطأ", className: "bg-[#fdeeee] text-[#e0484d]", dot: "bg-[#e0484d]" },
}

const SYNC_HEALTH_AR: Record<StoreSyncHealth, { label: string; className: string }> = {
  healthy: { label: "سليم", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  stale: { label: "يحتاج انتباه", className: "bg-[#fff7e6] text-[#e08b00]" },
  failed: { label: "فشل", className: "bg-[#fdeeee] text-[#e0484d]" },
  never_synced: { label: "لم تتم مزامنة", className: "bg-[#eef2f8] text-[#5b6b85]" },
}

const ARABIC_DATE = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

const ARABIC_DATE_TIME = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

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

interface StoreKpiCardData {
  label: string
  value: string
  footnote: string
  linkLabel: string
  href: string
  icon: LucideIcon
  tone: "blue" | "violet" | "green" | "orange"
}

const STORE_KPI_TONE_CLASSNAMES: Record<StoreKpiCardData["tone"], string> = {
  blue: "bg-[#eef4ff] text-[#2878ff]",
  violet: "bg-[#f3eeff] text-[#8b5cf6]",
  green: "bg-[#e9f8ef] text-[#1f9d55]",
  orange: "bg-[#fff3e3] text-[#e08b00]",
}

function StoreKpiCard({ kpi }: { kpi: StoreKpiCardData }) {
  const Icon = kpi.icon

  return (
    <div className={cn(PANEL, "p-4")}>
      {/* RTL: the label/value block is written first so it lands on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[12px] leading-[18px]", MUTED)}>{kpi.label}</p>
          <p className={cn("mt-1.5 text-[24px] font-extrabold leading-tight", HEADING)}>
            {kpi.value}
          </p>
          <p className={cn("mt-1.5 text-[11px]", MUTED)}>{kpi.footnote}</p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
            STORE_KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>

      {/* The export draws a small bar chart beside this link. Nothing on the stores service
          returns a series -- only the current totals -- so the card keeps the link and
          leaves the chart out rather than drawing bars from nothing. */}
      <div className="mt-3 flex items-center justify-end border-t border-[#f1f4f9] pt-2.5">
        <Link
          href={kpi.href}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2878ff] transition-colors hover:text-[#1f66e0]"
        >
          {kpi.linkLabel}
          <ChevronLeft className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "الفترة الزمنية"
  if (!range.to) return ARABIC_DATE.format(range.from)
  return `${ARABIC_DATE.format(range.from)} - ${ARABIC_DATE.format(range.to)}`
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
  const [pageSize, setPageSize] = useState(10)
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

  const totalPages = Math.max(1, Math.ceil(scopedStores.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = scopedStores.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // The footnote counts the platforms actually represented by connected stores, not the
  // length of the filter's option list -- that would claim platforms nobody has connected.
  const connectedPlatformCount = useMemo(
    () =>
      new Set(
        scopedStores
          .filter((store) => store.connectionStatus === "connected")
          .map((store) => store.platform)
      ).size,
    [scopedStores]
  )

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

  const kpiCards: StoreKpiCardData[] = [
    {
      label: "العملاء المتزامنين",
      value: formatNumber(kpiMetrics.customersSynced),
      footnote: "من جميع المتاجر",
      linkLabel: "عرض العملاء",
      href: ROUTES.customers,
      icon: Users,
      tone: "orange",
    },
    {
      label: "الطلبات المتزامنة",
      value: formatNumber(kpiMetrics.ordersSynced),
      footnote: "متاحة في النظام",
      linkLabel: "عرض الطلبات",
      href: ROUTES.orders,
      icon: ShoppingCart,
      tone: "green",
    },
    {
      label: "المنتجات المتزامنة",
      value: formatNumber(kpiMetrics.connectedProducts),
      footnote: "من جميع المتاجر",
      linkLabel: "عرض المنتجات",
      href: ROUTES.products,
      icon: Package,
      tone: "violet",
    },
    {
      label: "المتاجر المتصلة",
      value: formatNumber(kpiMetrics.connectedStores),
      footnote: `عبر ${connectedPlatformCount} ${connectedPlatformCount === 1 ? "منصة" : "منصات"} مختلفة`,
      linkLabel: "عرض المتاجر",
      href: ROUTES.integrations,
      icon: Store,
      tone: "blue",
    },
  ]

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, action left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>المتاجر</h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>
              اربط متاجرك، راقب أداءها، وحلل بيانات التجارة الإلكترونية من مكان واحد.
            </p>
          </div>

          <AppButton
            asChild
            className="h-11 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
          >
            <Link href={ROUTES.integrationsNew}>
              <span className="flex items-center justify-center gap-2">
                ربط متجر جديد
                <Plus className="size-4" />
              </span>
            </Link>
          </AppButton>
        </div>

        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((kpi) => (
            <StoreKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <div className={cn(PANEL, "space-y-4 p-4 md:p-5")}>
          {/* RTL: search first so it sits on the right, filters to its left. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full md:w-[300px] lg:w-[340px]">
              <AppSearchInput
                startIcon={<Search className="size-4 text-[#95a4bd]" />}
                placeholder="البحث في المتاجر، الرابط أو المنصة..."
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>

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
              <AppSelectTrigger className={FILTER_TRIGGER_CLASS}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {platformOptions.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {FILTER_LABEL_AR[option] ?? option}
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
              <AppSelectTrigger className={FILTER_TRIGGER_CLASS}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {connectionStatusOptions.map((option) => (
                  <AppSelectItem key={option} value={option}>
                    {FILTER_LABEL_AR[option] ?? option}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>

          {selectedStore ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f4f9] pt-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn("cursor-pointer text-[12px] font-semibold", MUTED)}
                  onClick={clearStoreContext}
                >
                  المتاجر
                </button>
                <ChevronLeft className="size-3.5 text-[#b6c2d4]" />
                <span className={cn("text-[12px] font-bold", HEADING)}>{selectedStore.name}</span>
              </div>

              <AppButton
                variant="outline"
                className="h-8 rounded-[8px] border-[#e1e7f0] bg-white px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                onClick={clearStoreContext}
              >
                إلغاء تحديد المتجر
              </AppButton>
            </div>
          ) : null}

          {isLoading ? (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-[12px] border border-[#eef2f8] py-16 text-[12.5px]",
                MUTED
              )}
            >
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل متاجرك المتصلة...
            </div>
          ) : loadError ? (
            <div className="rounded-[12px] border border-[#f7c9ca] bg-[#fdeeee] px-4 py-8 text-center text-[12.5px] text-[#e0484d]">
              {loadError}
            </div>
          ) : noStoresExist ? (
            <div className="rounded-[12px] border border-[#eef2f8] p-10 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-[14px] bg-[#eef4ff] text-[#2878ff]">
                <Store className="size-7" />
              </span>
              <p className={cn("text-[14px] font-extrabold", HEADING)}>اربط متجرك الأول</p>
              <p className={cn("mt-2 text-[12.5px]", MUTED)}>
                اربط منصة التجارة الإلكترونية الخاصة بك لتبدأ بتحليل بياناتك في مدار.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "store", label: "المتجر", align: "text-right" },
                      { key: "platform", label: "المنصة", align: "text-center" },
                      { key: "connection", label: "حالة الاتصال", align: "text-center" },
                      { key: "customers", label: "العملاء", align: "text-center" },
                      { key: "orders", label: "الطلبات", align: "text-center" },
                      { key: "products", label: "المنتجات", align: "text-center" },
                      { key: "lastSync", label: "آخر مزامنة", align: "text-center" },
                      { key: "health", label: "حالة المزامنة", align: "text-center" },
                      { key: "actions", label: "إجراء", align: "text-center" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] px-3 py-3 text-[11px] font-semibold",
                          MUTED,
                          column.align
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
                        <p className={cn("text-[13.5px] font-bold", HEADING)}>
                          لا توجد متاجر مطابقة للفلاتر الحالية
                        </p>
                        <p className={cn("mt-2 text-[12px]", MUTED)}>
                          جرّب تغيير المنصة أو الحالة أو الفترة الزمنية أو نص البحث.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((store) => {
                      const logoText = store.platform.slice(0, 2).toUpperCase()
                      const connection = CONNECTION_PILL_AR[store.connectionStatus]
                      const health = SYNC_HEALTH_AR[store.syncHealth]

                      return (
                        <tr
                          key={store.id}
                          className="border-b border-[#f4f7fb] transition-colors hover:bg-[#f8fafd]"
                        >
                          <td className="px-3 py-3.5 text-right">
                            {/* RTL: the avatar is written first so it lands to the right. */}
                            <button
                              type="button"
                              className="flex w-full cursor-pointer items-center justify-start gap-2.5 text-right"
                              onClick={() => openStoreDetails(store)}
                            >
                              <span
                                className={cn(
                                  "flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                                  getLogoColor(logoText)
                                )}
                              >
                                {logoText}
                              </span>
                              <span className="min-w-0">
                                <span
                                  className={cn("block truncate text-[12.5px] font-bold", HEADING)}
                                >
                                  {store.name}
                                </span>
                                <span className={cn("block truncate text-[11px]", MUTED)}>
                                  {store.url ?? store.currency ?? "—"}
                                </span>
                              </span>
                            </button>
                          </td>

                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-2 text-[12px] font-semibold",
                                HEADING
                              )}
                            >
                              <PlatformIcon platform={store.platform} />
                              {store.platform}
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                                connection.className
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", connection.dot)} />
                              {connection.label}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-[12.5px] tabular-nums text-[#334155]">
                            {formatNumber(store.customerCount)}
                          </td>
                          <td className="px-3 py-3.5 text-[12.5px] tabular-nums text-[#334155]">
                            {formatNumber(store.orderCount)}
                          </td>
                          <td className="px-3 py-3.5 text-[12.5px] tabular-nums text-[#334155]">
                            {formatNumber(store.productCount)}
                          </td>

                          <td className="px-3 py-3.5">
                            {store.lastSyncAt ? (
                              <>
                                <p className={cn("text-[12px] font-semibold", HEADING)}>
                                  {formatDistanceToNow(new Date(store.lastSyncAt), {
                                    addSuffix: true,
                                    locale: ar,
                                  })}
                                </p>
                                <p className={cn("mt-0.5 text-[10.5px]", MUTED)}>
                                  {ARABIC_DATE_TIME.format(new Date(store.lastSyncAt))}
                                </p>
                              </>
                            ) : (
                              <span className={cn("text-[12px]", MUTED)}>لم تتم مزامنة</span>
                            )}
                          </td>

                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                                health.className
                              )}
                              title={getSyncHealthTooltip(store.syncHealth, store.lastSyncError)}
                            >
                              {store.syncHealth === "healthy" ? (
                                <ShieldCheck className="size-3" />
                              ) : store.syncHealth === "stale" ? (
                                <TriangleAlert className="size-3" />
                              ) : store.syncHealth === "failed" ? (
                                <ShieldAlert className="size-3" />
                              ) : (
                                <CheckCircle2 className="size-3 opacity-60" />
                              )}
                              {health.label}
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <button
                              type="button"
                              aria-label={`عرض تفاصيل ${store.name}`}
                              className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738]"
                              onClick={() => openStoreDetails(store)}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !loadError && !noStoresExist ? (
            <div className="flex flex-col gap-3 border-t border-[#f1f4f9] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
              {/* RTL: count and page size on the right, pager on the left. */}
              <div className="flex items-center gap-3">
                <span className={cn("text-[12px]", MUTED)}>
                  {scopedStores.length === 0
                    ? "لا توجد نتائج"
                    : `عرض ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, scopedStores.length)} من ${scopedStores.length}`}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>عدد النتائج في الصفحة</span>
                  <AppSelect
                    value={String(pageSize)}
                    onValueChange={(next) => {
                      setPageSize(Number(next))
                      setPage(1)
                    }}
                  >
                    <AppSelectTrigger className="h-9 w-[74px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {[10, 25, 50].map((option) => (
                        <AppSelectItem key={option} value={String(option)}>
                          {option}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label="الصفحة الأولى"
                  onClick={() => setPage(1)}
                >
                  <ChevronsRight className="size-4" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label="الصفحة السابقة"
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  <ChevronRight className="size-4" />
                </button>
                <span className="flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-[#2878ff] bg-white px-2 text-[12px] font-bold text-[#2878ff]">
                  {currentPage}
                </span>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label="الصفحة التالية"
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label="الصفحة الأخيرة"
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsLeft className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* RTL: the feature blurbs are written first so they sit on the right. */}
        <div className={cn(PANEL, "grid gap-4 p-4 md:p-5 lg:grid-cols-[minmax(0,1fr)_340px]")}>
          <div className="grid gap-3.5 sm:grid-cols-3">
            {[
              {
                title: "تحليلات موحدة",
                body: "رؤية شاملة لأداء جميع متاجرك",
                icon: Sparkles,
              },
              {
                title: "مزامنة تلقائية",
                body: "تحديث بياناتك بشكل دوري",
                icon: RefreshCcw,
              },
              {
                title: "دعم جميع المنصات",
                body: "Zid, Salla, Shopify وأكثر",
                icon: ShoppingBag,
              },
            ].map((feature) => (
              <div key={feature.title} className="p-2 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
                  <feature.icon className="size-5" />
                </span>
                <p className={cn("mt-3 text-[13px] font-extrabold", HEADING)}>{feature.title}</p>
                <p className={cn("mt-1.5 text-[11.5px] leading-[19px]", MUTED)}>{feature.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[12px] border border-[#dbe6f8] bg-gradient-to-l from-[#eef4ff] to-[#fbfcff] p-5 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-[#2878ff] shadow-[0_4px_12px_rgba(11,23,56,0.08)]">
              <Store className="size-6" />
            </span>
            <h3 className={cn("mt-3.5 text-[14px] font-extrabold", HEADING)}>
              اربط المزيد من المتاجر
            </h3>
            <p className={cn("mt-2 text-[11.5px] leading-[19px]", MUTED)}>
              وسّع نطاق عملك بربط متاجر إضافية وحلل جميع بياناتك في مكان واحد.
            </p>
            <AppButton
              asChild
              variant="outline"
              className="mt-4 h-10 w-full rounded-[10px] border-[#2878ff] bg-white text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            >
              <Link href={ROUTES.integrationsNew}>
                <span className="flex items-center justify-center gap-2">
                  ربط متجر جديد
                  <Plus className="size-4" />
                </span>
              </Link>
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  )
}
