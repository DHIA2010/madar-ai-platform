"use client"

import type { Supplier } from "@/features/suppliers"
import { useWorkspace } from "@/features/workspace"

import type { PurchaseReturn, ReturnStatus } from "../types"

const STATUS_LABEL: Record<ReturnStatus, string> = {
  full: "إرجاع كامل",
  partial: "إرجاع جزئي",
}

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-bold">{label}: </span>
      <span>{value || "—"}</span>
    </p>
  )
}

// A4-sized printable return slip -- portaled straight to <body> by ReturnsListPage and shown only
// under the print media query defined alongside it there. Mirrors PurchasePrintDocument's layout
// (logo+title header / org name / two-column details / bordered table / totals) section-for-
// section so both print as the same visual family.
export function ReturnPrintDocument({
  entry,
  supplier,
}: {
  entry: PurchaseReturn
  supplier: Supplier | null
}) {
  const { currentOrganization } = useWorkspace()

  return (
    <div
      id="return-print-target"
      className="hidden bg-white p-[14mm] text-[#0b1738] print:block"
      style={{ width: "210mm", minHeight: "297mm", direction: "rtl" }}
      dir="rtl"
    >
      <div className="mb-2 flex items-start justify-between">
        <h1 className="text-[22px] font-extrabold">مرتجع مشتريات</h1>
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

      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
        <div className="space-y-2 text-right">
          <DetailLine label="رقم المرتجع" value={entry.code} />
          <DetailLine label="رقم الطلب" value={entry.purchaseCode} />
          <DetailLine label="تاريخ الإرجاع" value={entry.returnDate} />
          <DetailLine label="حالة الإرجاع" value={STATUS_LABEL[entry.status]} />
        </div>
        <div className="space-y-2 text-right">
          <DetailLine label="اسم المورد" value={entry.supplierName} />
          <DetailLine label="رقم جوال المورد" value={supplier?.phone ?? ""} />
          <DetailLine label="رقم المورد الضريبي" value={supplier?.companyDetails.taxNumber ?? ""} />
          <DetailLine label="المستودع" value={entry.warehouseName} />
        </div>
      </div>

      <table className="mb-8 w-full border-collapse border border-[#0b1738] text-[11.5px]">
        <thead>
          <tr className="bg-[#f1f3f6]">
            <th className="border border-[#0b1738] px-2 py-2 text-right font-bold">المنتج</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">SKU</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">تكلفة الوحدة</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">الكمية</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">الاجمالي</th>
          </tr>
        </thead>
        <tbody>
          {entry.items.map((item) => (
            <tr key={item.productId}>
              <td className="border border-[#0b1738] px-2 py-2 text-right">{item.productName}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">{item.sku}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">
                {formatCurrency(item.unitCost)}
              </td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">{item.qty}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center font-semibold">
                {formatCurrency(item.qty * item.unitCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-[95mm] space-y-2.5">
          <div className="flex items-center justify-between border-b-2 border-[#0b1738] pb-2 text-[16px]">
            <span className="font-extrabold">مبلغ الإرجاع</span>
            <span className="font-extrabold">{formatCurrency(entry.returnAmount)}</span>
          </div>
        </div>
      </div>

      {entry.notes ? (
        <div className="mt-6 border-t border-[#e1e7f0] pt-4">
          <p className="text-[11px] font-semibold text-[#95a4bd]">ملاحظات</p>
          <p className="mt-1 text-[12px]">{entry.notes}</p>
        </div>
      ) : null}
    </div>
  )
}
