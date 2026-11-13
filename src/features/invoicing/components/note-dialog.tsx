"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDialog,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { ADJUSTMENT_REASONS, emptyLine } from "../domain/catalog"
import { computeTotals, round2 } from "../domain/totals"
import { errorCode, errorDetails, useFormatters, useInvoicingError } from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type { AdjustmentReason, DocumentLine, SalesInvoiceDetail } from "../types/invoicing.types"
import { withoutKey } from "./lines-editor"
import { Field, NumberInput, PRIMARY_BUTTON, SECONDARY_BUTTON, TextInput } from "./primitives"
import { CELL_INPUT, FIELD, HEADING, MUTED } from "./styles"

type NoteLine = DocumentLine & { key: string }

let counter = 0
const keyed = (line: DocumentLine): NoteLine => ({ ...line, key: `note-${(counter += 1)}` })

// A credit note starts as the whole invoice (trim what isn't being returned); a debit note starts
// empty, for the extra charge.
function initialLines(invoice: SalesInvoiceDetail, type: "credit_note" | "debit_note"): NoteLine[] {
  if (type === "debit_note") return [keyed(emptyLine())]
  return invoice.lines
    .filter((line) => line.lineType === "item")
    .map((line) =>
      keyed({
        ...emptyLine(),
        productId: line.productId,
        description: line.description,
        details: line.details,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: round2(line.unitPrice * (1 - line.discountPercent / 100)),
        taxCategory: line.taxCategory,
        taxRate: line.taxRate,
        exemptionCode: line.exemptionCode,
        exemptionReason: line.exemptionReason,
      })
    )
}

