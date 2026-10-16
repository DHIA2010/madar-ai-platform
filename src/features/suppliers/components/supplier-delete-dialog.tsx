"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppConfirmDialog } from "@/components/app"

import { supplierService } from "../services"
import type { Supplier } from "../types"

import { type Locale, localeDirection } from "@/i18n/locales"

export function SupplierDeleteDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: Supplier | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const t = useTranslations("suppliers.deleteDialog")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!target) return
    setLoading(true)
    try {
      await supplierService.remove(target.id)
      toast.success(t("toastSuccess", { name: target.name }))
      onDeleted()
      onOpenChange(false)
    } catch {
      toast.error(t("toastError"))
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
          <span dir={localeDirection(locale as Locale)} className="flex items-center gap-3.5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-rose-50 text-rose-600">
              <Trash2 className="size-6" />
            </span>
            <span className="text-[19px] font-extrabold text-[#0b1738]">
              {t("title", { name: target.name })}
            </span>
          </span>
        ) : (
          ""
        )
      }
      description={
        <span
          dir={localeDirection(locale as Locale)}
          className="text-[13.5px] leading-[22px] text-[#6b7b96]"
        >
          {t("description")}
        </span>
      }
      confirmLabel={t("confirmLabel")}
      cancelLabel={tCommon("cancel")}
      confirmButtonClassName="h-12 flex-1 rounded-[10px] bg-rose-600 text-[14px] font-bold text-white shadow-sm hover:bg-rose-700"
      cancelButtonClassName="h-12 flex-1 rounded-[10px] border-[#e1e7f0] text-[14px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={() => onOpenChange(false)}
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        "max-w-[28rem] gap-5 p-6"
      )}
    />
  )
}
