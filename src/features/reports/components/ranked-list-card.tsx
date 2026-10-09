import { cn } from "@/lib/utils"

import { formatCurrency, HEADING, MUTED, PANEL } from "./ready-report-field"

// Generalized from src/features/expenses/components/expenses-by-workspace-card.tsx's ranked-list
// pattern -- any label/value list (top customers, top products, top branches, ...).
export function RankedListCard({
  title,
  entries,
  emptyLabel = "لا توجد بيانات",
}: {
  title: string
  entries: Array<{ label: string; value: number }>
  emptyLabel?: string
}) {
  const maxValue = Math.max(...entries.map((entry) => entry.value), 1)

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{title}</h3>
      {entries.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={entry.label} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[11.5px] font-bold text-[#2878ff]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                    {entry.label}
                  </span>
                  <span className={cn("shrink-0 text-[12px] font-bold", HEADING)}>
                    {formatCurrency(entry.value)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f8]">
                  <div
                    className="h-full rounded-full bg-[#2878ff]"
                    style={{ width: `${(entry.value / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
