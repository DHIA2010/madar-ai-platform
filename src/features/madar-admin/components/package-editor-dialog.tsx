"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AppButton, AppDialog, AppInput, AppSwitch, AppTextarea } from "@/components/app"

import type { AdminPackage, PackageEntitlements, PackageInput } from "../types/platform-admin.types"

const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"

type EntitlementSwitch =
  | "invoiceReader"
  | "shiftCash"
  | "customRoles"
  | "procurement"
  | "customReports"
  | "invoicing"

// The switches a package can turn on (see the backend's subscriptions/entitlements.ts).
const ENTITLEMENT_SWITCHES: Array<{ key: EntitlementSwitch; label: string; hint: string }> = [
  {
    key: "shiftCash",
    label: "حركات النقد وتقارير الورديات",
    hint: "السحب والإيداع وتقرير الوردية التفصيلي (فتح وإغلاق الوردية متاح للجميع).",
  },
  {
    key: "customRoles",
    label: "الأدوار والصلاحيات المخصصة",
    hint: "إنشاء أدوار مخصصة وتعيينها للأعضاء.",
  },
  {
    key: "procurement",
    label: "الموردون والمشتريات والمصروفات",
    hint: "متاحة بدون اشتراك منفصل فيها.",
  },
  {
    key: "invoiceReader",
    label: "قارئ فواتير المشتريات",
    hint: "قراءة فواتير الموردين بالذكاء الاصطناعي.",
  },
  {
    key: "customReports",
    label: "التقارير المخصصة",
    hint: "منشئ التقارير بدون اشتراك منفصل فيه.",
  },
  {
    key: "invoicing",
    label: "الفواتير وعروض الأسعار",
    hint: "تطبيق فواتير المنشآت وعروض الأسعار بدون اشتراك منفصل فيه.",
  },
]

function riyals(halalas: number | null): string {
  return halalas === null ? "" : String(halalas / 100)
}

