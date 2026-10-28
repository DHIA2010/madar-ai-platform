"use client"

import { useState } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSwitch,
} from "@/components/app"

import { APPLICATION_LABEL } from "../services"
import type {
  AdminApplicationPricing,
  AdminCoupon,
  AdminCouponInput,
  BillingInterval,
} from "../types/platform-admin.types"

import type { PurchasableApplication } from "@/application/contracts"

const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"
// "تطبيقات مدار" is a showcase card that's never sold on its own -- never a coupon target either.
const COUPON_APPLICATIONS = (Object.keys(APPLICATION_LABEL) as PurchasableApplication[]).filter(
  (application) => application !== "madarApps"
)

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

function dateInput(iso: string | null): string {
  if (!iso) return ""
  // Stored as the end of that day in Riyadh -- show that day back.
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Creates or edits a coupon: its code and discount, and who it's for -- every application or
// just some (and optionally only some of their packages), monthly and/or yearly billing.
export function CouponEditorDialog({
  initial,
  pricing,
  onClose,
  onSave,
}: {
  initial: AdminCoupon | null
  pricing: AdminApplicationPricing[]
  onClose: () => void
  onSave: (input: AdminCouponInput) => Promise<void>
}) {
  const [code, setCode] = useState(initial?.code ?? "")
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    initial?.discountType ?? "percentage"
  )
  const [value, setValue] = useState(
    initial
      ? String(
          initial.discountType === "fixed" ? initial.discountValue / 100 : initial.discountValue
        )
      : "10"
  )
  const [applications, setApplications] = useState<PurchasableApplication[]>(
    initial?.applications ?? []
  )
  const [packageIds, setPackageIds] = useState<string[]>(initial?.packageIds ?? [])
  const [intervals, setIntervals] = useState<BillingInterval[]>(
    initial?.billingIntervals ?? ["monthly", "yearly"]
  )
  const [usageLimit, setUsageLimit] = useState(
    initial?.usageLimit === null || initial?.usageLimit === undefined
      ? ""
      : String(initial.usageLimit)
  )
  const [expiresOn, setExpiresOn] = useState(dateInput(initial?.expiresAt ?? null))
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const allApplications = applications.length === 0
  // Packages can be narrowed only once specific applications are chosen.
  const packageGroups = allApplications
    ? []
    : pricing.filter(
        (entry) => applications.includes(entry.application) && entry.packages.length > 0
      )

  function toggleApplication(application: PurchasableApplication) {
    const next = toggle(applications, application)
    setApplications(next)
    // Drop package choices that belong to an application no longer selected.
    const allowed = new Set(
      pricing
        .filter((entry) => next.includes(entry.application))
        .flatMap((entry) => entry.packages.map((pkg) => pkg.id))
    )
    setPackageIds((current) => current.filter((id) => allowed.has(id)))
  }

  async function handleSave() {
    const normalizedCode = code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{2,40}$/.test(normalizedCode)) {
      toast.error("كود الكوبون: حروف إنجليزية وأرقام فقط (من 2 إلى 40 خانة).")
      return
    }
    const amount = Number(value)
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (discountType === "percentage" && amount > 100)
    ) {
      toast.error(
        discountType === "percentage" ? "النسبة يجب أن تكون من 1 إلى 100." : "أدخل مبلغ خصم صحيح."
      )
      return
    }
    if (intervals.length === 0) {
      toast.error("اختر الاشتراك الشهري أو السنوي أو كليهما.")
      return
    }
    const limit = usageLimit.trim() === "" ? null : Number(usageLimit)
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error("حد الاستخدام يجب أن يكون رقماً صحيحاً أو فارغاً.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        code: normalizedCode,
        discountType,
        discountValue: discountType === "fixed" ? Math.round(amount * 100) : Math.round(amount),
        applications,
        packageIds,
        billingIntervals: intervals,
        usageLimit: limit,
        expiresOn: expiresOn || null,
        isActive,
      })
      onClose()
    } catch (error) {
      const errorCode = (error as { code?: string })?.code
      toast.error(
        errorCode === "COUPON_CODE_TAKEN" ? "يوجد كوبون بنفس الكود." : "تعذر حفظ الكوبون."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={<span dir="rtl">{initial ? `تعديل كوبون ${initial.code}` : "إضافة كوبون جديد"}</span>}
      description={
        <span dir="rtl">أنشئ كود خصم يمكن لعملاء مدار استخدامه عند الدفع بالبطاقة.</span>
      }
      contentClassName="[direction:rtl] max-w-[36rem] gap-5 p-6"
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
            onClick={handleSave}
          >
            {initial ? "حفظ الكوبون" : "إنشاء الكوبون"}
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="max-h-[64vh] space-y-5 overflow-y-auto">
        <div>
          <label className={FIELD_LABEL}>كود الكوبون</label>
          <AppInput
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="WELCOME20"
            dir="ltr"
            className="h-11 rounded-[10px] text-right font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={FIELD_LABEL}>نوع الخصم</label>
            <AppSelect
              value={discountType}
              onValueChange={(next) => setDiscountType(next as "percentage" | "fixed")}
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="percentage">نسبة مئوية (%)</AppSelectItem>
                <AppSelectItem value="fixed">مبلغ ثابت (SAR)</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
          <div>
            <label className={FIELD_LABEL}>
              {discountType === "percentage" ? "النسبة (%)" : "المبلغ (SAR)"}
            </label>
            <AppInput
              type="number"
              min={1}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-11 rounded-[10px]"
            />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>التطبيقات المشمولة</label>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={allApplications}
              onClick={() => {
                setApplications([])
                setPackageIds([])
              }}
            >
              جميع التطبيقات
            </Chip>
            {COUPON_APPLICATIONS.map((application) => (
              <Chip
                key={application}
                selected={applications.includes(application)}
                onClick={() => toggleApplication(application)}
              >
                {APPLICATION_LABEL[application]}
              </Chip>
            ))}
          </div>
        </div>

        {packageGroups.length > 0 ? (
          <div>
            <label className={FIELD_LABEL}>الباقات المشمولة</label>
            <p className="-mt-1 mb-2 text-xs text-muted-foreground">
              بدون اختيار = جميع باقات التطبيقات المحددة.
            </p>
            <div className="space-y-3">
              {packageGroups.map((group) => (
                <div key={group.application}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    {APPLICATION_LABEL[group.application]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.packages.map((pkg) => (
                      <Chip
                        key={pkg.id}
                        selected={packageIds.includes(pkg.id)}
                        onClick={() => setPackageIds((current) => toggle(current, pkg.id))}
                      >
                        {pkg.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className={FIELD_LABEL}>مدة الاشتراك</label>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={intervals.includes("monthly")}
              onClick={() => setIntervals((current) => toggle(current, "monthly"))}
            >
              شهري
            </Chip>
            <Chip
              selected={intervals.includes("yearly")}
              onClick={() => setIntervals((current) => toggle(current, "yearly"))}
            >
              سنوي
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={FIELD_LABEL}>عدد مرات الاستخدام (اختياري)</label>
            <AppInput
              type="number"
              min={1}
              value={usageLimit}
              onChange={(event) => setUsageLimit(event.target.value)}
              placeholder="غير محدود"
              className="h-11 rounded-[10px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              كم مرة يمكن استخدام الكوبون إجمالاً من جميع العملاء.
            </p>
          </div>
          <div>
            <label className={FIELD_LABEL}>آخر يوم للاستخدام (اختياري)</label>
            <AppInput
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
              className="h-11 rounded-[10px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">الكوبون مفعل</p>
            <p className="text-xs text-muted-foreground">الكوبون المعطل لا يقبل عند الدفع.</p>
          </div>
          <AppSwitch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>
    </AppDialog>
  )
}
