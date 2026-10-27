"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  AppButton,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { APPLICATION_LABEL, PLAN_META, PLAN_ORDER, platformAdminService } from "../services"
import type { PlanTier } from "../types"
import type { BillingInterval } from "../types/platform-admin.types"

import type { SubscriptionApplication } from "@/application/contracts"

const NO_PLAN = "none"
const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"

// Turns an application on for one customer from Madar Admin -- a deal agreed outside checkout, or
// a goodwill extension. Leaving the price empty makes it complimentary (no revenue counted).
export function GrantSubscriptionDialog({
  customer,
  onClose,
  onGranted,
}: {
  customer: { id: string; name: string } | null
  onClose: () => void
  onGranted: () => void
}) {
  const [application, setApplication] = useState<SubscriptionApplication>("advertising")
  const [planTier, setPlanTier] = useState<PlanTier | typeof NO_PLAN>("growth")
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly")
  const [price, setPrice] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleGrant() {
    if (!customer) return
    const priceRiyals = price.trim() === "" ? null : Number(price)
    if (priceRiyals !== null && (!Number.isFinite(priceRiyals) || priceRiyals < 0)) {
      toast.error("يرجى إدخال سعر صحيح أو تركه فارغاً.")
      return
    }
    setSaving(true)
    try {
      await platformAdminService.grantSubscription(customer.id, {
        application,
        planTier: planTier === NO_PLAN ? null : planTier,
        interval,
        priceHalalas: priceRiyals === null ? null : Math.round(priceRiyals * 100),
      })
      toast.success(`تم تفعيل ${APPLICATION_LABEL[application]} لـ ${customer.name}.`)
      setPrice("")
      onGranted()
      onClose()
    } catch {
      toast.error("تعذر تفعيل الاشتراك.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={customer !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={<span dir="rtl">تفعيل اشتراك</span>}
      description={
        <span dir="rtl">
          تفعيل تطبيق لـ {customer?.name} مباشرة من إدارة مدار. اترك السعر فارغاً ليكون مجانياً.
        </span>
      }
      contentClassName="[direction:rtl] max-w-[32rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            variant="outline"
            className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
            onClick={onClose}
          >
            إلغاء
          </AppButton>
          <AppButton
            className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
            loading={saving}
            onClick={handleGrant}
          >
            تفعيل الاشتراك
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="space-y-5">
        <div>
          <label className={FIELD_LABEL}>التطبيق</label>
          <AppSelect
            value={application}
            onValueChange={(value) => setApplication(value as SubscriptionApplication)}
          >
            <AppSelectTrigger className="h-11 w-full rounded-[10px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {(Object.keys(APPLICATION_LABEL) as SubscriptionApplication[]).map((key) => (
                <AppSelectItem key={key} value={key}>
                  {APPLICATION_LABEL[key]}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={FIELD_LABEL}>الباقة</label>
            <AppSelect
              value={planTier}
              onValueChange={(value) => setPlanTier(value as PlanTier | typeof NO_PLAN)}
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {PLAN_ORDER.map((tier) => (
                  <AppSelectItem key={tier} value={tier}>
                    {PLAN_META[tier].name}
                  </AppSelectItem>
                ))}
                <AppSelectItem value={NO_PLAN}>بدون باقة</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
          <div>
            <label className={FIELD_LABEL}>مدة الاشتراك</label>
            <AppSelect
              value={interval}
              onValueChange={(value) => setBillingInterval(value as BillingInterval)}
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="monthly">شهري</AppSelectItem>
                <AppSelectItem value="yearly">سنوي</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>السعر (SAR) — اختياري</label>
          <AppInput
            type="number"
            min={0}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="مجاني"
            className="h-11 rounded-[10px]"
          />
        </div>
      </div>
    </AppDialog>
  )
}
