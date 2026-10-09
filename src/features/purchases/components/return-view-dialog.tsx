"use client"

import { AppButton, AppDialog } from "@/components/app"

import type { PurchaseReturn } from "../types"
import { PurchaseAvatar } from "./purchase-avatar"
import { ReturnStatusBadge } from "./return-status-badge"

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#95a4bd]">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[#0b1738]">{value || "—"}</p>
    </div>
  )
}

export function ReturnViewDialog({
  entry,
  onOpenChange,
}: {
  entry: PurchaseReturn | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AppDialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title={
        entry ? (
          <span dir="rtl" className="flex items-center gap-3.5">
            <PurchaseAvatar
              name={entry.supplierName}
              imageUrl={entry.supplierImageUrl}
              className="size-12"
            />
            <span>
              <span className="block text-[17px] font-extrabold text-[#0b1738]">
                {entry.supplierName}
              </span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-[#6b7b96]">
                {entry.code}
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
      {entry ? (
        <div dir="rtl" className="space-y-4">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <ReturnStatusBadge status={entry.status} />
            <p className="text-[13px] font-bold text-[#0b1738]">
              مبلغ الإرجاع: {formatCurrency(entry.returnAmount)}
            </p>
          </div>

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="رقم الطلب" value={entry.purchaseCode} />
              <Field label="الفرع" value={entry.warehouseName} />
              <Field label="العناصر المرتجعة" value={`${entry.returnQty} صنف`} />
              <Field label="تاريخ الإرجاع" value={entry.returnDate} />
            </div>
          </div>

          {entry.items.length > 0 ? (
            <div className="rounded-[12px] border border-[#e1e7f0] p-4">
              <p className="mb-2 text-[11px] font-semibold text-[#95a4bd]">الأصناف المرتجعة</p>
              <div className="space-y-2">
                {entry.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between border-b border-[#eef1f6] pb-2 text-[12.5px] last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-[#0b1738]">{item.productName}</p>
                      <p className="text-[11px] text-[#95a4bd]">
                        {item.sku} · {item.qty} × {formatCurrency(item.unitCost)}
                      </p>
                    </div>
                    <p className="font-bold text-[#0b1738]">
                      {formatCurrency(item.qty * item.unitCost)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <p className="mb-1.5 text-[11px] font-semibold text-[#95a4bd]">ملاحظات</p>
            <p className="text-[13px] font-medium whitespace-pre-wrap text-[#0b1738]">
              {entry.notes || "—"}
            </p>
          </div>
        </div>
      ) : null}
    </AppDialog>
  )
}
