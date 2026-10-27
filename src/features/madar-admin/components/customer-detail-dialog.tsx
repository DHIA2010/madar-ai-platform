"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  AppButton,
  AppDialog,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  APPLICATION_LABEL,
  formatDate,
  formatRelative,
  formatSar,
  nextRenewalDate,
  PLAN_META,
  platformAdminService,
  SOURCE_LABEL,
  STORE_PLATFORM_KEY,
} from "../services"
import type { AdminCustomerDetail } from "../types/platform-admin.types"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

const SECTION_TITLE = "mb-2 text-sm font-semibold text-foreground"
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "ناجحة",
  failed: "فاشلة",
  initiated: "قيد الإتمام",
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

// Everything Madar knows about one customer in one place: subscriptions per app, team, recent
// payments, and recent activity. `reloadKey` refetches after an action taken elsewhere on the page.
export function CustomerDetailDialog({
  customerId,
  reloadKey,
  onClose,
  onGrant,
}: {
  customerId: string | null
  reloadKey: number
  onClose: () => void
  onGrant: (customer: { id: string; name: string }) => void
}) {
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null)

  // A previous customer's detail is never shown for a new one -- `loaded` below only accepts a
  // detail whose id matches -- so there's nothing to clear when customerId changes.
  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    platformAdminService
      .getCustomer(customerId)
      .then((next) => {
        if (!cancelled) setDetail(next)
      })
      .catch(() => toast.error("تعذر تحميل بيانات العميل."))
    return () => {
      cancelled = true
    }
  }, [customerId, reloadKey])

  const loaded = detail && detail.id === customerId ? detail : null

  return (
    <AppDialog
      open={customerId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={<span dir="rtl">{loaded?.name ?? "تفاصيل العميل"}</span>}
      description={
        <span dir="rtl">
          {loaded?.owner ? `${loaded.owner.name} · ${loaded.owner.email}` : "جارٍ التحميل..."}
        </span>
      }
      contentClassName="[direction:rtl] max-w-[52rem] gap-5 p-6"
      footer={
        <div className="flex w-full justify-end gap-2">
          <AppButton variant="outline" className="h-11 rounded-[10px] px-5" onClick={onClose}>
            إغلاق
          </AppButton>
          {loaded ? (
            <AppButton
              className="h-11 rounded-[10px] px-5 font-semibold"
              onClick={() => onGrant({ id: loaded.id, name: loaded.name })}
            >
              تفعيل اشتراك
            </AppButton>
          ) : null}
        </div>
      }
    >
      {!loaded ? (
        <div dir="rtl" className="py-10 text-center text-sm text-muted-foreground">
          جارٍ تحميل بيانات العميل...
        </div>
      ) : (
        <div dir="rtl" className="max-h-[65vh] space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="الحالة" value={<SubscriptionStatusBadge status={loaded.status} />} />
            <Fact label="الإيراد الشهري" value={formatSar(loaded.monthlyRevenueHalalas)} />
            <Fact label="تاريخ التسجيل" value={formatDate(loaded.createdAt)} />
            <Fact label="آخر نشاط" value={formatRelative(loaded.lastActivityAt)} />
          </div>

          <section>
            <h3 className={SECTION_TITLE}>المتاجر المربوطة</h3>
            {loaded.platforms.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد متاجر مربوطة.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                {loaded.platforms.map((platform) => (
                  <PlatformChip key={platform} platform={STORE_PLATFORM_KEY[platform]} />
                ))}
                <span className="text-sm text-muted-foreground">({loaded.storeCount} متجر)</span>
              </div>
            )}
          </section>

          <section>
            <h3 className={SECTION_TITLE}>الاشتراكات</h3>
            {loaded.subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم يشترك هذا العميل في أي تطبيق بعد.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <AppTable>
                  <AppTableHeader>
                    <AppTableRow>
                      <AppTableHead>التطبيق</AppTableHead>
                      <AppTableHead>الباقة</AppTableHead>
                      <AppTableHead>الحالة</AppTableHead>
                      <AppTableHead>المصدر</AppTableHead>
                      <AppTableHead>التجديد / الانتهاء</AppTableHead>
                      <AppTableHead>القيمة</AppTableHead>
                    </AppTableRow>
                  </AppTableHeader>
                  <AppTableBody>
                    {loaded.subscriptions.map((subscription) => (
                      <AppTableRow key={subscription.id}>
                        <AppTableCell className="font-medium">
                          {APPLICATION_LABEL[subscription.application]}
                        </AppTableCell>
                        <AppTableCell>
                          {subscription.planTier ? PLAN_META[subscription.planTier].name : "—"}
                        </AppTableCell>
                        <AppTableCell>
                          <SubscriptionStatusBadge status={subscription.status} />
                        </AppTableCell>
                        <AppTableCell className="text-muted-foreground">
                          {SOURCE_LABEL[subscription.source]}
                        </AppTableCell>
                        <AppTableCell className="text-muted-foreground">
                          {formatDate(nextRenewalDate(subscription))}
                        </AppTableCell>
                        <AppTableCell>
                          {formatSar(subscription.priceHalalas)}
                          {subscription.billingInterval ? (
                            <span className="text-xs text-muted-foreground">
                              {subscription.billingInterval === "yearly" ? " / سنة" : " / شهر"}
                            </span>
                          ) : null}
                        </AppTableCell>
                      </AppTableRow>
                    ))}
                  </AppTableBody>
                </AppTable>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className={SECTION_TITLE}>الفريق ({loaded.members.length})</h3>
              <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                {loaded.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {member.email}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{member.role}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className={SECTION_TITLE}>آخر المدفوعات</h3>
              {loaded.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد مدفوعات إلكترونية.</p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {loaded.payments.slice(0, 6).map((payment) => (
                    <li
                      key={payment.id}
                      className="flex items-center justify-between px-3.5 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatSar(payment.amountHalalas)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(payment.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section>
            <h3 className={SECTION_TITLE}>آخر الأنشطة</h3>
            {loaded.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد نشاط مسجل.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                {loaded.activity.slice(0, 8).map((entry, index) => (
                  <li
                    key={`${entry.createdAt}-${index}`}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <span className="font-mono text-xs text-foreground" dir="ltr">
                      {entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.actorName ? `${entry.actorName} · ` : ""}
                      {formatRelative(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppDialog>
  )
}
