"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { BarChart3, FileCheck2, HandCoins, ListChecks, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDialog, AppSwitch } from "@/components/app"

import {
  buildConversion,
  closesQuotation,
  type ConversionMode,
  remainingQuantity,
  suggestPrepayments,
} from "../domain/conversions"
import { computeTotals, retentionAmount, round2 } from "../domain/totals"
import { useFormatters, useInvoicingError } from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type { AdvanceOption, QuotationDetail, TaxType } from "../types/invoicing.types"
import { NumberInput, PRIMARY_BUTTON, SECONDARY_BUTTON, Segmented } from "./primitives"
import { HEADING, MUTED } from "./styles"
import { prepaidTotal } from "./totals-card"

const MODES: Array<{ mode: ConversionMode; icon: LucideIcon }> = [
  { mode: "remaining", icon: FileCheck2 },
  { mode: "progress", icon: BarChart3 },
  { mode: "lines", icon: ListChecks },
  { mode: "advance", icon: HandCoins },
]

// Quotation -> invoice draft: the whole of what's left, a progress claim, chosen quantities, or
// an advance payment. The draft opens for review; nothing reaches ZATCA until it's issued.
export function ConvertDialog({
  quotation,
  open,
  onOpenChange,
}: {
  quotation: QuotationDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("invoicing.convert")
  const tCommon = useTranslations("invoicing.common")
  const router = useRouter()
  const { money, quantity } = useFormatters()
  const describeError = useInvoicingError()
  const items = useMemo(
    () => quotation.lines.filter((line) => line.lineType === "item"),
    [quotation.lines]
  )
  const nothingLeft = items.every((line) => remainingQuantity(line) <= 0)
  const [mode, setMode] = useState<ConversionMode>(() =>
    nothingLeft ? "advance" : quotation.sector === "contracting" ? "progress" : "remaining"
  )
  const [taxType, setTaxType] = useState<TaxType>("standard")
  const [cumulative, setCumulative] = useState<Record<string, number>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((line) => [line.id, remainingQuantity(line)]))
  )
  const [advancePercent, setAdvancePercent] = useState(quotation.advancePercent || 30)
  const [allPercent, setAllPercent] = useState(0)
  const [busy, setBusy] = useState(false)
  // Issued advance payment invoices of this quotation that still have something to take back.
  const [advances, setAdvances] = useState<AdvanceOption[]>([])
  const [deductAdvance, setDeductAdvance] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    salesInvoiceService
      .advances({ quotationId: quotation.id, customerId: quotation.customerId })
      .then((items) => !cancelled && setAdvances(items))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, quotation.id, quotation.customerId])

  const draft = useMemo(
    () => ({
      ...buildConversion(quotation, mode, {
        cumulative,
        quantities,
        advancePercent,
        advanceLabel: t("advanceLabel", { percent: advancePercent, number: quotation.number }),
      }),
      taxType,
    }),
    [quotation, mode, cumulative, quantities, advancePercent, taxType, t]
  )
  const totals = useMemo(
    () => computeTotals(draft.lines, { type: draft.discountType, value: draft.discountValue }),
    [draft]
  )
  const retention = retentionAmount(totals.taxableAmount, draft.retentionPercent)
  const closes = useMemo(() => closesQuotation(quotation, draft.lines), [quotation, draft.lines])
  const suggested = useMemo(
    () =>
      mode === "advance" || totals.taxableAmount <= 0
        ? []
        : suggestPrepayments(advances, {
            billedNet: totals.taxableAmount,
            contractNet: quotation.taxableAmount,
            closes,
            // Leaves the amount due at zero or more once retention is held back.
            ceiling: totals.taxableAmount * (1 - retention / Math.max(totals.totalAmount, 0.01)),
          }),
    [advances, mode, totals, retention, quotation, closes]
  )
  const input = useMemo(
    () => ({ ...draft, prepayments: deductAdvance ? suggested : [] }),
    [draft, deductAdvance, suggested]
  )
  const prepaid = prepaidTotal(input.prepayments, advances)
  const amountDue = round2(totals.totalAmount - retention - prepaid)

  const create = async () => {
    setBusy(true)
    try {
      const invoice = await salesInvoiceService.create(input)
      toast.success(t("created"))
      router.push(ROUTES.salesInvoiceDetails(invoice.id))
    } catch (error) {
      toast.error(describeError(error))
      setBusy(false)
    }
  }

  const lineAmount = (lineId: string) => {
    const line = input.lines.find((entry) => entry.quotationLineId === lineId)
    return line ? round2(line.quantity * line.unitPrice * (1 - line.discountPercent / 100)) : 0
  }

  const head = "px-2 py-2 text-start text-[11px] font-bold text-[#6b7b96]"
  const cell = "px-2 py-1.5 align-middle text-[12.5px]"

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="text-[17px] font-extrabold">{t("title")}</span>}
      description={t("description", { number: quotation.number })}
      contentClassName="max-w-[54rem] rounded-[22px] p-6"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className={cn("text-[12px]", MUTED)}>
              {t("summary.net")}{" "}
              <b className={cn("tabular-nums", HEADING)}>{money(totals.taxableAmount)}</b>
            </span>
            <span className={cn("text-[12px]", MUTED)}>
              {t("summary.vat")}{" "}
              <b className={cn("tabular-nums", HEADING)}>{money(totals.taxAmount)}</b>
            </span>
            {retention > 0 ? (
              <span className={cn("text-[12px]", MUTED)}>
                {t("summary.retention")}{" "}
                <b className={cn("tabular-nums", HEADING)}>− {money(retention)}</b>
              </span>
            ) : null}
            {prepaid > 0 ? (
              <span className={cn("text-[12px]", MUTED)}>
                {t("summary.prepaid")}{" "}
                <b className={cn("tabular-nums", HEADING)}>− {money(prepaid)}</b>
              </span>
            ) : null}
            <span className={cn("text-[13px] font-bold", HEADING)}>
              {retention > 0 || prepaid > 0 ? t("summary.due") : t("summary.total")}{" "}
              <b className="text-[17px] font-black tabular-nums text-[#4f46e5]">
                {money(amountDue)}
              </b>{" "}
              <span className={cn("text-[11px] font-semibold", MUTED)}>{tCommon("sar")}</span>
            </span>
          </div>
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
              disabled={totals.totalAmount <= 0}
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
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map(({ mode: value, icon: Icon }) => {
            const disabled = value !== "advance" && nothingLeft
            const active = mode === value
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => setMode(value)}
                className={cn(
                  "flex items-start gap-3 rounded-[16px] border p-3.5 text-start transition",
                  active
                    ? "border-[#4f46e5] bg-[#f5f6ff] ring-2 ring-[#4f46e5]/10"
                    : "border-[#e1e7f0] hover:bg-[#f7f9fc]",
                  disabled && "cursor-not-allowed opacity-45 hover:bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                    active ? "bg-[#4f46e5] text-white" : "bg-[#f1f3f7] text-[#5b6b85]"
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[13.5px] font-extrabold",
                      active ? "text-[#4f46e5]" : HEADING
                    )}
                  >
                    {t(`modes.${value}.title`)}
                  </span>
                  <span className={cn("block text-[11.5px] leading-5", MUTED)}>
                    {t(`modes.${value}.description`)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[#f7f9fc] px-3.5 py-2.5">
          <div>
            <p className={cn("text-[12.5px] font-bold", HEADING)}>{t("taxType.label")}</p>
            <p className={cn("text-[11.5px]", MUTED)}>
              {taxType === "standard" ? t("taxType.standardHint") : t("taxType.simplifiedHint")}
            </p>
          </div>
          <Segmented
            value={taxType}
            onChange={setTaxType}
            options={[
              { value: "standard", label: t("taxType.standard") },
              { value: "simplified", label: t("taxType.simplified") },
            ]}
          />
        </div>

        {mode === "advance" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#e1e7f0] p-4">
            <div className="min-w-0">
              <p className={cn("text-[13px] font-extrabold", HEADING)}>{t("advance.percent")}</p>
              <p className={cn("mt-0.5 text-[11.5px] leading-5", MUTED)}>
                {t("advance.hint", { amount: money(quotation.taxableAmount) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[10, 20, 30, 50].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAdvancePercent(value)}
                  className={cn(
                    "h-9 rounded-full border px-3 text-[12px] font-bold",
                    advancePercent === value
                      ? "border-[#4f46e5] bg-[#f5f6ff] text-[#4f46e5]"
                      : "border-[#e1e7f0] text-[#5b6b85] hover:bg-[#f7f9fc]"
                  )}
                >
                  {value}%
                </button>
              ))}
              <div className="relative w-[84px]">
                <NumberInput
                  aria-label={t("advance.percent")}
                  max={100}
                  value={advancePercent}
                  onChange={setAdvancePercent}
                  className="h-9 rounded-[10px] pe-6"
                />
                <span
                  className={cn(
                    "pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[12px]",
                    MUTED
                  )}
                >
                  %
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {mode === "remaining" ? (
          <p className="rounded-[14px] border border-dashed border-[#d9dcfb] bg-[#fafaff] px-4 py-3 text-[12.5px] leading-6 text-[#4a586f]">
            {quotation.billingStatus === "none"
              ? t("remaining.full", { count: items.length })
              : t("remaining.partial", { percent: Math.round(quotation.billedPercent) })}
          </p>
        ) : null}

        {mode === "progress" || mode === "lines" ? (
          <div className="overflow-hidden rounded-[16px] border border-[#e1e7f0]">
            {mode === "progress" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f6] bg-[#fafbfd] px-3 py-2">
                <p className={cn("text-[12px]", MUTED)}>{t("progress.hint")}</p>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("progress.setAll")}
                  </span>
                  <div className="relative w-[78px]">
                    <NumberInput
                      aria-label={t("progress.setAll")}
                      max={100}
                      value={allPercent}
                      onChange={(value) => {
                        setAllPercent(value)
                        setCumulative(
                          Object.fromEntries(
                            items.map((line) => [line.id, Math.max(line.billedPercent, value)])
                          )
                        )
                      }}
                      className="h-8 rounded-[9px] pe-6"
                    />
                    <span
                      className={cn(
                        "pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[12px]",
                        MUTED
                      )}
                    >
                      %
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_#eef1f6]">
                  <tr>
                    <th className={head}>{t("table.item")}</th>
                    <th className={cn(head, "w-24 text-center")}>
                      {mode === "progress" ? t("table.contract") : t("table.remaining")}
                    </th>
                    {mode === "progress" ? (
                      <th className={cn(head, "w-20 text-center")}>{t("table.previous")}</th>
                    ) : null}
                    <th className={cn(head, "w-28 text-center")}>
                      {mode === "progress" ? t("table.cumulative") : t("table.quantity")}
                    </th>
                    <th className={cn(head, "w-28 text-end")}>{t("table.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((line) => {
                    const left = remainingQuantity(line)
                    const done = left <= 0
                    return (
                      <tr
                        key={line.id}
                        className={cn("border-t border-[#f1f3f7]", done && "opacity-50")}
                      >
                        <td className={cn(cell, "font-semibold", HEADING)}>
                          <span className="line-clamp-2">{line.description}</span>
                        </td>
                        <td className={cn(cell, "text-center tabular-nums", MUTED)}>
                          {quantity(mode === "progress" ? line.quantity : left)}
                          {line.unit ? (
                            <span className="ms-1 text-[10.5px]">{line.unit}</span>
                          ) : null}
                        </td>
                        {mode === "progress" ? (
                          <td className={cn(cell, "text-center tabular-nums", MUTED)}>
                            {quantity(line.billedPercent)}%
                          </td>
                        ) : null}
                        <td className={cell}>
                          {mode === "progress" ? (
                            <NumberInput
                              aria-label={t("table.cumulative")}
                              disabled={done}
                              min={line.billedPercent}
                              max={100}
                              value={cumulative[line.id] ?? line.billedPercent}
                              onChange={(value) =>
                                setCumulative((current) => ({ ...current, [line.id]: value }))
                              }
                              className="h-9 rounded-[10px]"
                            />
                          ) : (
                            <NumberInput
                              aria-label={t("table.quantity")}
                              disabled={done}
                              max={left}
                              value={quantities[line.id] ?? 0}
                              onChange={(value) =>
                                setQuantities((current) => ({ ...current, [line.id]: value }))
                              }
                              className="h-9 rounded-[10px]"
                            />
                          )}
                        </td>
                        <td className={cn(cell, "text-end font-bold tabular-nums", HEADING)}>
                          {money(lineAmount(line.id))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {suggested.length ? (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-[#e1e7f0] px-4 py-3">
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-extrabold", HEADING)}>
                {t("prepayment.title")}
              </span>
              <span className={cn("mt-0.5 block text-[11.5px] leading-5", MUTED)}>
                {t(closes ? "prepayment.hintFinal" : "prepayment.hint", {
                  amount: money(suggested.reduce((sum, entry) => sum + entry.netAmount, 0)),
                  numbers: advances
                    .filter((advance) =>
                      suggested.some((entry) => entry.advanceInvoiceId === advance.id)
                    )
                    .map((advance) => advance.number)
                    .join(" · "),
                })}
              </span>
            </span>
            <AppSwitch checked={deductAdvance} onCheckedChange={setDeductAdvance} />
          </label>
        ) : null}
      </div>
    </AppDialog>
  )
}
