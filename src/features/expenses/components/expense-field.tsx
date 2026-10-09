import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Mirrors src/features/purchases/components/purchase-field.tsx's own constants exactly --
// duplicated per this codebase's established convention (each feature keeps its own copy rather
// than reaching into another feature's internals).
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

export function ExpensePagination({
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

export function ExpenseField({
  label,
  required = false,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <div>
      <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
        {label}
        {required ? <span className="text-[#e0484d]"> *</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{error}</p> : null}
    </div>
  )
}
