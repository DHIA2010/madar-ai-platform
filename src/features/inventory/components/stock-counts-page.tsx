"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ClipboardCheck, ClipboardList, Eye, Loader2, PencilLine, Plus, Scale } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppSearchableSelect,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { type StockCount, stockCountService } from "../services/stock-count.service"
import { stockTransferService } from "../services/stock-transfer.service"
import {
  BranchChip,
  FIELD_CLASS,
  formatQuantity,
  HEADING,
  KpiCard,
  MUTED,
  PAGE_SIZE,
  Pagination,
  PANEL,
  PRIMARY_BUTTON_CLASS,
} from "./inventory-ui"

import { type Locale, localeDirection } from "@/i18n/locales"

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value)
}

// "+3" / "-2" / "0", coloured by direction.
export function DifferenceValue({ value, money }: { value: number; money?: boolean }) {
  const rounded = Math.abs(value) < 1e-9 ? 0 : value
  const text = money ? formatMoney(rounded) : formatQuantity(rounded)
  return (
    <span
      className={cn(
        "inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 text-[12px] font-bold",
        rounded > 0
          ? "bg-emerald-50 text-emerald-700"
          : rounded < 0
            ? "bg-rose-50 text-rose-600"
            : "bg-[#f1f4f9] text-[#0b1738]"
      )}
      dir="ltr"
    >
      {rounded > 0 ? "+" : ""}
      {text}
    </span>
  )
}

export function StockCountStatusBadge({ status }: { status: StockCount["status"] }) {
  const t = useTranslations("inventory.counts.status")
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      )}
    >
      {status === "completed" ? (
        <ClipboardCheck className="size-3.5" />
      ) : (
        <PencilLine className="size-3.5" />
      )}
      {t(status)}
    </span>
  )
}

