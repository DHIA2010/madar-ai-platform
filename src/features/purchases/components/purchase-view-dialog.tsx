"use client"

import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { useSupplierVouchers } from "@/features/suppliers"

import {
  derivePurchasePaymentStatus,
  lineItemSubtotal,
  type Purchase,
  purchaseGrandTotal,
  purchaseItemsSubtotal,
} from "../types"
import { PurchaseAvatar } from "./purchase-avatar"
import { PurchasePaymentStatusBadge } from "./purchase-payment-status-badge"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#95a4bd]">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[#0b1738]">{value || "—"}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#e1e7f0] p-4">
      <p className="mb-3 text-[12.5px] font-bold text-[#0b1738]">{title}</p>
      {children}
    </div>
  )
}

export function PurchaseViewDialog({
  purchase,
  onOpenChange,
}: {
  purchase: Purchase | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("purchases.view")
  const tStatus = useTranslations("purchases.status")
  const tPaymentMethod = useTranslations("purchases.paymentMethod")
  const locale = useLocale()
  const dir = localeDirection(locale as Locale)
  const { vouchers } = useSupplierVouchers()
  const subtotal = purchase ? purchaseItemsSubtotal(purchase.items) : 0
  const grandTotal = purchase ? purchaseGrandTotal(purchase) : 0
  const paidAmount = purchase
    ? vouchers
        .filter((voucher) => voucher.purchaseId === purchase.id && voucher.type === "payment")
        .reduce((sum, voucher) => sum + voucher.amount, 0)
    : 0

  return (
    <AppDialog
      open={purchase !== null}
      onOpenChange={onOpenChange}
      title={
        purchase ? (
          <span dir={dir} className="flex items-center gap-3.5">
            <PurchaseAvatar
              name={purchase.supplierName}
              imageUrl={purchase.supplierImageUrl}
              className="size-12"
            />
            <span>
              <span className="block text-[17px] font-extrabold text-[#0b1738]">
                {purchase.supplierName}
              </span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-[#6b7b96]">
                {purchase.code}
              </span>
            </span>
          </span>
        ) : (
          ""
        )
      }
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        "max-w-[38rem] gap-5 p-6"
      )}
      footer={
        <AppButton
          variant="outline"
          className="h-11 w-full rounded-[10px] text-[13.5px] font-semibold"
          onClick={() => onOpenChange(false)}
        >
          {t("close")}
        </AppButton>
      }
    >
      {purchase ? (
        <div dir={dir} className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <PurchasePaymentStatusBadge status={derivePurchasePaymentStatus(purchase, vouchers)} />
            <p className="text-[13px] font-bold text-[#0b1738]">
              {t("grandTotalLabel", { total: formatMoney(grandTotal, purchase.currency) })}
            </p>
          </div>

          <Section title={t("orderDetails")}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label={t("orderStatus")} value={tStatus(purchase.status)} />
              <Field label={t("warehouse")} value={purchase.warehouseName} />
              <Field label={t("orderDate")} value={purchase.date} />
              <Field label={t("dueDate")} value={purchase.dueDate ?? ""} />
              <Field label={t("deliveryDate")} value={purchase.deliveryDate ?? ""} />
              <Field label={t("currency")} value={purchase.currency} />
              <Field
                label={t("paymentMethod")}
                value={purchase.paymentMethod ? tPaymentMethod(purchase.paymentMethod) : ""}
              />
              <Field label={t("referenceNumber")} value={purchase.referenceNumber} />
            </div>
          </Section>

          <Section title={t("items")}>
            <div className="space-y-2">
              {purchase.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b border-[#eef1f6] pb-2 text-[12.5px] last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-[#0b1738]">{item.productName}</p>
                    <p className="text-[11px] text-[#95a4bd]">
                      {item.sku} · {item.qty} × {formatMoney(item.netUnitCost, purchase.currency)}
                    </p>
                  </div>
                  <p className="font-bold text-[#0b1738]">
                    {formatMoney(lineItemSubtotal(item), purchase.currency)}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("totals")}>
            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("subtotal")}</span>
                <span className="font-semibold text-[#0b1738]">
                  {formatMoney(subtotal, purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">
                  {t("orderTax", { pct: purchase.orderTaxPercent })}
                </span>
                <span className="font-semibold text-[#0b1738]">
                  {formatMoney(subtotal * (purchase.orderTaxPercent / 100), purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("orderDiscount")}</span>
                <span className="font-semibold text-rose-600">
                  -{formatMoney(purchase.discountAmount, purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("shipping")}</span>
                <span className="font-semibold text-[#0b1738]">
                  {formatMoney(purchase.shippingAmount, purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("otherCosts")}</span>
                <span className="font-semibold text-[#0b1738]">
                  {formatMoney(
                    Number.isFinite(purchase.otherCosts) ? purchase.otherCosts : 0,
                    purchase.currency
                  )}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-[#e1e7f0] pt-1.5 text-[13.5px]">
                <span className="font-extrabold text-[#0b1738]">{t("grandTotal")}</span>
                <span className="font-extrabold text-[#2878ff]">
                  {formatMoney(grandTotal, purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("paidAmount")}</span>
                <span className="font-semibold text-emerald-600">
                  {formatMoney(paidAmount, purchase.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6b7b96]">{t("remaining")}</span>
                <span className="font-semibold text-rose-600">
                  {formatMoney(Math.max(0, grandTotal - paidAmount), purchase.currency)}
                </span>
              </div>
            </div>
          </Section>

          {purchase.note ? (
            <Section title={t("notes")}>
              <p className="text-[13px] font-medium whitespace-pre-wrap text-[#0b1738]">
                {purchase.note}
              </p>
            </Section>
          ) : null}
        </div>
      ) : null}
    </AppDialog>
  )
}
