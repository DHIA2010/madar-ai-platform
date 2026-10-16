import { useTranslations } from "next-intl"
import { Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"

import { HEADING, MUTED, PANEL } from "./expense-field"

// Plain arithmetic over the already-fetched expenses array (see use-expenses-overview.ts) --
// no AI/LLM involved, matching the user's explicit decision to drop AI invoice extraction from
// this module entirely.
export function ExpenseInsightsCard({ insights }: { insights: string[] }) {
  const t = useTranslations("expenses.overview")

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 flex items-center gap-2 text-[13.5px] font-bold", HEADING)}>
        <Lightbulb className="size-4 text-[#f59e0b]" />
        {t("insightsTitle")}
      </h3>
      {insights.length === 0 ? (
        <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>{t("insightsEmpty")}</p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((insight) => (
            <li key={insight} className="flex items-start gap-2 text-[12.5px]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2878ff]" />
              <span className={HEADING}>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
