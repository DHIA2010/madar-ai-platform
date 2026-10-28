"use client"

import { useEffect, useMemo, useState } from "react"
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

import { APPLICATION_LABEL, platformAdminService } from "../services"
import type { AdminApplicationPricing, BillingInterval } from "../types/platform-admin.types"

import type { PurchasableApplication } from "@/application/contracts"

const NO_PACKAGE = "none"
const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"

function riyalsInput(halalas: number | null): string {
  return halalas === null ? "" : String(halalas / 100)
}

// Turns an application (or the Madar Complete bundle) on for one customer from Madar Admin -- a
// deal agreed outside checkout, or a goodwill extension. Choosing a package prefills its price for
// the chosen period; clearing the price makes the subscription complimentary.
export function GrantSubscriptionDialog({
  customer,
  onClose,
  onGranted,
}: {
  customer: { id: string; name: string } | null
  onClose: () => void
  onGranted: () => void
}) {
  const [pricing, setPricing] = useState<AdminApplicationPricing[] | null>(null)
  const [application, setApplication] = useState<PurchasableApplication>("advertising")
  const [packageId, setPackageId] = useState<string>(NO_PACKAGE)
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly")
  const [price, setPrice] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customer || pricing) return
    platformAdminService
      .getPricing()
      .then(setPricing)
      .catch(() => toast.error("تعذر تحميل الباقات."))
  }, [customer, pricing])

  const packages = useMemo(
    () => pricing?.find((entry) => entry.application === application)?.packages ?? [],
    [pricing, application]
  )

  function prefillPrice(nextPackageId: string, nextInterval: BillingInterval) {
    const pkg = packages.find((entry) => entry.id === nextPackageId)
    setPrice(
      riyalsInput(
        pkg ? (nextInterval === "yearly" ? pkg.yearlyPriceHalalas : pkg.monthlyPriceHalalas) : null
      )
    )
  }

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
        packageId: packageId === NO_PACKAGE ? null : packageId,
        interval,
        priceHalalas: priceRiyals === null ? null : Math.round(priceRiyals * 100),
      })
      toast.success(`تم تفعيل ${APPLICATION_LABEL[application]} لـ ${customer.name}.`)
      setPrice("")
      setPackageId(NO_PACKAGE)
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
            onValueChange={(value) => {
              setApplication(value as PurchasableApplication)
              setPackageId(NO_PACKAGE)
              setPrice("")
            }}
          >
            <AppSelectTrigger className="h-11 w-full rounded-[10px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {(Object.keys(APPLICATION_LABEL) as PurchasableApplication[]).map((key) => (
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
              value={packageId}
              onValueChange={(value) => {
                setPackageId(value)
                prefillPrice(value, interval)
              }}
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value={NO_PACKAGE}>بدون باقة</AppSelectItem>
                {packages.map((pkg) => (
                  <AppSelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name}
                    {pkg.isActive ? "" : " (معطلة)"}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
          <div>
            <label className={FIELD_LABEL}>مدة الاشتراك</label>
            <AppSelect
              value={interval}
              onValueChange={(value) => {
                setBillingInterval(value as BillingInterval)
                if (packageId !== NO_PACKAGE) prefillPrice(packageId, value as BillingInterval)
              }}
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
