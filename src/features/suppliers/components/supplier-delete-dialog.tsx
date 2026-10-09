"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AppConfirmDialog } from "@/components/app"

import { supplierService } from "../services"
import type { Supplier } from "../types"

export function SupplierDeleteDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: Supplier | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!target) return
    setLoading(true)
    try {
      await supplierService.remove(target.id)
      toast.success(`تم حذف ${target.name}.`)
      onDeleted()
      onOpenChange(false)
    } catch {
      toast.error("تعذر حذف المورد. حاول مرة أخرى.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!loading) onOpenChange(open)
      }}
      title={
        target ? (
          <span dir="rtl" className="flex items-center gap-3.5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-rose-50 text-rose-600">
              <Trash2 className="size-6" />
            </span>
            <span className="text-[19px] font-extrabold text-[#0b1738]">حذف {target.name}</span>
          </span>
        ) : (
          ""
        )
      }
      description={
        <span dir="rtl" className="text-[13.5px] leading-[22px] text-[#6b7b96]">
          سيتم حذف هذا المورد نهائيًا من القائمة. لا يمكن التراجع عن هذا الإجراء.
        </span>
      }
      confirmLabel="حذف"
      cancelLabel="إلغاء"
      confirmButtonClassName="h-12 flex-1 rounded-[10px] bg-rose-600 text-[14px] font-bold text-white shadow-sm hover:bg-rose-700"
      cancelButtonClassName="h-12 flex-1 rounded-[10px] border-[#e1e7f0] text-[14px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={() => onOpenChange(false)}
      contentClassName="[direction:rtl] max-w-[28rem] gap-5 p-6"
    />
  )
}
