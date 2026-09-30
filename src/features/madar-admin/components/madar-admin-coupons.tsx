"use client"

import { useState } from "react"
import { Percent, Ticket, TicketCheck, TicketX } from "lucide-react"
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
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTableToolbar,
} from "@/components/app"

import { useMadarAdminCoupons } from "../hooks"
import { getCouponsKpis, PLAN_META, PLAN_ORDER } from "../services"
import type { CouponDiscountType, CouponStatus, PlanTier } from "../types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

// Custom pastel colors rather than AppStatusBadge's own tone mapping -- "success" resolves to
// bg-primary (blue), not green, which would read as "active" using the wrong color everywhere
// else in this feature already uses green for. Same pattern as subscription-status-badge.tsx.
const COUPON_STATUS_META: Record<CouponStatus, { label: string; className: string }> = {
  active: { label: "فعال", className: "bg-emerald-50 text-emerald-600" },
  expired: { label: "منتهي", className: "bg-rose-50 text-rose-600" },
  disabled: { label: "معطل", className: "bg-slate-100 text-slate-600" },
}

function formatDiscount(type: CouponDiscountType, value: number) {
  return type === "percentage" ? `${value}%` : `SAR ${value}`
}

export function MadarAdminCoupons() {
  const { coupons, createCoupon, toggleCouponStatus } = useMadarAdminCoupons()
  const kpisRaw = getCouponsKpis()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [code, setCode] = useState("")
  const [discountType, setDiscountType] = useState<CouponDiscountType>("percentage")
  const [value, setValue] = useState("10")
  const [usageLimit, setUsageLimit] = useState("100")
  const [expiresAt, setExpiresAt] = useState("")
  const [applicablePlans, setApplicablePlans] = useState<PlanTier[]>(PLAN_ORDER)

  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي الكوبونات",
      value: String(kpisRaw.total),
      deltaPct: null,
      icon: Ticket,
      tone: "blue",
    },
    {
      label: "كوبونات فعالة",
      value: String(kpisRaw.active),
      deltaPct: null,
      icon: TicketCheck,
      tone: "green",
    },
    {
      label: "كوبونات منتهية",
      value: String(kpisRaw.expired),
      deltaPct: null,
      icon: TicketX,
      tone: "rose",
    },
    {
      label: "مرات الاستخدام",
      value: new Intl.NumberFormat("en-US").format(kpisRaw.redemptions),
      deltaPct: null,
      icon: Percent,
      tone: "violet",
    },
  ]

  function resetForm() {
    setCode("")
    setDiscountType("percentage")
    setValue("10")
    setUsageLimit("100")
    setExpiresAt("")
    setApplicablePlans(PLAN_ORDER)
  }

  function handleCreate() {
    if (!code.trim() || !expiresAt) {
      toast.error("يرجى تعبئة كود الكوبون وتاريخ الانتهاء.")
      return
    }
    createCoupon({
      code: code.trim(),
      discountType,
      value: Number(value) || 0,
      usageLimit: Number(usageLimit) || 0,
      expiresAt,
      applicablePlans,
    })
    toast.success(`تم إنشاء كوبون ${code.trim().toUpperCase()}.`)
    resetForm()
    setDialogOpen(false)
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الكوبونات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة أكواد الخصم الترويجية لعملاء مدار.
          </p>
        </div>
        <AppButton
          className="h-11 rounded-[10px] px-6 font-semibold"
          onClick={() => setDialogOpen(true)}
        >
          إضافة كوبون
        </AppButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppTableToolbar title="جميع الكوبونات" description={`${coupons.length} كوبون`} />

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الكود</AppTableHead>
              <AppTableHead>الخصم</AppTableHead>
              <AppTableHead>الاستخدام</AppTableHead>
              <AppTableHead>الباقات المشمولة</AppTableHead>
              <AppTableHead>تاريخ الانتهاء</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead className="w-28" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {coupons.map((coupon) => {
              const meta = COUPON_STATUS_META[coupon.status]
              return (
                <AppTableRow key={coupon.id}>
                  <AppTableCell className="font-mono font-semibold text-foreground">
                    {coupon.code}
                  </AppTableCell>
                  <AppTableCell>{formatDiscount(coupon.discountType, coupon.value)}</AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {coupon.usedCount} / {coupon.usageLimit}
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {coupon.applicablePlans.map((tier) => PLAN_META[tier].name).join("، ")}
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">{coupon.expiresAt}</AppTableCell>
                  <AppTableCell>
                    <AppStatusBadge
                      status="neutral"
                      label={meta.label}
                      className={meta.className}
                    />
                  </AppTableCell>
                  <AppTableCell>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCouponStatus(coupon.id)}
                      disabled={coupon.status === "expired"}
                    >
                      {coupon.status === "disabled" ? "تفعيل" : "تعطيل"}
                    </AppButton>
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {coupons.length === 0 ? (
          <AppTableEmpty title="لا توجد كوبونات" description="أضف كوبونك الأول للبدء." />
        ) : null}
      </div>

      <AppDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={<span dir="rtl">إضافة كوبون جديد</span>}
        description={
          <span dir="rtl">أنشئ كود خصم جديد يمكن لعملاء مدار استخدامه عند الاشتراك.</span>
        }
        contentClassName="[direction:rtl] max-w-[32rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
              onClick={() => setDialogOpen(false)}
            >
              إلغاء
            </AppButton>
            <AppButton
              className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
              onClick={handleCreate}
            >
              إنشاء الكوبون
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">كود الكوبون</label>
            <AppInput
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="WELCOME20"
              className="h-11 rounded-[10px] font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">نوع الخصم</label>
              <AppSelect
                value={discountType}
                onValueChange={(v) => setDiscountType(v as CouponDiscountType)}
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
              <label className="mb-1.5 block text-sm font-medium text-foreground">القيمة</label>
              <AppInput
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                حد الاستخدام
              </label>
              <AppInput
                type="number"
                value={usageLimit}
                onChange={(event) => setUsageLimit(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                تاريخ الانتهاء
              </label>
              <AppInput
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              الباقات المشمولة
            </label>
            <div className="flex flex-wrap gap-2">
              {PLAN_ORDER.map((tier) => {
                const selected = applicablePlans.includes(tier)
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() =>
                      setApplicablePlans((current) =>
                        selected ? current.filter((t) => t !== tier) : [...current, tier]
                      )
                    }
                    className={
                      selected
                        ? "rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors"
                        : "rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                    }
                  >
                    {PLAN_META[tier].name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
