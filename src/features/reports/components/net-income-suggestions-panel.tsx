import { useLocale, useTranslations } from "next-intl"
import { Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"

import type { NetIncomeTotals } from "../types"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

import type { Locale } from "@/i18n/locales"

type BadgeTone = "high" | "growth" | "optimize" | "stable"

type SuggestionsTranslator = ReturnType<typeof useTranslations<"reports.netIncome.suggestions">>

interface Suggestion {
  title: string
  description: string
  tone: BadgeTone
}

// Plain threshold-based advisory cards -- no AI involved, matching this session's established
// pattern (src/features/expenses/hooks/use-expenses-overview.ts's rule-based insights) and the
// user's earlier explicit decision to drop AI from the Expenses module entirely.
function buildSuggestions(
  totals: NetIncomeTotals,
  t: SuggestionsTranslator,
  locale: Locale
): Suggestion[] {
  const expenseRatio = totals.sales > 0 ? totals.expenses / totals.sales : 0
  const cogsRatio = totals.sales > 0 ? totals.cogs / totals.sales : 0
  const returnRatio = totals.sales > 0 ? totals.returns / totals.sales : 0
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const salesAmount = `${Math.round(totals.sales).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US")} ${currency}`

  return [
    {
      title: t("expenseReview.title"),
      description:
        expenseRatio > 0.5
          ? t("expenseReview.high", { percent: Math.round(expenseRatio * 100) })
          : t("expenseReview.ok", { percent: Math.round(expenseRatio * 100) }),
      tone: expenseRatio > 0.5 ? "high" : "optimize",
    },
    {
      title: t("salesImprovement.title"),
      description: t("salesImprovement.description", { amount: salesAmount }),
      tone: "growth",
    },
    {
      title: t("cogsReview.title"),
      description:
        cogsRatio > 0.4
          ? t("cogsReview.high", { percent: Math.round(cogsRatio * 100) })
          : t("cogsReview.ok", { percent: Math.round(cogsRatio * 100) }),
      tone: "optimize",
    },
    {
      title: t("returnsReview.title"),
      description:
        returnRatio > 0.05
          ? t("returnsReview.high", { percent: Math.round(returnRatio * 100) })
          : t("returnsReview.ok", { percent: Math.round(returnRatio * 100) }),
      tone: returnRatio > 0.05 ? "high" : "stable",
    },
  ]
}

const BADGE_CLASS: Record<BadgeTone, string> = {
  high: "bg-rose-50 text-rose-600",
  growth: "bg-emerald-50 text-emerald-600",
  optimize: "bg-amber-50 text-amber-600",
  stable: "bg-slate-100 text-slate-600",
}

export function NetIncomeSuggestionsPanel({ totals }: { totals: NetIncomeTotals }) {
  const t = useTranslations("reports.netIncome.suggestions")
  const locale = useLocale() as Locale
  const suggestions = buildSuggestions(totals, t, locale)

  return (
    <div className={cn(PANEL, "flex h-full flex-col p-4")}>
      <h3 className={cn("mb-3 flex items-center gap-2 text-[13.5px] font-bold", HEADING)}>
        <Lightbulb className="size-4 text-[#f59e0b]" />
        {t("title")}
      </h3>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div key={suggestion.title} className="rounded-[12px] border border-[#eef2f8] p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className={cn("text-[12.5px] font-bold", HEADING)}>{suggestion.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold",
                  BADGE_CLASS[suggestion.tone]
                )}
              >
                {t(`badges.${suggestion.tone}` as "badges.high")}
              </span>
            </div>
            <p className={cn("text-[12px] leading-relaxed", MUTED)}>{suggestion.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
