"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSwitch,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useMadarAdminPackages } from "../hooks"
import { PLAN_META, PLAN_ORDER } from "../services"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

const PLAN_TONE_CLASSNAME: Record<string, string> = {
  enterprise: "bg-orange-50 text-orange-600",
  pro: "bg-violet-50 text-violet-600",
  growth: "bg-emerald-50 text-emerald-600",
  starter: "bg-blue-50 text-blue-600",
}

const COMPARISON_ROWS: {
  label: string
  values: Record<string, string>
}[] = [
  {
    label: "عدد المتاجر",
    values: { enterprise: "غير محدود", pro: "10", growth: "3", starter: "1" },
  },
  {
    label: "الزوار الشهرون",
    values: { enterprise: "غير محدود", pro: "500,000", growth: "100,000", starter: "10,000" },
  },
  {
    label: "مدة الاحتفاظ بالبيانات",
    values: { enterprise: "12 شهر", pro: "6 أشهر", growth: "3 أشهر", starter: "شهر واحد" },
  },
  { label: "مصادر الإعلانات", values: { enterprise: "✓", pro: "✓", growth: "✓", starter: "—" } },
  {
    label: "أحداث التجارة الإلكترونية",
    values: { enterprise: "✓", pro: "✓", growth: "✓", starter: "—" },
  },
  { label: "تقارير مخصصة", values: { enterprise: "✓", pro: "✓", growth: "—", starter: "—" } },
  { label: "الوصول إلى API", values: { enterprise: "✓", pro: "✓", growth: "—", starter: "—" } },
  {
    label: "الدعم الفني",
    values: {
      enterprise: "مخصص",
      pro: "أولوية",
      growth: "عبر البريد والدردشة",
      starter: "عبر البريد",
    },
  },
]

export function MadarAdminPackages() {
  const {
    plans,
    togglePlanActive,
    trialDays,
    setTrialDays,
    defaultTrialPlan,
    setDefaultTrialPlan,
    trialCardRequired,
    setTrialCardRequired,
    autoUpgradeEnabled,
    setAutoUpgradeEnabled,
    renewalReminderEnabled,
    setRenewalReminderEnabled,
    suspendOnFailedPayment,
    setSuspendOnFailedPayment,
    gracePeriodDays,
    setGracePeriodDays,
  } = useMadarAdminPackages()

  const kpis: MadarAdminKpi[] = plans
    .slice()
    .reverse()
    .map((plan) => ({
      label: `العملاء على ${plan.name}`,
      value: String(plan.customerCount),
      unit: undefined,
      deltaPct: null,
      icon: plan.icon,
      tone:
        plan.tier === "starter"
          ? "blue"
          : plan.tier === "growth"
            ? "green"
            : plan.tier === "pro"
              ? "violet"
              : "orange",
    }))

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">باقات الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة الباقات والمميزات والأسعار الخاصة بمنصة مدار.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">الباقات الحالية</h2>
        <AppButton className="h-11 rounded-[10px] px-6 font-semibold">إضافة باقة جديدة</AppButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = plans.find((p) => p.tier === tier) ?? {
            ...PLAN_META[tier],
            customerCount: 0,
          }
          const Icon = plan.icon
          return (
            <AppCard
              key={tier}
              className="flex flex-col rounded-2xl border-border/60 p-5 shadow-sm"
            >
              {plan.badgeLabel ? (
                <span className="mb-3 w-fit rounded-full bg-orange-50 px-2.5 py-1 text-[10.5px] font-semibold text-orange-600">
                  {plan.badgeLabel}
                </span>
              ) : null}
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  PLAN_TONE_CLASSNAME[tier]
                )}
              >
                <Icon className="size-5" />
              </div>
              <p className="mt-3 text-base font-bold text-foreground">{plan.name}</p>

              <div className="mt-2">
                <span className="text-2xl font-bold text-foreground">{plan.priceLabel}</span>
                {plan.billingSuffix ? (
                  <span className="ms-1 text-xs text-muted-foreground">/ {plan.billingSuffix}</span>
                ) : null}
              </div>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature.label}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>

              <AppButton
                variant="outline"
                className="mt-5 h-11 w-full rounded-[10px] font-semibold"
              >
                تعديل الباقة
              </AppButton>

              <div className="mt-3 flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-2.5">
                <span className="text-xs font-medium text-muted-foreground">الباقة مفعلة</span>
                <AppSwitch checked={plan.isActive} onCheckedChange={() => togglePlanActive(tier)} />
              </div>
            </AppCard>
          )
        })}
      </div>

      <AppCard
        title="مقارنة المميزات بين الباقات"
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <div className="overflow-x-auto">
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>الميزة</AppTableHead>
                {PLAN_ORDER.map((tier) => (
                  <AppTableHead key={tier}>{PLAN_META[tier].name}</AppTableHead>
                ))}
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {COMPARISON_ROWS.map((row) => (
                <AppTableRow key={row.label}>
                  <AppTableCell className="font-medium text-foreground">{row.label}</AppTableCell>
                  {PLAN_ORDER.map((tier) => (
                    <AppTableCell key={tier} className="text-muted-foreground">
                      {row.values[tier]}
                    </AppTableCell>
                  ))}
                </AppTableRow>
              ))}
              <AppTableRow>
                <AppTableCell className="font-medium text-foreground">السعر الشهري</AppTableCell>
                {PLAN_ORDER.map((tier) => (
                  <AppTableCell key={tier} className="font-semibold text-foreground">
                    {PLAN_META[tier].priceLabel}
                  </AppTableCell>
                ))}
              </AppTableRow>
            </AppTableBody>
          </AppTable>
        </div>
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppCard
          title="إعدادات التجربة المجانية"
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                مدة التجربة المجانية (بالأيام)
              </label>
              <AppInput
                type="number"
                value={trialDays}
                onChange={(event) => setTrialDays(Number(event.target.value))}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                الباقة الافتراضية للتجربة
              </label>
              <AppSelect
                value={defaultTrialPlan}
                onValueChange={(value) => setDefaultTrialPlan(value as typeof defaultTrialPlan)}
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
                </AppSelectContent>
              </AppSelect>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <span className="text-sm text-foreground">تفعيل بطاقة الدفع للتجربة المجانية</span>
              <AppSwitch checked={trialCardRequired} onCheckedChange={setTrialCardRequired} />
            </div>
          </div>
        </AppCard>

        <AppCard title="إعدادات عامة" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <span className="text-sm text-foreground">إتاحة الترقية التلقائية</span>
              <AppSwitch checked={autoUpgradeEnabled} onCheckedChange={setAutoUpgradeEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <span className="text-sm text-foreground">إرسال إشعار قبل التجديد</span>
              <AppSwitch
                checked={renewalReminderEnabled}
                onCheckedChange={setRenewalReminderEnabled}
              />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <span className="text-sm text-foreground">إيقاف الباقة عند فشل الدفع</span>
              <AppSwitch
                checked={suspendOnFailedPayment}
                onCheckedChange={setSuspendOnFailedPayment}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                فترة السماح عند فشل الدفع (بالأيام)
              </label>
              <AppInput
                type="number"
                value={gracePeriodDays}
                onChange={(event) => setGracePeriodDays(Number(event.target.value))}
                className="h-11 rounded-[10px]"
              />
            </div>
            <AppButton className="h-11 w-full rounded-[10px] font-semibold">
              حفظ الإعدادات
            </AppButton>
          </div>
        </AppCard>
      </div>
    </div>
  )
}