export function NoteDialog({
  invoice,
  type,
  open,
  onOpenChange,
}: {
  invoice: SalesInvoiceDetail
  type: "credit_note" | "debit_note"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("invoicing.note")
  const tReasons = useTranslations("invoicing.adjustmentReasons")
  const tCommon = useTranslations("invoicing.common")
  const router = useRouter()
  const { money } = useFormatters()
  const describeError = useInvoicingError()
  const credit = type === "credit_note"
  const [lines, setLines] = useState<NoteLine[]>(() => initialLines(invoice, type))
  const [reasonCode, setReasonCode] = useState<AdjustmentReason>(
    credit ? "refund" : "price_amendment"
  )
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const totals = useMemo(() => computeTotals(lines, { type: "amount", value: 0 }), [lines])
  const creditable = round2(invoice.totalAmount + invoice.debitedAmount - invoice.creditedAmount)
  const exceeds = credit && totals.totalAmount > creditable + 0.004

  const patch = (key: string, change: Partial<DocumentLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))

  const create = async () => {
    const kept = lines.filter((line) => line.quantity > 0 && line.unitPrice > 0)
    if (!kept.length || kept.some((line) => !line.description.trim())) {
      toast.error(t("linesRequired"))
      return
    }
    setBusy(true)
    try {
      const note = await salesInvoiceService.createNote(invoice.id, {
        documentType: type,
        reasonCode,
        reason: reason.trim() || null,
        notes: null,
        lines: kept.map(withoutKey),
      })
      toast.success(t("created"))
      onOpenChange(false)
      router.push(ROUTES.salesInvoiceDetails(note.id))
    } catch (error) {
      const remaining = errorDetails<{ remaining?: number }>(error)?.remaining
      toast.error(
        errorCode(error) === "SALES_CREDIT_EXCEEDS_INVOICE" && remaining !== undefined
          ? t("exceeds", { amount: money(remaining) })
          : describeError(error)
      )
      setBusy(false)
    }
  }

  const head = "px-2 py-2 text-start text-[11px] font-bold text-[#6b7b96]"

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="text-[17px] font-extrabold">
          {credit ? t("creditTitle") : t("debitTitle")}
        </span>
      }
      description={
        credit
          ? t("creditDescription", { number: invoice.number ?? "" })
          : t("debitDescription", { number: invoice.number ?? "" })
      }
      contentClassName="max-w-[50rem] rounded-[22px] p-6"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className={cn("text-[13px] font-bold", exceeds ? "text-[#dc2626]" : HEADING)}>
            {t("total")}{" "}
            <b className="text-[17px] font-black tabular-nums">{money(totals.totalAmount)}</b>{" "}
            <span className={cn("text-[11px] font-semibold", MUTED)}>{tCommon("sar")}</span>
            {credit ? (
              <span
                className={cn(
                  "ms-2 text-[11.5px] font-semibold",
                  exceeds ? "text-[#dc2626]" : MUTED
                )}
              >
                {t("creditable", { amount: money(creditable) })}
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              onClick={() => onOpenChange(false)}
              className={SECONDARY_BUTTON}
            >
              {tCommon("cancel")}
            </AppButton>
            <AppButton
              loading={busy}
              disabled={exceeds || totals.totalAmount <= 0}
              onClick={create}
              className={PRIMARY_BUTTON}
            >
              {t("create")}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("reasonCode")} required>
            <AppSelect
              value={reasonCode}
              onValueChange={(value) => setReasonCode(value as AdjustmentReason)}
            >
              <AppSelectTrigger className={cn(FIELD, "px-2.5")} aria-label={t("reasonCode")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {ADJUSTMENT_REASONS.map((value) => (
                  <AppSelectItem key={value} value={value}>
                    {tReasons(value)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </Field>
          <Field label={t("reason")}>
            <TextInput
              value={reason}
              onChange={setReason}
              placeholder={t(credit ? "reasonPlaceholder" : "debitReasonPlaceholder")}
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-[16px] border border-[#e1e7f0]">
          <div className="max-h-[300px] overflow-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#eef1f6]">
                <tr>
                  <th className={head}>{t("table.item")}</th>
                  <th className={cn(head, "w-24 text-center")}>{t("table.quantity")}</th>
                  <th className={cn(head, "w-28 text-center")}>{t("table.price")}</th>
                  <th className={cn(head, "w-28 text-end")}>{t("table.total")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t border-[#f1f3f7]">
                    <td className="px-1 py-1">
                      <input
                        value={line.description}
                        onChange={(event) => patch(line.key, { description: event.target.value })}
                        placeholder={t("table.itemPlaceholder")}
                        aria-label={t("table.item")}
                        className={cn(CELL_INPUT, "font-semibold")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <NumberInput
                        cell
                        aria-label={t("table.quantity")}
                        value={line.quantity}
                        onChange={(quantity) => patch(line.key, { quantity })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <NumberInput
                        cell
                        aria-label={t("table.price")}
                        value={line.unitPrice}
                        onChange={(unitPrice) => patch(line.key, { unitPrice })}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1 text-end text-[12.5px] font-bold tabular-nums",
                        HEADING
                      )}
                    >
                      {money(round2(line.quantity * line.unitPrice))}
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        aria-label={tCommon("delete")}
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((entry) => entry.key !== line.key))
                        }
                        className="flex size-8 items-center justify-center rounded-full text-[#a3b0c6] hover:bg-[#fef1f1] hover:text-[#dc2626] disabled:opacity-30"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[#eef1f6] bg-[#fafbfd] px-3 py-2">
            <button
              type="button"
              onClick={() => setLines((current) => [...current, keyed(emptyLine())])}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold text-[#4f46e5] hover:bg-[#eef0ff]"
            >
              <Plus className="size-3.5" />
              {t("addLine")}
            </button>
            <p className={cn("text-[11.5px]", MUTED)}>
              {t("vatIncluded", { amount: money(totals.taxAmount) })}
            </p>
          </div>
        </div>
        <p className={cn("text-[11.5px] leading-5", MUTED)}>{t("hint")}</p>
      </div>
    </AppDialog>
  )
}
