"use client"

import { Fragment, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Banknote, ChevronDown, CreditCard, Landmark, MoreHorizontal, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import { HEADING, MUTED } from "./ready-report-field"

export interface SourceGroup {
  sourceId: string
  sourceName: string
  totalSales: number
  invoiceCount: number
  avgInvoiceValue: number
  paymentMethods: Array<{
    paymentMethod: string
    invoiceCount: number
    totalSales: number
    pctOfSource: number
  }>
}

// payment_method_code is a raw code on pos_invoices (e.g. "cash", "stc_pay", "customer_wallet") --
// no per-org display-name lookup exists in the schema, so every raw code is bucketed into this
// fixed set of Arabic-labeled categories (matching the reference design's own taxonomy) instead of
// showing the raw snake_case code. Unrecognized codes fall into "أخرى". Each bucket also carries a
// distinct tone (icon badge + row tint) so the 6 categories are visually distinguishable at a
// glance, matching the tone pattern already used for KPI cards elsewhere in this feature.
export const PAYMENT_METHOD_BUCKETS = [
  { key: "cash", label: "نقدي", icon: Banknote, codes: ["cash"], tone: "bg-blue-50 text-blue-600" },
  {
    key: "mada",
    label: "مدى",
    icon: CreditCard,
    codes: ["mada"],
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    key: "credit_card",
    label: "بطاقة ائتمان",
    icon: CreditCard,
    codes: ["card", "credit_card", "visa", "mastercard"],
    tone: "bg-violet-50 text-violet-600",
  },
  {
    key: "wallet",
    label: "محفظة إلكترونية",
    icon: Wallet,
    codes: ["wallet", "e_wallet", "customer_wallet", "apple_pay", "stc_pay"],
    tone: "bg-amber-50 text-amber-600",
  },
  {
    key: "bank_transfer",
    label: "تحويل بنكي",
    icon: Landmark,
    codes: ["bank_transfer", "transfer"],
    tone: "bg-cyan-50 text-cyan-600",
  },
  {
    key: "other",
    label: "أخرى",
    icon: MoreHorizontal,
    codes: [],
    tone: "bg-slate-100 text-slate-600",
  },
] as const

export function bucketKeyForPaymentMethod(code: string): string {
  const normalized = code.toLowerCase()
  const match = PAYMENT_METHOD_BUCKETS.find((bucket) =>
    (bucket.codes as readonly string[]).includes(normalized)
  )
  return match?.key ?? "other"
}

function bucketIcon(key: string): LucideIcon {
  return PAYMENT_METHOD_BUCKETS.find((bucket) => bucket.key === key)?.icon ?? MoreHorizontal
}

function bucketLabel(key: string): string {
  return PAYMENT_METHOD_BUCKETS.find((bucket) => bucket.key === key)?.label ?? "أخرى"
}

function bucketTone(key: string): string {
  return (
    PAYMENT_METHOD_BUCKETS.find((bucket) => bucket.key === key)?.tone ??
    "bg-slate-100 text-slate-600"
  )
}

// Plain 2-decimal number, no currency suffix -- the column header already states "(ر.س)", so
// repeating "ر.س" on every cell (what formatCurrency does) doesn't match the reference design.
function formatPlainNumber(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TH_CLASS = "px-3 py-2.5 text-[11px] font-semibold"
// Clearer/darker than MUTED (#6b7b96) -- that shade read as too pale/low-contrast for the actual
// data values (invoice counts, averages), as opposed to header labels where the lighter weight is
// intentional.
const DATA_MUTED = "text-[#44546b] font-bold"

export function NestedSourceTable({ groups }: { groups: SourceGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(sourceId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  if (groups.length === 0) {
    return <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
  }

  return (
    // A real <table> (not a per-row CSS grid) so every row shares the exact same column widths --
    // independent grids per row auto-size to each row's own content, which left numbers like
    // "230.00" vs "14,936.77" misaligned from one row to the next.
    <table className="w-full text-right">
      <thead>
        <tr className="border-b border-[#e1e7f0]">
          <th className={cn(TH_CLASS, "w-10")} />
          <th className={cn(TH_CLASS, "font-bold text-black")}>الاسم</th>
          <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
            إجمالي المبيعات (ر.س)
          </th>
          <th className={cn(TH_CLASS, "text-center font-bold text-black")}>عدد الفواتير</th>
          <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
            متوسط قيمة الفاتورة (ر.س)
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const isOpen = expanded.has(group.sourceId)
          return (
            <Fragment key={group.sourceId}>
              <tr
                role="button"
                tabIndex={0}
                onClick={() => toggle(group.sourceId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") toggle(group.sourceId)
                }}
                className={cn(
                  "cursor-pointer border-b border-[#f1f4f9] transition-colors",
                  isOpen ? "bg-[#eef4ff]" : "hover:bg-[#f8fafd]"
                )}
              >
                <td className="px-3 py-3">
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-[#6b7b96] transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </td>
                <td className={cn("px-3 py-3 text-[12.5px] font-semibold", HEADING)}>
                  {group.sourceName}
                </td>
                <td className={cn("px-3 py-3 text-center text-[12.5px] font-bold", HEADING)}>
                  {formatPlainNumber(group.totalSales)}
                </td>
                <td className={cn("px-3 py-3 text-center text-[12.5px]", DATA_MUTED)}>
                  {group.invoiceCount}
                </td>
                <td className={cn("px-3 py-3 text-center text-[12.5px]", DATA_MUTED)}>
                  {formatPlainNumber(group.avgInvoiceValue)}
                </td>
              </tr>
              {isOpen ? (
                <tr className="border-b border-[#f1f4f9]">
                  <td colSpan={5} className="bg-[#fafbfd] p-0">
                    <div className="px-4 py-3">
                      <div className="mb-3 flex items-center gap-2">
                        <h4
                          className={cn("flex items-center gap-2 text-[12.5px] font-bold", HEADING)}
                        >
                          <span className="flex size-6 items-center justify-center rounded-full bg-[#eef4ff] text-[#2878ff]">
                            <Wallet className="size-3.5" />
                          </span>
                          طرق الدفع ({group.sourceName})
                        </h4>
                      </div>
                      <table
                        className="w-full border-separate text-right"
                        style={{ borderSpacing: "0 6px" }}
                      >
                        <thead>
                          <tr>
                            <th className="px-3 py-1 text-[11px] font-bold text-black">
                              طريقة الدفع
                            </th>
                            <th className="px-3 py-1 text-center text-[11px] font-bold text-black">
                              عدد الفواتير
                            </th>
                            <th className="px-3 py-1 text-center text-[11px] font-bold text-black">
                              إجمالي المبيعات (ر.س)
                            </th>
                            <th className="px-3 py-1 text-center text-[11px] font-bold text-black">
                              النسبة من المصدر
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.paymentMethods.map((method) => {
                            const Icon = bucketIcon(method.paymentMethod)
                            const tone = bucketTone(method.paymentMethod)
                            return (
                              <tr
                                key={method.paymentMethod}
                                className="bg-white text-[12px] shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
                              >
                                <td className="rounded-s-[8px] px-3 py-2">
                                  <span
                                    className={cn("flex items-center gap-2 font-semibold", HEADING)}
                                  >
                                    <span
                                      className={cn(
                                        "flex size-7 shrink-0 items-center justify-center rounded-full",
                                        tone
                                      )}
                                    >
                                      <Icon className="size-3.5" />
                                    </span>
                                    {bucketLabel(method.paymentMethod)}
                                  </span>
                                </td>
                                <td className={cn("px-3 py-2 text-center", DATA_MUTED)}>
                                  {method.invoiceCount}
                                </td>
                                <td className={cn("px-3 py-2 text-center font-bold", HEADING)}>
                                  {formatPlainNumber(method.totalSales)}
                                </td>
                                <td className="rounded-e-[8px] px-3 py-2">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[#dde4ef]">
                                      <div
                                        className="h-full rounded-full bg-[#2878ff]"
                                        style={{ width: `${Math.min(method.pctOfSource, 100)}%` }}
                                      />
                                    </div>
                                    <span
                                      className={cn("w-14 shrink-0 text-[11px] font-bold", HEADING)}
                                    >
                                      {method.pctOfSource.toFixed(2)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
