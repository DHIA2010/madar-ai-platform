"use client"

import { useWorkspace } from "@/features/workspace"

import type { Supplier, SupplierVoucher } from "../types"
import {
  formatVoucherAmount,
  PAYMENT_METHOD_NAME,
  VOUCHER_TYPE_META,
} from "./supplier-voucher-dialog"

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-bold">{label}: </span>
      <span>{value || "—"}</span>
    </p>
  )
}

// A4-sized printable voucher slip -- portaled straight to <body> by SupplierVouchersPage and
// shown only under the print media query defined alongside it there. Mirrors
// PurchasePrintDocument/ReturnPrintDocument's layout (logo+title header / org name / two-column
// details / totals) section-for-section so all three print as the same visual family.
export function SupplierVoucherPrintDocument({
  voucher,
  supplier,
}: {
  voucher: SupplierVoucher
  supplier: Supplier | null
}) {
  const { currentOrganization } = useWorkspace()
  const meta = VOUCHER_TYPE_META[voucher.type]

  return (
    <div
      id="supplier-voucher-print-target"
      className="hidden bg-white p-[14mm] text-[#0b1738] print:block"
      style={{ width: "210mm", minHeight: "297mm", direction: "rtl" }}
      dir="rtl"
    >
      <div className="mb-2 flex items-start justify-between">
        <h1 className="text-[22px] font-extrabold">{meta.label}</h1>
        {currentOrganization?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentOrganization.logoUrl}
            alt=""
            className="size-16 rounded-[10px] object-contain"
          />
        ) : (
          <span />
        )}
      </div>
      <h2 className="mb-6 text-right text-[19px] font-extrabold">
        {currentOrganization?.name ?? ""}
      </h2>

      <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
        <div className="space-y-2 text-right">
          <DetailLine label="رقم السند" value={voucher.reference} />
          <DetailLine label="نوع السند" value={meta.label} />
          <DetailLine label="تاريخ السند" value={voucher.transactionDate} />
          <DetailLine label="طريقة الدفع" value={PAYMENT_METHOD_NAME[voucher.paymentMethod]} />
        </div>
        <div className="space-y-2 text-right">
          <DetailLine label="اسم المورد" value={voucher.supplierName} />
          <DetailLine label="رقم جوال المورد" value={supplier?.phone ?? ""} />
          <DetailLine
            label="الرقم الضريبي للمورد"
            value={supplier?.companyDetails.taxNumber ?? ""}
          />
          <DetailLine label="الفاتورة المرتبطة" value={voucher.purchaseCode ?? "—"} />
        </div>
      </div>

      <div className="flex justify-end">
        <div className="w-[95mm] space-y-2.5">
          {voucher.taxInclusive ? (
            <div className="flex items-center justify-between text-[13px]">
              <span>منها ضريبة القيمة المضافة</span>
              <span>{formatVoucherAmount(voucher.taxAmount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-b-2 border-[#0b1738] pb-2 text-[16px]">
            <span className="font-extrabold">{meta.label} - المبلغ الإجمالي</span>
            <span className="font-extrabold">{formatVoucherAmount(voucher.amount)}</span>
          </div>
        </div>
      </div>

      {voucher.notes ? (
        <div className="mt-6 border-t border-[#e1e7f0] pt-4">
          <p className="text-[11px] font-semibold text-[#95a4bd]">ملاحظات</p>
          <p className="mt-1 text-[12px]">{voucher.notes}</p>
        </div>
      ) : null}
    </div>
  )
}
