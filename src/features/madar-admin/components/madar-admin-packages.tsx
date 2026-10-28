"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Check, Layers, Pencil, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppCard, AppDialog, AppInput, AppSwitch } from "@/components/app"

import { APPLICATION_LABEL, formatSar, platformAdminService } from "../services"
import type {
  AdminApplicationPricing,
  AdminPackage,
  AdminPlatformSettings,
  PackageInput,
  PricingMode,
} from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PackageEditorDialog } from "./package-editor-dialog"

import type { PurchasableApplication } from "@/application/contracts"

const MODE_OPTIONS: Array<{ mode: PricingMode; label: string; hint: string }> = [
  {
    mode: "packages",
    label: "باقات متعددة",
    hint: "يختار العميل إحدى الباقات المفعلة.",
  },
  {
    mode: "fixed",
    label: "سعر ثابت",
    hint: "سعر واحد بدون خيارات -- تُعرض أول باقة مفعلة فقط.",
  },
  {
    mode: "contact",
    label: "تواصل معنا",
    hint: "لا يوجد سعر إلكتروني، ويُطلب من العميل التواصل مع فريق مدار.",
  },
  {
    mode: "free",
    label: "مجاني",
    hint: "يفعّله العميل بنفسه بدون دفع لمدة محددة، بحد أقصى سنة.",
  },
]

const DEFAULT_FREE_DAYS = 30
const MAX_FREE_DAYS = 365

// Every purchasable application except "تطبيقات مدار" -- that card is a showcase for the Madar
// apps bundle that's never sold directly (it has no subscribe button in the marketplace).
const PRICED_APPLICATIONS = (Object.keys(APPLICATION_LABEL) as PurchasableApplication[]).filter(
  (application) => application !== "madarApps"
)

function yearlySaving(pkg: AdminPackage): number | null {
  if (pkg.monthlyPriceHalalas === null || pkg.yearlyPriceHalalas === null) return null
  const fullYear = pkg.monthlyPriceHalalas * 12
  if (fullYear <= 0 || pkg.yearlyPriceHalalas >= fullYear) return null
  return Math.round(((fullYear - pkg.yearlyPriceHalalas) / fullYear) * 100)
}

