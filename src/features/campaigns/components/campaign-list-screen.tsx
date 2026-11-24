"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { subDays } from "date-fns"
import {
  ChevronDown,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { AppError } from "@/lib/app-errors"
import { toLocalDay } from "@/lib/local-day"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppConfirmDialog,
  AppDateRangeFilter,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppSearchInput,
  AppSwitch,
} from "@/components/app"

import { Can } from "@/features/authentication"

import {
  type CampaignControlLevel,
  type CampaignPerformanceRow,
  campaignPerformanceService,
  canControlCampaignRow,
  isCampaignRowSwitchedOn,
} from "../services/campaign-performance.service"
import {
  AdGroupAddAdDialog,
  AdGroupBudgetDialog,
  campaignRowPublishPlatform,
  canChangeAdGroupBudget,
} from "./campaign-ad-group-actions"
import { CampaignModuleNav } from "./campaign-module-nav"
import { CampaignRowSettingsDialog, type RowSettingsMode } from "./campaign-row-settings"
import { campaignStatusBucket, campaignStatusPill } from "./campaign-status-pill"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

// Same visual tokens as the other campaign screens in this feature.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

type StatusFilter = "all" | "active" | "paused" | "other"
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "paused", "other"]

function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function formatNumber(value: number, locale: Locale, digits = 0) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: digits }).format(
    value
  )
}

// Money in the campaign's own currency, never converted.
function formatMoney(value: number, currency: string | null | undefined, locale: Locale) {
  const amount = formatNumber(value, locale, value < 100 ? 2 : 0)
  const code = currency ?? "SAR"
  if (code === "SAR") return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
  return locale === "ar" ? `${amount} ${code}` : `${code} ${amount}`
}

// What is under a row once it is opened: still loading, failed, or its rows.
type Children = "loading" | "error" | CampaignPerformanceRow[]

