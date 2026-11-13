"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  BadgeCheck,
  Check,
  CircleSlash,
  Clock3,
  FileCode2,
  FileX2,
  Loader2,
  Printer,
  ShieldCheck,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { errorCode, useFormatters, useInvoicingError } from "../hooks/use-invoicing"
import { publicDocumentService } from "../services/invoicing.service"
import type { QuotationDetail, SalesInvoiceDetail, Seller } from "../types/invoicing.types"
import { DocumentPaper, invoicePaper, quotationPaper } from "./document-paper"
import { PaperStage } from "./page-shell"
import { Field, PRIMARY_BUTTON, SECONDARY_BUTTON, TextArea, TextInput } from "./primitives"
import { printDocument, PrintSheet } from "./print"
import { HEADING, MUTED } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

type Loaded<T> = { state: "loading" } | { state: "missing" } | { state: "ready"; document: T }

// The page a customer opens from a shared link: the seller's name, the document, nothing else.
function PublicShell({
  seller,
  caption,
  actions,
  children,
}: {
  seller: Seller | null
  caption?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const t = useTranslations("invoicing.public")
  const locale = useLocale() as Locale
  return (
    <div dir={localeDirection(locale)} className="min-h-screen bg-[#f3f5f9]">
      <header className="sticky top-0 z-20 border-b border-[#e4e9f2] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[920px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            {seller?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the merchant's own logo URL
              <img
                src={seller.logoUrl}
                alt=""
                className="size-10 shrink-0 rounded-[10px] object-contain"
              />
            ) : seller ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef0ff] text-[15px] font-black text-[#4f46e5]">
                {seller.name.trim().charAt(0)}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className={cn("truncate text-[14.5px] font-extrabold", HEADING)}>{seller?.name}</p>
              {caption ? <p className={cn("truncate text-[11.5px]", MUTED)}>{caption}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[920px] space-y-4 px-3 py-5 sm:px-4 sm:py-7">
        {children}
      </main>
      <footer className={cn("pb-8 text-center text-[11.5px]", MUTED)}>{t("poweredBy")}</footer>
    </div>
  )
}

function PublicMessage({ loading }: { loading: boolean }) {
  const t = useTranslations("invoicing.public")
  const locale = useLocale() as Locale
  return (
    <div
      dir={localeDirection(locale)}
      className="flex min-h-screen items-center justify-center bg-[#f3f5f9] px-4"
    >
      {loading ? (
        <Loader2 className="size-7 animate-spin text-[#a3b0c6]" />
      ) : (
        <div className="w-full max-w-md rounded-[24px] bg-white px-6 py-10 text-center shadow-[0_30px_80px_-40px_rgba(11,23,56,0.35)] ring-1 ring-[#e9edf4]">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f1f3f7] text-[#6b7b96]">
            <FileX2 className="size-7" />
          </span>
          <h1 className={cn("mt-4 text-[18px] font-extrabold", HEADING)}>{t("missing.title")}</h1>
          <p className={cn("mt-2 text-[13px] leading-6", MUTED)}>{t("missing.description")}</p>
        </div>
      )}
    </div>
  )
}

function PrintButton() {
  const t = useTranslations("invoicing.public")
  return (
    <AppButton
      variant="outline"
      onClick={printDocument}
      icon={<Printer className="size-4" />}
      className={cn(SECONDARY_BUTTON, "h-10 px-4")}
    >
      {t("print")}
    </AppButton>
  )
}

// A strip above the sheet: what this is, how much, and what the reader can do about it.
function Summary({
  tone = "plain",
  icon,
  title,
  description,
  amountLabel,
  amount,
  children,
}: {
  tone?: "plain" | "success" | "danger" | "warning"
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  amountLabel: string
  amount: string
  children?: ReactNode
}) {
  const tCommon = useTranslations("invoicing.common")
  return (
    <section
      className={cn(
        "rounded-[20px] border bg-white p-4 shadow-[0_8px_30px_-18px_rgba(11,23,56,0.25)] sm:p-5",
        tone === "success"
          ? "border-[#bfe8cd]"
          : tone === "danger"
            ? "border-[#fbd5d5]"
            : tone === "warning"
              ? "border-[#fde3b0]"
              : "border-[#e4e9f2]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              className={cn(
                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full",
                tone === "success"
                  ? "bg-[#e9f8ef] text-[#15803d]"
                  : tone === "danger"
                    ? "bg-[#fef1f1] text-[#dc2626]"
                    : tone === "warning"
                      ? "bg-[#fff7e6] text-[#b45309]"
                      : "bg-[#eef0ff] text-[#4f46e5]"
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className={cn("text-[16px] leading-6 font-extrabold", HEADING)}>{title}</h1>
            {description ? (
              <p className={cn("mt-0.5 text-[12.5px] leading-6", MUTED)}>{description}</p>
            ) : null}
          </div>
        </div>
        <div className="text-end">
          <p className={cn("text-[11.5px] font-semibold", MUTED)}>{amountLabel}</p>
          <p className={cn("text-[24px] leading-8 font-black tabular-nums", HEADING)}>
            {amount}
            <span className={cn("ms-1.5 text-[12px] font-bold", MUTED)}>{tCommon("sar")}</span>
          </p>
        </div>
      </div>
      {children ? <div className="mt-4 border-t border-[#eef1f6] pt-4">{children}</div> : null}
    </section>
  )
}

export function PublicQuotationPage({ token }: { token: string }) {
  const t = useTranslations("invoicing.public.quotation")
  const tCommon = useTranslations("invoicing.common")
  const { money, date } = useFormatters()
  const describeError = useInvoicingError()
  const [loaded, setLoaded] = useState<Loaded<QuotationDetail>>({ state: "loading" })
  const [answer, setAnswer] = useState<"accept" | "decline" | null>(null)
  const [name, setName] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [justAnswered, setJustAnswered] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicDocumentService
      .quotation(token)
      .then((document) => !cancelled && setLoaded({ state: "ready", document }))
      .catch(() => !cancelled && setLoaded({ state: "missing" }))
    return () => {
      cancelled = true
    }
  }, [token])

  const quotation = loaded.state === "ready" ? loaded.document : null
  const paper = useMemo(() => (quotation ? quotationPaper(quotation) : null), [quotation])

  if (!quotation || !paper) return <PublicMessage loading={loaded.state === "loading"} />

  const status = quotation.displayStatus

  const respond = async () => {
    if (!answer) return
    if (name.trim().length < 2) {
      toast.error(t("dialog.nameRequired"))
      return
    }
    setBusy(true)
    try {
      const document = await publicDocumentService.respond(
        token,
        answer,
        name.trim(),
        answer === "decline" ? reason.trim() || null : null
      )
      setLoaded({ state: "ready", document })
      setJustAnswered(true)
      setAnswer(null)
    } catch (error) {
      toast.error(describeError(error))
      // Someone answered or withdrew it meanwhile: show where it stands now.
      if (errorCode(error) === "QUOTATION_CANNOT_RESPOND") {
        publicDocumentService
          .quotation(token)
          .then((document) => setLoaded({ state: "ready", document }))
          .catch(() => setLoaded({ state: "missing" }))
        setAnswer(null)
      }
    } finally {
      setBusy(false)
    }
  }

  const amount = money(quotation.totalAmount)
  const amountLabel = t("total")

  return (
    <PublicShell
      seller={quotation.seller}
      caption={
        <>
          {t("caption")} <span dir="ltr">{quotation.number}</span>
        </>
      }
      actions={<PrintButton />}
    >
      {status === "accepted" ? (
        <Summary
          tone="success"
          icon={<Check className="size-5" strokeWidth={2.6} />}
          title={justAnswered ? t("thanksAccepted") : t("accepted")}
          description={
            quotation.respondedBy
              ? t("acceptedBy", {
                  name: quotation.respondedBy,
                  date: quotation.respondedAt ? date(quotation.respondedAt) : "",
                })
              : t("acceptedHint", { seller: quotation.seller.name })
          }
          amountLabel={amountLabel}
          amount={amount}
        />
      ) : status === "declined" ? (
        <Summary
          tone="danger"
          icon={<X className="size-5" strokeWidth={2.6} />}
          title={justAnswered ? t("thanksDeclined") : t("declined")}
          description={t("declinedHint", { seller: quotation.seller.name })}
          amountLabel={amountLabel}
          amount={amount}
        />
      ) : status === "expired" ? (
        <Summary
          tone="warning"
          icon={<Clock3 className="size-5" />}
          title={t("expired")}
          description={t("expiredHint", { seller: quotation.seller.name })}
          amountLabel={amountLabel}
          amount={amount}
        />
      ) : status === "superseded" ? (
        <Summary
          tone="warning"
          icon={<CircleSlash className="size-5" />}
          title={t("superseded")}
          description={t("supersededHint", { seller: quotation.seller.name })}
          amountLabel={amountLabel}
          amount={amount}
        />
      ) : (
        <Summary
          title={t("heading", { seller: quotation.seller.name })}
          description={
            quotation.validUntil
              ? t("validUntil", { date: date(quotation.validUntil) })
              : (quotation.title ?? undefined)
          }
          amountLabel={amountLabel}
          amount={amount}
        >
          {quotation.canRespond ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn("text-[12.5px] leading-6", MUTED)}>{t("prompt")}</p>
              <div className="flex shrink-0 gap-2">
                <AppButton
                  variant="outline"
                  onClick={() => setAnswer("decline")}
                  className={cn(SECONDARY_BUTTON, "flex-1 justify-center sm:flex-none")}
                >
                  {t("decline")}
                </AppButton>
                <AppButton
                  onClick={() => setAnswer("accept")}
                  icon={<Check className="size-4" strokeWidth={2.6} />}
                  className={cn(
                    PRIMARY_BUTTON,
                    "flex-1 justify-center bg-[#16a34a] shadow-[0_10px_24px_-12px_rgba(22,163,74,0.7)] hover:bg-[#15803d] sm:flex-none"
                  )}
                >
                  {t("accept")}
                </AppButton>
              </div>
            </div>
          ) : null}
        </Summary>
      )}

      <PaperStage>
        <DocumentPaper data={paper} />
      </PaperStage>

      <AppDialog
        open={answer !== null}
        onOpenChange={(open) => !open && setAnswer(null)}
        title={
          <span className="text-[17px] font-extrabold">
            {answer === "decline" ? t("dialog.declineTitle") : t("dialog.acceptTitle")}
          </span>
        }
        description={
          answer === "decline"
            ? t("dialog.declineDescription")
            : t("dialog.acceptDescription", { amount, seller: quotation.seller.name })
        }
        contentClassName="max-w-[28rem] rounded-[22px] p-6"
        footer={
          <>
            <AppButton
              variant="outline"
              onClick={() => setAnswer(null)}
              className={SECONDARY_BUTTON}
            >
              {tCommon("cancel")}
            </AppButton>
            <AppButton
              loading={busy}
              onClick={respond}
              className={cn(
                PRIMARY_BUTTON,
                answer === "decline"
                  ? "bg-[#dc2626] shadow-none hover:bg-[#b91c1c]"
                  : "bg-[#16a34a] shadow-none hover:bg-[#15803d]"
              )}
            >
              {answer === "decline" ? t("dialog.confirmDecline") : t("dialog.confirmAccept")}
            </AppButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("dialog.name")} required>
            <TextInput
              value={name}
              onChange={setName}
              placeholder={t("dialog.namePlaceholder")}
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          {answer === "decline" ? (
            <Field label={t("dialog.reason")}>
              <TextArea
                rows={3}
                value={reason}
                onChange={setReason}
                placeholder={t("dialog.reasonPlaceholder")}
              />
            </Field>
          ) : null}
        </div>
      </AppDialog>

      <PrintSheet data={paper} />
    </PublicShell>
  )
}

