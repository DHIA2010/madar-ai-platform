"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppConfirmDialog } from "@/components/app"

import { type Locale, localeDirection } from "@/i18n/locales"

export interface ActivationTarget {
  id: string
  name: string
  priceLabel?: string
  confirmLabel: string
  // Optional -- lets the dialog mirror the app's own card/icon accent instead of a generic
  // look. Omit for targets with no single-app identity (there are none today, but the type
  // doesn't require it).
  icon?: LucideIcon
  iconWrapperClassName?: string
  confirmButtonClassName?: string
  // Defaults to "activate" -- switches the title/description/toast copy and the confirm button's
  // default styling to a removal-flavored one instead of the app's own accent color.
  intent?: "activate" | "deactivate"
}

export function ActivationConfirmDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: ActivationTarget | null
  onOpenChange: (open: boolean) => void
  onConfirm: (target: ActivationTarget) => Promise<void>
}) {
  const t = useTranslations("applications.confirmDialog")
  const locale = useLocale()
  const dir = localeDirection(locale as Locale)
  const [loading, setLoading] = useState(false)

  const isDeactivate = target?.intent === "deactivate"

  async function handleConfirm() {
    if (!target) return
    setLoading(true)
    try {
      await onConfirm(target)
      toast.success(
        t(isDeactivate ? "toastDeactivateSuccess" : "toastActivateSuccess", { name: target.name })
      )
      onOpenChange(false)
    } catch {
      toast.error(
        t(isDeactivate ? "toastDeactivateError" : "toastActivateError", { name: target.name })
      )
    } finally {
      setLoading(false)
    }
  }

  const Icon = target?.icon

  return (
    <AppConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!loading) onOpenChange(open)
      }}
      title={
        target ? (
          <span dir={dir} className="flex items-center gap-3.5">
            {Icon ? (
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-[14px]",
                  target.iconWrapperClassName ?? "bg-[#eef4ff] text-[#2878ff]"
                )}
              >
                <Icon className="size-6" />
              </span>
            ) : null}
            <span className="text-[19px] font-extrabold text-[#0b1738]">
              {isDeactivate ? t("deactivateVerb") : t("activateVerb")} {target.name}
            </span>
          </span>
        ) : (
          ""
        )
      }
      description={
        target ? (
          <span dir={dir} className="text-[13.5px] leading-[22px] text-[#6b7b96]">
            {t(isDeactivate ? "deactivateDescription" : "activateDescription", {
              name: target.name,
            })}
          </span>
        ) : null
      }
      confirmLabel={target?.confirmLabel ?? t("defaultConfirmLabel")}
      cancelLabel={t("cancelLabel")}
      confirmButtonClassName={cn(
        "h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm",
        isDeactivate
          ? "border border-[#e1e7f0] bg-white text-[#c2410c] hover:bg-[#fff2e8] hover:text-[#c2410c]"
          : target?.confirmButtonClassName
      )}
      cancelButtonClassName="h-12 flex-1 rounded-[10px] border-[#e1e7f0] text-[14px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={() => onOpenChange(false)}
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        "max-w-[32rem] gap-5 p-6"
      )}
    >
      {target?.priceLabel ? (
        <div
          dir={dir}
          className="flex items-center justify-between rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] px-5 py-4"
        >
          <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#6b7b96]">
            <CheckCircle2 className="size-4 text-[#16a34a]" />
            {t("subscriptionPrice")}
          </span>
          <span className="text-[15px] font-extrabold text-[#0b1738]">{target.priceLabel}</span>
        </div>
      ) : null}
    </AppConfirmDialog>
  )
}