// The campaigns list: every campaign on the connected ad platforms with its real numbers for the
// chosen period (GET /v1/campaigns/performance/campaigns) -- the same rows the dashboard drills
// into, so one can be found by name, platform or state. A campaign opens to its ad groups and an
// ad group to its ads; where the platform's connection allows it (Snapchat, TikTok, Google), each
// of the three can be switched on or off, or deleted, right from its row.
export function CampaignListScreen() {
  const t = useTranslations("campaigns")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 29), to: today }
  })
  const [rows, setRows] = useState<CampaignPerformanceRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [platformFilter, setPlatformFilter] = useState<string>("all")

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Record<string, Children>>({})
  const [switching, setSwitching] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CampaignPerformanceRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // The ad group a new ad is being added to, and the one whose daily budget is being changed.
  const [addingAdTo, setAddingAdTo] = useState<CampaignPerformanceRow | null>(null)
  const [budgetOf, setBudgetOf] = useState<CampaignPerformanceRow | null>(null)
  // The row whose settings are open, and what is being done with them: view, edit or copy.
  const [managing, setManaging] = useState<{
    row: CampaignPerformanceRow
    mode: RowSettingsMode
  } | null>(null)
  // Raised to load the campaigns again (after a campaign was copied).
  const [reloads, setReloads] = useState(0)

  const startDate = dateRange?.from ? toLocalDay(dateRange.from) : undefined
  const endDay = dateRange?.to ?? dateRange?.from
  const endDate = endDay ? toLocalDay(endDay) : undefined

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(false)
      // The numbers under an opened row belong to the old period.
      setExpanded(new Set())
      setChildren({})
      try {
        const result = await campaignPerformanceService.listCampaigns({
          startDate,
          endDate,
          pageSize: 200,
        })
        if (!cancelled) setRows(result.items)
      } catch (error) {
        console.error("Failed to load the campaigns list", error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, reloads])

  const loadChildren = useCallback(
    async (row: Pick<CampaignPerformanceRow, "id" | "level">) => {
      setChildren((current) => ({ ...current, [row.id]: "loading" }))
      try {
        const result =
          row.level === "campaign"
            ? await campaignPerformanceService.listAdGroups(row.id, { startDate, endDate })
            : await campaignPerformanceService.listAdsOrKeywords(row.id, "ads", {
                startDate,
                endDate,
              })
        setChildren((current) => ({ ...current, [row.id]: result.items }))
      } catch {
        setChildren((current) => ({ ...current, [row.id]: "error" }))
      }
    },
    [startDate, endDate]
  )

  const toggleOpen = (row: CampaignPerformanceRow) => {
    const open = !expanded.has(row.id)
    setExpanded((current) => {
      const next = new Set(current)
      if (open) next.add(row.id)
      else next.delete(row.id)
      return next
    })
    if (open && !Array.isArray(children[row.id])) void loadChildren(row)
  }

  // Applies a change to one row wherever it is held: the campaigns, or a parent's opened rows.
  const patchRow = (
    row: CampaignPerformanceRow,
    change: (row: CampaignPerformanceRow) => CampaignPerformanceRow | null
  ) => {
    const apply = (list: CampaignPerformanceRow[]) =>
      list.flatMap((entry) => {
        if (entry.id !== row.id) return [entry]
        const next = change(entry)
        return next ? [next] : []
      })
    if (row.parentId === null) {
      setRows((current) => (current ? apply(current) : current))
      return
    }
    const parentId = row.parentId
    setChildren((current) => {
      const list = current[parentId]
      return Array.isArray(list) ? { ...current, [parentId]: apply(list) } : current
    })
  }

  const controlLevel = (row: CampaignPerformanceRow) => row.level as CampaignControlLevel

  const setActive = async (row: CampaignPerformanceRow, active: boolean) => {
    setSwitching(row.id)
    try {
      const result = await campaignPerformanceService.setActive(row.id, controlLevel(row), active)
      patchRow(row, (entry) => ({ ...entry, status: result.status }))
      toast.success(
        t(active ? "listScreen.controls.switchedOn" : "listScreen.controls.switchedOff")
      )
    } catch (error) {
      toast.error(
        t(
          error instanceof AppError && error.code === "SNAPCHAT_GONE"
            ? "listScreen.controls.gone"
            : "listScreen.controls.switchFailed"
        )
      )
    } finally {
      setSwitching(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await campaignPerformanceService.remove(deleting.id, controlLevel(deleting))
      patchRow(deleting, () => null)
      toast.success(t("listScreen.controls.deleted"))
      setDeleting(null)
    } catch {
      toast.error(t("listScreen.controls.deleteFailed"))
    } finally {
      setDeleteBusy(false)
    }
  }

  const platforms = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.platform))].sort(),
    [rows]
  )
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: 0, active: 0, paused: 0, other: 0 }
    for (const row of rows ?? []) {
      result.all += 1
      result[campaignStatusBucket(row.status)] += 1
    }
    return result
  }, [rows])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (rows ?? [])
      .filter((row) => statusFilter === "all" || campaignStatusBucket(row.status) === statusFilter)
      .filter((row) => platformFilter === "all" || row.platform === platformFilter)
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .sort((a, b) => b.spend - a.spend)
  }, [rows, search, statusFilter, platformFilter])

  const columns = [
    { key: "campaign", label: t("metrics.entity.campaign"), align: "text-start" },
    { key: "status", label: t("metrics.columns.status") },
    { key: "spend", label: t("metrics.columns.spend") },
    { key: "impressions", label: t("metrics.columns.impressions") },
    { key: "clicks", label: t("metrics.columns.clicks") },
    { key: "ctr", label: t("metrics.columns.ctr") },
    { key: "results", label: t("checkupScreen.columns.results") },
    { key: "cpa", label: t("checkupScreen.columns.costPerResult") },
    { key: "controls", label: t("listScreen.controls.column") },
  ]

  // The row's own menu: look at its settings, and where Madar can change the platform (Snapchat
  // today), edit it or make a copy of it.
  const rowMenu = (row: CampaignPerformanceRow) => {
    const canChange = campaignRowPublishPlatform(row) === "snapchat"
    const item =
      "flex h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-3 text-[13px] font-semibold text-[#0b1738]"
    return (
      // Not modal: a modal menu that opens a window leaves the page unclickable once the window
      // closes.
      <AppDropdownMenu dir={dir} modal={false}>
        <AppDropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("listScreen.controls.manage.menu", { name: row.name })}
            title={t("listScreen.controls.manage.actions.view")}
            className="flex size-10 items-center justify-center rounded-[10px] text-[#475467] transition-colors hover:bg-[#eef2f8]"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end" className="min-w-[180px] rounded-[12px] p-1.5">
          <AppDropdownMenuItem className={item} onSelect={() => setManaging({ row, mode: "view" })}>
            <Eye className="size-4 text-[#6b7b96]" />
            {t("listScreen.controls.manage.actions.view")}
          </AppDropdownMenuItem>
          {canChange ? (
            <Can permission="campaigns:create">
              <AppDropdownMenuItem
                className={item}
                onSelect={() => setManaging({ row, mode: "edit" })}
              >
                <Pencil className="size-4 text-[#6b7b96]" />
                {t("listScreen.controls.manage.actions.edit")}
              </AppDropdownMenuItem>
              <AppDropdownMenuItem
                className={item}
                onSelect={() => setManaging({ row, mode: "clone" })}
              >
                <Copy className="size-4 text-[#6b7b96]" />
                {t("listScreen.controls.manage.actions.clone")}
              </AppDropdownMenuItem>
            </Can>
          ) : null}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    )
  }

  // One row of the table at its depth: a campaign (0), an ad group (1) or an ad (2).
  const renderRow = (row: CampaignPerformanceRow, depth: number) => {
    const pill = campaignStatusPill(row.status, t)
    const open = expanded.has(row.id)
    const under = children[row.id]
    const canOpen = row.level === "campaign" || row.level === "adGroup"
    const on = isCampaignRowSwitchedOn(row.status)
    return (
      <Fragment key={row.id}>
        <tr
          className={cn(
            "border-b border-[#f4f7fb] hover:bg-[#f8fafd]",
            depth === 1 && "bg-[#fafbfe]",
            depth === 2 && "bg-[#f5f8fd]"
          )}
        >
          <td className="px-3 py-3.5 text-start">
            <div className="flex items-center gap-2" style={{ paddingInlineStart: depth * 28 }}>
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => toggleOpen(row)}
                  aria-expanded={open}
                  aria-label={t(
                    open ? "listScreen.controls.collapse" : "listScreen.controls.expand",
                    { name: row.name }
                  )}
                  title={t(
                    row.level === "campaign"
                      ? "listScreen.controls.showAdGroups"
                      : "listScreen.controls.showAds"
                  )}
                  className="flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[#6b7b96] transition-colors hover:bg-[#eef2f8]"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      !open && "ltr:-rotate-90 rtl:rotate-90"
                    )}
                  />
                </button>
              ) : (
                <span className="size-9 shrink-0" />
              )}
              {depth === 0 ? (
                <PlatformBadge
                  platform={row.platform}
                  className="size-9"
                  iconClassName="size-[18px]"
                />
              ) : null}
              <div className="min-w-0">
                <p className={cn("max-w-[320px] truncate text-[13px] font-bold", HEADING)}>
                  {row.name}
                </p>
                <p className={cn("text-[11.5px]", MUTED)}>
                  {depth === 0
                    ? row.platform
                    : t(
                        depth === 1
                          ? "listScreen.controls.levels.adGroup"
                          : "listScreen.controls.levels.ad"
                      )}
                </p>
              </div>
            </div>
          </td>
          <td className="px-3 py-3.5">
            <span
              className={cn(
                "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                pill.className
              )}
            >
              {pill.label}
            </span>
          </td>
          <td className="whitespace-nowrap px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {formatMoney(row.spend, row.currency, locale)}
          </td>
          <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {formatNumber(row.impressions, locale)}
          </td>
          <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {formatNumber(row.clicks, locale)}
          </td>
          <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {formatNumber(row.ctr, locale, 2)}%
          </td>
          <td className="px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {formatNumber(row.conversions, locale, 1)}
          </td>
          <td className="whitespace-nowrap px-3 py-3.5 text-[13px] tabular-nums text-[#334155]">
            {row.conversions > 0 ? formatMoney(row.cpa, row.currency, locale) : "—"}
          </td>
          <td className="px-3 py-2">
            <div className="flex items-center justify-center gap-1">
              {canControlCampaignRow(row) ? (
                <Can permission="campaigns:create">
                  <div className="flex items-center justify-center gap-2">
                    {row.level === "adGroup" && campaignRowPublishPlatform(row) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setAddingAdTo(row)}
                          aria-label={t("listScreen.controls.addAd.buttonLabel", {
                            name: row.name,
                          })}
                          title={t("listScreen.controls.addAd.button")}
                          className="flex size-10 items-center justify-center rounded-[10px] text-[#1d4fd8] transition-colors hover:bg-[#eef4ff]"
                        >
                          <Plus className="size-4" />
                        </button>
                        {canChangeAdGroupBudget(row) ? (
                          <button
                            type="button"
                            onClick={() => setBudgetOf(row)}
                            aria-label={t("listScreen.controls.budget.buttonLabel", {
                              name: row.name,
                            })}
                            title={t("listScreen.controls.budget.button")}
                            className="flex size-10 items-center justify-center rounded-[10px] text-[#137a41] transition-colors hover:bg-[#e7f8ee]"
                          >
                            <Wallet className="size-4" />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {switching === row.id ? (
                      <Loader2 className="size-5 animate-spin text-[#98a2b3]" />
                    ) : (
                      <AppSwitch
                        checked={on}
                        onCheckedChange={(active) => void setActive(row, active)}
                        aria-label={t("listScreen.controls.switchLabel", { name: row.name })}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleting(row)}
                      aria-label={t("listScreen.controls.deleteLabel", { name: row.name })}
                      title={t("listScreen.controls.delete")}
                      className="flex size-10 items-center justify-center rounded-[10px] text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Can>
              ) : (
                <span
                  className={cn("whitespace-nowrap text-[11.5px]", MUTED)}
                  title={t("listScreen.controls.notSupportedHint")}
                >
                  {t("listScreen.controls.notSupported")}
                </span>
              )}
              {row.level === "keyword" ? null : rowMenu(row)}
            </div>
          </td>
        </tr>
        {open && !Array.isArray(under) ? (
          <tr className="border-b border-[#f4f7fb] bg-[#fafbfe]">
            <td colSpan={columns.length} className="px-4 py-4 text-center">
              {under === "error" ? (
                <button
                  type="button"
                  onClick={() => void loadChildren(row)}
                  className="text-[12.5px] font-semibold text-[#e0484d] underline"
                >
                  {t("listScreen.controls.childrenLoadError")}
                </button>
              ) : (
                <Loader2 className="mx-auto size-5 animate-spin text-[#98a2b3]" />
              )}
            </td>
          </tr>
        ) : null}
        {open && Array.isArray(under) && under.length === 0 ? (
          <tr className="border-b border-[#f4f7fb] bg-[#fafbfe]">
            <td
              colSpan={columns.length}
              className={cn("px-4 py-4 text-center text-[12.5px]", MUTED)}
            >
              {t(
                row.level === "campaign"
                  ? "listScreen.controls.noAdGroups"
                  : "listScreen.controls.noAds"
              )}
            </td>
          </tr>
        ) : null}
        {open && Array.isArray(under) ? under.map((child) => renderRow(child, depth + 1)) : null}
      </Fragment>
    )
  }

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("listScreen.title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("listScreen.realSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
            <Can permission="campaigns:create">
              <Link
                href={ROUTES.campaignsCreate}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#1d4fd8] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1a45bd]"
              >
                <Plus className="size-4" />
                {t("listScreen.newCampaign")}
              </Link>
            </Can>
          </div>
        </div>

        <CampaignModuleNav />

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-semibold transition-colors",
                    statusFilter === filter
                      ? "border-[#1d4fd8] bg-[#1d4fd8] text-white"
                      : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0]"
                  )}
                >
                  {t(`listScreen.filters.${filter}` as "listScreen.filters.all")}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      statusFilter === filter ? "bg-white/20" : "bg-[#eef2f8]"
                    )}
                  >
                    {counts[filter]}
                  </span>
                </button>
              ))}
            </div>
            <div className="w-full lg:w-[340px]">
              <AppSearchInput
                startIcon={<Search className="size-4 text-[#95a4bd]" />}
                placeholder={t("listScreen.searchPlaceholder")}
                className="h-11 rounded-[10px] border-[#e1e7f0] bg-white text-[13px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {platforms.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["all", ...platforms].map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setPlatformFilter(platform)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors",
                    platformFilter === platform
                      ? "border-[#1d4fd8] bg-[#eef4ff] text-[#1d4fd8]"
                      : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0]"
                  )}
                >
                  {platform === "all" ? (
                    t("listScreen.allPlatforms")
                  ) : (
                    <>
                      <PlatformBadge
                        platform={platform}
                        className="size-5"
                        iconClassName="size-3"
                      />
                      {platform}
                    </>
                  )}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1040px] text-center">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "border-b border-[#eef2f8] px-3 py-3 text-[11.5px] font-semibold",
                        MUTED,
                        column.align ?? "text-center"
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn("transition-opacity", isLoading && rows && "opacity-60")}>
                {loadError ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center">
                      <p className="text-[12.5px] text-[#e0484d]">{t("listScreen.loadError")}</p>
                    </td>
                  </tr>
                ) : rows === null ? (
                  <tr>
                    <td colSpan={columns.length} className="py-12 text-center">
                      <p className={cn("text-[12.5px]", MUTED)}>
                        {t("dashboardScreen.loadingPerformance")}
                      </p>
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-14 text-center">
                      <p className={cn("text-[14px] font-bold", HEADING)}>
                        {rows.length === 0
                          ? t("listScreen.emptyTitle")
                          : t("listScreen.noMatchTitle")}
                      </p>
                      <p className={cn("mt-2 text-[12.5px]", MUTED)}>
                        {rows.length === 0
                          ? t("listScreen.emptyDescription")
                          : t("listScreen.noMatchDescription")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => renderRow(row, 0))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AdGroupAddAdDialog
        row={addingAdTo}
        onClose={() => setAddingAdTo(null)}
        onAdded={(row) => {
          // The new ad shows under its ad group at once.
          setExpanded((current) => new Set(current).add(row.id))
          void loadChildren(row)
        }}
      />
      <AdGroupBudgetDialog
        row={budgetOf}
        onClose={() => setBudgetOf(null)}
        onSaved={(row, dailyBudget) => patchRow(row, (entry) => ({ ...entry, dailyBudget }))}
      />
      <CampaignRowSettingsDialog
        row={managing?.row ?? null}
        mode={managing?.mode ?? "view"}
        onModeChange={(mode) => setManaging((current) => (current ? { ...current, mode } : null))}
        onClose={() => setManaging(null)}
        onEdited={(row, settings) =>
          patchRow(row, (entry) => ({
            ...entry,
            name: settings.name,
            status: settings.status || entry.status,
            dailyBudget: settings.dailyBudget ?? entry.dailyBudget,
          }))
        }
        onCloned={(row) => {
          // The copy sits beside what it was copied from: a campaign in the list, an ad group
          // under its campaign, an ad under its ad group.
          if (row.parentId === null) setReloads((count) => count + 1)
          else
            void loadChildren({
              id: row.parentId,
              level: row.level === "ad" ? "adGroup" : "campaign",
            })
        }}
      />
      <AppConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null)
        }}
        title={
          deleting
            ? t(`listScreen.controls.deleteTitle.${controlLevel(deleting)}`, {
                name: deleting.name,
              })
            : ""
        }
        description={
          deleting ? t(`listScreen.controls.deleteDescription.${controlLevel(deleting)}`) : ""
        }
        confirmLabel={t("listScreen.controls.confirmDelete")}
        cancelLabel={t("listScreen.controls.cancel")}
        confirmTone="destructive"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
