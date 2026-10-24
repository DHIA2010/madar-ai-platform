// Renders a formatted POS sale note -- shared by the FormattedNoteEditor's own live preview and
// the printed receipt (ThermalInvoiceReceipt.tsx), so "what you see while editing" and "what
// actually prints" can never drift apart. Falls back to the legacy flattened plain-text rendering
// (one centered block, newlines collapsed) for an invoice created before this feature existed --
// see pos-invoices.service.ts's Invoice.notesLines, null for exactly that case.

import { cn } from "@/lib/utils"

import type { NoteLine } from "../services/pos-saved-notes.service"

const ALIGN_CLASS: Record<NoteLine["align"], string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

export function NoteLines({
  lines,
  plainText,
  className,
}: {
  lines: NoteLine[] | null
  plainText: string | null
  className?: string
}) {
  if (lines && lines.length > 0) {
    return (
      <div className={className}>
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(ALIGN_CLASS[line.align], line.bold ? "font-bold" : "font-normal")}
            style={{ fontSize: line.fontSize, color: line.color }}
          >
            {line.text || " "}
          </div>
        ))}
      </div>
    )
  }

  if (plainText) {
    return <div className={cn("text-center", className)}>{plainText}</div>
  }

  return null
}
