"use client"

import { useCallback, useEffect, useState } from "react"
import { BadgePercent, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  AppDateField,
  AppDialog,
  AppInput,
  AppSearchableSelect,
  AppSwitch,
} from "@/components/app"

import { APPLICATION_LABEL, formatSar, platformAdminService } from "../services"
import type { AdminApplicationPricing, AdminOffer, AdminOfferInput } from "../types"

import type { PurchasableApplication } from "@/application/contracts"

// Apps an offer can include free (the bundle itself and the base app are left out).
const BONUS_APPLICATIONS: PurchasableApplication[] = [
  "accounting",
  "promotions",
  "customReports",
  "procurement",
  "expenses",
  "invoicing",
  "ai",
  "loyalty",
  "booking",
  "advertising",
  "ecommerce",
]
const ADDONS: Array<{ code: string; label: string }> = [
  { code: "whatsapp_daily_report", label: "التقرير اليومي على واتساب (الخطة الاحترافية)" },
]

const EMPTY: AdminOfferInput = {
  title: "",
  subtitle: null,
  application: "pos",
  packageId: null,
  priceHalalas: 0,
  years: 2,
  bonusApplications: [],
  bonusAddons: [],
  features: [],
  isActive: false,
  endsOn: null,
}

// Madar Admin -> الباقات -> العروض: limited-time deals shown in the customer's apps page under
// «العروض» while switched on. Buying one switches on its package for its years plus every app and
// add-on it includes.
export function MadarAdminOffers() {
  const [offers, setOffers] = useState<AdminOffer[] | null>(null)
  const [pricing, setPricing] = useState<AdminApplicationPricing[]>([])
  const [editing, setEditing] = useState<{ offer: AdminOffer | null } | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(() => {
    platformAdminService
      .listOffers()
      .then(setOffers)
      .catch(() => {
        setOffers([])
        toast.error("تعذر تحميل العروض.")
      })
  }, [])
  useEffect(() => {
    load()
    platformAdminService
      .getPricing()
      .then(setPricing)
      .catch(() => {})
  }, [load])

  const inputOf = (offer: AdminOffer): AdminOfferInput => ({
    title: offer.title,
    subtitle: offer.subtitle,
    application: offer.application,
    packageId: offer.packageId,
    priceHalalas: offer.priceHalalas,
    years: offer.years,
    bonusApplications: offer.bonusApplications,
    bonusAddons: offer.bonusAddons,
    features: offer.features,
    isActive: offer.isActive,
    endsOn: offer.endsOn,
  })

  async function toggle(offer: AdminOffer, isActive: boolean) {
    setToggling(offer.id)
    try {
      await platformAdminService.saveOffer(offer.id, { ...inputOf(offer), isActive })
      toast.success(isActive ? "العرض ظاهر للعملاء الآن." : "أُوقف العرض.")
      load()
    } catch {
      toast.error("تعذر تحديث العرض.")
    } finally {
      setToggling(null)
    }
  }

  return (
    <AppCard
      title="العروض"
      subtitle="تظهر للعملاء في صفحة التطبيقات تحت «العروض» ما دامت مفعّلة. الاشتراك في العرض يفعّل الباقة لمدته وكل ما يشمله مجاناً."
      state={offers === null ? "loading" : "idle"}
      className="rounded-2xl border-border/60 shadow-sm"
      actions={
        <AppButton className="gap-1.5 rounded-[10px]" onClick={() => setEditing({ offer: null })}>
          <Plus className="size-4" />
          عرض جديد
        </AppButton>
      }
    >
      <div className="flex flex-col gap-3">
        {(offers ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا توجد عروض.</p>
        ) : null}
        {(offers ?? []).map((offer) => (
          <div
            key={offer.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4",
              offer.available ? "border-[#bfdbfe] bg-[#f5f9ff]" : "border-border/60"
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb]">
                <BadgePercent className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{offer.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {APPLICATION_LABEL[offer.application]}
                  {offer.package ? ` — ${offer.package.name}` : ""} · {offer.years}{" "}
                  {offer.years === 1 ? "سنة" : "سنوات"} بـ {formatSar(offer.priceHalalas)}
                  {offer.regularHalalas > offer.priceHalalas
                    ? ` (بدلاً من ${formatSar(offer.regularHalalas)})`
                    : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  يشمل مجاناً:{" "}
                  {[
                    ...offer.bonusApplications.map((app) => APPLICATION_LABEL[app] ?? app),
                    ...offer.bonusAddons.map(
                      (code) => ADDONS.find((addon) => addon.code === code)?.label ?? code
                    ),
                  ].join("، ") || "—"}
                </p>
                {offer.endsOn ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">آخر يوم: {offer.endsOn}</p>
                ) : null}
                {offer.isActive && !offer.available ? (
                  <p className="mt-1 text-xs font-semibold text-[#b45309]">
                    مفعّل لكنه لا يظهر: انتهى تاريخه أو الباقة غير متاحة.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <AppSwitch
                  checked={offer.isActive}
                  disabled={toggling === offer.id}
                  onCheckedChange={(checked) => void toggle(offer, checked)}
                />
                {offer.isActive ? "مفعّل" : "متوقف"}
              </label>
              <AppButton
                variant="outline"
                size="icon-sm"
                aria-label="تعديل"
                onClick={() => setEditing({ offer })}
              >
                <Pencil className="size-4" />
              </AppButton>
              <AppButton
                variant="outline"
                size="icon-sm"
                aria-label="حذف"
                onClick={() => {
                  if (!window.confirm(`حذف «${offer.title}»؟`)) return
                  platformAdminService
                    .deleteOffer(offer.id)
                    .then(load)
                    .catch(() => toast.error("تعذر حذف العرض."))
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </AppButton>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <OfferEditor
          key={editing.offer?.id ?? "new"}
          initial={editing.offer ? inputOf(editing.offer) : EMPTY}
          id={editing.offer?.id ?? null}
          pricing={pricing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      ) : null}
    </AppCard>
  )
}

function OfferEditor({
  initial,
  id,
  pricing,
  onClose,
  onSaved,
}: {
  initial: AdminOfferInput
  id: string | null
  pricing: AdminApplicationPricing[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [price, setPrice] = useState(initial.priceHalalas ? String(initial.priceHalalas / 100) : "")
  const [features, setFeatures] = useState(initial.features.join("\n"))
  const [saving, setSaving] = useState(false)
  const packages =
    pricing
      .find((entry) => entry.application === draft.application)
      ?.packages.filter((pkg) => pkg.isActive) ?? []
  const set = (patch: Partial<AdminOfferInput>) => setDraft((current) => ({ ...current, ...patch }))
  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]

  async function save() {
    const priceHalalas = Math.round(Number(price) * 100)
    if (!draft.title.trim() || !Number.isFinite(priceHalalas) || priceHalalas < 100) {
      toast.error("أدخل اسم العرض وسعره.")
      return
    }
    setSaving(true)
    try {
      await platformAdminService.saveOffer(id, {
        ...draft,
        priceHalalas,
        features: features
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      })
      toast.success("تم حفظ العرض.")
      onSaved()
    } catch {
      toast.error("تعذر حفظ العرض.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={id ? "تعديل العرض" : "عرض جديد"}
      contentClassName="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="outline" onClick={onClose}>
            إلغاء
          </AppButton>
          <AppButton loading={saving} onClick={() => void save()}>
            حفظ
          </AppButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pe-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">اسم العرض</label>
            <AppInput
              value={draft.title}
              onChange={(event) => set({ title: event.target.value })}
              placeholder="عرض الجمعة الزرقاء"
              className="h-11 rounded-[10px]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">سطر تحت الاسم</label>
            <AppInput
              value={draft.subtitle ?? ""}
              onChange={(event) => set({ subtitle: event.target.value || null })}
              placeholder="السنة الأولى مدفوعة والسنة الثانية مجاناً"
              className="h-11 rounded-[10px]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">الباقة</label>
            <AppSearchableSelect
              value={draft.packageId ?? ""}
              onChange={(value) => set({ packageId: value || null })}
              options={[
                { value: "", label: "أغلى باقة متاحة تلقائياً" },
                ...packages.map((pkg) => ({
                  value: pkg.id,
                  label: `${APPLICATION_LABEL[draft.application]} — ${pkg.name}${
                    pkg.yearlyPriceHalalas !== null
                      ? ` (${formatSar(pkg.yearlyPriceHalalas)} سنوياً)`
                      : ""
                  }`,
                })),
              ]}
              placeholder="اختر"
              searchPlaceholder="بحث..."
              emptyLabel="لا توجد نتائج"
              triggerClassName="h-11 rounded-[10px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">السعر (ر.س)</label>
              <AppInput
                type="number"
                min={1}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">عدد السنوات</label>
              <AppInput
                type="number"
                min={1}
                max={5}
                value={String(draft.years)}
                onChange={(event) =>
                  set({ years: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })
                }
                className="h-11 rounded-[10px]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">تطبيقات مجانية ضمن العرض</label>
          <div className="flex flex-wrap gap-2">
            {BONUS_APPLICATIONS.map((application) => (
              <button
                key={application}
                type="button"
                onClick={() =>
                  set({ bonusApplications: toggleIn(draft.bonusApplications, application) })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  draft.bonusApplications.includes(application)
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                    : "border-border text-muted-foreground"
                )}
              >
                {APPLICATION_LABEL[application]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ADDONS.map((addon) => (
              <button
                key={addon.code}
                type="button"
                onClick={() => set({ bonusAddons: toggleIn(draft.bonusAddons, addon.code) })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  draft.bonusAddons.includes(addon.code)
                    ? "border-[#16a34a] bg-[#f0fdf4] text-[#15803d]"
                    : "border-border text-muted-foreground"
                )}
              >
                {addon.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            ما يظهر في بطاقة العرض (سطر لكل ميزة)
          </label>
          <textarea
            rows={6}
            value={features}
            onChange={(event) => setFeatures(event.target.value)}
            className="w-full rounded-[10px] border border-border px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div>
            <label className="mb-1.5 block text-sm font-medium">آخر يوم للعرض (اختياري)</label>
            <AppDateField
              value={draft.endsOn ?? ""}
              onChange={(value) => set({ endsOn: value || null })}
              clearable
              triggerClassName="h-11 rounded-[10px]"
            />
          </div>
          <label className="flex h-11 items-center gap-2 text-sm font-medium">
            <AppSwitch checked={draft.isActive} onCheckedChange={(isActive) => set({ isActive })} />
            ظاهر للعملاء
          </label>
        </div>
      </div>
    </AppDialog>
  )
}
