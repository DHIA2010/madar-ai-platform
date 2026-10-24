"use client"

// A per-line formatted note editor -- NOT contentEditable (fragile, accessibility-unfriendly, and
// nothing like it exists elsewhere in this codebase to build on). Instead: a vertical stack of
// plain controlled <input> "line rows," each with its own align/bold toggles. Enter inserts a new
// line after the current one (inheriting its formatting) and focuses it; Backspace on an empty,
// non-first line removes it and focuses the previous line -- the natural "press Enter for a new
// line" feel without contentEditable's fragility. Shared between the cashier's note dialog and the
// Settings -> Sale notes library dialog (see NotesSettings.tsx), so both ever only have one real
// implementation of this editor.

import { useRef } from "react"
import { useTranslations } from "next-intl"
import { AlignCenter, AlignLeft, AlignRight, Bold, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  NOTE_LINE_DEFAULT_COLOR,
  NOTE_LINE_DEFAULT_FONT_SIZE,
  NOTE_LINE_MAX_FONT_SIZE,
  NOTE_LINE_MIN_FONT_SIZE,
  type NoteLine,
  type NoteLineAlign,
} from "../services/pos-saved-notes.service"
import { NoteLines } from "./NoteLines"

export const MAX_NOTE_LINES = 10
export const MAX_NOTE_LINE_LENGTH = 100

const ALIGN_OPTIONS: NoteLineAlign[] = ["left", "center", "right"]
const ALIGN_ICON: Record<NoteLineAlign, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
}

function emptyLine(from?: NoteLine): NoteLine {
  return {
    text: "",
    bold: from?.bold ?? false,
    align: from?.align ?? "center",
    fontSize: from?.fontSize ?? NOTE_LINE_DEFAULT_FONT_SIZE,
    color: from?.color ?? NOTE_LINE_DEFAULT_COLOR,
  }
}

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return NOTE_LINE_DEFAULT_FONT_SIZE
  return Math.min(NOTE_LINE_MAX_FONT_SIZE, Math.max(NOTE_LINE_MIN_FONT_SIZE, Math.round(value)))
}

