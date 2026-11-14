"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import { useInvoicingAccess } from "../hooks/use-invoicing"
import { quotationService, salesInvoiceService } from "../services/invoicing.service"
import type { QuotationDetail, SalesInvoiceDetail } from "../types/invoicing.types"
import {
  DocumentEditor,
  emptyEditorValues,
  invoiceToValues,
  toInvoiceInput,
} from "./document-editor"
import { PageError, PageLoading } from "./page-shell"
import { InvoicingLocked } from "./primitives"
import { useDocumentLabel } from "./status"
import { useZatcaReadiness, ZatcaReadinessBanner } from "./zatca-readiness"

export function InvoiceEditorPage({ invoiceId }: { invoiceId?: string }) {
  const t = useTranslations("invoicing.invoice")
  const router = useRouter()
  const { enabled, checking, canManage } = useInvoicingAccess()
  const documentLabel = useDocumentLabel()
  const readiness = useZatcaReadiness(enabled)
  const [invoice, setInvoice] = useState<SalesInvoiceDetail | null>(null)
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null)
  const [ready, setReady] = useState(!invoiceId)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !invoiceId) return
    let cancelled = false
    ;(async () => {
      try {
        const loaded = await salesInvoiceService.get(invoiceId)
        // Only a draft invoice is edited; an issued one is corrected with a credit or debit note.
        if (loaded.status !== "draft" || loaded.documentType !== "invoice") {
          router.replace(ROUTES.salesInvoiceDetails(loaded.id))
          return
        }
        const linked = loaded.quotationId
          ? await quotationService.get(loaded.quotationId).catch(() => null)
          : null
        if (cancelled) return
        setInvoice(loaded)
        setQuotation(linked)
        setReady(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, invoiceId, router])

  if (!enabled) return checking ? null : <InvoicingLocked />
  if (!canManage) return <PageError message={t("noPermission")} />
  if (failed) return <PageError message={t("notFound")} />
  if (!ready) return <PageLoading />

  return (
    <DocumentEditor
      key={invoice?.id ?? "new"}
      kind="invoice"
      heading={invoice ? t("editTitle", { type: documentLabel(invoice) }) : t("newTitle")}
      subheading={invoice ? invoice.customer.name : t("newSubtitle")}
      backHref={invoice ? ROUTES.salesInvoiceDetails(invoice.id) : ROUTES.salesInvoices}
      initial={invoice ? invoiceToValues(invoice) : emptyEditorValues()}
      quotation={quotation}
      invoiceId={invoice?.id ?? null}
      banner={<ZatcaReadinessBanner readiness={readiness} />}
      onSubmit={async (values) => {
        const input = toInvoiceInput(values)
        const saved = invoice
          ? await salesInvoiceService.update(invoice.id, input)
          : await salesInvoiceService.create(input)
        toast.success(t("saved"))
        router.push(ROUTES.salesInvoiceDetails(saved.id))
      }}
    />
  )
}