// Inventory -> Stock take: counting a branch's stock and approving the differences.
export function StockCountsPage() {
  const t = useTranslations("inventory.counts")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()

  const [counts, setCounts] = useState<StockCount[] | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState("")
  const [branch, setBranch] = useState("all")
  const [status, setStatus] = useState<"all" | StockCount["status"]>("all")
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    stockCountService
      .list()
      .then((items) => {
        if (!cancelled) setCounts(items)
      })
      .catch(() => {
        if (cancelled) return
        toast.error(t("toasts.loadFailed"))
        setCounts([])
      })
    stockTransferService
      .branches()
      .then((items) => {
        if (!cancelled) setBranches(items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [t])

  const all = useMemo(() => counts ?? [], [counts])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return all.filter(
      (count) =>
        (branch === "all" || count.workspaceId === branch) &&
        (status === "all" || count.status === status) &&
        (!query ||
          count.reference.toLowerCase().includes(query) ||
          count.notes.toLowerCase().includes(query))
    )
  }, [all, search, branch, status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const drafts = all.filter((count) => count.status === "draft").length
  const completedThisMonth = all.filter(
    (count) => count.status === "completed" && count.countDate.startsWith(monthPrefix)
  ).length
  const netValue = all
    .filter((count) => count.status === "completed")
    .reduce((sum, count) => sum + count.netDifferenceValue, 0)

  const openCount = (count: StockCount) =>
    router.push(`${ROUTES.inventoryStockCountsNew}?id=${encodeURIComponent(count.id)}`)

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("heading")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subheading")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpis.total")} value={all.length} icon={ClipboardList} tone="blue" />
        <KpiCard label={t("kpis.drafts")} value={drafts} icon={PencilLine} tone="amber" />
        <KpiCard
          label={t("kpis.completedThisMonth")}
          value={completedThisMonth}
          icon={ClipboardCheck}
          tone="emerald"
        />
        <KpiCard
          label={t("kpis.netValue")}
          value={formatMoney(netValue)}
          icon={Scale}
          tone={netValue < 0 ? "rose" : "violet"}
        />
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <AppSearchInput
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          wrapperClassName="w-full sm:w-72"
          className={FIELD_CLASS}
        />
        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={branch}
            options={[
              { value: "all", label: t("filters.allBranches") },
              ...branches.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(value) => {
              setBranch(value)
              setPage(1)
            }}
            placeholder={t("filters.branch")}
            ariaLabel={t("filters.branch")}
            triggerClassName="w-[190px]"
          />
          <AppSearchableSelect
            value={status}
            options={[
              { value: "all", label: t("filters.allStatuses") },
              { value: "draft", label: t("status.draft") },
              { value: "completed", label: t("status.completed") },
            ]}
            onChange={(value) => {
              setStatus(value as typeof status)
              setPage(1)
            }}
            placeholder={t("filters.status")}
            ariaLabel={t("filters.status")}
            triggerClassName="w-[160px]"
          />
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => router.push(ROUTES.inventoryStockCountsNew)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {t("add")}
          </AppButton>
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>{t("table.reference")}</AppTableHead>
              <AppTableHead>{t("table.branch")}</AppTableHead>
              <AppTableHead>{t("table.date")}</AppTableHead>
              <AppTableHead>{t("table.status")}</AppTableHead>
              <AppTableHead>{t("table.counted")}</AppTableHead>
              <AppTableHead>{t("table.differences")}</AppTableHead>
              <AppTableHead>{t("table.net")}</AppTableHead>
              <AppTableHead>{t("table.netValue")}</AppTableHead>
              <AppTableHead>{t("table.by")}</AppTableHead>
              <AppTableHead className="w-16">{t("table.actions")}</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((count) => (
              <AppTableRow key={count.id}>
                <AppTableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-600">
                      <ClipboardList className="size-4" />
                    </span>
                    <span className={cn("font-mono text-[13px] font-bold", HEADING)}>
                      {count.reference}
                    </span>
                  </div>
                </AppTableCell>
                <AppTableCell>
                  <BranchChip name={count.workspaceName} tone="to" />
                </AppTableCell>
                <AppTableCell className={cn("text-[13px]", HEADING)}>
                  {count.countDate}
                </AppTableCell>
                <AppTableCell>
                  <StockCountStatusBadge status={count.status} />
                </AppTableCell>
                <AppTableCell>
                  <span
                    className={cn(
                      "inline-flex min-w-9 justify-center rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[12px] font-bold",
                      HEADING
                    )}
                  >
                    {count.items.length}
                  </span>
                </AppTableCell>
                <AppTableCell>
                  <span
                    className={cn(
                      "inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 text-[12px] font-bold",
                      count.differences > 0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-[#f1f4f9] text-[#0b1738]"
                    )}
                  >
                    {count.differences}
                  </span>
                </AppTableCell>
                <AppTableCell>
                  <DifferenceValue value={count.netDifference} />
                </AppTableCell>
                <AppTableCell>
                  <DifferenceValue value={count.netDifferenceValue} money />
                </AppTableCell>
                <AppTableCell className={cn("text-[12.5px]", MUTED)}>
                  {(count.status === "completed" ? count.completedByName : count.createdByName) ??
                    "—"}
                </AppTableCell>
                <AppTableCell>
                  <AppButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={count.status === "draft" ? t("continue") : t("view")}
                    title={count.status === "draft" ? t("continue") : t("view")}
                    className={cn(
                      "rounded-[8px] border",
                      count.status === "draft"
                        ? "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    )}
                    onClick={() => openCount(count)}
                  >
                    {count.status === "draft" ? (
                      <PencilLine className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </AppButton>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {counts === null ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <AppTableEmpty
            title={all.length === 0 ? t("empty.title") : t("empty.noMatchTitle")}
            description={all.length === 0 ? t("empty.description") : t("empty.noMatchDescription")}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            {t("showingCount", { shown: rows.length, total: filtered.length })}
          </p>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            previousLabel={tCommon("previous")}
            nextLabel={tCommon("next")}
          />
        </div>
      </div>
    </div>
  )
}
