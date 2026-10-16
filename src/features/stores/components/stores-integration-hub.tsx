"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { endOfDay, formatDistanceToNow, startOfDay } from "date-fns"
import { ar, enUS } from "date-fns/locale"
import {
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
  AppDateRangeFilter,
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
import { type Locale, localeDirection } from "@/i18n/locales"

const platformOptions = ["All Platforms", "Salla", "Shopify", "Zid"]
const connectionStatusOptions = [
  "All Statuses",
  "Connected",
  "Paused",
  "Disconnected",
  "Error",
  "Pending",
]
// Colours and radii from the stores SVG export, matching the treatment the campaigns and
// integrations surfaces already use.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FILTER_TRIGGER_CLASS =
  "h-10 w-[150px] rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"

type StoresTranslator = ReturnType<typeof useTranslations<"stores">>

// Data-only: colours/dots live here, the actual label text comes from the `stores` namespace
// via connectionStatusLabel()/syncHealthLabel() below -- same module-level data+function split
// used by administration/components/permission-matrix.tsx and the taxes settings screen.
const CONNECTION_STATUS_META: Record<StoreConnectionStatus, { className: string; dot: string }> = {
  connected: { className: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  pending: { className: "bg-[#eef2f8] text-[#5b6b85]", dot: "bg-[#95a4bd]" },
  paused: { className: "bg-[#fff7e6] text-[#e08b00]", dot: "bg-[#e08b00]" },
  disconnected: { className: "bg-[#eef2f8] text-[#5b6b85]", dot: "bg-[#95a4bd]" },
  error: { className: "bg-[#fdeeee] text-[#e0484d]", dot: "bg-[#e0484d]" },
}

const SYNC_HEALTH_META: Record<StoreSyncHealth, { className: string }> = {
  healthy: { className: "bg-[#e9f8ef] text-[#1f9d55]" },
  stale: { className: "bg-[#fff7e6] text-[#e08b00]" },
  failed: { className: "bg-[#fdeeee] text-[#e0484d]" },
  never_synced: { className: "bg-[#eef2f8] text-[#5b6b85]" },
}

function connectionStatusLabel(status: StoreConnectionStatus, t: StoresTranslator): string {
  return t(`connectionStatus.${status}.label` as "connectionStatus.connected.label")
}

function syncHealthLabel(health: StoreSyncHealth, t: StoresTranslator): string {
  const key = health === "never_synced" ? "neverSynced" : health
  return t(`syncHealth.${key}.label` as "syncHealth.healthy.label")
}

function absoluteDateTimeFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

// The filter values themselves are the English tokens the filtering logic runs on -- only their
// displayed label is localised, and platform brand names (Salla/Shopify/Zid) are real stored
// enum values that stay as-is in every locale.
function connectionStatusFilterToken(status: StoreConnectionStatus): string {
  if (status === "connected") return "Connected"
  if (status === "paused") return "Paused"
  if (status === "disconnected") return "Disconnected"
  if (status === "error") return "Error"
  return "Pending"
}

function platformFilterLabel(option: string, t: StoresTranslator): string {
  if (option === "All Platforms") return t("filters.allPlatforms")
  return option
}

function statusFilterLabel(option: string, t: StoresTranslator): string {
  if (option === "All Statuses") return t("filters.allStatuses")
  return connectionStatusLabel(option.toLowerCase() as StoreConnectionStatus, t)
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
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}

function getSyncHealthTooltip(
  health: StoreSyncHealth,
  lastSyncError: string | null,
  t: StoresTranslator
) {
  if (health === "healthy") return t("syncHealth.healthy.tooltip")
  if (health === "stale") return t("syncHealth.stale.tooltip")
  // lastSyncError is the real error message synced from the integration, not a UI string --
  // it's shown verbatim when present rather than translated.
  if (health === "failed") return lastSyncError ?? t("syncHealth.failed.tooltip")
  return t("syncHealth.neverSynced.tooltip")
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

export function StoresIntegrationHub() {
  const t = useTranslations("stores")
  const locale = useLocale() as Locale
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
          setLoadError(t("hub.loadError"))
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
    // Only runs once on mount -- re-running on every locale toggle would refetch the whole
    // store list just from switching the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedStoreId = selectedStoreIdOverride ?? activeStore?.id ?? null

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      const matchesPlatform = platform === "All Platforms" || store.platform === platform
      const matchesStatus =
        connectionStatus === "All Statuses" ||
        connectionStatusFilterToken(store.connectionStatus) === connectionStatus
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

  const connectedPlatformWord = t(
    connectedPlatformCount === 1
      ? "kpis.connectedStores.platformSingular"
      : "kpis.connectedStores.platformPlural"
  )

  const kpiCards: StoreKpiCardData[] = [
    {
      label: t("kpis.customersSynced.label"),
      value: formatNumber(kpiMetrics.customersSynced),
      footnote: t("kpis.customersSynced.footnote"),
      linkLabel: t("kpis.customersSynced.link"),
      href: ROUTES.customers,
      icon: Users,
      tone: "orange",
    },
    {
      label: t("kpis.ordersSynced.label"),
      value: formatNumber(kpiMetrics.ordersSynced),
      footnote: t("kpis.ordersSynced.footnote"),
      linkLabel: t("kpis.ordersSynced.link"),
      href: ROUTES.orders,
      icon: ShoppingCart,
      tone: "green",
    },
    {
      label: t("kpis.productsSynced.label"),
      value: formatNumber(kpiMetrics.connectedProducts),
      footnote: t("kpis.productsSynced.footnote"),
      linkLabel: t("kpis.productsSynced.link"),
      href: ROUTES.products,
      icon: Package,
      tone: "violet",
    },
    {
      label: t("kpis.connectedStores.label"),
      value: formatNumber(kpiMetrics.connectedStores),
      footnote: t("kpis.connectedStores.footnote", {
        count: connectedPlatformCount,
        platform: connectedPlatformWord,
      }),
      linkLabel: t("kpis.connectedStores.link"),
      href: ROUTES.integrations,
      icon: Store,
      tone: "blue",
    },
  ]

  return (
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")}
      dir={localeDirection(locale)}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, action left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("hub.heading")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("hub.subheading")}</p>
          </div>

          <AppButton
            asChild
            className="h-11 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
          >
            <Link href={ROUTES.integrationsNew}>
              <span className="flex items-center justify-center gap-2">
                {t("hub.connectNewStore")}
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
                placeholder={t("hub.searchPlaceholder")}
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <AppDateRangeFilter
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
                    {platformFilterLabel(option, t)}
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
                    {statusFilterLabel(option, t)}
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
                  {t("hub.heading")}
                </button>
                <ChevronLeft className="size-3.5 text-[#b6c2d4] rtl:rotate-180" />
                <span className={cn("text-[12px] font-bold", HEADING)}>{selectedStore.name}</span>
              </div>

              <AppButton
                variant="outline"
                className="h-8 rounded-[8px] border-[#e1e7f0] bg-white px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                onClick={clearStoreContext}
              >
                {t("hub.clearStoreSelection")}
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
              {t("hub.loading")}
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
              <p className={cn("text-[14px] font-extrabold", HEADING)}>{t("hub.emptyTitle")}</p>
              <p className={cn("mt-2 text-[12.5px]", MUTED)}>{t("hub.emptySubtitle")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "store", label: t("table.columns.store"), align: "text-right" },
                      { key: "platform", label: t("table.columns.platform"), align: "text-center" },
                      {
                        key: "connection",
                        label: t("table.columns.connection"),
                        align: "text-center",
                      },
                      {
                        key: "customers",
                        label: t("table.columns.customers"),
                        align: "text-center",
                      },
                      { key: "orders", label: t("table.columns.orders"), align: "text-center" },
                      {
                        key: "products",
                        label: t("table.columns.products"),
                        align: "text-center",
                      },
                      {
                        key: "lastSync",
                        label: t("table.columns.lastSync"),
                        align: "text-center",
                      },
                      { key: "health", label: t("table.columns.health"), align: "text-center" },
                      {
                        key: "actions",
                        label: t("table.columns.actions"),
                        align: "text-center",
                      },
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
                          {t("table.noMatchTitle")}
                        </p>
                        <p className={cn("mt-2 text-[12px]", MUTED)}>{t("table.noMatchHint")}</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((store) => {
                      const logoText = store.platform.slice(0, 2).toUpperCase()
                      const connection = CONNECTION_STATUS_META[store.connectionStatus]
                      const health = SYNC_HEALTH_META[store.syncHealth]

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
                              {connectionStatusLabel(store.connectionStatus, t)}
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
                                    locale: locale === "ar" ? ar : enUS,
                                  })}
                                </p>
                                <p className={cn("mt-0.5 text-[10.5px]", MUTED)}>
                                  {absoluteDateTimeFormatter(locale).format(
                                    new Date(store.lastSyncAt)
                                  )}
                                </p>
                              </>
                            ) : (
                              <span className={cn("text-[12px]", MUTED)}>
                                {syncHealthLabel("never_synced", t)}
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                                health.className
                              )}
                              title={getSyncHealthTooltip(store.syncHealth, store.lastSyncError, t)}
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
                              {syncHealthLabel(store.syncHealth, t)}
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <button
                              type="button"
                              aria-label={t("table.viewDetailsAriaLabel", { name: store.name })}
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
                    ? t("pagination.noResults")
                    : t("pagination.showingRange", {
                        from: (currentPage - 1) * pageSize + 1,
                        to: Math.min(currentPage * pageSize, scopedStores.length),
                        total: scopedStores.length,
                      })}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>{t("pagination.itemsPerPage")}</span>
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
                  aria-label={t("pagination.first")}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label={t("pagination.previous")}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </button>
                <span className="flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-[#2878ff] bg-white px-2 text-[12px] font-bold text-[#2878ff]">
                  {currentPage}
                </span>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("pagination.next")}
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("pagination.last")}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="size-4 rtl:rotate-180" />
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
                title: t("features.unifiedAnalytics.title"),
                body: t("features.unifiedAnalytics.body"),
                icon: Sparkles,
              },
              {
                title: t("features.autoSync.title"),
                body: t("features.autoSync.body"),
                icon: RefreshCcw,
              },
              {
                title: t("features.allPlatformsSupport.title"),
                body: t("features.allPlatformsSupport.body"),
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
            <h3 className={cn("mt-3.5 text-[14px] font-extrabold", HEADING)}>{t("cta.title")}</h3>
            <p className={cn("mt-2 text-[11.5px] leading-[19px]", MUTED)}>{t("cta.body")}</p>
            <AppButton
              asChild
              variant="outline"
              className="mt-4 h-10 w-full rounded-[10px] border-[#2878ff] bg-white text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            >
              <Link href={ROUTES.integrationsNew}>
                <span className="flex items-center justify-center gap-2">
                  {t("hub.connectNewStore")}
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
