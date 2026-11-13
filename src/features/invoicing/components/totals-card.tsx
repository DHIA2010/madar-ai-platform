"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { AppSwitch } from "@/components/app"

import { type DocumentTotals, retentionAmount, round2 } from "../domain/totals"
import { useFormatters } from "../hooks/use-invoicing"
import type { AdvanceOption, DiscountType, InvoiceInput } from "../types/invoicing.types"
import { NumberInput } from "./primitives"
import { HEADING, MUTED, PANEL, SECTION_TITLE } from "./styles"

type Prepayment = InvoiceInput["prepayments"][number]

// What the chosen advance payment invoices take off this invoice, VAT included.
export function prepaidTotal(prepayments: Prepayment[], advances: AdvanceOption[]): number {
  return round2(
    prepayments.reduce((sum, entry) => {
      const option = advances.find((advance) => advance.id === entry.advanceInvoiceId)
      return sum + entry.netAmount * (1 + (option?.taxRate ?? 15) / 100)
    }, 0)
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className={cn("text-[13px]", strong ? cn("font-extrabold", HEADING) : MUTED)}>{label}</dt>
      <dd
        className={cn(
          "text-[13.5px] tabular-nums",
          strong ? cn("font-extrabold", HEADING) : muted ? MUTED : cn("font-bold", HEADING)
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function PercentField({
  label,
  hint,
  value,
  onChange,
  amount,
}: {
  label: string
  hint?: string
  value: number
  onChange: (next: number) => void
  amount: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={cn("text-[13px] font-semibold", HEADING)}>{label}</p>
        {hint ? <p className={cn("text-[11px] leading-4", MUTED)}>{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative w-[76px]">
          <NumberInput
            aria-label={label}
            max={100}
            value={value}
            onChange={onChange}
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
        <span className={cn("w-[92px] text-end text-[13px] font-bold tabular-nums", HEADING)}>
          {amount}
        </span>
      </div>
    </div>
  )
}

export function TotalsCard({
  kind,
  totals,
  discountType,
  discountValue,
  onDiscountChange,
  retentionPercent,
  onRetentionChange,
  showRetention,
  advancePercent,
  onAdvanceChange,
  advances,
  prepayments,
  onPrepaymentsChange,
  allowPrepayments,
  footer,
}: {
  kind: "quotation" | "invoice"
  totals: DocumentTotals
  discountType: DiscountType
  discountValue: number
  onDiscountChange: (next: { discountType: DiscountType; discountValue: number }) => void
  retentionPercent: number
  onRetentionChange: (next: number) => void
  showRetention: boolean
  advancePercent: number
  onAdvanceChange: (next: number) => void
  advances: AdvanceOption[]
  prepayments: Prepayment[]
  onPrepaymentsChange: (next: Prepayment[]) => void
  allowPrepayments: boolean
  footer?: ReactNode
}) {
  const t = useTranslations("invoicing.editor.totals")
  const tTax = useTranslations("invoicing.taxCategories")
  const tCommon = useTranslations("invoicing.common")
  const { money, quantity, date } = useFormatters()
  const retention = showRetention ? retentionAmount(totals.taxableAmount, retentionPercent) : 0
  const prepaid = allowPrepayments ? prepaidTotal(prepayments, advances) : 0
  const amountDue = round2(totals.totalAmount - prepaid - retention)

  return (
    <section className={cn(PANEL, "p-5")}>
      <h2 className={SECTION_TITLE}>{t("title")}</h2>
      <dl className="mt-3">
        <Row label={t("subtotal")} value={money(totals.subtotal)} />
        <div className="flex items-center justify-between gap-3 py-1.5">
          <dt className={cn("text-[13px]", MUTED)}>{t("discount")}</dt>
          <dd className="flex items-center gap-1.5">
            <div className="flex h-9 items-center rounded-[10px] border border-[#e1e7f0] bg-[#f7f9fc] p-0.5">
              {(["amount", "percent"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onDiscountChange({ discountType: type, discountValue: 0 })}
                  className={cn(
                    "h-full rounded-[8px] px-2 text-[11.5px] font-bold transition",
                    discountType === type ? "bg-white text-[#4f46e5] shadow-sm" : "text-[#8a97ad]"
                  )}
                >
                  {type === "amount" ? tCommon("sar") : "%"}
                </button>
              ))}
            </div>
            <div className="w-[92px]">
              <NumberInput
                aria-label={t("discount")}
                max={discountType === "percent" ? 100 : undefined}
                value={discountValue}
                onChange={(value) => onDiscountChange({ discountType, discountValue: value })}
                className="h-9 rounded-[10px]"
              />
            </div>
          </dd>
        </div>
        {totals.discountAmount > 0 ? (
          <Row label={t("taxable")} value={money(totals.taxableAmount)} />
        ) : null}
        {totals.breakdown.map((entry) => (
          <Row
            key={`${entry.taxCategory}-${entry.taxRate}-${entry.exemptionCode ?? ""}`}
            label={
              entry.taxCategory === "S"
                ? t("vatRate", { rate: quantity(entry.taxRate) })
                : tTax(entry.taxCategory)
            }
            value={money(entry.taxAmount)}
            muted={entry.taxCategory !== "S"}
          />
        ))}
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[14px] bg-[#0b1738] px-4 py-3 text-white">
          <dt className="text-[13px] font-bold">{t("total")}</dt>
          <dd className="text-[19px] font-black tabular-nums">
            {money(totals.totalAmount)}
            <span className="ms-1 text-[11px] font-semibold opacity-70">{tCommon("sar")}</span>
          </dd>
        </div>
      </dl>

      {kind === "quotation" ? (
        <div className="mt-3 border-t border-[#eef1f6] pt-2">
          <PercentField
            label={t("advance")}
            hint={t("advanceHint")}
            value={advancePercent}
            onChange={onAdvanceChange}
            amount={money(round2((totals.totalAmount * advancePercent) / 100))}
          />
          {showRetention ? (
            <PercentField
              label={t("retention")}
              hint={t("retentionHint")}
              value={retentionPercent}
              onChange={onRetentionChange}
              amount={money(retention)}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-3 border-t border-[#eef1f6] pt-2">
          {allowPrepayments && advances.length ? (
            <div className="pb-1">
              <p className={cn("py-1 text-[12.5px] font-extrabold", HEADING)}>{t("prepayments")}</p>
              {advances.map((advance) => {
                const entry = prepayments.find((item) => item.advanceInvoiceId === advance.id)
                return (
                  <div
                    key={advance.id}
                    className={cn(
                      "mt-1.5 rounded-[12px] border px-3 py-2.5 transition",
                      entry ? "border-[#c9cffb] bg-[#f8f8ff]" : "border-[#e9edf5]"
                    )}
                  >
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className={cn("block text-[12.5px] font-bold", HEADING)} dir="ltr">
                          {advance.number}
                        </span>
                        <span className={cn("block text-[11px]", MUTED)}>
                          {t("advanceRemaining", {
                            amount: money(advance.remainingNet),
                            date: date(advance.issueDate),
                          })}
                        </span>
                      </span>
                      <AppSwitch
                        checked={!!entry}
                        onCheckedChange={(checked) =>
                          onPrepaymentsChange(
                            checked
                              ? [
                                  ...prepayments,
                                  {
                                    advanceInvoiceId: advance.id,
                                    netAmount: round2(
                                      Math.min(
                                        advance.remainingNet,
                                        Math.max(totals.taxableAmount - prepaid / 1.15, 0)
                                      )
                                    ),
                                  },
                                ]
                              : prepayments.filter((item) => item.advanceInvoiceId !== advance.id)
                          )
                        }
                      />
                    </label>
                    {entry ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={cn("text-[11.5px]", MUTED)}>{t("deductNet")}</span>
                        <div className="w-[110px]">
                          <NumberInput
                            aria-label={t("deductNet")}
                            max={advance.remainingNet}
                            value={entry.netAmount}
                            onChange={(value) =>
                              onPrepaymentsChange(
                                prepayments.map((item) =>
                                  item.advanceInvoiceId === advance.id
                                    ? { ...item, netAmount: value }
                                    : item
                                )
                              )
                            }
                            className="h-9 rounded-[10px]"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {prepaid > 0 ? <Row label={t("prepaid")} value={`− ${money(prepaid)}`} /> : null}
            </div>
          ) : null}
          {showRetention ? (
            <PercentField
              label={t("retention")}
              hint={t("retentionHint")}
              value={retentionPercent}
              onChange={onRetentionChange}
              amount={retention > 0 ? `− ${money(retention)}` : money(0)}
            />
          ) : null}
          {prepaid > 0 || retention > 0 ? (
            <div className="mt-1 border-t border-dashed border-[#e1e7f0] pt-1">
              <Row strong label={t("amountDue")} value={money(amountDue)} />
            </div>
          ) : null}
        </div>
      )}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  )
}
