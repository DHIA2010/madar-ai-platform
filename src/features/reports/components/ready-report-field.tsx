import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Duplicated from src/features/expenses/components/expense-field.tsx's own constants -- same
// convention every feature follows (page-local copies, not cross-feature imports).
export const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"

function visiblePages(page: number, totalPages: number, siblingCount = 1): number[] {
  const pages = new Set<number>([1, totalPages])
  for (let index = page - siblingCount; index <= page + siblingCount; index += 1) {
    if (index >= 1 && index <= totalPages) pages.add(index)
  }
  return [...pages].sort((left, right) => left - right)
}

export function ReadyReportPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  const pages = visiblePages(page, totalPages)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="flex h-10 items-center gap-1 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12.5px] font-semibold text-[#6b7b96] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronRight className="size-4" />
        السابق
      </button>
      {pages.map((pageNumber, index) => {
        const previous = pages[index - 1]
        const gap = previous && pageNumber - previous > 1
        return (
          <span key={pageNumber} className="flex items-center gap-2">
            {gap ? <span className="px-1 text-[12.5px] text-[#95a4bd]">...</span> : null}
            <button
              type="button"
              onClick={() => onPageChange(pageNumber)}
              aria-current={pageNumber === page ? "page" : undefined}
              className={cn(
                "flex h-10 min-w-10 items-center justify-center rounded-[10px] border px-3 text-[13px] font-bold transition-colors",
                pageNumber === page
                  ? "border-[#2878ff] bg-[#2878ff] text-white shadow-[0_4px_10px_rgba(40,120,255,0.3)]"
                  : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#c4d5f0] hover:bg-[#f7f9fd]"
              )}
            >
              {pageNumber}
            </button>
          </span>
        )
      })}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="flex h-10 items-center gap-1 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12.5px] font-semibold text-[#6b7b96] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-50"
      >
        التالي
        <ChevronLeft className="size-4" />
      </button>
    </div>
  )
}

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
} as const

// Only the net-income card uses this -- its whole card (not just the icon) is tinted to match the
// reference design: light red when negative, light green when positive.
const EMPHASIS_CARD_CLASS = {
  positive: "border-emerald-100 bg-emerald-50/60",
  negative: "border-rose-100 bg-rose-50/60",
} as const
const EMPHASIS_VALUE_CLASS = {
  positive: "text-emerald-600",
  negative: "text-rose-600",
} as const

export function ReadyReportKpiCard({
  label,
  value,
  icon: Icon,
  tone,
  trailing,
  emphasis,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof KPI_TONE
  trailing?: ReactNode
  emphasis?: "positive" | "negative"
}) {
  return (
    <div className={cn(PANEL, "p-4", emphasis && EMPHASIS_CARD_CLASS[emphasis])}>
      <div className="flex items-start justify-between">
        <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
        <span
          className={cn("flex size-9 items-center justify-center rounded-[10px]", KPI_TONE[tone])}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p
          className={cn(
            "text-[22px] font-extrabold",
            emphasis ? EMPHASIS_VALUE_CLASS[emphasis] : HEADING
          )}
        >
          {value}
        </p>
        {trailing}
      </div>
    </div>
  )
}

export function ReadyReportTrendBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return null
  const isUp = changePercent >= 0
  return (
    <span className={cn("text-[11.5px] font-bold", isUp ? "text-[#16a34a]" : "text-[#dc2626]")}>
      {isUp ? "+" : ""}
      {changePercent.toFixed(1)}%
    </span>
  )
}

export function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ر.س`
}