export function PublicInvoicePage({ token }: { token: string }) {
  const t = useTranslations("invoicing.public.invoice")
  const { money, date } = useFormatters()
  const [loaded, setLoaded] = useState<Loaded<SalesInvoiceDetail>>({ state: "loading" })

  useEffect(() => {
    let cancelled = false
    publicDocumentService
      .invoice(token)
      .then((document) => !cancelled && setLoaded({ state: "ready", document }))
      .catch(() => !cancelled && setLoaded({ state: "missing" }))
    return () => {
      cancelled = true
    }
  }, [token])

  const invoice = loaded.state === "ready" ? loaded.document : null
  const paper = useMemo(() => (invoice ? invoicePaper(invoice) : null), [invoice])

  if (!invoice || !paper) return <PublicMessage loading={loaded.state === "loading"} />

  const note = invoice.documentType !== "invoice"
  const paid = !note && invoice.paymentStatus === "paid"
  const kind =
    invoice.documentType === "credit_note"
      ? t("creditNote")
      : invoice.documentType === "debit_note"
        ? t("debitNote")
        : t("invoice")

  return (
    <PublicShell
      seller={invoice.seller}
      caption={
        <>
          {kind} <span dir="ltr">{invoice.number}</span>
        </>
      }
      actions={
        <>
          {invoice.zatca.signed ? (
            <AppButton
              asChild
              variant="outline"
              className={cn(SECONDARY_BUTTON, "hidden h-10 px-4 sm:inline-flex")}
            >
              <a href={publicDocumentService.invoiceXmlUrl(token)} download>
                <FileCode2 className="size-4" />
                {t("xml")}
              </a>
            </AppButton>
          ) : null}
          <PrintButton />
        </>
      }
    >
      <Summary
        tone={paid ? "success" : invoice.overdue ? "danger" : "plain"}
        icon={paid ? <BadgeCheck className="size-5" /> : undefined}
        title={t("heading", { kind, seller: invoice.seller.name })}
        description={
          note
            ? date(invoice.issueDate)
            : paid
              ? t("paid")
              : invoice.dueDate
                ? t(invoice.overdue ? "overdue" : "dueOn", { date: date(invoice.dueDate) })
                : date(invoice.issueDate)
        }
        amountLabel={note || paid ? t("total") : t("balance")}
        amount={money(note || paid ? invoice.totalAmount : invoice.balance)}
      >
        {invoice.zatca.status === "cleared" || invoice.zatca.status === "reported" ? (
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#15803d]">
            <ShieldCheck className="size-4 shrink-0" />
            {t(`${invoice.zatca.status}${note ? "Note" : ""}`)}
          </p>
        ) : null}
      </Summary>

      <PaperStage>
        <DocumentPaper data={paper} />
      </PaperStage>

      <PrintSheet data={paper} />
    </PublicShell>
  )
}