// Pricing per application (and for the Madar Complete bundle): how it's sold, its packages, and
// each package's monthly/yearly price -- exactly what the customer marketplace and checkout use.
// Also the trial and renewal settings, which apply to every application alike.
export function MadarAdminPackages() {
  const [pricing, setPricing] = useState<AdminApplicationPricing[] | null>(null)
  const [selected, setSelected] = useState<PurchasableApplication>("advertising")
  const [editing, setEditing] = useState<{ pkg: AdminPackage | null } | null>(null)
  const [deleting, setDeleting] = useState<AdminPackage | null>(null)
  const [busy, setBusy] = useState(false)
  // The free-period length being typed, per application (until saved).
  const [freeDaysDraft, setFreeDaysDraft] = useState<{ application: string; value: string } | null>(
    null
  )

  const load = useCallback(async () => {
    try {
      setPricing(await platformAdminService.getPricing())
    } catch {
      toast.error("تعذر تحميل الباقات.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const current = pricing?.find((entry) => entry.application === selected) ?? null
  const packages = current?.packages ?? []
  const label = APPLICATION_LABEL[selected]
  const freeDaysValue =
    freeDaysDraft?.application === selected
      ? freeDaysDraft.value
      : String(current?.freeDays ?? DEFAULT_FREE_DAYS)

  function saveFreeMode(freeDays: number) {
    void run(
      () => platformAdminService.setPricingMode(selected, "free", freeDays),
      `${label} مجاني لمدة ${freeDays} يوم.`
    )
  }

  function saveFreeDays() {
    const days = Number(freeDaysValue)
    if (!Number.isInteger(days) || days < 1 || days > MAX_FREE_DAYS) {
      toast.error(`أدخل عدد أيام بين 1 و ${MAX_FREE_DAYS} (سنة كحد أقصى).`)
      return
    }
    saveFreeMode(days)
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      await load()
    } catch (error) {
      const code = (error as { code?: string; details?: { code?: string } })?.code
      toast.error(
        code === "PACKAGE_IN_USE"
          ? "لا يمكن حذف باقة عليها مشتركون -- عطّلها بدلاً من ذلك."
          : "تعذر حفظ التغيير."
      )
    } finally {
      setBusy(false)
    }
  }

  function move(index: number, direction: -1 | 1) {
    const order = packages.map((pkg) => pkg.id)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    void run(() => platformAdminService.reorderPackages(selected, order), "تم تحديث الترتيب.")
  }

  function toggleActive(pkg: AdminPackage) {
    const input: PackageInput = {
      name: pkg.name,
      description: pkg.description,
      features: pkg.features,
      monthlyPriceHalalas: pkg.monthlyPriceHalalas,
      yearlyPriceHalalas: pkg.yearlyPriceHalalas,
      isRecommended: pkg.isRecommended,
      isActive: !pkg.isActive,
    }
    void run(
      () => platformAdminService.updatePackage(pkg.id, input),
      pkg.isActive ? `تم تعطيل باقة ${pkg.name}.` : `تم تفعيل باقة ${pkg.name}.`
    )
  }

  const subscribers = packages.reduce((sum, pkg) => sum + pkg.subscriberCount, 0)
  const kpis: MadarAdminKpi[] = [
    {
      label: "الباقات",
      value: String(packages.length),
      deltaPct: null,
      icon: Layers,
      tone: "blue",
    },
    {
      label: "الباقات المفعلة",
      value: String(packages.filter((pkg) => pkg.isActive).length),
      deltaPct: null,
      icon: Check,
      tone: "green",
    },
    {
      label: `المشتركون في ${label}`,
      value: String(subscribers),
      deltaPct: null,
      icon: Users,
      tone: "violet",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">باقات الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          حدد طريقة بيع كل تطبيق وباقاته وأسعاره الشهرية والسنوية -- تظهر للعملاء فوراً في التطبيقات
          وصفحة الدفع.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
        {PRICED_APPLICATIONS.map((application) => (
          <button
            key={application}
            type="button"
            onClick={() => setSelected(application)}
            className={cn(
              "rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-colors",
              selected === application
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {APPLICATION_LABEL[application]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppCard
        state={pricing === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {current?.visible === false ? "التطبيق مخفي عن العملاء" : "التطبيق ظاهر للعملاء"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {current?.visible === false
                ? "لا يظهر في صفحة التطبيقات ولا يمكن شراؤه أو تجربته. المشتركون الحاليون يحتفظون به."
                : "يظهر في صفحة التطبيقات ويمكن للعملاء شراؤه أو تجربته."}
            </p>
          </div>
          <AppSwitch
            checked={current?.visible !== false}
            disabled={busy || current === null}
            onCheckedChange={(visible) =>
              void run(
                () => platformAdminService.setApplicationVisibility(selected, visible),
                visible ? `أصبح ${label} ظاهراً للعملاء.` : `تم إخفاء ${label} عن العملاء.`
              )
            }
          />
        </div>

        <p className="mt-5 text-sm font-semibold text-foreground">طريقة البيع — {label}</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              disabled={busy}
              onClick={() =>
                current?.mode !== option.mode &&
                (option.mode === "free"
                  ? saveFreeMode(DEFAULT_FREE_DAYS)
                  : void run(
                      () => platformAdminService.setPricingMode(selected, option.mode),
                      `تم تغيير طريقة بيع ${label}.`
                    ))
              }
              className={cn(
                "rounded-[12px] border p-3.5 text-start transition-colors",
                current?.mode === option.mode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <p
                className={cn(
                  "text-sm font-bold",
                  current?.mode === option.mode ? "text-primary" : "text-foreground"
                )}
              >
                {option.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{option.hint}</p>
            </button>
          ))}
        </div>

        {current?.mode === "free" ? (
          <div className="mt-4 rounded-[12px] border border-border/60 p-4">
            <p className="text-sm font-semibold text-foreground">مدة الاستخدام المجاني</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-24">
                <AppInput
                  type="number"
                  min={1}
                  max={MAX_FREE_DAYS}
                  value={freeDaysValue}
                  onChange={(event) =>
                    setFreeDaysDraft({ application: selected, value: event.target.value })
                  }
                  className="h-9 rounded-[8px] text-center"
                />
              </div>
              <span className="text-sm text-muted-foreground">يوم</span>
              <AppButton
                size="sm"
                variant="outline"
                className="h-9 rounded-[8px]"
                disabled={busy || Number(freeDaysValue) === current.freeDays}
                onClick={saveFreeDays}
              >
                حفظ
              </AppButton>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              يتوقف التطبيق تلقائياً بعد {current.freeDays} يوم من التفعيل (بحد أقصى سنة)، ولا يمكن
              للعميل تفعيله مجاناً مرة أخرى.
            </p>
          </div>
        ) : null}
      </AppCard>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">باقات {label}</h2>
        <AppButton
          className="h-11 rounded-[10px] px-5 font-semibold"
          icon={<Plus className="size-4" />}
          onClick={() => setEditing({ pkg: null })}
        >
          إضافة باقة
        </AppButton>
      </div>

      {current?.mode === "free" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          هذا التطبيق مجاني حالياً -- الباقات أدناه لا تُعرض للعملاء حتى تختار طريقة بيع مدفوعة.
        </p>
      ) : null}

      {current?.mode === "contact" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          هذا التطبيق معروض حالياً بخيار &quot;تواصل معنا&quot; -- الباقات أدناه لا تُعرض للعملاء
          حتى تختار &quot;باقات متعددة&quot; أو &quot;سعر ثابت&quot;.
        </p>
      ) : null}

      {packages.length === 0 && pricing !== null ? (
        <AppCard className="rounded-2xl border-border/60 p-10 text-center text-sm text-muted-foreground shadow-sm">
          لا توجد باقات لهذا التطبيق بعد.
        </AppCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg, index) => {
            const saving = yearlySaving(pkg)
            const shownAsFixed = current?.mode === "fixed" && index === 0
            const hiddenByFixed = current?.mode === "fixed" && index > 0
            return (
              <AppCard
                key={pkg.id}
                className={cn(
                  "flex flex-col rounded-2xl border-border/60 p-5 shadow-sm",
                  (!pkg.isActive || hiddenByFixed) && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-base font-bold text-foreground">{pkg.name}</p>
                      {pkg.isRecommended ? (
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10.5px] font-semibold text-orange-600">
                          موصى بها
                        </span>
                      ) : null}
                      {shownAsFixed ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                          السعر الثابت المعروض
                        </span>
                      ) : null}
                    </div>
                    {pkg.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{pkg.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="تحريك للأعلى"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="تحريك للأسفل"
                      disabled={busy || index === packages.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </AppButton>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-[10px] bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] text-muted-foreground">شهري</p>
                    <p className="text-base font-bold text-foreground">
                      {pkg.monthlyPriceHalalas === null ? "—" : formatSar(pkg.monthlyPriceHalalas)}
                    </p>
                  </div>
                  <div className="rounded-[10px] bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      سنوي
                      {saving ? (
                        <span className="ms-1 font-semibold text-emerald-600">وفّر {saving}%</span>
                      ) : null}
                    </p>
                    <p className="text-base font-bold text-foreground">
                      {pkg.yearlyPriceHalalas === null ? "—" : formatSar(pkg.yearlyPriceHalalas)}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 flex-1 space-y-1.5">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-muted-foreground">
                  {pkg.subscriberCount} مشترك حالياً
                </p>

                <div className="mt-3 flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-2.5">
                  <span className="text-xs font-medium text-muted-foreground">الباقة مفعلة</span>
                  <AppSwitch
                    checked={pkg.isActive}
                    disabled={busy}
                    onCheckedChange={() => toggleActive(pkg)}
                  />
                </div>

                <div className="mt-3 flex gap-2">
                  <AppButton
                    variant="outline"
                    className="h-10 flex-1 rounded-[10px] font-semibold"
                    icon={<Pencil className="size-3.5" />}
                    onClick={() => setEditing({ pkg })}
                  >
                    تعديل
                  </AppButton>
                  <AppButton
                    variant="outline"
                    size="icon"
                    className="size-10 rounded-[10px] text-destructive hover:text-destructive"
                    aria-label="حذف"
                    disabled={busy}
                    onClick={() => setDeleting(pkg)}
                  >
                    <Trash2 className="size-4" />
                  </AppButton>
                </div>
              </AppCard>
            )
          })}
        </div>
      )}

      <TrialAndRenewalSettings />

      {editing ? (
        <PackageEditorDialog
          key={editing.pkg?.id ?? "new"}
          open
          initial={editing.pkg}
          applicationLabel={label}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing.pkg) {
              await platformAdminService.updatePackage(editing.pkg.id, input)
              toast.success(`تم حفظ باقة ${input.name}.`)
            } else {
              await platformAdminService.createPackage(selected, input)
              toast.success(`تمت إضافة باقة ${input.name}.`)
            }
            await load()
          }}
        />
      ) : null}

      <AppDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={<span dir="rtl">حذف باقة {deleting?.name}</span>}
        description={
          <span dir="rtl">
            سيتم حذف الباقة نهائياً. إذا كان عليها مشتركون، عطّلها بدلاً من حذفها.
          </span>
        }
        contentClassName="[direction:rtl] max-w-[28rem] p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] font-semibold"
              onClick={() => setDeleting(null)}
            >
              تراجع
            </AppButton>
            <AppButton
              variant="destructive"
              className="h-12 flex-1 rounded-[10px] font-bold"
              loading={busy}
              onClick={async () => {
                if (!deleting) return
                await run(
                  () => platformAdminService.deletePackage(deleting.id),
                  `تم حذف باقة ${deleting.name}.`
                )
                setDeleting(null)
              }}
            >
              تأكيد الحذف
            </AppButton>
          </div>
        }
      />
    </div>
  )
}

// Trial length (the same for every application) and the renewal policy.
function TrialAndRenewalSettings() {
  const [settings, setSettings] = useState<AdminPlatformSettings | null>(null)
  const [draft, setDraft] = useState({
    trialDays: "",
    renewalReminderDays: "",
    gracePeriodDays: "",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    platformAdminService
      .getSettings()
      .then((loaded) => {
        setSettings(loaded)
        setDraft({
          trialDays: String(loaded.trialDays),
          renewalReminderDays: String(loaded.renewalReminderDays),
          gracePeriodDays: String(loaded.gracePeriodDays),
        })
      })
      .catch(() => toast.error("تعذر تحميل إعدادات التجربة."))
  }, [])

  async function save() {
    const trialDays = Number(draft.trialDays)
    const renewalReminderDays = Number(draft.renewalReminderDays)
    const gracePeriodDays = Number(draft.gracePeriodDays)
    if (
      !Number.isInteger(trialDays) ||
      trialDays < 1 ||
      trialDays > 90 ||
      !Number.isInteger(renewalReminderDays) ||
      renewalReminderDays < 1 ||
      !Number.isInteger(gracePeriodDays) ||
      gracePeriodDays < 0
    ) {
      toast.error("يرجى إدخال أعداد أيام صحيحة (التجربة من 1 إلى 90 يوماً).")
      return
    }
    setSaving(true)
    try {
      setSettings(
        await platformAdminService.updateSettings({
          trialDays,
          renewalReminderDays,
          gracePeriodDays,
        })
      )
      toast.success("تم حفظ إعدادات التجربة والتجديد.")
    } catch {
      toast.error("تعذر حفظ الإعدادات.")
    } finally {
      setSaving(false)
    }
  }

  const fields: Array<{ key: keyof typeof draft; label: string; hint: string }> = [
    {
      key: "trialDays",
      label: "مدة التجربة المجانية (بالأيام)",
      hint: "تُطبق على جميع التطبيقات.",
    },
    {
      key: "renewalReminderDays",
      label: "التذكير قبل التجديد (بالأيام)",
      hint: "متى يُرسل للعميل تذكير بموعد التجديد.",
    },
    {
      key: "gracePeriodDays",
      label: "فترة السماح بعد انتهاء الاشتراك (بالأيام)",
      hint: "يبقى التطبيق متاحاً خلالها قبل إيقافه.",
    },
  ]

  return (
    <AppCard
      title="إعدادات التجربة والتجديد"
      state={settings === null ? "loading" : "idle"}
      className="rounded-2xl border-border/60 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {field.label}
            </label>
            <AppInput
              type="number"
              min={0}
              value={draft[field.key]}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="h-11 rounded-[10px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <AppButton
          className="h-11 rounded-[10px] px-6 font-semibold"
          loading={saving}
          onClick={save}
        >
          حفظ الإعدادات
        </AppButton>
      </div>
    </AppCard>
  )
}
