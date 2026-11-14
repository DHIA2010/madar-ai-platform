"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { GitBranch, Lock } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { useInvoicingAccess, useInvoicingError } from "../hooks/use-invoicing"
import { quotationService } from "../services/invoicing.service"
import type { QuotationDetail } from "../types/invoicing.types"
import {
  DocumentEditor,
  emptyEditorValues,
  quotationToValues,
  toQuotationInput,
} from "./document-editor"
import { PageError, PageHeader, PageLoading } from "./page-shell"
import { InvoicingLocked, PRIMARY_BUTTON } from "./primitives"
import { HEADING, MUTED, PANEL } from "./styles"

// An accepted or invoiced quotation is the record of what was agreed: changes go in a revision.
const locked = (quotation: QuotationDetail) =>
  quotation.status === "accepted" || quotation.status === "superseded" || quotation.invoiceCount > 0

export function QuotationEditorPage({ quotationId }: { quotationId?: string }) {
  const t = useTranslations("invoicing.quotation")
  const router = useRouter()
  const { enabled, checking, canManage } = useInvoicingAccess()
  const describeError = useInvoicingError()
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [revising, setRevising] = useState(false)

  useEffect(() => {
    if (!enabled || !quotationId) return
    let cancelled = false
    quotationService
      .get(quotationId)
      .then((result) => !cancelled && setQuotation(result))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [enabled, quotationId])

  if (!enabled) return checking ? null : <InvoicingLocked />
  if (!canManage) return <PageError message={t("noPermission")} />
  if (failed) return <PageError message={t("notFound")} />
  if (quotationId && !quotation) return <PageLoading />

  if (quotation && locked(quotation)) {
    const revise = async () => {
      setRevising(true)
      try {
        const revision = await quotationService.revise(quotation.id)
        toast.success(t("revised", { revision: revision.revision }))
        router.replace(ROUTES.quotationEdit(revision.id))
      } catch (error) {
        toast.error(describeError(error))
        setRevising(false)
      }
    }
    return (
      <div className="space-y-5">
        <PageHeader title={quotation.number} backHref={ROUTES.quotationDetails(quotation.id)} />
        <div className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fff7e6] text-[#b45309]">
            <Lock className="size-7" />
          </span>
          <h2 className={cn("mt-4 text-[17px] font-extrabold", HEADING)}>{t("locked.title")}</h2>
          <p className={cn("mt-2 text-[13px] leading-6", MUTED)}>
            {quotation.status === "superseded" ? t("locked.superseded") : t("locked.description")}
          </p>
          {quotation.status === "superseded" ? null : (
            <AppButton
              loading={revising}
              onClick={revise}
              icon={<GitBranch className="size-4" />}
              className={cn(PRIMARY_BUTTON, "mt-5")}
            >
              {t("locked.revise")}
            </AppButton>
          )}
        </div>
      </div>
    )
  }

  return (
    <DocumentEditor
      key={quotation?.id ?? "new"}
      kind="quotation"
      heading={quotation ? t("editTitle", { number: quotation.number }) : t("newTitle")}
      subheading={quotation ? quotation.customer.name : t("newSubtitle")}
      backHref={quotation ? ROUTES.quotationDetails(quotation.id) : ROUTES.quotations}
      initial={quotation ? quotationToValues(quotation) : emptyEditorValues()}
      onSubmit={async (values) => {
        const input = toQuotationInput(values)
        const saved = quotation
          ? await quotationService.update(quotation.id, input)
          : await quotationService.create(input)
        toast.success(t("saved"))
        router.push(ROUTES.quotationDetails(saved.id))
      }}
    />
  )
}
