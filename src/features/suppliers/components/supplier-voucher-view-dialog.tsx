"use client"

import { AppButton, AppDialog } from "@/components/app"

import type { SupplierVoucher } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import {
  formatVoucherAmount,
  PAYMENT_METHOD_NAME,
  VOUCHER_TYPE_META,
} from "./supplier-voucher-dialog"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#95a4bd]">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[#0b1738]">{value || "—"}</p>
    </div>
  )
}

export function SupplierVoucherViewDialog({
  voucher,
  onOpenChange,
}: {
  voucher: SupplierVoucher | null
  onOpenChange: (open: boolean) => void
}) {
  const meta = voucher ? VOUCHER_TYPE_META[voucher.type] : null

  return (
    <AppDialog
      open={voucher !== null}
      onOpenChange={onOpenChange}
      title={
        voucher ? (
          <span dir="rtl" className="flex items-center gap-3.5">
            <SupplierAvatar
              name={voucher.supplierName}
              imageUrl={voucher.supplierImageUrl}
              className="size-12"
            />
            <span>
              <span className="block text-[17px] font-extrabold text-[#0b1738]">
                {voucher.supplierName}
              </span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-[#6b7b96]">
                {voucher.reference}
              </span>
            </span>
          </span>
        ) : (
          ""
        )
      }
      contentClassName="[direction:rtl] max-w-[32rem] gap-5 p-6"
      footer={
        <AppButton
          variant="outline"
          className="h-11 w-full rounded-[10px] text-[13.5px] font-semibold"
          onClick={() => onOpenChange(false)}
        >
          إغلاق
        </AppButton>
      }
    >
      {voucher && meta ? (
        <div dir="rtl" className="space-y-4">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            <p className="text-[13px] font-bold text-[#0b1738]">
              المبلغ: {formatVoucherAmount(voucher.amount)}
            </p>
          </div>

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="رقم السند" value={voucher.reference} />
              <Field label="التاريخ" value={voucher.transactionDate} />
              <Field label="طريقة الدفع" value={PAYMENT_METHOD_NAME[voucher.paymentMethod]} />
              <Field label="الفاتورة المرتبطة" value={voucher.purchaseCode ?? "—"} />
            </div>
          </div>

          {voucher.taxInclusive ? (
            <div className="rounded-[12px] border border-[#e1e7f0] p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="يشمل الضريبة" value="نعم" />
                <Field label="قيمة الضريبة" value={formatVoucherAmount(voucher.taxAmount)} />
              </div>
            </div>
          ) : null}

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <p className="mb-1.5 text-[11px] font-semibold text-[#95a4bd]">ملاحظات</p>
            <p className="text-[13px] font-medium whitespace-pre-wrap text-[#0b1738]">
              {voucher.notes || "—"}
            </p>
          </div>
        </div>
      ) : null}
    </AppDialog>
  )
}
