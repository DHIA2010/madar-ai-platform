"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDateField, AppDialog, AppInput, AppSwitch } from "@/components/app"

import type {
  Promotion,
  PromotionDiscountType,
  PromotionInput,
  PromotionScope,
} from "../types/promotion.types"
import { BranchMultiSelect } from "./branch-multi-select"
import { type PickerProduct, ProductMultiPicker } from "./product-multi-picker"
import { FIELD_CLASS, FIELD_LABEL, MUTED } from "./promotion-styles"

import { type Locale, localeDirection } from "@/i18n/locales"

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
        "rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors",
        selected
          ? "bg-[#ea580c] text-white"
          : "border border-[#e1e7f0] text-[#6b7b96] hover:bg-[#f7f9fc]"
      )}
    >
      {children}
    </button>
  )
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]

const pad = (value: number) => String(value).padStart(2, "0")

// A stored instant back to the local day it falls on ("YYYY-MM-DD").
function toDay(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A day picked in the form to an instant: the start of that local day, or its very end.
function fromDay(day: string, edge: "start" | "end"): string | null {
  if (!day) return null
  const [year, month, date] = day.split("-").map(Number)
  return (
    edge === "start"
      ? new Date(year, month - 1, date, 0, 0, 0, 0)
      : new Date(year, month - 1, date, 23, 59, 59, 999)
  ).toISOString()
}

// 0 = Sunday ... 6 = Saturday, shown starting from Sunday as Saudi calendars do.
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

export function PromotionEditorDialog({
  initial,
  products,
  categories,
  branches,
  onClose,
  onSave,
}: {
  initial: Promotion | null
  products: PickerProduct[]
  categories: string[]
  branches: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (input: PromotionInput) => Promise<void>
}) {
  const t = useTranslations("promotions.editor")
  const locale = useLocale() as Locale
  const [name, setName] = useState(initial?.name ?? "")
  const [discountType, setDiscountType] = useState<PromotionDiscountType>(
    initial?.discountType ?? "percent"
  )
  const [value, setValue] = useState(initial ? String(initial.discountValue) : "10")
  const [maxPerUnit, setMaxPerUnit] = useState(
    initial?.maxDiscountPerUnit ? String(initial.maxDiscountPerUnit) : ""
  )
  const [amountIncludesTax, setAmountIncludesTax] = useState(initial?.amountIncludesTax ?? true)
  const [scope, setScope] = useState<PromotionScope>(initial?.scope ?? "all")
  const [productIds, setProductIds] = useState<string[]>(initial?.productIds ?? [])
  const [chosenCategories, setChosenCategories] = useState<string[]>(initial?.categories ?? [])
  const [excludedProductIds, setExcludedProductIds] = useState<string[]>(
    initial?.excludedProductIds ?? []
  )
  const [showExclusions, setShowExclusions] = useState(
    (initial?.excludedProductIds.length ?? 0) > 0
  )
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(initial?.workspaceIds ?? [])
  const [startDay, setStartDay] = useState(toDay(initial?.startsAt ?? null))
  const [endDay, setEndDay] = useState(toDay(initial?.endsAt ?? null))
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? [])
  const [limitHours, setLimitHours] = useState(Boolean(initial?.startTime))
  const [startTime, setStartTime] = useState(initial?.startTime ?? "16:00")
  const [endTime, setEndTime] = useState(initial?.endTime ?? "19:00")
  const [licenceNumber, setLicenceNumber] = useState(initial?.licenceNumber ?? "")
  const [isActive, setIsActive] = useState(!(initial?.isPaused ?? false))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const amount = Number(value)
    const cap = maxPerUnit.trim() === "" ? null : Number(maxPerUnit)
    if (!name.trim()) return void toast.error(t("errors.name"))
    if (!Number.isFinite(amount) || amount <= 0 || (discountType === "percent" && amount > 100)) {
      return void toast.error(discountType === "percent" ? t("errors.percent") : t("errors.amount"))
    }
    if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) {
      return void toast.error(t("errors.cap"))
    }
    if (scope === "products" && productIds.length === 0) {
      return void toast.error(t("errors.products"))
    }
    if (scope === "categories" && chosenCategories.length === 0) {
      return void toast.error(t("errors.categories"))
    }
    const startsAt = fromDay(startDay, "start")
    const endsAt = fromDay(endDay, "end")
    if (startsAt && endsAt && endsAt <= startsAt) return void toast.error(t("errors.dates"))

    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        discountType,
        discountValue: amount,
        maxDiscountPerUnit: discountType === "percent" ? cap : null,
        amountIncludesTax,
        scope,
        productIds: scope === "products" ? productIds : [],
        categories: scope === "categories" ? chosenCategories : [],
        excludedProductIds: scope !== "products" && showExclusions ? excludedProductIds : [],
        workspaceIds,
        startsAt,
        endsAt,
        daysOfWeek,
        startTime: limitHours ? startTime : null,
        endTime: limitHours ? endTime : null,
        licenceNumber: licenceNumber.trim() || null,
        isPaused: !isActive,
      })
      onClose()
    } catch {
      toast.error(t("errors.save"))
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
      title={
        <span dir={localeDirection(locale)}>{initial ? t("editTitle") : t("createTitle")}</span>
      }
      description={<span dir={localeDirection(locale)}>{t("description")}</span>}
      contentClassName={cn(
        "max-w-[38rem] gap-5 p-6",
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
      )}
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            variant="outline"
            className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
            onClick={onClose}
          >
            {t("cancel")}
          </AppButton>
          <AppButton
            className="h-12 flex-1 rounded-[10px] bg-[#ea580c] text-[14px] font-bold text-white shadow-sm hover:bg-[#c2410c]"
            loading={saving}
            onClick={handleSave}
          >
            {initial ? t("save") : t("create")}
          </AppButton>
        </div>
      }
    >
      <div dir={localeDirection(locale)} className="max-h-[64vh] space-y-5 overflow-y-auto px-0.5">
        <div>
          <label className={FIELD_LABEL}>{t("name")}</label>
          <AppInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            className={FIELD_CLASS}
          />
          <p className={cn("mt-1 text-[11.5px]", MUTED)}>{t("nameHint")}</p>
        </div>

        <div>
          <label className={FIELD_LABEL}>{t("discount")}</label>
          <div className="flex flex-wrap gap-2">
            <Chip selected={discountType === "percent"} onClick={() => setDiscountType("percent")}>
              {t("percent")}
            </Chip>
            <Chip selected={discountType === "fixed"} onClick={() => setDiscountType("fixed")}>
              {t("fixed")}
            </Chip>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <div>
              <AppInput
                type="number"
                min={0}
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className={FIELD_CLASS}
              />
              <p className={cn("mt-1 text-[11.5px]", MUTED)}>
                {discountType === "percent" ? t("percentHint") : t("fixedHint")}
              </p>
            </div>
            {discountType === "percent" ? (
              <div>
                <AppInput
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={maxPerUnit}
                  onChange={(event) => setMaxPerUnit(event.target.value)}
                  placeholder={t("capPlaceholder")}
                  className={FIELD_CLASS}
                />
                <p className={cn("mt-1 text-[11.5px]", MUTED)}>{t("capHint")}</p>
              </div>
            ) : null}
          </div>
          {/* Always offered. For a percentage the result is the same either way (a share of the
              price before VAT, or of the price with it, comes to the same amount off) -- there it
              decides how the cap is read, which the hint says. */}
          <div className="mt-3 rounded-[12px] bg-[#f7f9fc] p-1.5 ps-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-[#0b1738]">
                {discountType === "fixed" ? t("vat.amount") : t("vat.percent")}
              </p>
              <div className="flex shrink-0 rounded-[10px] bg-white p-1 shadow-[0_1px_2px_rgba(11,23,56,0.06)]">
                {[true, false].map((includes) => (
                  <button
                    key={String(includes)}
                    type="button"
                    onClick={() => setAmountIncludesTax(includes)}
                    className={cn(
                      "rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                      amountIncludesTax === includes
                        ? "bg-[#ea580c] text-white"
                        : "text-[#6b7b96] hover:text-[#0b1738]"
                    )}
                  >
                    {includes ? t("vat.includes") : t("vat.excludes")}
                  </button>
                ))}
              </div>
            </div>
            {discountType === "percent" ? (
              <p className={cn("mt-1.5 pe-2 pb-1 text-[11.5px] leading-5", MUTED)}>
                {t("vat.percentHint")}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>{t("appliesTo")}</label>
          <div className="flex flex-wrap gap-2">
            {(["all", "products", "categories"] as const).map((option) => (
              <Chip key={option} selected={scope === option} onClick={() => setScope(option)}>
                {t(`scope.${option}`)}
              </Chip>
            ))}
          </div>
          <div className="mt-2.5">
            {scope === "products" ? (
              <ProductMultiPicker
                products={products}
                selected={productIds}
                onChange={setProductIds}
              />
            ) : null}
            {scope === "categories" ? (
              categories.length === 0 ? (
                <p className={cn("text-[12px]", MUTED)}>{t("noCategories")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Chip
                      key={category}
                      selected={chosenCategories.includes(category)}
                      onClick={() => setChosenCategories((current) => toggle(current, category))}
                    >
                      {category}
                    </Chip>
                  ))}
                </div>
              )
            ) : null}
          </div>
          {scope !== "products" ? (
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between rounded-[10px] bg-[#f7f9fc] px-3.5 py-2.5">
                <div>
                  <p className="text-[12.5px] font-semibold text-[#0b1738]">{t("exclude")}</p>
                  <p className={cn("text-[11.5px]", MUTED)}>{t("excludeHint")}</p>
                </div>
                <AppSwitch checked={showExclusions} onCheckedChange={setShowExclusions} />
              </div>
              {showExclusions ? (
                <ProductMultiPicker
                  products={products}
                  selected={excludedProductIds}
                  onChange={setExcludedProductIds}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {branches.length > 1 ? (
          <div>
            <label className={FIELD_LABEL}>{t("branches")}</label>
            <BranchMultiSelect
              branches={branches}
              selected={workspaceIds}
              onChange={setWorkspaceIds}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL}>{t("startDate")}</label>
            <AppDateField value={startDay} onChange={setStartDay} placeholder={t("now")} />
          </div>
          <div>
            <label className={FIELD_LABEL}>{t("endDate")}</label>
            <AppDateField value={endDay} onChange={setEndDay} placeholder={t("noEnd")} />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL}>{t("days")}</label>
          <div className="flex flex-wrap gap-2">
            <Chip selected={daysOfWeek.length === 0} onClick={() => setDaysOfWeek([])}>
              {t("everyDay")}
            </Chip>
            {WEEK_DAYS.map((day) => (
              <Chip
                key={day}
                selected={daysOfWeek.includes(day)}
                onClick={() => setDaysOfWeek((current) => toggle(current, day))}
              >
                {t(`weekDays.${day}`)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-[10px] bg-[#f7f9fc] px-3.5 py-2.5">
            <div>
              <p className="text-[12.5px] font-semibold text-[#0b1738]">{t("hours")}</p>
              <p className={cn("text-[11.5px]", MUTED)}>{t("hoursHint")}</p>
            </div>
            <AppSwitch checked={limitHours} onCheckedChange={setLimitHours} />
          </div>
          {limitHours ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>{t("from")}</label>
                <AppInput
                  type="time"
                  dir="ltr"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>{t("to")}</label>
                <AppInput
                  type="time"
                  dir="ltr"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label className={FIELD_LABEL}>{t("licence")}</label>
          <AppInput
            value={licenceNumber}
            onChange={(event) => setLicenceNumber(event.target.value)}
            placeholder={t("licencePlaceholder")}
            className={FIELD_CLASS}
          />
          <p className={cn("mt-1 text-[11.5px]", MUTED)}>{t("licenceHint")}</p>
        </div>

        <div className="flex items-center justify-between rounded-[10px] bg-[#f7f9fc] px-3.5 py-2.5">
          <div>
            <p className="text-[12.5px] font-semibold text-[#0b1738]">{t("active")}</p>
            <p className={cn("text-[11.5px]", MUTED)}>{t("activeHint")}</p>
          </div>
          <AppSwitch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>
    </AppDialog>
  )
}
