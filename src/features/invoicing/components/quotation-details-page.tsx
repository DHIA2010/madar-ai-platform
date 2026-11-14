"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  Check,
  ChevronLeft,
  Copy,
  FileOutput,
  GitBranch,
  History,
  MoreHorizontal,
  Pencil,
  Printer,
  Send,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "@/components/app"

import { useFormatters, useInvoicingAccess, useInvoicingError } from "../hooks/use-invoicing"
import { quotationService } from "../services/invoicing.service"
import type { QuotationDetail } from "../types/invoicing.types"
import { ConvertDialog } from "./convert-dialog"
import { DocumentPaper, quotationPaper } from "./document-paper"
import { InfoRow, PageError, PageHeader, PageLoading, PaperStage, SideCard } from "./page-shell"
import {
  afterMenuCloses,
  InvoicingLocked,
  Pill,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TextArea,
} from "./primitives"
import { printDocument, PrintSheet } from "./print"
import { publicLink, ShareDialog } from "./share-dialog"
import { QuotationBillingPill, QuotationStatusPill } from "./status"
import { HEADING, MUTED } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

type Confirm = "accept" | "draft" | "delete" | "revise" | null

export function QuotationDetailsPage({ quotationId }: { quotationId: string }) {
  const t = useTranslations("invoicing.quotation")
  const tCommon = useTranslations("invoicing.common")
  const tSectors = useTranslations("invoicing.sectors")
  const tStatus = useTranslations("invoicing.status")
  const tDocs = useTranslations("invoicing.docTypes")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { enabled, checking, canManage } = useInvoicingAccess()
  const { money, date } = useFormatters()
  const describeError = useInvoicingError()
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setQuotation(await quotationService.get(quotationId))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [quotationId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  const paper = useMemo(() => (quotation ? quotationPaper(quotation) : null), [quotation])

  if (!enabled) return checking ? null : <InvoicingLocked />
  if (failed) return <PageError message={t("notFound")} onRetry={load} />
  if (!quotation || !paper) return <PageLoading />

  const status = quotation.displayStatus
  const superseded = status === "superseded"
  const billable = !superseded && status !== "declined" && quotation.billingStatus !== "full"
  const editable =
    (quotation.status === "draft" ||
      quotation.status === "sent" ||
      quotation.status === "declined") &&
    quotation.invoiceCount === 0
  const shareable = quotation.status !== "draft" && !superseded
  const latest = quotation.revisions.reduce(
    (best, entry) => (entry.revision > best.revision ? entry : best),
    quotation.revisions[0] ?? { id: quotation.id, revision: quotation.revision }
  )

  // Runs a change, shows what the server said, and keeps the page on the result.
  const run = async (action: () => Promise<QuotationDetail | void>, success?: string) => {
    setBusy(true)
    try {
      const result = await action()
      if (result) setQuotation(result)
      if (success) toast.success(success)
      return true
    } catch (error) {
      toast.error(describeError(error))
      return false
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const send = async () => {
    if (quotation.status === "draft") {
      const sent = await run(() => quotationService.setStatus(quotation.id, "sent"), t("sent"))
      if (!sent) return
    }
    setShareOpen(true)
  }

  const confirmAction = async () => {
    if (confirm === "accept") {
      await run(() => quotationService.setStatus(quotation.id, "accepted"), t("accepted"))
    } else if (confirm === "draft") {
      await run(() => quotationService.setStatus(quotation.id, "draft"), t("backToDraft"))
    } else if (confirm === "revise") {
      setBusy(true)
      try {
        const revision = await quotationService.revise(quotation.id)
        toast.success(t("revised", { revision: revision.revision }))
        router.push(ROUTES.quotationEdit(revision.id))
      } catch (error) {
        toast.error(describeError(error))
        setBusy(false)
        setConfirm(null)
      }
    } else if (confirm === "delete") {
      const removed = await run(() => quotationService.remove(quotation.id), t("deleted"))
      if (removed) router.push(ROUTES.quotations)
    }
  }

  const duplicate = async () => {
    try {
      const copy = await quotationService.duplicate(quotation.id)
      toast.success(t("duplicated"))
      router.push(ROUTES.quotationEdit(copy.id))
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const convertButton = (primary: boolean) => (
    <AppButton
      onClick={() => setConvertOpen(true)}
      icon={<FileOutput className="size-4" />}
      className={primary ? PRIMARY_BUTTON : SECONDARY_BUTTON}
      variant={primary ? "default" : "outline"}
    >
      {t("actions.convert")}
    </AppButton>
  )

  return (
    <div dir={localeDirection(locale)} className="space-y-5 pb-10">
      <PageHeader
        backHref={ROUTES.quotations}
        title={
          <span dir="ltr" className="inline-block">
            {quotation.number}
          </span>
        }
        subtitle={[quotation.customer.name, quotation.title].filter(Boolean).join(" · ")}
        badges={
          <>
            {quotation.revision > 1 ? (
              <Pill tone="accent">{t("revision", { revision: quotation.revision })}</Pill>
            ) : null}
            <QuotationStatusPill quotation={quotation} />
            <QuotationBillingPill quotation={quotation} />
          </>
        }
        actions={
          <>
            {canManage && quotation.status === "draft" ? (
              <AppButton
                loading={busy}
                onClick={send}
                icon={<Send className="size-4" />}
                className={PRIMARY_BUTTON}
              >
                {t("actions.send")}
              </AppButton>
            ) : null}
            {canManage && billable && quotation.status !== "draft" ? convertButton(true) : null}
            {canManage && status === "declined" ? (
              <AppButton
                onClick={() => setConfirm("revise")}
                icon={<GitBranch className="size-4" />}
                className={PRIMARY_BUTTON}
              >
                {t("actions.revise")}
              </AppButton>
            ) : null}
            {canManage && (status === "sent" || status === "expired") ? (
              <AppButton
                variant="outline"
                onClick={() => setConfirm("accept")}
                icon={<Check className="size-4 text-[#15803d]" />}
                className={SECONDARY_BUTTON}
              >
                {t("actions.accept")}
              </AppButton>
            ) : null}
            {canManage && editable && quotation.status === "draft" ? (
              <AppButton asChild variant="outline" className={SECONDARY_BUTTON}>
                <Link href={ROUTES.quotationEdit(quotation.id)}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </Link>
              </AppButton>
            ) : null}
            {shareable ? (
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
            {canManage ? (
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
                  {billable && quotation.status === "draft" ? (
                    <AppDropdownMenuItem onSelect={afterMenuCloses(() => setConvertOpen(true))}>
                      <FileOutput className="size-4" />
                      {t("actions.convert")}
                    </AppDropdownMenuItem>
                  ) : null}
                  {editable && quotation.status !== "draft" ? (
                    <AppDropdownMenuItem
                      onSelect={() => router.push(ROUTES.quotationEdit(quotation.id))}
                    >
                      <Pencil className="size-4" />
                      {tCommon("edit")}
                    </AppDropdownMenuItem>
                  ) : null}
                  {status === "sent" || status === "expired" ? (
                    <>
                      <AppDropdownMenuItem onSelect={afterMenuCloses(() => setDeclineOpen(true))}>
                        <X className="size-4" />
                        {t("actions.decline")}
                      </AppDropdownMenuItem>
                      {quotation.invoiceCount === 0 ? (
                        <AppDropdownMenuItem onSelect={afterMenuCloses(() => setConfirm("draft"))}>
                          <Undo2 className="size-4" />
                          {t("actions.backToDraft")}
                        </AppDropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                  {!superseded && !editable ? (
                    <AppDropdownMenuItem onSelect={afterMenuCloses(() => setConfirm("revise"))}>
                      <GitBranch className="size-4" />
                      {t("actions.revise")}
                    </AppDropdownMenuItem>
                  ) : null}
                  <AppDropdownMenuItem onSelect={() => void duplicate()}>
                    <Copy className="size-4" />
                    {tCommon("duplicate")}
                  </AppDropdownMenuItem>
                  {quotation.invoiceCount === 0 ? (
                    <>
                      <AppDropdownMenuSeparator />
                      <AppDropdownMenuItem
                        className="text-[#dc2626] focus:text-[#dc2626]"
                        onSelect={afterMenuCloses(() => setConfirm("delete"))}
                      >
                        <Trash2 className="size-4" />
                        {tCommon("delete")}
                      </AppDropdownMenuItem>
                    </>
                  ) : null}
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            ) : null}
          </>
        }
      />

      {superseded && latest.id !== quotation.id ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#fde3b0] bg-[#fffaf0] px-4 py-3">
          <p className="text-[12.5px] font-semibold text-[#92400e]">
            {t("supersededBanner", { revision: latest.revision })}
          </p>
          <Link
            href={ROUTES.quotationDetails(latest.id)}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-4 text-[12.5px] font-bold text-[#b45309] ring-1 ring-[#fde3b0]"
          >
            {t("openLatest")}
            <ChevronLeft className="size-3.5 ltr:rotate-180" />
          </Link>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PaperStage>
          <DocumentPaper data={paper} />
        </PaperStage>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <SideCard>
            <p className={cn("text-[12px] font-semibold", MUTED)}>{t("summary.total")}</p>
            <p className={cn("mt-1 text-[28px] leading-9 font-black tabular-nums", HEADING)}>
              {money(quotation.totalAmount)}
              <span className={cn("ms-1.5 text-[12px] font-bold", MUTED)}>{tCommon("sar")}</span>
            </p>
            <dl className="mt-3 border-t border-[#eef1f6] pt-2">
              <InfoRow label={t("summary.customer")} value={quotation.customer.name} />
              <InfoRow label={t("summary.sector")} value={tSectors(`${quotation.sector}.name`)} />
              <InfoRow label={t("summary.issueDate")} value={date(quotation.issueDate)} />
              <InfoRow
                label={t("summary.validUntil")}
                value={quotation.validUntil ? date(quotation.validUntil) : t("summary.noExpiry")}
                tone={status === "expired" ? "danger" : undefined}
              />
              <InfoRow label={t("summary.beforeVat")} value={money(quotation.taxableAmount)} />
              <InfoRow label={t("summary.vat")} value={money(quotation.taxAmount)} />
              {quotation.advancePercent > 0 ? (
                <InfoRow
                  label={t("summary.advance", { percent: quotation.advancePercent })}
                  value={money((quotation.totalAmount * quotation.advancePercent) / 100)}
                />
              ) : null}
              {quotation.retentionPercent > 0 ? (
                <InfoRow
                  label={t("summary.retention", { percent: quotation.retentionPercent })}
                  value={money((quotation.taxableAmount * quotation.retentionPercent) / 100)}
                />
              ) : null}
            </dl>
          </SideCard>

          {quotation.respondedBy || quotation.declineReason ? (
            <SideCard title={t("response.title")}>
              <dl>
                {quotation.respondedBy ? (
                  <InfoRow label={t("response.by")} value={quotation.respondedBy} />
                ) : null}
                {quotation.respondedAt ? (
                  <InfoRow label={t("response.at")} value={date(quotation.respondedAt)} />
                ) : null}
              </dl>
              {quotation.declineReason ? (
                <p className="mt-2 rounded-[12px] bg-[#fef1f1] px-3 py-2 text-[12.5px] leading-6 text-[#b42318]">
                  {quotation.declineReason}
                </p>
              ) : null}
            </SideCard>
          ) : null}

          {superseded ? null : (
            <SideCard title={t("billing.title")}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("text-[12.5px]", MUTED)}>
                  {t("billing.billed", {
                    amount: money(quotation.billedAmount),
                    total: money(quotation.subtotal),
                  })}
                </p>
                <p className={cn("text-[13px] font-extrabold tabular-nums", HEADING)}>
                  {Math.round(quotation.billedPercent)}%
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef1f6]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    quotation.billingStatus === "full" ? "bg-[#16a34a]" : "bg-[#4f46e5]"
                  )}
                  style={{ width: `${Math.min(100, quotation.billedPercent)}%` }}
                />
              </div>
              {quotation.invoices.length ? (
                <ul className="mt-3 space-y-1.5">
                  {quotation.invoices.map((invoice) => (
                    <li key={invoice.id}>
                      <Link
                        href={ROUTES.salesInvoiceDetails(invoice.id)}
                        className="flex items-center justify-between gap-2 rounded-[12px] border border-[#eef1f6] px-3 py-2 hover:bg-[#f7f9fc]"
                      >
                        <span className="min-w-0">
                          <span className={cn("block text-[12.5px] font-bold", HEADING)}>
                            {invoice.invoiceKind === "advance"
                              ? tDocs("advance")
                              : invoice.invoiceKind === "progress"
                                ? tDocs("progress", { number: invoice.claimNumber ?? 1 })
                                : tDocs("invoice")}
                          </span>
                          <span className={cn("block text-[11px]", MUTED)}>
                            <span dir="ltr">{invoice.number ?? tStatus("invoice.draft")}</span>
                            {" · "}
                            {date(invoice.issueDate)}
                          </span>
                        </span>
                        <span className="text-end">
                          <span
                            className={cn(
                              "block text-[12.5px] font-extrabold tabular-nums",
                              HEADING
                            )}
                          >
                            {money(invoice.totalAmount)}
                          </span>
                          <span
                            className={cn(
                              "block text-[10.5px] font-bold",
                              invoice.status === "issued" ? "text-[#15803d]" : "text-[#8a97ad]"
                            )}
                          >
                            {invoice.status === "issued"
                              ? tStatus("invoice.issued")
                              : tStatus("invoice.draft")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={cn("mt-3 text-[12px] leading-5", MUTED)}>{t("billing.none")}</p>
              )}
              {canManage && billable ? (
                <AppButton
                  fullWidth
                  onClick={() => setConvertOpen(true)}
                  icon={<FileOutput className="size-4" />}
                  className={cn(PRIMARY_BUTTON, "mt-3 w-full justify-center")}
                >
                  {quotation.invoices.length ? t("billing.next") : t("actions.convert")}
                </AppButton>
              ) : null}
            </SideCard>
          )}

          {quotation.revisions.length > 1 ? (
            <SideCard
              title={t("revisions.title")}
              action={<History className="size-4 text-[#8a97ad]" />}
            >
              <ul className="space-y-1">
                {[...quotation.revisions]
                  .sort((a, b) => b.revision - a.revision)
                  .map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={ROUTES.quotationDetails(entry.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[12.5px]",
                          entry.id === quotation.id ? "bg-[#f5f6ff]" : "hover:bg-[#f7f9fc]"
                        )}
                      >
                        <span
                          className={cn(
                            "font-bold",
                            entry.id === quotation.id ? "text-[#4f46e5]" : HEADING
                          )}
                        >
                          {t("revision", { revision: entry.revision })}
                        </span>
                        <span className={MUTED}>
                          {tStatus(`quotation.${entry.status}`)} · {date(entry.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </SideCard>
          ) : null}
        </aside>
      </div>

      <AppConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? t(`confirm.${confirm}.title`) : ""}
        description={confirm ? t(`confirm.${confirm}.description`) : ""}
        confirmLabel={confirm ? t(`confirm.${confirm}.cta`) : ""}
        cancelLabel={tCommon("cancel")}
        confirmTone={confirm === "delete" ? "destructive" : "default"}
        confirmButtonClassName={
          confirm && confirm !== "delete" ? "bg-[#4f46e5] font-bold hover:bg-[#4338ca]" : undefined
        }
        loading={busy}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      />

      <AppDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title={t("decline.title")}
        description={t("decline.description")}
        contentClassName="max-w-[28rem] rounded-[22px] p-6"
        footer={
          <>
            <AppButton
              variant="outline"
              onClick={() => setDeclineOpen(false)}
              className={SECONDARY_BUTTON}
            >
              {tCommon("cancel")}
            </AppButton>
            <AppButton
              loading={busy}
              onClick={async () => {
                const declined = await run(
                  () =>
                    quotationService.setStatus(
                      quotation.id,
                      "declined",
                      declineReason.trim() || undefined
                    ),
                  t("declined")
                )
                if (declined) setDeclineOpen(false)
              }}
              className={cn(PRIMARY_BUTTON, "bg-[#dc2626] shadow-none hover:bg-[#b91c1c]")}
            >
              {t("decline.cta")}
            </AppButton>
          </>
        }
      >
        <TextArea
          rows={3}
          value={declineReason}
          onChange={setDeclineReason}
          placeholder={t("decline.placeholder")}
        />
      </AppDialog>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={t("share.title")}
        description={t("share.description")}
        link={publicLink(ROUTES.publicQuotation(quotation.publicToken))}
        message={t("share.message", { number: quotation.number, seller: quotation.seller.name })}
        subject={t("share.subject", { number: quotation.number, seller: quotation.seller.name })}
        phone={quotation.customer.phone}
        email={quotation.customer.email}
      />

      {convertOpen ? (
        <ConvertDialog quotation={quotation} open onOpenChange={setConvertOpen} />
      ) : null}

      <PrintSheet data={paper} />
    </div>
  )
}
