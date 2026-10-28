"use client"

import { useCallback, useEffect, useState } from "react"
import { MoreHorizontal, Percent, Ticket, TicketCheck, TicketX } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
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

import { APPLICATION_LABEL, BILLING_INTERVAL_LABEL, formatDate, formatSar } from "../services"
import { platformAdminService } from "../services"
import type {
  AdminApplicationPricing,
  AdminCoupon,
  AdminCouponInput,
  AdminCouponStatus,
} from "../types/platform-admin.types"
import { CouponEditorDialog } from "./coupon-editor-dialog"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

// Custom pastel colors rather than AppStatusBadge's own tone mapping -- same pattern as
// subscription-status-badge.tsx.
const STATUS_META: Record<AdminCouponStatus, { label: string; className: string }> = {
  active: { label: "فعال", className: "bg-emerald-50 text-emerald-600" },
  disabled: { label: "معطل", className: "bg-slate-100 text-slate-600" },
  expired: { label: "منتهي", className: "bg-rose-50 text-rose-600" },
  exhausted: { label: "استُنفد", className: "bg-amber-50 text-amber-600" },
}

function toInput(coupon: AdminCoupon, isActive: boolean): AdminCouponInput {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    applications: coupon.applications,
    packageIds: coupon.packageIds,
    billingIntervals: coupon.billingIntervals,
    usageLimit: coupon.usageLimit,
    expiresOn: coupon.expiresAt
      ? new Date(new Date(coupon.expiresAt).getTime() + 3 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null,
    isActive,
  }
}

