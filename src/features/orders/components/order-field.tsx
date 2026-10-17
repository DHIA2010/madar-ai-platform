import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Mirrors src/features/expenses/components/expense-field.tsx's own constants exactly --
// duplicated per this codebase's established convention (each feature keeps its own copy rather
// than reaching into another feature's internals).
export const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"

export function OrderField({
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

export function OrderSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string | null
  children: ReactNode
}) {
  return (
    <section className={cn(PANEL, "p-4 md:p-5")}>
      <div className="mb-4">
        <h2 className={cn("text-[14px] font-extrabold", HEADING)}>{title}</h2>
        {description ? <p className={cn("mt-1 text-[11.5px]", MUTED)}>{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
