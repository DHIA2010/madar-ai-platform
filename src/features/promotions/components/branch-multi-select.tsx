"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Search, Store } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppInput, AppPopover, AppPopoverContent, AppPopoverTrigger } from "@/components/app"

import { FIELD_CLASS, MUTED } from "./promotion-styles"

// Picks the branches a promotion runs in -- none picked means every branch.
export function BranchMultiSelect({
  branches,
  selected,
  onChange,
}: {
  branches: Array<{ id: string; name: string }>
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = useTranslations("promotions.editor")
  const [search, setSearch] = useState("")
  const all = selected.length === 0
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return branches.filter((branch) => !query || branch.name.toLowerCase().includes(query))
  }, [branches, search])
  const chosenNames = branches
    .filter((branch) => selected.includes(branch.id))
    .map((branch) => branch.name)

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((entry) => entry !== id)
      : [...selected, id]
    // Every branch picked one by one is the same as "all branches".
    onChange(next.length === branches.length ? [] : next)
  }

  return (
    <AppPopover onOpenChange={(open) => !open && setSearch("")}>
      <AppPopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2.5 rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-start transition-colors hover:border-[#cfd8e6] data-[state=open]:border-[#ea580c] data-[state=open]:ring-3 data-[state=open]:ring-[#ea580c]/15"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#fff4e5] text-[#ea580c]">
            <Store className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0b1738]">
            {all ? t("allBranches") : chosenNames.join("، ")}
          </span>
          {!all ? (
            <span className="shrink-0 rounded-full bg-[#ea580c] px-2 py-0.5 text-[11px] font-bold text-white">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="size-4 shrink-0 text-[#95a4bd]" />
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[14px] border-[#e1e7f0] p-0 shadow-[0_12px_32px_rgba(11,23,56,0.14)]"
      >
        {branches.length > 6 ? (
          <div className="relative border-b border-[#eef2f8] p-2">
            <Search className="pointer-events-none absolute inset-y-0 start-5 my-auto size-4 text-[#95a4bd]" />
            <AppInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchBranches")}
              className={cn(FIELD_CLASS, "h-10 ps-9")}
            />
          </div>
        ) : null}
        {/* Opened over a dialog, whose scroll lock would otherwise swallow the wheel here. */}
        <div
          className="max-h-64 overflow-y-auto p-1.5"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <Row
            label={t("allBranches")}
            hint={t("allBranchesHint")}
            checked={all}
            round
            onClick={() => onChange([])}
          />
          <div className="my-1 h-px bg-[#eef2f8]" />
          {visible.length === 0 ? (
            <p className={cn("py-4 text-center text-[12px]", MUTED)}>{t("noBranches")}</p>
          ) : (
            visible.map((branch) => (
              <Row
                key={branch.id}
                label={branch.name}
                checked={selected.includes(branch.id)}
                onClick={() => toggle(branch.id)}
              />
            ))
          )}
        </div>
      </AppPopoverContent>
    </AppPopover>
  )
}

function Row({
  label,
  hint,
  checked,
  round = false,
  onClick,
}: {
  label: string
  hint?: string
  checked: boolean
  round?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-start transition-colors",
        checked ? "bg-[#fff4e5]" : "hover:bg-[#f7f9fc]"
      )}
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center border",
          round ? "rounded-full" : "rounded-[5px]",
          checked ? "border-[#ea580c] bg-[#ea580c] text-white" : "border-[#cfd8e6] bg-white"
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-[#0b1738]">{label}</span>
        {hint ? <span className={cn("block text-[11px]", MUTED)}>{hint}</span> : null}
      </span>
    </button>
  )
}
