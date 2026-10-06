"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import { CheckCircle2, CreditCard, Landmark, Scale, Sparkles, Upload } from "lucide-react"
import { toast } from "sonner"

import { fileToBase64 } from "@/lib/file-to-base64"
import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { MoyasarPaymentPanel } from "@/features/billing"

import { PLAN_TIER_ACCENT, PLAN_TIER_META, PLAN_TIER_ORDER } from "../services"
import type { ApplicationCategoryId } from "../types"
import { PlanComparisonDialog } from "./plan-comparison-dialog"

import type { SubscriptionPlanTier } from "@/application/contracts"

export interface ActivationRequestTarget {
  applicationId: string
  category: ApplicationCategoryId
  name: string
  icon?: LucideIcon
  iconWrapperClassName?: string
  // Whether this application hasn't used its one-time free trial yet (and isn't already active/
  // pending) -- shows the "ابدأ تجربة مجانية" option above the paid-tier form when true.
  trialAvailable?: boolean
}

// Enterprise has no fixed self-serve price (see plan-tiers.ts's "تواصل معنا") -- Moyasar checkout
// only ever charges a known amount, so that tier stays on the manual bank-transfer review path
// regardless of which payment-method tab is active.
const MOYASAR_ELIGIBLE_TIERS: ReadonlySet<SubscriptionPlanTier> = new Set([
  "starter",
  "growth",
  "pro",
])

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
  onStartTrial,
}: {
  target: ActivationRequestTarget | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ActivationRequestInput) => Promise<void>
  onStartTrial: (applicationId: string) => Promise<void>
}) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionPlanTier>("growth")
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer">("card")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)

  const Icon = target?.icon
  const isCardCheckout = paymentMethod === "card" && MOYASAR_ELIGIBLE_TIERS.has(selectedTier)

  function reset() {
    setSelectedTier("growth")
    setPaymentMethod("card")
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

  async function handleStartTrial() {
    if (!target) return
    setStartingTrial(true)
    try {
      await onStartTrial(target.applicationId)
      toast.success(`تم تفعيل تجربة ${target.name} المجانية لمدة 7 أيام.`)
      reset()
      onOpenChange(false)
    } catch {
      toast.error("تعذر بدء التجربة المجانية. حاول مرة أخرى.")
    } finally {
      setStartingTrial(false)
    }
  }

  return (
    <>
      <AppDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (submitting || startingTrial) return
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
              اختر الباقة المناسبة، وادفع ببطاقتك فورًا أو أرفق إيصال تحويل بنكي -- التفعيل عبر
              البطاقة فوري، وعبر التحويل البنكي بعد مراجعة الطلب.
            </span>
          ) : null
        }
        contentClassName="[direction:rtl] max-w-[34rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
              disabled={submitting || startingTrial}
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </AppButton>
            {isCardCheckout ? null : (
              <AppButton
                className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
                loading={submitting}
                disabled={startingTrial}
                onClick={handleSubmit}
              >
                إرسال الطلب
              </AppButton>
            )}
          </div>
        }
      >
        {target ? (
          <div dir="rtl" className="space-y-5">
            {target.trialAvailable ? (
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#2878ff] p-4 shadow-[0_6px_16px_rgba(40,120,255,0.3)]">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/15 text-white">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-extrabold text-white">جرّب مجانًا لمدة 7 أيام</p>
                    <p className="text-[11.5px] font-medium text-white/80">
                      بدون دفع، وبدون انتظار موافقة.
                    </p>
                  </div>
                </div>
                <AppButton
                  className="h-10 shrink-0 rounded-[10px] bg-white px-4 text-[13px] font-bold text-[#2878ff] shadow-sm hover:bg-white/90 hover:text-[#2878ff] active:bg-white/80 active:text-[#2878ff]"
                  loading={startingTrial}
                  disabled={submitting}
                  onClick={handleStartTrial}
                >
                  ابدأ التجربة
                </AppButton>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[12.5px] font-semibold text-[#0b1738]">الباقة</label>
                <button
                  type="button"
                  onClick={() => setComparisonOpen(true)}
                  className="flex items-center gap-1 text-[11.5px] font-semibold text-[#2878ff] hover:underline"
                >
                  <Scale className="size-3.5" />
                  مقارنة الباقات
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {PLAN_TIER_ORDER.map((tier) => {
                  const meta = PLAN_TIER_META[tier]
                  const accent = PLAN_TIER_ACCENT[tier]
                  const TierIcon = accent.icon
                  const selected = selectedTier === tier
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setSelectedTier(tier)
                        // Enterprise has no fixed self-serve price -- selecting it while on the
                        // card tab must not leave the dialog in a dead state with no submit path.
                        if (!MOYASAR_ELIGIBLE_TIERS.has(tier)) {
                          setPaymentMethod("bank_transfer")
                        }
                      }}
                      className={cn(
                        "rounded-[12px] border p-3.5 text-right transition-colors",
                        selected
                          ? "border-[#2878ff] bg-[#eef4ff]"
                          : "border-[#e1e7f0] bg-white hover:border-[#c4d5f0]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-[13px] font-bold",
                            selected ? "text-[#2878ff]" : "text-[#0b1738]"
                          )}
                        >
                          {meta.name}
                        </p>
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[8px]",
                            accent.iconWrapperClassName
                          )}
                        >
                          <TierIcon className="size-3.5" />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-[#6b7b96]">
                        {meta.priceLabel}
                        {meta.billingSuffix ? ` / ${meta.billingSuffix}` : ""}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {MOYASAR_ELIGIBLE_TIERS.has(selectedTier) ? (
              <div className="grid grid-cols-2 gap-2 rounded-[12px] bg-[#f1f4f9] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-bold transition-colors",
                    paymentMethod === "card"
                      ? "bg-white text-[#2878ff] shadow-sm"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                >
                  <CreditCard className="size-3.5" />
                  ادفع الآن
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-bold transition-colors",
                    paymentMethod === "bank_transfer"
                      ? "bg-white text-[#2878ff] shadow-sm"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                >
                  <Landmark className="size-3.5" />
                  تحويل بنكي
                </button>
              </div>
            ) : null}

            {isCardCheckout && target ? (
              <MoyasarPaymentPanel
                key={selectedTier}
                application={target.category}
                applicationName={target.name}
                planTier={selectedTier as "starter" | "growth" | "pro"}
              />
            ) : (
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
            )}
          </div>
        ) : null}
      </AppDialog>

      <PlanComparisonDialog open={comparisonOpen} onOpenChange={setComparisonOpen} />
    </>
  )
}
