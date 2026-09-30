"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import { CheckCircle2, Upload } from "lucide-react"
import { toast } from "sonner"

import { fileToBase64 } from "@/lib/file-to-base64"
import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { PLAN_TIER_META, PLAN_TIER_ORDER } from "../services"

import type { SubscriptionPlanTier } from "@/application/contracts"

export interface ActivationRequestTarget {
  applicationId: string
  name: string
  icon?: LucideIcon
  iconWrapperClassName?: string
}

const ACCEPTED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
const ACCEPT_ATTR = ACCEPTED_CONTENT_TYPES.join(",")
const MAX_FILE_BYTES = 5 * 1024 * 1024

export interface ActivationRequestInput {
  applicationId: string
  planTier: SubscriptionPlanTier
  attachmentContentType: string
  attachmentDataBase64: string
}

// Replaces the old instant-activate confirm dialog for paid applications -- a customer now picks
// an account-wide plan tier and attaches a manual bank-transfer receipt, and the application stays
// "قيد المراجعة" until a Madar staff member approves the request from the internal admin console.
export function ActivationRequestDialog({
  target,
  onOpenChange,
  onSubmit,
}: {
  target: ActivationRequestTarget | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ActivationRequestInput) => Promise<void>
}) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionPlanTier>("growth")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const Icon = target?.icon

  function reset() {
    setSelectedTier("growth")
    setFile(null)
  }

  async function handleSubmit() {
    if (!target) return
    if (!file) {
      toast.error("يرجى إرفاق إيصال التحويل البنكي.")
      return
    }
    if (!ACCEPTED_CONTENT_TYPES.includes(file.type)) {
      toast.error("الملفات المقبولة: صور (PNG/JPEG/WebP) أو PDF فقط.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("يجب ألا يتجاوز حجم الملف 5 ميجابايت.")
      return
    }

    setSubmitting(true)
    try {
      const attachmentDataBase64 = await fileToBase64(file)
      await onSubmit({
        applicationId: target.applicationId,
        planTier: selectedTier,
        attachmentContentType: file.type,
        attachmentDataBase64,
      })
      toast.success(`تم إرسال طلب تفعيل ${target.name} للمراجعة.`)
      reset()
      onOpenChange(false)
    } catch {
      toast.error("تعذر إرسال طلب التفعيل. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (submitting) return
        if (!open) reset()
        onOpenChange(open)
      }}
      title={
        target ? (
          <span dir="rtl" className="flex items-center gap-3.5">
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
              طلب تفعيل {target.name}
            </span>
          </span>
        ) : (
          ""
        )
      }
      description={
        target ? (
          <span dir="rtl" className="text-[13.5px] leading-[22px] text-[#6b7b96]">
            اختر الباقة المناسبة وأرفق إيصال التحويل البنكي -- سيتم تفعيل التطبيق فور مراجعة الطلب
            والموافقة عليه.
          </span>
        ) : null
      }
      contentClassName="[direction:rtl] max-w-[34rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            variant="outline"
            className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </AppButton>
          <AppButton
            className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
            loading={submitting}
            onClick={handleSubmit}
          >
            إرسال الطلب
          </AppButton>
        </div>
      }
    >
      {target ? (
        <div dir="rtl" className="space-y-5">
          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-[#0b1738]">الباقة</label>
            <div className="grid grid-cols-2 gap-2.5">
              {PLAN_TIER_ORDER.map((tier) => {
                const meta = PLAN_TIER_META[tier]
                const selected = selectedTier === tier
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedTier(tier)}
                    className={cn(
                      "rounded-[12px] border p-3.5 text-right transition-colors",
                      selected
                        ? "border-[#2878ff] bg-[#eef4ff]"
                        : "border-[#e1e7f0] bg-white hover:border-[#c4d5f0]"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[13px] font-bold",
                        selected ? "text-[#2878ff]" : "text-[#0b1738]"
                      )}
                    >
                      {meta.name}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[#6b7b96]">
                      {meta.priceLabel}
                      {meta.billingSuffix ? ` / ${meta.billingSuffix}` : ""}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-[#0b1738]">
              إيصال التحويل البنكي
            </label>
            <label
              className={cn(
                "flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed text-center transition-colors",
                file
                  ? "border-[#16a34a] bg-[#f0fdf4]"
                  : "border-[#dbe6f8] bg-[#f7f9fd] hover:border-[#c4d5f0]"
              )}
            >
              <input
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <CheckCircle2 className="size-5 text-[#16a34a]" />
                  <span className="text-[12px] font-semibold text-[#16a34a]">{file.name}</span>
                </>
              ) : (
                <>
                  <Upload className="size-5 text-[#95a4bd]" />
                  <span className="text-[11.5px] text-[#6b7b96]">
                    اضغط لإرفاق صورة أو ملف PDF (حتى 5 ميجابايت)
                  </span>
                </>
              )}
            </label>
          </div>
        </div>
      ) : null}
    </AppDialog>
  )
}
