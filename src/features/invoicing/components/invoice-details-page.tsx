"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowUpLeft,
  BadgeCheck,
  Banknote,
  FileCode2,
  FileMinus2,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Printer,
  RefreshCw,
  Share2,
  ShieldAlert,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from "@/components/app"

import {
  errorCode,
  errorDetails,
  useFormatters,
  useInvoicingAccess,
  useInvoicingError,
} from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type { SalesInvoiceDetail } from "../types/invoicing.types"
import { DocumentPaper, invoicePaper } from "./document-paper"
import { NoteDialog } from "./note-dialog"
import { InfoRow, PageError, PageHeader, PageLoading, PaperStage, SideCard } from "./page-shell"
import { PaymentDialog } from "./payment-dialog"
import { afterMenuCloses, InvoicingLocked, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./primitives"
import { printDocument, PrintSheet } from "./print"
import { publicLink, ShareDialog } from "./share-dialog"
import { InvoiceStatusPill, useDocumentLabel, ZatcaPill } from "./status"
import { HEADING, MUTED } from "./styles"
import { useZatcaReadiness, ZatcaReadinessBanner } from "./zatca-readiness"

import { type Locale, localeDirection } from "@/i18n/locales"

type Confirm = { kind: "issue" } | { kind: "delete" } | { kind: "payment"; id: string } | null

// What stopped the invoice from being issued, and where it's fixed.
type IssueProblem =
  | { kind: "buyer"; fields: string[] }
  | { kind: "seller"; fields: string[] }
  | { kind: "device" }

const ROW_LINK =
  "flex items-center justify-between gap-2 rounded-[12px] border border-[#eef1f6] px-3 py-2 hover:bg-[#f7f9fc]"

export function InvoiceDetailsPage({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("invoicing.invoice")
  const tZatca = useTranslations("invoicing.zatca")
  const tPayments = useTranslations("invoicing.payments")
  const tMethods = useTranslations("invoicing.paymentMethods")
  const tReasons = useTranslations("invoicing.adjustmentReasons")
  const tBuyer = useTranslations("invoicing.buyerFields")
  const tSeller = useTranslations("invoicing.sellerFields")
  const tStatus = useTranslations("invoicing.status")
  const tCommon = useTranslations("invoicing.common")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { enabled, checking, canManage } = useInvoicingAccess()
  const { money, date } = useFormatters()
  const describeError = useInvoicingError()
  const documentLabel = useDocumentLabel()
  const [invoice, setInvoice] = useState<SalesInvoiceDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [problem, setProblem] = useState<IssueProblem | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [noteType, setNoteType] = useState<"credit_note" | "debit_note" | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const readiness = useZatcaReadiness(enabled && invoice?.status === "draft")

  const load = useCallback(async () => {
    try {
      setInvoice(await salesInvoiceService.get(invoiceId))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [invoiceId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  const paper = useMemo(() => (invoice ? invoicePaper(invoice) : null), [invoice])

  if (!enabled) return checking ? null : <InvoicingLocked />
  if (failed) return <PageError message={t("notFound")} onRetry={load} />
  if (!invoice || !paper) return <PageLoading />

  const draft = invoice.status === "draft"
  const issued = invoice.status === "issued"
  const isInvoice = invoice.documentType === "invoice"
  const isCredit = invoice.documentType === "credit_note"
  const totalLabel = t(isInvoice ? "amounts.total" : "amounts.noteTotal")
  const label = documentLabel(invoice)
  const refused = draft && invoice.zatca.status === "rejected"
  const waiting = invoice.status === "pending_clearance" || invoice.zatca.status === "pending"
  const payable = issued && !isCredit && invoice.balance > 0
  const zatcaError =
    (locale === "ar" ? invoice.zatca.lastErrorAr : invoice.zatca.lastError) ??
    invoice.zatca.lastError ??
    invoice.zatca.lastErrorAr
  const collected =
    invoice.amountDue > 0 ? Math.min(100, (invoice.paidAmount / invoice.amountDue) * 100) : 0

  // ZATCA answers inside the invoice (a refused one comes back as a draft with the reason);
  // what the server checks before sending arrives as an error naming what's missing.
  const send = async (action: () => Promise<SalesInvoiceDetail>) => {
    setBusy(true)
    setProblem(null)
    try {
      const result = await action()
      setInvoice(result)
      const outcome = result.documentType === "invoice" ? "issue" : "issueNote"
      if (result.status === "draft" && result.zatca.status === "rejected") {
        toast.error(t(`${outcome}.refused`))
      } else if (result.status === "pending_clearance" || result.zatca.status === "pending") {
        toast.message(t(`${outcome}.waiting`))
      } else if (result.zatca.status === "cleared") {
        toast.success(t(`${outcome}.cleared`))
      } else if (result.zatca.status === "reported") {
        toast.success(t(`${outcome}.reported`))
      } else {
        toast.success(t(`${outcome}.done`))
      }
    } catch (error) {
      const code = errorCode(error)
      const fields = errorDetails<{ fields?: string[] }>(error)?.fields ?? []
      if (code === "SALES_INVOICE_BUYER_INCOMPLETE") setProblem({ kind: "buyer", fields })
      else if (code === "SALES_INVOICE_SELLER_INCOMPLETE") setProblem({ kind: "seller", fields })
      else if (code === "ZATCA_DEVICE_STANDARD_UNSUPPORTED") setProblem({ kind: "device" })
      else toast.error(describeError(error))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const confirmAction = async () => {
    if (!confirm) return
    if (confirm.kind === "issue") {
      await send(() => salesInvoiceService.issue(invoice.id))
      return
    }
    setBusy(true)
    try {
      if (confirm.kind === "delete") {
        await salesInvoiceService.remove(invoice.id)
        toast.success(t("deleted"))
        router.push(isInvoice ? ROUTES.salesInvoices : ROUTES.salesNotes)
        return
      }
      setInvoice(await salesInvoiceService.removePayment(invoice.id, confirm.id))
      toast.success(tPayments("removed"))
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const downloadXml = async () => {
    try {
      await salesInvoiceService.downloadXml(invoice.id, invoice.number ?? invoice.id)
    } catch {
      toast.error(tZatca("xmlFailed"))
    }
  }

  const confirmKey =
    confirm?.kind === "issue"
      ? `issue${isInvoice ? "" : "Note"}${invoice.taxType === "standard" ? "Standard" : "Simplified"}`
      : confirm?.kind === "delete"
        ? "delete"
        : "payment"

  const problemFields =
    problem && problem.kind !== "device"
      ? problem.fields
          .map((field) => {
            const names = problem.kind === "buyer" ? tBuyer : tSeller
            return names.has(field) ? names(field) : field
          })
          .join(locale === "ar" ? "، " : ", ")
      : ""

  return (
    <div dir={localeDirection(locale)} className="space-y-5 pb-10">
      <PageHeader
        backHref={isInvoice ? ROUTES.salesInvoices : ROUTES.salesNotes}
        title={
          invoice.number ? (
            <span dir="ltr" className="inline-block">
              {invoice.number}
            </span>
          ) : (
            t("draftTitle", { type: label })
          )
        }
        subtitle={[invoice.number ? label : null, invoice.customer.name, invoice.title]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <>
            <InvoiceStatusPill invoice={invoice} />
            <ZatcaPill invoice={invoice} />
          </>
        }
        actions={
          <>
            {canManage && draft ? (
              <AppButton
                loading={busy && confirm === null}
                onClick={() => setConfirm({ kind: "issue" })}
                icon={<BadgeCheck className="size-4" />}
                className={PRIMARY_BUTTON}
              >
                {refused
                  ? t("actions.reissue")
                  : isInvoice
                    ? t("actions.issue")
                    : t("actions.issueNote")}
              </AppButton>
            ) : null}
            {canManage && payable ? (
              <AppButton
                onClick={() => setPaymentOpen(true)}
                icon={<Banknote className="size-4" />}
                className={PRIMARY_BUTTON}
              >
                {t("actions.recordPayment")}
              </AppButton>
            ) : null}
            {canManage && draft && isInvoice ? (
              <AppButton asChild variant="outline" className={SECONDARY_BUTTON}>
                <Link href={ROUTES.salesInvoiceEdit(invoice.id)}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </Link>
              </AppButton>
            ) : null}
            {issued ? (
              <AppButton
                variant="outline"
                onClick={() => setShareOpen(true)}
                icon={<Share2 className="size-4" />}
                className={SECONDARY_BUTTON}
              >
                {tCommon("share")}
              </AppButton>
            ) : null}
            <AppButton
              variant="outline"
              onClick={printDocument}
              icon={<Printer className="size-4" />}
              className={SECONDARY_BUTTON}
            >
              {tCommon("print")}
            </AppButton>
            {(canManage && (draft || (issued && isInvoice))) || invoice.zatca.signed ? (
              <AppDropdownMenu>
                <AppDropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={tCommon("actions")}
                    className="flex size-11 items-center justify-center rounded-full border border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fc]"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </AppDropdownMenuTrigger>
                <AppDropdownMenuContent align="end" className="min-w-52">
                  {canManage && issued && isInvoice ? (
                    <>
                      <AppDropdownMenuItem
                        onSelect={afterMenuCloses(() => setNoteType("credit_note"))}
                      >
                        <FileMinus2 className="size-4" />
                        {t("actions.creditNote")}
                      </AppDropdownMenuItem>
                      <AppDropdownMenuItem
                        onSelect={afterMenuCloses(() => setNoteType("debit_note"))}
                      >
                        <FilePlus2 className="size-4" />
                        {t("actions.debitNote")}
                      </AppDropdownMenuItem>
                    </>
                  ) : null}
                  {invoice.zatca.signed ? (
                    <AppDropdownMenuItem onSelect={() => void downloadXml()}>
                      <FileCode2 className="size-4" />
                      {tZatca("downloadXml")}
                    </AppDropdownMenuItem>
                  ) : null}
                  {canManage && draft && !invoice.zatca.signed ? (
                    <AppDropdownMenuItem
                      className="text-[#dc2626] focus:text-[#dc2626]"
                      onSelect={afterMenuCloses(() => setConfirm({ kind: "delete" }))}
                    >
                      <Trash2 className="size-4" />
                      {tCommon("delete")}
                    </AppDropdownMenuItem>
                  ) : null}
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            ) : null}
          </>
        }
      />

      {draft && !problem ? (
        <ZatcaReadinessBanner readiness={readiness} taxType={invoice.taxType} />
      ) : null}

      {problem ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#fbd5d5] bg-[#fff6f6] px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fee4e2] text-[#dc2626]">
              <ShieldAlert className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-extrabold text-[#912018]">
                {t(`problem.${problem.kind}.title`)}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-6 text-[#b42318]">
                {t(`problem.${problem.kind}.description`, { fields: problemFields })}
              </p>
            </div>
          </div>
          <Link
            href={
              problem.kind === "buyer"
                ? isInvoice
                  ? ROUTES.salesInvoiceEdit(invoice.id)
                  : ROUTES.salesInvoiceDetails(invoice.originalInvoiceId ?? invoice.id)
                : problem.kind === "seller"
                  ? ROUTES.settingsGeneral
                  : ROUTES.settingsZatca
            }
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-4 text-[12.5px] font-bold text-[#b42318] ring-1 ring-[#fbd5d5]"
          >
            {t(`problem.${problem.kind}.cta`)}
            <ArrowUpLeft className="size-3.5 ltr:-scale-x-100" />
          </Link>
        </div>
      ) : null}

      {refused && zatcaError && !problem ? (
        <div className="flex items-start gap-3 rounded-[16px] border border-[#fbd5d5] bg-[#fff6f6] px-4 py-3.5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fee4e2] text-[#dc2626]">
            <ShieldAlert className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-extrabold text-[#912018]">{tZatca("refusedTitle")}</p>
            <p className="mt-0.5 text-[12.5px] leading-6 break-words text-[#b42318]">
              {zatcaError}
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-[#b42318]/80">
              {tZatca("refusedHint")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PaperStage>
          <DocumentPaper data={paper} />
        </PaperStage>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <SideCard>
            <p className={cn("text-[12px] font-semibold", MUTED)}>
              {issued && !isCredit ? t("amounts.balance") : totalLabel}
            </p>
            <p
              className={cn(
                "mt-1 text-[28px] leading-9 font-black tabular-nums",
                issued && !isCredit && invoice.balance <= 0 ? "text-[#15803d]" : HEADING
              )}
            >
              {money(issued && !isCredit ? invoice.balance : invoice.totalAmount)}
              <span className={cn("ms-1.5 text-[12px] font-bold", MUTED)}>{tCommon("sar")}</span>
            </p>
            {issued && isInvoice && invoice.amountDue > 0 ? (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-[#eef1f6]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      collected >= 100 ? "bg-[#16a34a]" : "bg-[#4f46e5]"
                    )}
                    style={{ width: `${collected}%` }}
                  />
                </div>
                <p className={cn("mt-1.5 text-[11.5px]", MUTED)}>
                  {t("amounts.collected", {
                    paid: money(invoice.paidAmount),
                    total: money(invoice.amountDue),
                  })}
                </p>
              </div>
            ) : null}
            <dl className="mt-3 border-t border-[#eef1f6] pt-2">
              <InfoRow label={t("amounts.customer")} value={invoice.customer.name} />
              <InfoRow label={t("amounts.issueDate")} value={date(invoice.issueDate)} />
              {isInvoice && invoice.dueDate ? (
                <InfoRow
                  label={t("amounts.dueDate")}
                  value={date(invoice.dueDate)}
                  tone={invoice.overdue ? "danger" : undefined}
                />
              ) : null}
              <InfoRow label={t("amounts.beforeVat")} value={money(invoice.taxableAmount)} />
              <InfoRow label={t("amounts.vat")} value={money(invoice.taxAmount)} />
              <InfoRow label={totalLabel} value={money(invoice.totalAmount)} strong />
              {invoice.prepaidAmount > 0 ? (
                <InfoRow label={t("amounts.prepaid")} value={`− ${money(invoice.prepaidAmount)}`} />
              ) : null}
              {invoice.retentionAmount > 0 ? (
                <InfoRow
                  label={t("amounts.retention", { percent: invoice.retentionPercent })}
                  value={`− ${money(invoice.retentionAmount)}`}
                />
              ) : null}
              {invoice.prepaidAmount > 0 || invoice.retentionAmount > 0 ? (
                <InfoRow label={t("amounts.amountDue")} value={money(invoice.amountDue)} strong />
              ) : null}
              {invoice.paidAmount > 0 ? (
                <InfoRow
                  label={t("amounts.paid")}
                  value={`− ${money(invoice.paidAmount)}`}
                  tone="success"
                />
              ) : null}
              {invoice.creditedAmount > 0 ? (
                <InfoRow
                  label={t("amounts.credited")}
                  value={`− ${money(invoice.creditedAmount)}`}
                />
              ) : null}
              {invoice.debitedAmount > 0 ? (
                <InfoRow label={t("amounts.debited")} value={`+ ${money(invoice.debitedAmount)}`} />
              ) : null}
            </dl>
            {invoice.adjustmentReasonCode ? (
              <p className="mt-2 rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-[12.5px] leading-6 text-[#344054]">
                <b className="font-bold">
                  {tReasons.has(invoice.adjustmentReasonCode)
                    ? tReasons(invoice.adjustmentReasonCode)
                    : invoice.adjustmentReasonCode}
                </b>
                {invoice.adjustmentReason ? ` — ${invoice.adjustmentReason}` : ""}
              </p>
            ) : null}
          </SideCard>

          <SideCard title={tZatca("title")} action={<ZatcaPill invoice={invoice} />}>
            {invoice.zatca.status === null ? (
              <p className={cn("text-[12.5px] leading-6", MUTED)}>
                {draft
                  ? invoice.taxType === "standard"
                    ? tZatca("draftStandard")
                    : tZatca("draftSimplified")
                  : tZatca("notLinked")}
              </p>
            ) : (
              <dl>
                {invoice.zatca.uuid ? (
                  <InfoRow
                    label="UUID"
                    value={
                      <span dir="ltr" className="font-mono text-[11px] break-all">
                        {invoice.zatca.uuid}
                      </span>
                    }
                  />
                ) : null}
                {invoice.zatca.icv !== null ? (
                  <InfoRow label={tZatca("icv")} value={invoice.zatca.icv} />
                ) : null}
                {invoice.zatca.invoiceHash ? (
                  <InfoRow
                    label={tZatca("hash")}
                    value={
                      <span dir="ltr" className="font-mono text-[11px] break-all">
                        {invoice.zatca.invoiceHash.slice(0, 24)}…
                      </span>
                    }
                  />
                ) : null}
                {invoice.zatca.submittedAt ? (
                  <InfoRow label={tZatca("submittedAt")} value={date(invoice.zatca.submittedAt)} />
                ) : null}
                {invoice.zatca.attempts > 1 ? (
                  <InfoRow label={tZatca("attempts")} value={invoice.zatca.attempts} />
                ) : null}
              </dl>
            )}
            {waiting ? (
              <p className="mt-2 rounded-[12px] bg-[#fff7e6] px-3 py-2 text-[12px] leading-5 text-[#92400e]">
                {zatcaError ?? tZatca("waitingHint")}
              </p>
            ) : null}
            {invoice.zatca.warnings.length ? (
              <div className="mt-2 rounded-[12px] bg-[#fff7e6] px-3 py-2">
                <p className="text-[11.5px] font-extrabold text-[#92400e]">{tZatca("warnings")}</p>
                <ul className="mt-1 list-disc space-y-0.5 ps-4 text-[11.5px] leading-5 text-[#92400e]">
                  {invoice.zatca.warnings.map((warning, index) => (
                    <li key={index} className="break-words">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canManage && (waiting || refused) ? (
              <AppButton
                fullWidth
                variant="outline"
                loading={busy && confirm === null}
                onClick={() => void send(() => salesInvoiceService.retryZatca(invoice.id))}
                icon={<RefreshCw className="size-4" />}
                className={cn(SECONDARY_BUTTON, "mt-3 w-full justify-center")}
              >
                {tZatca("retry")}
              </AppButton>
            ) : null}
            {invoice.zatca.signed ? (
              <button
                type="button"
                onClick={() => void downloadXml()}
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#4f46e5] hover:underline"
              >
                <FileCode2 className="size-3.5" />
                {tZatca("downloadXml")}
              </button>
            ) : null}
          </SideCard>

          {issued && !isCredit ? (
            <SideCard
              title={tPayments("title")}
              action={
                canManage && payable ? (
                  <button
                    type="button"
                    onClick={() => setPaymentOpen(true)}
                    className="text-[12.5px] font-bold text-[#4f46e5] hover:underline"
                  >
                    {tPayments("add")}
                  </button>
                ) : null
              }
            >
              {invoice.payments.length ? (
                <ul className="space-y-1.5">
                  {invoice.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex items-center justify-between gap-2 rounded-[12px] border border-[#eef1f6] px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className={cn("block text-[12.5px] font-bold", HEADING)}>
                          {tMethods.has(payment.method) ? tMethods(payment.method) : payment.method}
                        </span>
                        <span className={cn("block truncate text-[11px]", MUTED)}>
                          {[date(payment.paidOn), payment.reference].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-[12.5px] font-extrabold text-[#15803d] tabular-nums">
                          {money(payment.amount)}
                        </span>
                        {canManage ? (
                          <button
                            type="button"
                            aria-label={tPayments("remove")}
                            onClick={() => setConfirm({ kind: "payment", id: payment.id })}
                            className="flex size-7 items-center justify-center rounded-full text-[#a3b0c6] hover:bg-[#fef1f1] hover:text-[#dc2626]"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={cn("text-[12px] leading-5", MUTED)}>{tPayments("none")}</p>
              )}
            </SideCard>
          ) : null}

          {invoice.quotationId ||
          invoice.originalInvoiceId ||
          invoice.adjustments.length ||
          invoice.prepayments.length ||
          invoice.advanceRemaining !== null ? (
            <SideCard title={t("related.title")}>
              <ul className="space-y-1.5">
                {invoice.quotationId ? (
                  <li>
                    <Link href={ROUTES.quotationDetails(invoice.quotationId)} className={ROW_LINK}>
                      <span className={cn("text-[12.5px] font-bold", HEADING)}>
                        {t("related.quotation")}
                      </span>
                      <span dir="ltr" className={cn("text-[12px] font-semibold", MUTED)}>
                        {invoice.quotationNumber}
                      </span>
                    </Link>
                  </li>
                ) : null}
                {invoice.originalInvoiceId ? (
                  <li>
                    <Link
                      href={ROUTES.salesInvoiceDetails(invoice.originalInvoiceId)}
                      className={ROW_LINK}
                    >
                      <span className={cn("text-[12.5px] font-bold", HEADING)}>
                        {t("related.original")}
                      </span>
                      <span dir="ltr" className={cn("text-[12px] font-semibold", MUTED)}>
                        {invoice.originalInvoiceNumber}
                      </span>
                    </Link>
                  </li>
                ) : null}
                {invoice.prepayments.map((prepayment) => (
                  <li key={prepayment.id}>
                    <Link
                      href={ROUTES.salesInvoiceDetails(prepayment.advanceInvoiceId)}
                      className={ROW_LINK}
                    >
                      <span className="min-w-0">
                        <span className={cn("block text-[12.5px] font-bold", HEADING)}>
                          {t("related.prepayment")}
                        </span>
                        <span dir="ltr" className={cn("block text-[11px]", MUTED)}>
                          {prepayment.advanceInvoiceNumber}
                        </span>
                      </span>
                      <span className={cn("text-[12.5px] font-extrabold tabular-nums", HEADING)}>
                        {money(prepayment.netAmount + prepayment.taxAmount)}
                      </span>
                    </Link>
                  </li>
                ))}
                {invoice.adjustments.map((note) => (
                  <li key={note.id}>
                    <Link href={ROUTES.salesInvoiceDetails(note.id)} className={ROW_LINK}>
                      <span className="min-w-0">
                        <span className={cn("block text-[12.5px] font-bold", HEADING)}>
                          {documentLabel({
                            documentType: note.documentType,
                            invoiceKind: "regular",
                            taxType: invoice.taxType,
                            claimNumber: null,
                          })}
                        </span>
                        <span className={cn("block text-[11px]", MUTED)}>
                          <span dir="ltr">{note.number ?? tStatus("invoice.draft")}</span>
                          {" · "}
                          {date(note.issueDate)}
                        </span>
                      </span>
                      <span className="text-end">
                        <span
                          className={cn("block text-[12.5px] font-extrabold tabular-nums", HEADING)}
                        >
                          {money(note.totalAmount)}
                        </span>
                        <span
                          className={cn(
                            "block text-[10.5px] font-bold",
                            note.status === "issued" ? "text-[#15803d]" : "text-[#8a97ad]"
                          )}
                        >
                          {note.status === "issued"
                            ? tStatus("invoice.issued")
                            : tStatus("invoice.draft")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {invoice.advanceRemaining !== null ? (
                <p className={cn("mt-2 text-[12px] leading-5", MUTED)}>
                  {invoice.advanceRemaining > 0
                    ? t("related.advanceRemaining", { amount: money(invoice.advanceRemaining) })
                    : t("related.advanceUsed")}
                </p>
              ) : null}
            </SideCard>
          ) : null}
        </aside>
      </div>

      <AppConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? t(`confirm.${confirmKey}.title`) : ""}
        description={confirm ? t(`confirm.${confirmKey}.description`) : ""}
        confirmLabel={confirm ? t(`confirm.${confirmKey}.cta`) : ""}
        cancelLabel={tCommon("cancel")}
        confirmTone={confirm && confirm.kind !== "issue" ? "destructive" : "default"}
        confirmButtonClassName={
          confirm?.kind === "issue" ? "bg-[#4f46e5] font-bold hover:bg-[#4338ca]" : undefined
        }
        loading={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      />

      {paymentOpen ? (
        <PaymentDialog invoice={invoice} open onOpenChange={setPaymentOpen} onSaved={setInvoice} />
      ) : null}

      {noteType ? (
        <NoteDialog
          invoice={invoice}
          type={noteType}
          open
          onOpenChange={(open) => !open && setNoteType(null)}
        />
      ) : null}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={t("share.title")}
        description={t("share.description")}
        link={publicLink(ROUTES.publicSalesInvoice(invoice.publicToken))}
        message={t("share.message", { number: invoice.number ?? "", seller: invoice.seller.name })}
        subject={t("share.subject", { number: invoice.number ?? "", seller: invoice.seller.name })}
        phone={invoice.customer.phone}
        email={invoice.customer.email}
      />

      <PrintSheet data={paper} />
    </div>
  )
}
