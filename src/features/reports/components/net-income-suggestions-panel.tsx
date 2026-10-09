import { Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"

import type { NetIncomeTotals } from "../types"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

type BadgeTone = "high" | "growth" | "optimize" | "stable"

const BADGE_META: Record<BadgeTone, { label: string; className: string }> = {
  high: { label: "أولوية عالية", className: "bg-rose-50 text-rose-600" },
  growth: { label: "فرصة نمو", className: "bg-emerald-50 text-emerald-600" },
  optimize: { label: "تحسين الربحية", className: "bg-amber-50 text-amber-600" },
  stable: { label: "مستقر", className: "bg-slate-100 text-slate-600" },
}

interface Suggestion {
  title: string
  description: string
  tone: BadgeTone
}

// Plain threshold-based advisory cards -- no AI involved, matching this session's established
// pattern (src/features/expenses/hooks/use-expenses-overview.ts's rule-based insights) and the
// user's earlier explicit decision to drop AI from the Expenses module entirely.
function buildSuggestions(totals: NetIncomeTotals): Suggestion[] {
  const expenseRatio = totals.sales > 0 ? totals.expenses / totals.sales : 0
  const cogsRatio = totals.sales > 0 ? totals.cogs / totals.sales : 0
  const returnRatio = totals.sales > 0 ? totals.returns / totals.sales : 0

  return [
    {
      title: "مراجعة المصروفات",
      description:
        expenseRatio > 0.5
          ? `المصروفات تمثل ${Math.round(expenseRatio * 100)}% من المبيعات -- راجع البنود الأكبر لخفضها.`
          : `المصروفات تمثل ${Math.round(expenseRatio * 100)}% من المبيعات، ضمن نطاق معقول.`,
      tone: expenseRatio > 0.5 ? "high" : "optimize",
    },
    {
      title: "تحسين المبيعات",
      description: `إجمالي المبيعات ${Math.round(totals.sales).toLocaleString("en-US")} ر.س خلال الفترة -- زيادة حجم المبيعات تخفف أثر المصروفات الثابتة.`,
      tone: "growth",
    },
    {
      title: "مراجعة تكلفة المنتجات",
      description:
        cogsRatio > 0.4
          ? `تكلفة المنتجات المباعة تمثل ${Math.round(cogsRatio * 100)}% من المبيعات -- راجع تسعير الموردين.`
          : `تكلفة المنتجات المباعة تمثل ${Math.round(cogsRatio * 100)}% من المبيعات.`,
      tone: "optimize",
    },
    {
      title: "متابعة المرتجعات",
      description:
        returnRatio > 0.05
          ? `المرتجعات تمثل ${Math.round(returnRatio * 100)}% من المبيعات -- راجع أسباب الإرجاع المتكررة.`
          : `المرتجعات منخفضة (${Math.round(returnRatio * 100)}% من المبيعات).`,
      tone: returnRatio > 0.05 ? "high" : "stable",
    },
  ]
}

export function NetIncomeSuggestionsPanel({ totals }: { totals: NetIncomeTotals }) {
  const suggestions = buildSuggestions(totals)

  return (
    <div className={cn(PANEL, "flex h-full flex-col p-4")}>
      <h3 className={cn("mb-3 flex items-center gap-2 text-[13.5px] font-bold", HEADING)}>
        <Lightbulb className="size-4 text-[#f59e0b]" />
        مقترحات لتحسين صافي الدخل
      </h3>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div key={suggestion.title} className="rounded-[12px] border border-[#eef2f8] p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className={cn("text-[12.5px] font-bold", HEADING)}>{suggestion.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold",
                  BADGE_META[suggestion.tone].className
                )}
              >
                {BADGE_META[suggestion.tone].label}
              </span>
            </div>
            <p className={cn("text-[12px] leading-relaxed", MUTED)}>{suggestion.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
