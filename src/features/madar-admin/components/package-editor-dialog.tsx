"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AppButton, AppDialog, AppInput, AppSwitch, AppTextarea } from "@/components/app"

import type { AdminPackage, PackageInput } from "../types/platform-admin.types"

const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"

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
  const [isRecommended, setIsRecommended] = useState(initial?.isRecommended ?? false)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const monthlyHalalas = toHalalas(monthly)
  const yearlyHalalas = toHalalas(yearly)
  const saving12 =
    typeof monthlyHalalas === "number" && typeof yearlyHalalas === "number" && monthlyHalalas > 0
      ? Math.round(((monthlyHalalas * 12 - yearlyHalalas) / (monthlyHalalas * 12)) * 100)
      : null

  async function handleSave() {
    if (!name.trim()) {
      toast.error("يرجى إدخال اسم الباقة.")
      return
    }
    if (monthlyHalalas === "invalid" || yearlyHalalas === "invalid") {
      toast.error("يرجى إدخال أسعار صحيحة أو تركها فارغة.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        features: features
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        monthlyPriceHalalas: monthlyHalalas,
        yearlyPriceHalalas: yearlyHalalas,
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
