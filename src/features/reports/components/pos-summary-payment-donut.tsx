"use client"

import { useLocale, useTranslations } from "next-intl"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { cn } from "@/lib/utils"

import { CHART_COLORS, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

import type { Locale } from "@/i18n/locales"

export interface PosSummaryPaymentRow {
  paymentMethodCode: string
  amount: number
  percentage: number
}

function formatCurrency(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

// nameByCode resolves a payment_method_code (e.g. "mada", "apple_pay") to its real configured
// display name (posPaymentMethodsService.list(), fetched once by the parent dashboard) -- falls
// back to the raw code for anything not found, same as how the cart checkout screen already
// handles an unresolved code.
export function PosSummaryPaymentDonut({
  rows,
  nameByCode,
}: {
  rows: PosSummaryPaymentRow[]
  nameByCode: Record<string, string>
}) {
  const t = useTranslations("dashboard.posSummary")
  const locale = useLocale() as Locale
  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{t("paymentMethodsTitle")}</h3>
      {rows.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="paymentMethodCode"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {rows.map((row, index) => (
                    <Cell
                      key={row.paymentMethodCode}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, item) => [
                    formatCurrencyCompact(value),
                    nameByCode[(item.payload as PosSummaryPaymentRow).paymentMethodCode] ??
                      (item.payload as PosSummaryPaymentRow).paymentMethodCode,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className={cn("text-[10.5px]", MUTED)}>{formatCurrencyCompact(total)}</p>
              <p className={cn("text-[13px] font-extrabold", HEADING)}>
                {locale === "ar" ? "ر.س" : "SAR"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {rows.map((row, index) => (
              <div key={row.paymentMethodCode} className="flex items-center gap-2 text-[12px]">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className={cn("min-w-0 flex-1 truncate font-semibold", HEADING)}>
                  {nameByCode[row.paymentMethodCode] ?? row.paymentMethodCode}
                </span>
                <span className={cn("shrink-0 font-bold", HEADING)}>
                  {row.percentage.toFixed(0)}%
                </span>
                <span className={cn("shrink-0", MUTED)}>{formatCurrency(row.amount, locale)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
