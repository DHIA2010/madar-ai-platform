"use client"

// The dropdown used across the Add Product page: a trigger showing the chosen option with its
// own icon tile, and a panel that filters as you type and marks the current selection.
//
// A plain <Select> was fine for a handful of fixed choices but not for the component picker,
// where a real catalogue runs to hundreds of rows -- many sharing a name -- and scrolling was
// the only way to find anything.

import { useId, useMemo, useState, type Ref } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { tajawal } from "@/components/design/fonts"

export interface SelectOption {
  value: string
  label: string
  // Shown under the label -- a stock figure or category, so options that share a name can be
  // told apart. The component picker relies on this.
  hint?: string
  icon?: LucideIcon
  // Tailwind classes for the icon tile, written out in full: a class assembled at runtime
  // produces no CSS at all, because Tailwind generates utilities by scanning the source.
  tint?: string
  imageUrl?: string | null
  keywords?: string
}

const DEFAULT_TINT = "bg-[#eef4ff] text-[#2878ff]"
const TRIGGER_CLASS =
  "flex h-11 w-full cursor-pointer items-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-2.5 text-right text-[13px] text-[#0b1738] transition-colors hover:border-[#c4d5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/35 disabled:cursor-not-allowed disabled:opacity-60"

// Below this a search field is noise -- the whole list is already on screen.
const SEARCH_THRESHOLD = 5

function normalize(value: string) {
  // Arabic text is matched as typed; only case and surrounding space are normalized, since
  // stripping diacritics would need a transliteration table this page has no use for.
  return value.trim().toLowerCase()
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "اختر",
  searchPlaceholder = "بحث...",
  emptyLabel = "لا توجد نتائج",
  ariaLabel,
  disabled = false,
  triggerClassName,
  compact = false,
  footer,
  triggerRef,
  hideTriggerMark = false,
}: {
  value: string
  options: SelectOption[]
  onChange: (next: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  ariaLabel?: string
  disabled?: boolean
  triggerClassName?: string
  compact?: boolean
  // Lets a caller focus or open this control from elsewhere -- the bundle row's edit action
  // opens the picker for that row.
  triggerRef?: Ref<HTMLButtonElement>
  // For a row that already shows the selected item's thumbnail beside the control, so the
  // trigger does not repeat it.
  hideTriggerMark?: boolean
  // Rendered under the list -- used by the component picker to offer a manual entry when the
  // catalogue has nothing suitable.
  footer?: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // A combobox has to name the list it controls for assistive technology to follow the pair.
  const listboxId = useId()

  const selected = options.find((option) => option.value === value) ?? null
  const showSearch = options.length >= SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    const term = normalize(query)
    if (!term) return options
    return options.filter((option) =>
      normalize(`${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`).includes(term)
    )
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={cn(TRIGGER_CLASS, compact && "h-9 text-[12px]", triggerClassName)}
        >
          {/* RTL: the tile is written first so it lands to the right of the label. */}
          {hideTriggerMark ? null : <OptionMark option={selected} compact={compact} />}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-right",
              !selected && "text-[#95a4bd]",
              selected && "font-semibold"
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-[#95a4bd] transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>

      {/* Radix portals this to document.body, which does not inherit the page's dir. */}
      <PopoverContent
        dir="rtl"
        align="start"
        sideOffset={6}
        className={cn(
          tajawal.className,
          "w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-[16px] border-[#e1e7f0] p-1.5 shadow-[0_12px_32px_rgba(11,23,56,0.12)]"
        )}
      >
        {showSearch ? (
          // RTL: the magnifier is written first so it sits at the inline start (the right).
          <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-[#f4f6fa] px-3">
            <Search className="size-4 shrink-0 text-[#8996ad]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 min-w-0 flex-1 bg-transparent text-[12.5px] text-[#0b1738] outline-none placeholder:text-[#95a4bd]"
            />
          </div>
        ) : null}

        <div id={listboxId} role="listbox" className="max-h-[264px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[#6b7b96]">{emptyLabel}</p>
          ) : (
            filtered.map((option) => {
              const isSelected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-right transition-colors",
                    isSelected ? "bg-[#eaf1ff]" : "hover:bg-[#f4f7fc]"
                  )}
                  onClick={() => {
                    onChange(option.value)
                    close()
                  }}
                >
                  <OptionMark option={option} compact={compact} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[12.5px] text-[#0b1738]",
                        isSelected && "font-bold"
                      )}
                    >
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="block truncate text-[10.5px] text-[#6b7b96]">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <Check className="size-4 shrink-0 text-[#2878ff]" strokeWidth={3} />
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        {footer ? (
          <div className="mt-1.5 border-t border-[#eef2f8] pt-1.5">{footer(close)}</div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function OptionMark({ option, compact }: { option: SelectOption | null; compact: boolean }) {
  if (!option) return null

  const size = compact ? "size-6" : "size-8"

  if (option.imageUrl) {
    return (
      <span
        className={cn(
          size,
          "shrink-0 overflow-hidden rounded-[8px] border border-[#eef2f8] bg-[#fafbfe]"
        )}
      >
        {/* Remote storefront images cannot go through the default next/image loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={option.imageUrl} alt="" className="size-full object-cover" />
      </span>
    )
  }

  if (!option.icon) return null

  const Icon = option.icon
  return (
    <span
      className={cn(
        size,
        "flex shrink-0 items-center justify-center rounded-[8px]",
        option.tint ?? DEFAULT_TINT
      )}
    >
      <Icon className={compact ? "size-3.5" : "size-4"} />
    </span>
  )
}
