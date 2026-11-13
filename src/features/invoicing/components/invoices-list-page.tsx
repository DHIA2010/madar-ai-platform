"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  CircleDollarSign,
  Clock4,
  FileMinus2,
  Plus,
  ReceiptText,
  ShieldAlert,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useFormatters, useInvoicingAccess, useInvoicingError } from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type { InvoiceSummary, SalesInvoice } from "../types/invoicing.types"
import { PageHeader, PageLoading } from "./page-shell"
import { EmptyState, FilterTabs, InvoicingLocked, KpiCard, PRIMARY_BUTTON } from "./primitives"
import { InvoiceStatusPill, useDocumentLabel, ZatcaPill } from "./status"
import { HEADING, MUTED, PANEL } from "./styles"
import { useZatcaReadiness, ZatcaReadinessBanner } from "./zatca-readiness"

import { type Locale, localeDirection } from "@/i18n/locales"

type InvoiceTab = "all" | "draft" | "unpaid" | "overdue" | "paid" | "zatca"
type NoteTab = "all" | "credit_note" | "debit_note" | "draft"
type Tab = InvoiceTab | NoteTab

const INVOICE_TABS: InvoiceTab[] = ["all", "draft", "unpaid", "overdue", "paid", "zatca"]
const NOTE_TABS: NoteTab[] = ["all", "credit_note", "debit_note", "draft"]

// Notes are every document that is not an invoice; their list has no KPI row, so no summary.
async function fetchDocuments(notes: boolean): Promise<[SalesInvoice[], InvoiceSummary | null]> {
  if (!notes) {
    return Promise.all([
      salesInvoiceService.list({ documentType: "invoice" }),
      salesInvoiceService.summary(),
    ])
  }
  const list = await salesInvoiceService.list({ documentType: "all" })
  return [list.filter((item) => item.documentType !== "invoice"), null]
}

const isDraft = (invoice: SalesInvoice) =>
  invoice.status === "draft" || invoice.status === "pending_clearance"

function inTab(invoice: SalesInvoice, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true
    case "draft":
      return isDraft(invoice)
    case "unpaid":
      return (
        invoice.status === "issued" &&
        (invoice.paymentStatus === "unpaid" || invoice.paymentStatus === "partial")
      )
    case "overdue":
      return invoice.overdue
    case "paid":
      return invoice.status === "issued" && invoice.paymentStatus === "paid"
    case "zatca":
      return invoice.zatca.status === "rejected" || invoice.zatca.status === "pending"
    default:
      return invoice.documentType === tab
  }
}

