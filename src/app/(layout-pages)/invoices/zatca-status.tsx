"use client"

// The ZATCA pieces the sales-invoices and returns (credit notes) pages share: the status badge in
// the table, the "not reported yet" banner, the status rows of the detail panel and the button
// that sends one document again. A signed sale or return is reported automatically after it's
// saved (backend pos/zatca-reporting.ts) -- these show where it stands and allow a manual retry.

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import type { Locale } from "@/i18n/locales"
import { zatcaService } from "@/features/pos/services/zatca.service"

import { Button } from "@/components/ui/button"

export type ZatcaDocumentKind = "invoice" | "return"

// The ZATCA fields an invoice and a return both carry.
export interface ZatcaFields {
  zatcaSigned: boolean
  zatcaStatus: string | null
  zatcaReportedAt: string | null
  zatcaLastError: string | null
  zatcaLastErrorAr: string | null
}

type ZatcaState = "reported" | "rejected" | "failed" | "pending"

function zatcaState(document: ZatcaFields): ZatcaState {
  if (document.zatcaReportedAt) return "reported"
  if (document.zatcaStatus === "NOT_REPORTED") return "rejected"
  return document.zatcaLastError ? "failed" : "pending"
}

const STATE_TINT: Record<ZatcaState, { tint: string; dot: string }> = {
  reported: { tint: "bg-[#e9f8ef] text-[#1f9d55]", dot: "bg-[#1f9d55]" },
  rejected: { tint: "bg-[#fdecec] text-[#d92d20]", dot: "bg-[#d92d20]" },
  failed: { tint: "bg-[#fff6e5] text-[#b45309]", dot: "bg-[#f59e0b]" },
  pending: { tint: "bg-[#eef4ff] text-[#2878ff]", dot: "bg-[#2878ff]" },
}

// ZATCA's reason for not accepting it, in Arabic when the page is (ZATCA's own Arabic wording,
// stored next to the English one).
function zatcaReasonText(document: ZatcaFields, locale: Locale): string | null {
  return (locale === "ar" ? document.zatcaLastErrorAr : null) ?? document.zatcaLastError
}

// Reported, refused (ZATCA's reason on hover), couldn't be sent yet (retried automatically), or
// being sent. Unsigned documents (no production device at the time) have nothing to report.
export function ZatcaStatusBadge({ document }: { document: ZatcaFields }) {
  const t = useTranslations("invoices.zatca")
  const locale = useLocale() as Locale
  if (!document.zatcaSigned) return <span className="text-[12px] text-[#8098b4]">—</span>
  const state = zatcaState(document)
  const tint = STATE_TINT[state]
  return (
    <span
      title={state === "reported" ? undefined : (zatcaReasonText(document, locale) ?? undefined)}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tint.tint
      )}
    >
      <span className={cn("size-1.5 rounded-full", tint.dot)} />
      {t(`states.${state}`)}
    </span>
  )
}

// How many signed documents of this kind ZATCA hasn't accepted yet, linking to the list in the
// ZATCA settings. Renders nothing when there are none, or for anyone not allowed to see them.
export function ZatcaUnreportedBanner({ kind }: { kind: ZatcaDocumentKind }) {
  const t = useTranslations("invoices.zatca")
  const [count, setCount] = useState(0)
  useEffect(() => {
    zatcaService
      .listUnreported()
      .then((items) => setCount(items.filter((item) => item.kind === kind).length))
      .catch(() => setCount(0))
  }, [kind])
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#fde3b0] bg-[#fff8eb] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-4 shrink-0 text-[#b45309]" />
        <p className="text-[12.5px] font-semibold text-[#92400e]">
          {t(kind === "invoice" ? "banner.invoices" : "banner.returns", { count })}
        </p>
      </div>
      <Link
        href={ROUTES.settingsZatca}
        className="text-[12.5px] font-bold text-[#b45309] underline-offset-4 hover:underline"
      >
        {t("banner.link")}
      </Link>
    </div>
  )
}

// The status rows of a detail panel's <dl className="grid grid-cols-2">.
export function ZatcaDetailRows({
  document,
  labelClassName,
}: {
  document: ZatcaFields
  labelClassName: string
}) {
  const t = useTranslations("invoices.zatca")
  const locale = useLocale() as Locale
  if (!document.zatcaSigned) return null
  const reason = document.zatcaReportedAt ? null : zatcaReasonText(document, locale)
  return (
    <>
      <dt className={labelClassName}>{t("detail.statusLabel")}</dt>
      <dd
        className={cn(
          "text-right font-semibold",
          document.zatcaReportedAt
            ? "text-[#1f9d55]"
            : document.zatcaLastError
              ? "text-[#d92d20]"
              : "text-[#b45309]"
        )}
      >
        {document.zatcaReportedAt
          ? t("detail.reported", { status: document.zatcaStatus ?? "—" })
          : document.zatcaLastError
            ? t("detail.notReported")
            : t("detail.awaiting")}
      </dd>
      {reason ? (
        <dd className="col-span-2 rounded-[8px] bg-[#fdecec] px-2.5 py-1.5 text-[11px] leading-5 text-[#b42318]">
          {t("detail.reason", { reason })}
        </dd>
      ) : null}
    </>
  )
}

// Sends one signed document to ZATCA again. onChange receives the fields to merge into the
// document (reported, or the new reason).
export function ZatcaReportButton({
  document,
  report,
  onChange,
}: {
  document: ZatcaFields
  report: () => Promise<{ status: string }>
  onChange: (patch: Partial<ZatcaFields>) => void
}) {
  const t = useTranslations("invoices.zatca")
  const locale = useLocale() as Locale
  const [sending, setSending] = useState(false)
  if (!document.zatcaSigned || document.zatcaReportedAt) return null

  const send = async () => {
    setSending(true)
    try {
      const result = await report()
      onChange({
        zatcaStatus: result.status,
        zatcaReportedAt: new Date().toISOString(),
        zatcaLastError: null,
        zatcaLastErrorAr: null,
      })
      toast.success(t("toasts.reported", { status: result.status }))
    } catch (error) {
      const code = error instanceof AppError ? error.code : undefined
      // ZATCA refused it or couldn't be reached: its reason, shown and kept on the document.
      const rejected = code === "ZATCA_REJECTED" && error instanceof AppError ? error : undefined
      const reasonAr =
        (rejected?.details as { reasonAr?: string | null } | undefined)?.reasonAr ?? null
      const reason = rejected ? ((locale === "ar" ? reasonAr : null) ?? rejected.message) : null
      if (rejected) onChange({ zatcaLastError: rejected.message, zatcaLastErrorAr: reasonAr })
      toast.error(
        code === "POS_INVOICE_ALREADY_REPORTED_TO_ZATCA"
          ? t("toasts.alreadyReported")
          : code === "POS_INVOICE_NOT_ZATCA_SIGNED"
            ? t("toasts.notSigned")
            : code === "ZATCA_REPORT_IN_PROGRESS"
              ? t("toasts.inProgress")
              : t("toasts.failed"),
        reason ? { description: t("toasts.zatcaSaid", { reason }) } : {}
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Button
      className="h-10 w-full gap-2 rounded-[10px] bg-[#1f9d55] text-[12.5px] font-bold text-white hover:bg-[#188045]"
      disabled={sending}
      onClick={() => void send()}
    >
      {sending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
      {t("reportAgain")}
    </Button>
  )
}
