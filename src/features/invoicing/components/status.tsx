"use client"

import { useTranslations } from "next-intl"
import { BadgeCheck, CircleAlert, Clock3, ShieldCheck, ShieldX } from "lucide-react"

import type { Quotation, SalesInvoice } from "../types/invoicing.types"
import { Pill, type Tone } from "./primitives"

const QUOTATION_TONE: Record<Quotation["displayStatus"], Tone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  declined: "danger",
  expired: "warning",
  superseded: "neutral",
}

export function QuotationStatusPill({ quotation }: { quotation: Quotation }) {
  const t = useTranslations("invoicing.status.quotation")
  return <Pill tone={QUOTATION_TONE[quotation.displayStatus]}>{t(quotation.displayStatus)}</Pill>
}

export function QuotationBillingPill({ quotation }: { quotation: Quotation }) {
  const t = useTranslations("invoicing.status.billing")
  if (quotation.billingStatus === "none") return null
  return (
    <Pill tone={quotation.billingStatus === "full" ? "success" : "accent"}>
      {quotation.billingStatus === "full"
        ? t("full")
        : t("partial", { percent: Math.round(quotation.billedPercent) })}
    </Pill>
  )
}

export function invoiceStatusKey(invoice: SalesInvoice): { key: string; tone: Tone } {
  if (invoice.status === "draft") {
    return invoice.zatca.status === "rejected"
      ? { key: "rejected", tone: "danger" }
      : { key: "draft", tone: "neutral" }
  }
  if (invoice.status === "pending_clearance") return { key: "pendingClearance", tone: "warning" }
  if (invoice.status === "void") return { key: "void", tone: "neutral" }
  if (invoice.documentType !== "invoice" || invoice.paymentStatus === "not_applicable") {
    return { key: "issued", tone: "success" }
  }
  if (invoice.paymentStatus === "paid") return { key: "paid", tone: "success" }
  if (invoice.overdue) return { key: "overdue", tone: "danger" }
  if (invoice.paymentStatus === "partial") return { key: "partial", tone: "warning" }
  return { key: "unpaid", tone: "info" }
}

export function InvoiceStatusPill({ invoice }: { invoice: SalesInvoice }) {
  const t = useTranslations("invoicing.status.invoice")
  const { key, tone } = invoiceStatusKey(invoice)
  return <Pill tone={tone}>{t(key)}</Pill>
}

// Where the document stands with ZATCA (nothing for a draft that was never sent).
export function ZatcaPill({ invoice }: { invoice: SalesInvoice }) {
  const t = useTranslations("invoicing.status.zatca")
  const state = invoice.zatca.status
  if (state === "cleared") {
    return (
      <Pill tone="success" icon={ShieldCheck}>
        {t("cleared")}
      </Pill>
    )
  }
  if (state === "reported") {
    return (
      <Pill tone="success" icon={BadgeCheck}>
        {t("reported")}
      </Pill>
    )
  }
  if (state === "pending") {
    return (
      <Pill tone="warning" icon={Clock3}>
        {t("pending")}
      </Pill>
    )
  }
  if (state === "rejected") {
    return (
      <Pill tone="danger" icon={ShieldX}>
        {t("rejected")}
      </Pill>
    )
  }
  if (invoice.status === "issued") {
    return (
      <Pill tone="neutral" icon={CircleAlert}>
        {t("notLinked")}
      </Pill>
    )
  }
  return null
}

// "Tax invoice", "Advance payment invoice", "Progress claim #3", "Credit note"...
export function useDocumentLabel() {
  const t = useTranslations("invoicing.docTypes")
  return (
    invoice: Pick<SalesInvoice, "documentType" | "invoiceKind" | "taxType" | "claimNumber">
  ) => {
    if (invoice.documentType === "credit_note") return t("creditNote")
    if (invoice.documentType === "debit_note") return t("debitNote")
    if (invoice.invoiceKind === "advance") return t("advance")
    if (invoice.invoiceKind === "progress")
      return t("progress", { number: invoice.claimNumber ?? 1 })
    return invoice.taxType === "standard" ? t("standard") : t("simplified")
  }
}