// Tax invoices, or (variant "notes") the credit and debit notes raised against them.
export function InvoicesListPage({ variant = "invoices" }: { variant?: "invoices" | "notes" }) {
  const notes = variant === "notes"
  const t = useTranslations(notes ? "invoicing.notes" : "invoicing.invoices")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { enabled, canManage } = useInvoicingAccess()
  const { money, date } = useFormatters()
  const describeError = useInvoicingError()
  const documentLabel = useDocumentLabel()
  const readiness = useZatcaReadiness(enabled)
  const [items, setItems] = useState<SalesInvoice[] | null>(null)
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!enabled) return
    let stale = false
    fetchDocuments(notes).then(
      ([list, totals]) => {
        if (stale) return
        setItems(list)
        setSummary(totals)
      },
      (error) => {
        if (stale) return
        setItems([])
        toast.error(describeError(error))
      }
    )
    return () => {
      stale = true
    }
  }, [enabled, notes, describeError])

  const searched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !items) return items ?? []
    return items.filter((invoice) =>
      [
        invoice.number,
        invoice.customer.name,
        invoice.customer.vatNumber,
        invoice.title,
        invoice.reference,
        invoice.quotationNumber,
        invoice.originalInvoiceNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [items, search])
  const rows = useMemo(() => searched.filter((invoice) => inTab(invoice, tab)), [searched, tab])

  if (!enabled) return <InvoicingLocked />

  const newButton =
    canManage && !notes ? (
      <Link
        href={ROUTES.salesInvoicesNew}
        className={cn(PRIMARY_BUTTON, "inline-flex items-center")}
      >
        <Plus className="size-4" />
        {t("new")}
      </Link>
    ) : null
  const tabs: Tab[] = notes ? NOTE_TABS : INVOICE_TABS

  return (
    <div dir={localeDirection(locale)} className="space-y-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={newButton} />

      {notes ? null : (
        <>
          <ZatcaReadinessBanner readiness={readiness} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Wallet}
              tone="info"
              label={t("kpi.outstanding")}
              value={money(summary?.outstanding ?? 0)}
              hint={t("kpi.outstandingHint")}
            />
            <KpiCard
              icon={Clock4}
              tone="danger"
              label={t("kpi.overdue")}
              value={money(summary?.overdue ?? 0)}
              hint={t("kpi.overdueHint", { count: summary?.overdueCount ?? 0 })}
            />
            <KpiCard
              icon={CircleDollarSign}
              tone="success"
              label={t("kpi.paid")}
              value={money(summary?.paidThisMonth ?? 0)}
              hint={t("kpi.paidHint", { amount: money(summary?.issuedThisMonth ?? 0) })}
            />
            <KpiCard
              icon={ShieldAlert}
              tone={summary?.zatcaAttention ? "warning" : "accent"}
              label={t("kpi.zatca")}
              value={summary?.zatcaAttention ?? 0}
              hint={t("kpi.zatcaHint", { count: summary?.draftCount ?? 0 })}
            />
          </div>
        </>
      )}

      {items === null ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={notes ? FileMinus2 : ReceiptText}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            notes ? (
              <Link
                href={ROUTES.salesInvoices}
                className={cn(PRIMARY_BUTTON, "inline-flex items-center")}
              >
                {t("empty.cta")}
              </Link>
            ) : (
              newButton
            )
          }
        />
      ) : (
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <FilterTabs
              value={tab}
              onChange={setTab}
              options={tabs.map((value) => ({
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
            <AppTable className="min-w-[940px]">
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>{t("table.number")}</AppTableHead>
                  <AppTableHead>{t("table.customer")}</AppTableHead>
                  <AppTableHead>{t("table.issueDate")}</AppTableHead>
                  <AppTableHead>{notes ? t("table.original") : t("table.dueDate")}</AppTableHead>
                  <AppTableHead className="text-end">{t("table.total")}</AppTableHead>
                  {notes ? null : (
                    <AppTableHead className="text-end">{t("table.balance")}</AppTableHead>
                  )}
                  <AppTableHead>{t("table.status")}</AppTableHead>
                  <AppTableHead>{t("table.zatca")}</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {rows.map((invoice) => (
                  <AppTableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => router.push(ROUTES.salesInvoiceDetails(invoice.id))}
                  >
                    <AppTableCell>
                      <span className={cn("block text-[13px] font-extrabold", HEADING)} dir="ltr">
                        {invoice.number ?? "—"}
                      </span>
                      <span className={cn("block text-[11.5px]", MUTED)}>
                        {documentLabel(invoice)}
                      </span>
                    </AppTableCell>
                    <AppTableCell>
                      <span
                        className={cn(
                          "block max-w-[240px] truncate text-[13px] font-bold",
                          HEADING
                        )}
                      >
                        {invoice.customer.name}
                      </span>
                      {invoice.title ? (
                        <span className={cn("block max-w-[240px] truncate text-[11.5px]", MUTED)}>
                          {invoice.title}
                        </span>
                      ) : null}
                    </AppTableCell>
                    <AppTableCell className={MUTED}>{date(invoice.issueDate)}</AppTableCell>
                    <AppTableCell
                      className={invoice.overdue ? "font-semibold text-[#dc2626]" : MUTED}
                    >
                      {notes ? (
                        <span dir="ltr">{invoice.originalInvoiceNumber ?? "—"}</span>
                      ) : (
                        date(invoice.dueDate)
                      )}
                    </AppTableCell>
                    <AppTableCell className={cn("text-end font-extrabold tabular-nums", HEADING)}>
                      {money(invoice.totalAmount)}
                    </AppTableCell>
                    {notes ? null : (
                      <AppTableCell
                        className={cn(
                          "text-end font-bold tabular-nums",
                          invoice.status === "issued" && invoice.balance > 0 ? HEADING : MUTED
                        )}
                      >
                        {invoice.status === "issued" ? money(invoice.balance) : "—"}
                      </AppTableCell>
                    )}
                    <AppTableCell>
                      <InvoiceStatusPill invoice={invoice} />
                    </AppTableCell>
                    <AppTableCell>
                      <ZatcaPill invoice={invoice} />
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
    </div>
  )
}
