"use client"

import { useEffect, useState } from "react"
import { Printer } from "lucide-react"
import { toast } from "sonner"

import { ASSETS } from "@/constants/assets"

import { AppButton, AppDialog } from "@/components/app"

import {
  APPLICATION_LABEL,
  BILLING_INTERVAL_LABEL,
  formatDate,
  formatSar,
  paymentMethodLabel,
  platformAdminService,
} from "../services"
import type { AdminReceiptDetail } from "../types/platform-admin.types"

// Printing shows only the receipt: globals.css hides everything else while body has this class.
const PRINTING_CLASS = "printing-receipt"

function printReceipt() {
  document.body.classList.add(PRINTING_CLASS)
  const cleanup = () => {
    document.body.classList.remove(PRINTING_CLASS)
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)
  window.print()
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex justify-between gap-4 py-1 text-[12.5px]">
      <span className="text-[#6b7b96]">{label}</span>
      <span className="text-end font-medium text-[#0b1738]">{value}</span>
    </div>
  )
}

// A payment receipt (not a ZATCA tax invoice) for one successful Madar subscription payment --
// designed to read well on screen and when printed or saved as PDF from the browser.
export function ReceiptDocument({ receipt }: { receipt: AdminReceiptDetail }) {
  const description = [
    `اشتراك ${APPLICATION_LABEL[receipt.application] ?? receipt.application}`,
    receipt.packageName ? `باقة ${receipt.packageName}` : null,
    receipt.billingInterval ? BILLING_INTERVAL_LABEL[receipt.billingInterval] : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const subtotal = receipt.originalAmountHalalas ?? receipt.amountHalalas

  return (
    <div
      dir="rtl"
      className="madar-receipt mx-auto w-full max-w-[640px] rounded-2xl bg-white p-8 text-[#0b1738] shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-[#e8edf5]"
    >
      <div className="flex items-start justify-between gap-6 border-b border-[#eef2f8] pb-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- printed in-place, no optimizer */}
          <img src={ASSETS.logo} alt={receipt.seller.name} className="h-10 w-auto" />
          <p className="mt-3 text-[12px] text-[#6b7b96]">{receipt.seller.email}</p>
        </div>
        <div className="text-end">
          <p className="text-[22px] font-extrabold">إيصال دفع</p>
          <p className="mt-1 font-mono text-[13px] font-semibold text-[#2878ff]" dir="ltr">
            {receipt.number}
          </p>
          <p className="mt-1 text-[12px] text-[#6b7b96]">{formatDate(receipt.paidAt)}</p>
          <span className="mt-2 inline-block rounded-full bg-[#dcfce7] px-3 py-1 text-[11px] font-bold text-[#15803d]">
            مدفوع
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-[#f7f9fd] p-4">
        <p className="mb-2 text-[11.5px] font-bold text-[#6b7b96]">صادر إلى</p>
        <p className="text-[15px] font-bold">{receipt.customer.name}</p>
        <div className="mt-1.5">
          <Row label="البريد الإلكتروني" value={receipt.customer.email} />
          <Row label="الرقم الضريبي" value={receipt.customer.taxNumber} />
          <Row label="السجل التجاري" value={receipt.customer.commercialRegistration} />
          <Row label="الجوال" value={receipt.customer.phone} />
          <Row label="العنوان" value={receipt.customer.address} />
        </div>
      </div>

      <table className="mt-6 w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#eef2f8] text-[11.5px] text-[#6b7b96]">
            <th className="pb-2 text-start font-semibold">الوصف</th>
            <th className="pb-2 text-end font-semibold">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#eef2f8]">
            <td className="py-3 font-medium">{description}</td>
            <td className="py-3 text-end font-semibold">{formatSar(subtotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 ms-auto w-full max-w-[280px] space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <span className="text-[#6b7b96]">المجموع</span>
          <span className="font-medium">{formatSar(subtotal)}</span>
        </div>
        {receipt.discountHalalas ? (
          <div className="flex justify-between text-[#15803d]">
            <span>خصم{receipt.couponCode ? ` (${receipt.couponCode})` : ""}</span>
            <span className="font-medium">- {formatSar(receipt.discountHalalas)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-[#eef2f8] pt-2 text-[15px] font-extrabold">
          <span>الإجمالي المدفوع</span>
          <span className="text-[#2878ff]">{formatSar(receipt.amountHalalas)}</span>
        </div>
      </div>

      <div className="mt-6 border-t border-[#eef2f8] pt-4">
        <Row label="طريقة الدفع" value={paymentMethodLabel(receipt.paymentMethod)} />
        <Row
          label="مرجع العملية"
          value={
            receipt.paymentReference ? (
              <span dir="ltr" className="font-mono text-[11.5px]">
                {receipt.sourceType === "bank_transfer"
                  ? receipt.paymentReference.slice(0, 40)
                  : receipt.paymentReference}
              </span>
            ) : null
          }
        />
      </div>

      <p className="mt-8 text-center text-[11.5px] text-[#95a4bd]">
        شكراً لاشتراكك في {receipt.seller.name}. هذا إيصال دفع وليس فاتورة ضريبية.
      </p>
    </div>
  )
}

export function ReceiptDialog({
  receiptId,
  onClose,
}: {
  receiptId: string | null
  onClose: () => void
}) {
  const [receipt, setReceipt] = useState<AdminReceiptDetail | null>(null)

  useEffect(() => {
    if (!receiptId) return
    let cancelled = false
    platformAdminService
      .getReceipt(receiptId)
      .then((next) => {
        if (!cancelled) setReceipt(next)
      })
      .catch(() => toast.error("تعذر تحميل الإيصال."))
    return () => {
      cancelled = true
    }
  }, [receiptId])

  const loaded = receipt && receipt.id === receiptId ? receipt : null

  return (
    <AppDialog
      open={receiptId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={<span dir="rtl">{loaded ? `إيصال ${loaded.number}` : "الإيصال"}</span>}
      contentClassName="[direction:rtl] max-w-[46rem] gap-4 bg-[#f4f7fc] p-6"
      footer={
        <div className="flex w-full justify-end gap-2">
          <AppButton variant="outline" className="h-11 rounded-[10px] px-5" onClick={onClose}>
            إغلاق
          </AppButton>
          <AppButton
            className="h-11 rounded-[10px] px-5 font-semibold"
            icon={<Printer className="size-4" />}
            disabled={!loaded}
            onClick={printReceipt}
          >
            طباعة / حفظ PDF
          </AppButton>
        </div>
      }
    >
      <div className="max-h-[68vh] overflow-y-auto">
        {loaded ? (
          <ReceiptDocument receipt={loaded} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">جارٍ تحميل الإيصال...</p>
        )}
      </div>
    </AppDialog>
  )
}