export function FormattedNoteEditor({
  value,
  onChange,
  className,
}: {
  value: NoteLine[]
  onChange: (next: NoteLine[]) => void
  className?: string
}) {
  const t = useTranslations("pos.noteEditor")
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  // Always at least one visible row, even when the caller's value is empty (a brand-new note) --
  // every edit still writes the full array back through onChange, so the parent's own "is this
  // note actually empty" check (all lines blank) stays accurate.
  const lines = value.length > 0 ? value : [emptyLine()]

  const updateLine = (index: number, patch: Partial<NoteLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const insertLineAfter = (index: number) => {
    if (lines.length >= MAX_NOTE_LINES) return
    const next = [...lines]
    next.splice(index + 1, 0, emptyLine(lines[index]))
    onChange(next)
    requestAnimationFrame(() => inputRefs.current[index + 1]?.focus())
  }

  const removeLine = (index: number) => {
    if (lines.length <= 1) return
    const next = lines.filter((_, i) => i !== index)
    onChange(next)
    requestAnimationFrame(() => {
      const target = inputRefs.current[index - 1]
      target?.focus()
      target?.setSelectionRange(target.value.length, target.value.length)
    })
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 rounded-[10px] border border-[#e8edf3] bg-white p-2"
          >
            <div className="flex items-center gap-1">
              <input
                ref={(element) => {
                  inputRefs.current[index] = element
                }}
                value={line.text}
                maxLength={MAX_NOTE_LINE_LENGTH}
                placeholder={t("linePlaceholder")}
                onChange={(event) => updateLine(index, { text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    insertLineAfter(index)
                  } else if (event.key === "Backspace" && line.text === "" && index > 0) {
                    event.preventDefault()
                    removeLine(index)
                  }
                }}
                style={{ fontSize: line.fontSize, color: line.color }}
                className={cn(
                  "h-9 flex-1 rounded-[8px] border border-[#e8edf3] bg-white px-2.5 outline-none placeholder:text-[#98A2B3] focus:border-[#2563eb]",
                  line.bold && "font-bold",
                  line.align === "left" && "text-left",
                  line.align === "center" && "text-center",
                  line.align === "right" && "text-right"
                )}
              />

              <button
                type="button"
                aria-label={t("lineRemoveAria")}
                disabled={lines.length <= 1}
                onClick={() => removeLine(index)}
                className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[#e0484d] transition-colors hover:bg-[#fdeeee] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-[8px] border border-[#e8edf3] bg-[#f7f9fc] p-0.5">
                {ALIGN_OPTIONS.map((align) => {
                  const Icon = ALIGN_ICON[align]
                  const ariaLabel =
                    align === "left"
                      ? t("lineAlignLeftAria")
                      : align === "center"
                        ? t("lineAlignCenterAria")
                        : t("lineAlignRightAria")
                  return (
                    <button
                      key={align}
                      type="button"
                      aria-label={ariaLabel}
                      aria-pressed={line.align === align}
                      onClick={() => updateLine(index, { align })}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-[6px] transition-colors",
                        line.align === align
                          ? "bg-white text-[#2563eb] shadow-[0_1px_2px_rgba(16,42,92,0.12)]"
                          : "text-[#8098b4] hover:text-[#0d1b3e]"
                      )}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-label={t("lineBoldAria")}
                  aria-pressed={line.bold}
                  onClick={() => updateLine(index, { bold: !line.bold })}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-[6px] transition-colors",
                    line.bold
                      ? "bg-white text-[#2563eb] shadow-[0_1px_2px_rgba(16,42,92,0.12)]"
                      : "text-[#8098b4] hover:text-[#0d1b3e]"
                  )}
                >
                  <Bold className="size-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-[8px] border border-[#e8edf3] bg-[#f7f9fc] px-1.5 py-0.5">
                <input
                  type="number"
                  aria-label={t("fontSizeAria")}
                  min={NOTE_LINE_MIN_FONT_SIZE}
                  max={NOTE_LINE_MAX_FONT_SIZE}
                  value={line.fontSize}
                  onChange={(event) =>
                    updateLine(index, { fontSize: clampFontSize(Number(event.target.value)) })
                  }
                  className="h-6 w-11 rounded-[4px] border border-[#e8edf3] bg-white text-center text-[12px] text-[#0d1b3e] outline-none focus:border-[#2563eb]"
                />
                <span className="text-[10px] text-[#8098b4]">{t("pxUnit")}</span>
              </div>

              <input
                type="color"
                aria-label={t("colorAria")}
                value={line.color}
                onChange={(event) => updateLine(index, { color: event.target.value })}
                className="size-7 cursor-pointer rounded-[6px] border border-[#e8edf3] bg-white p-0.5"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={lines.length >= MAX_NOTE_LINES}
        onClick={() => insertLineAfter(lines.length - 1)}
        className="flex items-center gap-1.5 self-start rounded-[8px] px-2 py-1.5 text-[12px] font-semibold text-[#2563eb] transition-colors hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        {t("addLine")}
      </button>
      {lines.length >= MAX_NOTE_LINES ? (
        <p className="text-[11px] text-[#98A2B3]">
          {t("maxLinesReached", { max: MAX_NOTE_LINES })}
        </p>
      ) : null}

      <div className="mt-1 rounded-[10px] border border-dashed border-[#e8edf3] bg-[#f7f9fc] p-3">
        <p className="mb-1.5 text-[10.5px] font-bold tracking-wide text-[#8098b4] uppercase">
          {t("previewLabel")}
        </p>
        <NoteLines lines={lines} plainText={null} className="text-[12px] text-[#0d1b3e]" />
      </div>
    </div>
  )
}