function toHalalas(value: string): number | null | "invalid" {
  if (value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid"
  return Math.round(parsed * 100)
}

// Creates or edits one package: its name, description, features (one per line), and a monthly
// and/or yearly price. A package with neither price can't be bought (useful for a "contact us"
// application's descriptive package).
export function PackageEditorDialog({
  open,
  initial,
  applicationLabel,
  onClose,
  onSave,
}: {
  open: boolean
  initial: AdminPackage | null
  applicationLabel: string
  onClose: () => void
  onSave: (input: PackageInput) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [features, setFeatures] = useState((initial?.features ?? []).join("\n"))
  const [monthly, setMonthly] = useState(riyals(initial?.monthlyPriceHalalas ?? null))
  const [yearly, setYearly] = useState(riyals(initial?.yearlyPriceHalalas ?? null))
  const [includedBranches, setIncludedBranches] = useState(String(initial?.includedBranches ?? 1))
  const [branchMonthly, setBranchMonthly] = useState(
    riyals(initial?.extraBranchMonthlyHalalas ?? null)
  )
  const [branchYearly, setBranchYearly] = useState(
    riyals(initial?.extraBranchYearlyHalalas ?? null)
  )
  const [isRecommended, setIsRecommended] = useState(initial?.isRecommended ?? false)
  const [entitlements, setEntitlements] = useState<PackageEntitlements>(initial?.entitlements ?? {})
  const [maxAdPlatforms, setMaxAdPlatforms] = useState(
    initial?.entitlements?.maxAdPlatforms === undefined
      ? ""
      : String(initial.entitlements.maxAdPlatforms)
  )
  const [maxStores, setMaxStores] = useState(
    initial?.entitlements?.maxStores === undefined ? "" : String(initial.entitlements.maxStores)
  )
  const toggleEntitlement = (key: EntitlementSwitch, on: boolean) =>
    setEntitlements((current) => ({ ...current, [key]: on }))
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const monthlyHalalas = toHalalas(monthly)
  const yearlyHalalas = toHalalas(yearly)
  const branchMonthlyHalalas = toHalalas(branchMonthly)
  const branchYearlyHalalas = toHalalas(branchYearly)
  const saving12 =
    typeof monthlyHalalas === "number" && typeof yearlyHalalas === "number" && monthlyHalalas > 0
      ? Math.round(((monthlyHalalas * 12 - yearlyHalalas) / (monthlyHalalas * 12)) * 100)
      : null

  async function handleSave() {
    if (!name.trim()) {
      toast.error("يرجى إدخال اسم الباقة.")
      return
    }
    if (
      monthlyHalalas === "invalid" ||
      yearlyHalalas === "invalid" ||
      branchMonthlyHalalas === "invalid" ||
      branchYearlyHalalas === "invalid"
    ) {
      toast.error("يرجى إدخال أسعار صحيحة أو تركها فارغة.")
      return
    }
    const included = Number(includedBranches)
    if (!Number.isInteger(included) || included < 1) {
      toast.error("عدد الفروع المشمولة يجب أن يكون 1 أو أكثر.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        includedBranches: included,
        entitlements: {
          ...Object.fromEntries(
            ENTITLEMENT_SWITCHES.filter(({ key }) => entitlements[key]).map(({ key }) => [
              key,
              true,
            ])
          ),
          ...(maxAdPlatforms.trim() === "" ? {} : { maxAdPlatforms: Number(maxAdPlatforms) }),
          ...(maxStores.trim() === "" ? {} : { maxStores: Number(maxStores) }),
        },
        name: name.trim(),
        description: description.trim(),
        features: features
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        monthlyPriceHalalas: monthlyHalalas,
        yearlyPriceHalalas: yearlyHalalas,
        extraBranchMonthlyHalalas: branchMonthlyHalalas,
        extraBranchYearlyHalalas: branchYearlyHalalas,
        isRecommended,
        isActive,
      })
      onClose()
    } catch {
      toast.error("تعذر حفظ الباقة.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={<span dir="rtl">{initial ? "تعديل الباقة" : "إضافة باقة جديدة"}</span>}
      description={<span dir="rtl">{applicationLabel}</span>}
      contentClassName="[direction:rtl] max-w-[34rem] gap-5 p-6"
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
            حفظ الباقة
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="max-h-[62vh] space-y-5 overflow-y-auto">
        <div>
          <label className={FIELD_LABEL}>اسم الباقة</label>
          <AppInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="مثال: Growth"
            className="h-11 rounded-[10px]"
          />
        </div>

        <div>
          <label className={FIELD_LABEL}>وصف مختصر (اختياري)</label>
          <AppInput
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="مثال: للأعمال النامية"
            className="h-11 rounded-[10px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className={FIELD_LABEL}>السعر الشهري (SAR)</label>
            <AppInput
              type="number"
              min={0}
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
              placeholder="غير متاح"
              className="h-11 rounded-[10px]"
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>السعر السنوي (SAR)</label>
            <AppInput
              type="number"
              min={0}
              value={yearly}
              onChange={(event) => setYearly(event.target.value)}
              placeholder="غير متاح"
              className="h-11 rounded-[10px]"
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          اترك أي سعر فارغاً لإخفاء تلك المدة.
          {saving12 !== null && saving12 > 0
            ? ` السنوي يوفّر على العميل ${saving12}% مقارنة بالدفع الشهري.`
            : ""}
        </p>

        <div className="rounded-[12px] border border-border p-3.5">
          <p className="text-sm font-semibold text-foreground">الفروع / مساحات العمل</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
            عدد الفروع المشمولة في سعر الباقة، وسعر كل فرع إضافي يضيفه العميل. اترك سعر الفرع فارغاً
            إذا كانت الباقة لا تبيع فروعاً. أجهزة الكاشير غير محدودة داخل الفرع.
          </p>
          <div className="mb-3.5">
            <label className={FIELD_LABEL}>الفروع المشمولة</label>
            <AppInput
              type="number"
              min={1}
              value={includedBranches}
              onChange={(event) => setIncludedBranches(event.target.value)}
              className="h-11 rounded-[10px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={FIELD_LABEL}>للفرع شهرياً (SAR)</label>
              <AppInput
                type="number"
                min={0}
                value={branchMonthly}
                onChange={(event) => setBranchMonthly(event.target.value)}
                placeholder="لا تبيع فروعاً"
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>للفرع سنوياً (SAR)</label>
              <AppInput
                type="number"
                min={0}
                value={branchYearly}
                onChange={(event) => setBranchYearly(event.target.value)}
                placeholder="لا تبيع فروعاً"
                className="h-11 rounded-[10px]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>المميزات (ميزة في كل سطر)</label>
          <AppTextarea
            value={features}
            onChange={(event) => setFeatures(event.target.value)}
            rows={5}
            placeholder={"حتى 3 متاجر\nتقارير متقدمة\nدعم أولوية"}
            className="rounded-[10px]"
          />
        </div>

        <div className="space-y-2.5">
          <div className="rounded-[12px] border border-border p-3.5">
            <p className="text-sm font-semibold text-foreground">مزايا الباقة</p>
            <p className="mb-2.5 mt-0.5 text-xs text-muted-foreground">
              ما تفتحه الباقة لمشتركيها -- يمنع الخادم أي ميزة غير مفعّلة هنا.
            </p>
            <div className="space-y-2">
              {ENTITLEMENT_SWITCHES.map(({ key, label, hint }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-[10px] bg-muted/40 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <AppSwitch
                    checked={entitlements[key] === true}
                    onCheckedChange={(on) => toggleEntitlement(key, on)}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className={FIELD_LABEL}>حد المنصات الإعلانية</label>
                  <AppInput
                    type="number"
                    min={0}
                    value={maxAdPlatforms}
                    onChange={(event) => setMaxAdPlatforms(event.target.value)}
                    placeholder="بدون حد"
                    className="h-11 rounded-[10px]"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>حد المتاجر</label>
                  <AppInput
                    type="number"
                    min={0}
                    value={maxStores}
                    onChange={(event) => setMaxStores(event.target.value)}
                    placeholder="بدون حد"
                    className="h-11 rounded-[10px]"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">الباقة الموصى بها</p>
              <p className="text-xs text-muted-foreground">تظهر بعلامة مميزة ومختارة افتراضياً.</p>
            </div>
            <AppSwitch checked={isRecommended} onCheckedChange={setIsRecommended} />
          </div>
          <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">الباقة مفعلة</p>
              <p className="text-xs text-muted-foreground">
                الباقة المعطلة لا تظهر للعملاء الجدد، ويحتفظ المشتركون الحاليون بها.
              </p>
            </div>
            <AppSwitch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
