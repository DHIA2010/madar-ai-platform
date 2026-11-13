"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  CircleCheckBig,
  Copy,
  Eye,
  FileText,
  Hourglass,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Send,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppConfirmDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useFormatters, useInvoicingAccess, useInvoicingError } from "../hooks/use-invoicing"
import { quotationService } from "../services/invoicing.service"
import type { Quotation, QuotationSummary } from "../types/invoicing.types"
import { PageHeader, PageLoading } from "./page-shell"
import {
  afterMenuCloses,
  EmptyState,
  FilterTabs,
  InvoicingLocked,
  KpiCard,
  PRIMARY_BUTTON,
} from "./primitives"
import { QuotationBillingPill, QuotationStatusPill } from "./status"
import { HEADING, MUTED, PANEL } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

type Tab = "all" | "draft" | "sent" | "accepted" | "declined" | "expired" | "invoiced"
const TABS: Tab[] = ["all", "draft", "sent", "accepted", "invoiced", "expired", "declined"]

const inTab = (quotation: Quotation, tab: Tab) =>
  tab === "all" ||
  (tab === "invoiced" ? quotation.billingStatus !== "none" : quotation.displayStatus === tab)

export function QuotationsListPage() {
  const t = useTranslations("invoicing.quotations")
  const tCommon = useTranslations("invoicing.common")
  const tSectors = useTranslations("invoicing.sectors")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { enabled, canManage } = useInvoicingAccess()
  const { money, date } = useFormatters()
  const describeError = useInvoicingError()
  const [items, setItems] = useState<Quotation[] | null>(null)
  const [summary, setSummary] = useState<QuotationSummary | null>(null)
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")
  const [removeTarget, setRemoveTarget] = useState<Quotation | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, totals] = await Promise.all([
        quotationService.list(),
        quotationService.summary(),
      ])
      setItems(list)
      setSummary(totals)
    } catch (error) {
      setItems([])
      toast.error(describeError(error))
    }
  }, [describeError])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !items) return items ?? []
    return items.filter((quotation) =>
      [quotation.number, quotation.customer.name, quotation.title, quotation.reference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [items, search])
  const rows = useMemo(() => searched.filter((quotation) => inTab(quotation, tab)), [searched, tab])

  if (!enabled) return <InvoicingLocked />

  const duplicate = async (quotation: Quotation) => {
    try {
      const copy = await quotationService.duplicate(quotation.id)
      toast.success(t("duplicated"))
      router.push(ROUTES.quotationEdit(copy.id))
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const remove = async () => {
    if (!removeTarget) return
    setBusy(true)
    try {
      await quotationService.remove(removeTarget.id)
      toast.success(t("deleted"))
      setRemoveTarget(null)
      await load()
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const newButton = canManage ? (
    <Link href={ROUTES.quotationsNew} className={cn(PRIMARY_BUTTON, "inline-flex items-center")}>
      <Plus className="size-4" />
      {t("new")}
    </Link>
  ) : null

  return (
    <div dir={localeDirection(locale)} className="space-y-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={newButton} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Send}
          tone="info"
          label={t("kpi.open")}
          value={money(summary?.openAmount ?? 0)}
          hint={t("kpi.openHint", { count: summary?.openCount ?? 0 })}
        />
        <KpiCard
          icon={CircleCheckBig}
          tone="success"
          label={t("kpi.accepted")}
          value={money(summary?.acceptedAmount ?? 0)}
          hint={t("kpi.acceptedHint")}
        />
        <KpiCard
          icon={Percent}
          tone="accent"
          label={t("kpi.acceptance")}
          value={`${Math.round(summary?.acceptanceRate ?? 0)}%`}
          hint={t("kpi.acceptanceHint")}
        />
        <KpiCard
          icon={Hourglass}
          tone="warning"
          label={t("kpi.expiring")}
          value={summary?.expiringSoon ?? 0}
          hint={t("kpi.expiringHint")}
        />
      </div>

      {items === null ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("empty.title")}
          description={t("empty.description")}
          action={newButton}
        />
      ) : (
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <FilterTabs
              value={tab}
              onChange={setTab}
              options={TABS.map((value) => ({
                value,
                label: t(`tabs.${value}`),
                count:
                  value === "all"
                    ? undefined
                    : searched.filter((item) => inTab(item, value)).length,
              }))}
            />
            <AppSearchInput
              placeholder={t("search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              wrapperClassName="w-full sm:w-64"
            />
          </div>
          <div className="overflow-x-auto border-t border-[#eef1f6]">
            <AppTable className="min-w-[860px]">
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>{t("table.number")}</AppTableHead>
                  <AppTableHead>{t("table.customer")}</AppTableHead>
                  <AppTableHead>{t("table.issueDate")}</AppTableHead>
                  <AppTableHead>{t("table.validUntil")}</AppTableHead>
                  <AppTableHead className="text-end">{t("table.total")}</AppTableHead>
                  <AppTableHead>{t("table.status")}</AppTableHead>
                  <AppTableHead className="w-12" />
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {rows.map((quotation) => (
                  <AppTableRow
                    key={quotation.id}
                    className="cursor-pointer"
                    onClick={() => router.push(ROUTES.quotationDetails(quotation.id))}
                  >
                    <AppTableCell>
                      <span className={cn("block text-[13px] font-extrabold", HEADING)} dir="ltr">
                        {quotation.number}
                        {quotation.revision > 1 ? (
                          <span className="ms-1.5 rounded-md bg-[#eef0ff] px-1.5 py-0.5 text-[10px] font-bold text-[#4f46e5]">
                            R{quotation.revision}
                          </span>
                        ) : null}
                      </span>
                      <span className={cn("block text-[11.5px]", MUTED)}>
                        {tSectors(`${quotation.sector}.name`)}
                      </span>
                    </AppTableCell>
                    <AppTableCell>
                      <span
                        className={cn(
                          "block max-w-[260px] truncate text-[13px] font-bold",
                          HEADING
                        )}
                      >
                        {quotation.customer.name}
                      </span>
                      {quotation.title ? (
                        <span className={cn("block max-w-[260px] truncate text-[11.5px]", MUTED)}>
                          {quotation.title}
                        </span>
                      ) : null}
                    </AppTableCell>
                    <AppTableCell className={MUTED}>{date(quotation.issueDate)}</AppTableCell>
                    <AppTableCell
                      className={quotation.displayStatus === "expired" ? "text-[#b45309]" : MUTED}
                    >
                      {date(quotation.validUntil)}
                    </AppTableCell>
                    <AppTableCell className={cn("text-end font-extrabold tabular-nums", HEADING)}>
                      {money(quotation.totalAmount)}
                    </AppTableCell>
                    <AppTableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <QuotationStatusPill quotation={quotation} />
                        <QuotationBillingPill quotation={quotation} />
                      </div>
                    </AppTableCell>
                    <AppTableCell onClick={(event) => event.stopPropagation()}>
                      <AppDropdownMenu>
                        <AppDropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={tCommon("actions")}
                            className="flex size-8 items-center justify-center rounded-full text-[#6b7b96] hover:bg-[#f1f3f7]"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </AppDropdownMenuTrigger>
                        <AppDropdownMenuContent align="end" className="min-w-44">
                          <AppDropdownMenuItem
                            onSelect={() => router.push(ROUTES.quotationDetails(quotation.id))}
                          >
                            <Eye className="size-4" />
                            {tCommon("view")}
                          </AppDropdownMenuItem>
                          {canManage ? (
                            <>
                              <AppDropdownMenuItem
                                onSelect={() => router.push(ROUTES.quotationEdit(quotation.id))}
                              >
                                <Pencil className="size-4" />
                                {tCommon("edit")}
                              </AppDropdownMenuItem>
                              <AppDropdownMenuItem onSelect={() => void duplicate(quotation)}>
                                <Copy className="size-4" />
                                {tCommon("duplicate")}
                              </AppDropdownMenuItem>
                              {quotation.invoiceCount === 0 ? (
                                <>
                                  <AppDropdownMenuSeparator />
                                  <AppDropdownMenuItem
                                    className="text-[#dc2626] focus:text-[#dc2626]"
                                    onSelect={afterMenuCloses(() => setRemoveTarget(quotation))}
                                  >
                                    <Trash2 className="size-4" />
                                    {tCommon("delete")}
                                  </AppDropdownMenuItem>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </AppDropdownMenuContent>
                      </AppDropdownMenu>
                    </AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          </div>
          {rows.length === 0 ? (
            <p className={cn("px-4 py-12 text-center text-[13px]", MUTED)}>{t("noMatches")}</p>
          ) : null}
        </section>
      )}

      <AppConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t("deleteTitle", { number: removeTarget?.number ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        confirmTone="destructive"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
