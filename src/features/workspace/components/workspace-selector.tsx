"use client"

import { useState } from "react"
import { Boxes, ChevronDown, Store, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { useWorkspace } from "../hooks"
import { WorkspaceSelectorContent } from "./workspace-selector-content"

interface WorkspaceSelectorProps {
  triggerLabel?: string
  triggerAriaLabel?: string
  compact?: boolean
}

export function WorkspaceSelector({
  triggerLabel,
  triggerAriaLabel,
  compact = false,
}: WorkspaceSelectorProps = {}) {
  const { currentOrganization, currentWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)

  const resolvedLabel =
    triggerLabel ?? currentWorkspace?.name ?? currentOrganization?.name ?? "اختر مساحة العمل"

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={triggerAriaLabel ?? "فتح مدير مساحات العمل"}
          dir="rtl"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-full border border-[#e8edf3] bg-white px-3 py-2 text-start shadow-[0_1px_2px_rgba(15,30,62,0.04)] transition-colors hover:border-[#c7d9ff] hover:bg-[#f8faff]"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
            <Store className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[10.5px] font-medium text-[#8098b4]">
              مساحة العمل الحالية
            </span>
            <span className="truncate text-[12.5px] font-bold text-[#0d1b3e]">{resolvedLabel}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-[#8098b4]" />
        </button>
      ) : (
        <AppButton
          type="button"
          variant="outline"
          className="min-w-[220px] max-w-full justify-between overflow-hidden [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
          onClick={() => setOpen(true)}
          icon={<Store className="size-4" />}
          iconPosition="start"
          aria-label={triggerAriaLabel ?? "فتح مدير مساحات العمل"}
        >
          <span className="block truncate whitespace-nowrap text-start">{resolvedLabel}</span>
          <ChevronDown className={cn("size-4 shrink-0 opacity-70")} />
        </AppButton>
      )}

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={<span className="sr-only">إدارة مساحات العمل</span>}
        showCloseButton={false}
        contentClassName="!left-1/2 !right-auto grid-rows-[auto_minmax(0,1fr)] w-[min(1180px,94vw)] max-w-[1180px] max-h-[88vh] overflow-hidden rounded-2xl p-0 ring-0 [direction:rtl]"
      >
        <div dir="rtl" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-[#eef1f6] p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <Boxes className="size-5" />
            </span>
            <div className="min-w-0 flex-1 text-right">
              <h2 className="text-[17px] font-extrabold text-[#0d1b3e]">إدارة مساحات العمل</h2>
              <p className="mt-1 text-[12.5px] text-[#8098b4]">
                اختر منظمة لعرض مساحات العمل الخاصة بها، أو أنشئ مساحة عمل جديدة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#8098b4] transition-colors hover:bg-[#f4f7fc] hover:text-[#0d1b3e]"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-5">
            <WorkspaceSelectorContent onComplete={() => setOpen(false)} />
          </div>
        </div>
      </AppDialog>
    </>
  )
}
