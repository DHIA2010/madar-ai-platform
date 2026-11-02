"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowLeftRight,
  Boxes,
  CalendarDays,
  ChevronLeft,
  Eye,
  Loader2,
  Package,
  Plus,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDialog,
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

import { type StockTransfer, stockTransferService } from "../services/stock-transfer.service"
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

// Inventory -> Stock transfers: every move of stock from one branch to another.
export function StockTransfersPage() {
  const t = useTranslations("inventory.transfers")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  // Branches come from the server, never the browser's saved list.
  const [availableWorkspaces, setBranches] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    stockTransferService
      .branches()
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [])

  const [transfers, setTransfers] = useState<StockTransfer[] | null>(null)
  const [search, setSearch] = useState("")
  const [fromBranch, setFromBranch] = useState("all")
  const [toBranch, setToBranch] = useState("all")
  const [page, setPage] = useState(1)
  const [viewTarget, setViewTarget] = useState<StockTransfer | null>(null)

  useEffect(() => {
    let cancelled = false
    stockTransferService
      .list()
      .then((items) => {
        if (!cancelled) setTransfers(items)
      })
      .catch(() => {
        if (cancelled) return
        toast.error(t("toasts.loadFailed"))
        setTransfers([])
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const all = useMemo(() => transfers ?? [], [transfers])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return all.filter(
      (transfer) =>
        (fromBranch === "all" || transfer.fromWorkspaceId === fromBranch) &&
        (toBranch === "all" || transfer.toWorkspaceId === toBranch) &&
        (!query ||
          transfer.reference.toLowerCase().includes(query) ||
          transfer.notes.toLowerCase().includes(query) ||
          transfer.items.some(
            (item) =>
              item.productName.toLowerCase().includes(query) ||
              item.sku.toLowerCase().includes(query)
          ))
    )
  }, [all, search, fromBranch, toBranch])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const unitsMoved = all.reduce((sum, transfer) => sum + transfer.totalQuantity, 0)
  const thisMonth = all.filter((transfer) => transfer.transferDate.startsWith(monthPrefix)).length
  const productsMoved = new Set(all.flatMap((transfer) => transfer.items.map((i) => i.productId)))
    .size

  const branchOptions = (allLabel: string) => [
    { value: "all", label: allLabel },
    ...availableWorkspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
  ]

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("heading")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subheading")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpis.total")} value={all.length} icon={ArrowLeftRight} tone="blue" />
        <KpiCard
          label={t("kpis.units")}
          value={formatQuantity(unitsMoved)}
          icon={Boxes}
          tone="violet"
        />
        <KpiCard label={t("kpis.thisMonth")} value={thisMonth} icon={CalendarDays} tone="emerald" />
        <KpiCard label={t("kpis.products")} value={productsMoved} icon={Package} tone="amber" />
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
            value={fromBranch}
            options={branchOptions(t("filters.allFrom"))}
            onChange={(value) => {
              setFromBranch(value)
              setPage(1)
            }}
            placeholder={t("filters.from")}
            ariaLabel={t("filters.from")}
            triggerClassName="w-[210px]"
          />
          <AppSearchableSelect
            value={toBranch}
            options={branchOptions(t("filters.allTo"))}
            onChange={(value) => {
              setToBranch(value)
              setPage(1)
            }}
            placeholder={t("filters.to")}
            ariaLabel={t("filters.to")}
            triggerClassName="w-[210px]"
          />
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => router.push(ROUTES.inventoryTransfersAdd)}
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
              <AppTableHead>{t("table.from")}</AppTableHead>
              <AppTableHead>{t("table.to")}</AppTableHead>
              <AppTableHead>{t("table.date")}</AppTableHead>
              <AppTableHead>{t("table.products")}</AppTableHead>
              <AppTableHead>{t("table.quantity")}</AppTableHead>
              <AppTableHead>{t("table.createdBy")}</AppTableHead>
              <AppTableHead className="w-16">{t("table.actions")}</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((transfer) => (
              <AppTableRow key={transfer.id}>
                <AppTableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-600">
                      <ArrowLeftRight className="size-4" />
                    </span>
                    <span className={cn("font-mono text-[13px] font-bold", HEADING)}>
                      {transfer.reference}
                    </span>
                  </div>
                </AppTableCell>
                <AppTableCell>
                  <BranchChip name={transfer.fromWorkspaceName} tone="from" />
                </AppTableCell>
                <AppTableCell>
                  <BranchChip name={transfer.toWorkspaceName} tone="to" />
                </AppTableCell>
                <AppTableCell className={cn("text-[13px]", HEADING)}>
                  {transfer.transferDate}
                </AppTableCell>
                <AppTableCell>
                  <span
                    className={cn(
                      "inline-flex min-w-9 justify-center rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[12px] font-bold",
                      HEADING
                    )}
                  >
                    {transfer.items.length}
                  </span>
                </AppTableCell>
                <AppTableCell>
                  <span className="inline-flex min-w-9 justify-center rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-bold text-violet-700">
                    {formatQuantity(transfer.totalQuantity)}
                  </span>
                </AppTableCell>
                <AppTableCell className={cn("text-[12.5px]", MUTED)}>
                  {transfer.createdByName ?? "—"}
                </AppTableCell>
                <AppTableCell>
                  <AppButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("view")}
                    className="rounded-[8px] border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    onClick={() => setViewTarget(transfer)}
                  >
                    <Eye className="size-4" />
                  </AppButton>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {transfers === null ? (
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

      <AppDialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null)
        }}
        title={
          <span dir={dir} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
              <ArrowLeftRight className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-mono text-[17px] font-extrabold text-[#0b1738]">
                {viewTarget?.reference}
              </span>
              <span className="text-[12px] font-medium text-[#0b1738]">
                {viewTarget?.transferDate}
              </span>
            </span>
          </span>
        }
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[34rem] gap-5 p-6"
        )}
        footer={
          <AppButton
            variant="outline"
            className="h-11 w-full rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
            onClick={() => setViewTarget(null)}
          >
            {t("close")}
          </AppButton>
        }
      >
        {viewTarget ? (
          <div dir={dir} className="space-y-4">
            <div className="flex items-center gap-3 rounded-[12px] border border-[#e1e7f0] bg-[#f9fbfe] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-[#0b1738]">{t("table.from")}</p>
                <p className={cn("mt-0.5 truncate text-[13.5px] font-bold", HEADING)}>
                  {viewTarget.fromWorkspaceName}
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2878ff] text-white">
                <ChevronLeft className="size-4 ltr:rotate-180" />
              </span>
              <div className="min-w-0 flex-1 text-end">
                <p className="text-[11px] font-semibold text-[#0b1738]">{t("table.to")}</p>
                <p className={cn("mt-0.5 truncate text-[13.5px] font-bold", HEADING)}>
                  {viewTarget.toWorkspaceName}
                </p>
              </div>
            </div>

            <ul className="max-h-[18rem] divide-y divide-[#eef2f7] overflow-y-auto rounded-[12px] border border-[#e1e7f0]">
              {viewTarget.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f1f4f9] text-[#6b7b96]">
                    <Package className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[13px] font-semibold", HEADING)}>
                      {item.productName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#0b1738]">{item.sku || "—"}</p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-bold text-violet-700">
                    {formatQuantity(item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {viewTarget.notes ? (
              <div className="rounded-[12px] border border-[#e1e7f0] p-3">
                <p className="text-[11px] font-semibold text-[#0b1738]">{t("notes")}</p>
                <p className={cn("mt-1 text-[13px] whitespace-pre-wrap", HEADING)}>
                  {viewTarget.notes}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </AppDialog>
    </div>
  )
}
