"use client"

import type { LucideIcon } from "lucide-react"
import { ChevronLeft, Store } from "lucide-react"

import { cn } from "@/lib/utils"

// Same surface language as the Categories / Suppliers list pages.
export const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"
export const PRIMARY_BUTTON_CLASS =
  "h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
export const PAGE_SIZE = 12

export const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
} as const

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
        <span
          className={cn("flex size-9 items-center justify-center rounded-[10px]", KPI_TONE[tone])}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("mt-3 text-[22px] font-extrabold", HEADING)}>{value}</p>
    </div>
  )
}

export function BranchChip({ name, tone }: { name: string; tone: "from" | "to" }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[11rem] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
        tone === "from"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      )}
    >
      <Store className="size-3.5 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
}) {
  if (totalPages <= 1) return null
  const navButton =
    "flex h-10 items-center gap-1 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12.5px] font-semibold text-[#6b7b96] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-50"
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={navButton}
      >
        <ChevronLeft className="size-4 rtl:rotate-180" />
        {previousLabel}
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <button
          key={pageNumber}
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
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={navButton}
      >
        {nextLabel}
        <ChevronLeft className="size-4 ltr:rotate-180" />
      </button>
    </div>
  )
}