// Discount codes for Madar subscriptions, redeemed at card checkout. A use is counted only when
// the payment succeeds.
export function MadarAdminCoupons() {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null)
  const [pricing, setPricing] = useState<AdminApplicationPricing[]>([])
  const [editing, setEditing] = useState<{ coupon: AdminCoupon | null } | null>(null)
  const [deleting, setDeleting] = useState<AdminCoupon | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCoupons(await platformAdminService.listCoupons())
    } catch {
      toast.error("تعذر تحميل الكوبونات.")
    }
  }, [])

  useEffect(() => {
    void load()
    platformAdminService
      .getPricing()
      .then(setPricing)
      .catch(() => {})
  }, [load])

  const packageName = new Map(
    pricing.flatMap((entry) => entry.packages.map((pkg) => [pkg.id, pkg.name] as const))
  )

  async function toggleActive(coupon: AdminCoupon) {
    setBusy(true)
    try {
      await platformAdminService.updateCoupon(coupon.id, toInput(coupon, !coupon.isActive))
      toast.success(coupon.isActive ? `تم تعطيل ${coupon.code}.` : `تم تفعيل ${coupon.code}.`)
      await load()
    } catch {
      toast.error("تعذر تحديث الكوبون.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await platformAdminService.deleteCoupon(deleting.id)
      toast.success(`تم حذف ${deleting.code}.`)
      setDeleting(null)
      await load()
    } catch (error) {
      toast.error(
        (error as { code?: string })?.code === "COUPON_IN_USE"
          ? "تم استخدام هذا الكوبون -- عطّله بدلاً من حذفه."
          : "تعذر حذف الكوبون."
      )
    } finally {
      setBusy(false)
    }
  }

  const list = coupons ?? []
  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي الكوبونات",
      value: String(list.length),
      deltaPct: null,
      icon: Ticket,
      tone: "blue",
    },
    {
      label: "كوبونات فعالة",
      value: String(list.filter((coupon) => coupon.status === "active").length),
      deltaPct: null,
      icon: TicketCheck,
      tone: "green",
    },
    {
      label: "منتهية أو معطلة",
      value: String(list.filter((coupon) => coupon.status !== "active").length),
      deltaPct: null,
      icon: TicketX,
      tone: "rose",
    },
    {
      label: "مرات الاستخدام",
      value: String(list.reduce((sum, coupon) => sum + coupon.usedCount, 0)),
      deltaPct: null,
      icon: Percent,
      tone: "violet",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الكوبونات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أكواد خصم على اشتراكات مدار لتطبيق واحد أو عدة تطبيقات.
          </p>
        </div>
        <AppButton
          className="h-11 rounded-[10px] px-6 font-semibold"
          onClick={() => setEditing({ coupon: null })}
        >
          إضافة كوبون
        </AppButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppTableToolbar title="جميع الكوبونات" description={`${list.length} كوبون`} />

      <AppCard
        state={coupons === null ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الكود</AppTableHead>
              <AppTableHead>الخصم</AppTableHead>
              <AppTableHead>التطبيقات</AppTableHead>
              <AppTableHead>المدة</AppTableHead>
              <AppTableHead>الاستخدام</AppTableHead>
              <AppTableHead>تاريخ الانتهاء</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.map((coupon) => {
              const status = STATUS_META[coupon.status]
              const applicationsLabel =
                coupon.applications.length === 0
                  ? "جميع التطبيقات"
                  : coupon.applications
                      .map((application) => APPLICATION_LABEL[application])
                      .join("، ")
              const packagesLabel = coupon.packageIds
                .map((id) => packageName.get(id))
                .filter(Boolean)
                .join("، ")
              return (
                <AppTableRow key={coupon.id}>
                  <AppTableCell className="font-mono font-semibold text-foreground" dir="ltr">
                    {coupon.code}
                  </AppTableCell>
                  <AppTableCell className="font-medium">
                    {coupon.discountType === "percentage"
                      ? `${coupon.discountValue}%`
                      : formatSar(coupon.discountValue)}
                  </AppTableCell>
                  <AppTableCell className="max-w-[260px]">
                    <p className="text-foreground">{applicationsLabel}</p>
                    {packagesLabel ? (
                      <p className="text-xs text-muted-foreground">الباقات: {packagesLabel}</p>
                    ) : null}
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {coupon.billingIntervals
                      .map((interval) => BILLING_INTERVAL_LABEL[interval])
                      .join(" و")}
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {coupon.usedCount} / {coupon.usageLimit ?? "∞"}
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {coupon.expiresAt ? formatDate(coupon.expiresAt) : "بدون انتهاء"}
                  </AppTableCell>
                  <AppTableCell>
                    <AppStatusBadge
                      status="neutral"
                      label={status.label}
                      className={status.className}
                    />
                  </AppTableCell>
                  <AppTableCell>
                    <AppDropdownMenu modal={false}>
                      <AppDropdownMenuTrigger asChild>
                        <AppButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label="إجراءات"
                          disabled={busy}
                        >
                          <MoreHorizontal className="size-4" />
                        </AppButton>
                      </AppDropdownMenuTrigger>
                      <AppDropdownMenuContent align="end">
                        <AppDropdownMenuItem onSelect={() => setEditing({ coupon })}>
                          تعديل
                        </AppDropdownMenuItem>
                        <AppDropdownMenuItem onSelect={() => void toggleActive(coupon)}>
                          {coupon.isActive ? "تعطيل" : "تفعيل"}
                        </AppDropdownMenuItem>
                        <AppDropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleting(coupon)}
                        >
                          حذف
                        </AppDropdownMenuItem>
                      </AppDropdownMenuContent>
                    </AppDropdownMenu>
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {coupons !== null && list.length === 0 ? (
          <AppTableEmpty title="لا توجد كوبونات" description="أضف أول كوبون خصم لعملاء مدار." />
        ) : null}
      </AppCard>

      {editing ? (
        <CouponEditorDialog
          key={editing.coupon?.id ?? "new"}
          initial={editing.coupon}
          pricing={pricing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing.coupon) {
              await platformAdminService.updateCoupon(editing.coupon.id, input)
              toast.success(`تم حفظ ${input.code}.`)
            } else {
              await platformAdminService.createCoupon(input)
              toast.success(`تم إنشاء كوبون ${input.code}.`)
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
        title={<span dir="rtl">حذف كوبون {deleting?.code}</span>}
        description={
          <span dir="rtl">
            سيتم حذف الكوبون نهائياً. الكوبون المستخدم لا يمكن حذفه -- عطّله بدلاً من ذلك.
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
              onClick={confirmDelete}
            >
              تأكيد الحذف
            </AppButton>
          </div>
        }
      />
    </div>
  )
}
