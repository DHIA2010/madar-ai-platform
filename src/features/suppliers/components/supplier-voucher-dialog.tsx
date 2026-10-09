"use client"

import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Landmark } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateField,
  AppDialog,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app"

import type { SupplierVoucherPaymentMethod, SupplierVoucherType } from "../types"

// Same design language as CustomerStatement's own سند dialog -- duplicated locally rather than
// imported, matching this codebase's per-feature-duplication convention for page-local styling.
export const HEADING = "text-[#0d1b3e]"
export const MUTED = "text-[#5b6b85]"
export const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

// Suppliers has no real tax-settings backend of its own to read a live rate from (this whole
// module is frontend-only) -- same hardcoded fallback CustomerStatement itself falls back to.
export const VOUCHER_VAT_RATE = 0.15

export const VOUCHER_TYPE_META: Record<
  SupplierVoucherType,
  { label: string; verb: string; icon: typeof ArrowDownCircle; color: string; bg: string }
> = {
  receipt: {
    label: "سند قبض",
    verb: "قبض",
    icon: ArrowDownCircle,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  payment: { label: "سند صرف", verb: "صرف", icon: ArrowUpCircle, color: "#dc2626", bg: "#fef2f2" },
}

export const PAYMENT_METHOD_OPTIONS: Array<{
  code: SupplierVoucherPaymentMethod
  name: string
  icon: typeof Banknote
}> = [
  { code: "cash", name: "نقدًا", icon: Banknote },
  { code: "card", name: "بطاقة", icon: CreditCard },
  { code: "transfer", name: "تحويل بنكي", icon: Landmark },
]
export const PAYMENT_METHOD_NAME: Record<SupplierVoucherPaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((method) => [method.code, method.name])
) as Record<SupplierVoucherPaymentMethod, string>

export function formatVoucherAmount(value: number): string {
  return `${new Intl.NumberFormat("ar-SA-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ر.س`
}

// The سند قبض/صرف creation dialog -- shared by SupplierStatement (supplier already fixed by the
// page it's on) and SupplierVouchersPage (supplier picked from a dropdown, since that page isn't
// scoped to one supplier). `supplierLocked` switches between a disabled single-option select and
// a real searchable one; everything else behaves identically either way.
export function SupplierVoucherDialog({
  type,
  supplierId,
  onSupplierIdChange,
  supplierOptions,
  supplierLocked = false,
  supplierBalance,
  invoiceId,
  onInvoiceIdChange,
  invoiceOptions,
  selectedInvoiceAmount = null,
  amount,
  onAmountChange,
  transactionDate,
  onTransactionDateChange,
  taxInclusive,
  onTaxInclusiveChange,
  paymentMethod,
  onPaymentMethodChange,
  notes,
  onNotesChange,
  isSaving,
  onCancel,
  onSubmit,
}: {
  type: SupplierVoucherType
  supplierId: string
  onSupplierIdChange: (id: string) => void
  supplierOptions: AppSearchableSelectOption[]
  supplierLocked?: boolean
  supplierBalance: number
  // The purchase invoice this سند optionally settles/refunds -- "" means no link. Options are
  // scoped to the currently-selected supplier's own invoices, computed by the parent.
  invoiceId: string
  onInvoiceIdChange: (id: string) => void
  invoiceOptions: AppSearchableSelectOption[]
  // The linked invoice's own grand total, for the "ملخص العملية" summary -- null when nothing is
  // linked or the parent hasn't resolved it yet.
  selectedInvoiceAmount?: number | null
  amount: string
  onAmountChange: (value: string) => void
  transactionDate: string
  onTransactionDateChange: (value: string) => void
  taxInclusive: boolean
  onTaxInclusiveChange: (value: boolean) => void
  paymentMethod: SupplierVoucherPaymentMethod | ""
  onPaymentMethodChange: (value: SupplierVoucherPaymentMethod) => void
  notes: string
  onNotesChange: (value: string) => void
  isSaving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const meta = VOUCHER_TYPE_META[type]
  const Icon = meta.icon
  const numericAmount = Math.round((Number(amount) || 0) * 100) / 100
  const taxAmount = taxInclusive
    ? Math.round((numericAmount - numericAmount / (1 + VOUCHER_VAT_RATE)) * 100) / 100
    : 0
  // A receipt moves the balance toward "we owe the supplier more" (+1), a payment reduces it
  // (-1) -- same sign convention buildSupplierTransactions (SupplierStatement) uses.
  const direction = type === "receipt" ? 1 : -1
  const balanceAfter = supplierBalance + direction * numericAmount
  const subtitle =
    type === "receipt"
      ? "تسجيل مبلغ حقيقي تم استلامه من المورد (مثل استرداد أو رصيد دائن)"
      : "تسجيل مبلغ تم دفعه فعليًا للمورد، يخصم من المبلغ المستحق له"

  return (
    <AppDialog
      open={true}
      onOpenChange={(next) => {
        if (!next && !isSaving) onCancel()
      }}
      contentClassName="w-[92vw] max-w-[34rem] rounded-[16px] p-5 [direction:rtl]"
      title={
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className={cn("text-[15px] font-extrabold", HEADING)}>{meta.label}</span>
        </div>
      }
      description={<span className={cn("text-[12px]", MUTED)}>{subtitle}</span>}
      footer={
        <>
          <AppButton
            className="h-10 gap-2 rounded-[10px] px-5 text-[13px] font-semibold text-white"
            style={{ backgroundColor: meta.color }}
            disabled={isSaving}
            onClick={onSubmit}
          >
            {isSaving ? "جارٍ الحفظ..." : `حفظ ${meta.label}`}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isSaving}
            onClick={onCancel}
          >
            إلغاء
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>التاريخ</label>
            <AppDateField value={transactionDate} onChange={onTransactionDateChange} />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              رقم السند
            </label>
            <input
              disabled
              value="سيُنشأ تلقائياً بعد الحفظ"
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-[11px] text-[#8098b4]")}
            />
          </div>
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            المورد <span className="text-[#dc2626]">*</span>
          </label>
          <AppSearchableSelect
            value={supplierId}
            onChange={onSupplierIdChange}
            options={supplierOptions}
            disabled={supplierLocked}
            placeholder="اختر المورد"
            searchPlaceholder="ابحث عن مورد..."
            emptyLabel="لا يوجد موردون"
            ariaLabel="المورد"
            triggerClassName="h-11"
          />
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            ربط بفاتورة شراء (اختياري)
          </label>
          <AppSearchableSelect
            value={invoiceId}
            onChange={onInvoiceIdChange}
            options={[{ value: "", label: "بدون ربط بفاتورة" }, ...invoiceOptions]}
            disabled={!supplierId || invoiceOptions.length === 0}
            placeholder="بدون ربط بفاتورة"
            searchPlaceholder="ابحث برقم الفاتورة..."
            emptyLabel="لا توجد فواتير"
            ariaLabel="الفاتورة المرتبطة"
            triggerClassName="h-11"
          />
          {supplierId && invoiceOptions.length === 0 ? (
            <p className="mt-1 text-[10.5px] text-[#95a4bd]">
              لا توجد فواتير شراء مسجلة لهذا المورد.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              طريقة الدفع <span className="text-[#dc2626]">*</span>
            </label>
            <AppSearchableSelect
              value={paymentMethod}
              onChange={(value) => onPaymentMethodChange(value as SupplierVoucherPaymentMethod)}
              options={PAYMENT_METHOD_OPTIONS.map((method) => ({
                value: method.code,
                label: method.name,
                icon: method.icon,
              }))}
              placeholder="اختر طريقة الدفع"
              ariaLabel="طريقة الدفع"
              triggerClassName="h-11"
            />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              المبلغ <span className="text-[#dc2626]">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-left")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <label className="flex items-center gap-2 text-[12px] font-semibold">
            <input
              type="checkbox"
              checked={taxInclusive}
              onChange={(event) => onTaxInclusiveChange(event.target.checked)}
              className="size-4 rounded border-[#e8edf3]"
            />
            <span className={HEADING}>يشمل الضريبة؟</span>
          </label>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>الضريبة</label>
            <input
              disabled
              dir="ltr"
              value={taxAmount.toFixed(2)}
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-left text-[#8098b4]")}
            />
          </div>
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            ملاحظات (اختياري)
          </label>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={2}
            maxLength={500}
            className={cn(
              FIELD_CLASS,
              "h-auto w-full resize-none px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
            )}
          />
        </div>

        <div className="rounded-[12px] border border-[#e8edf3] bg-[#f8fafc] p-3.5">
          <p className={cn("mb-2 text-[12px] font-bold", HEADING)}>ملخص العملية</p>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <div className="flex items-center justify-between">
              <span className={MUTED}>المبلغ</span>
              <span className={cn("font-semibold", HEADING)}>
                {formatVoucherAmount(numericAmount)}
              </span>
            </div>
            {taxInclusive ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>منها ضريبة القيمة المضافة</span>
                <span className={cn("font-semibold", HEADING)}>
                  {formatVoucherAmount(taxAmount)}
                </span>
              </div>
            ) : null}
            {invoiceId ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>مرتبط بفاتورة</span>
                <span className={cn("font-semibold", HEADING)}>
                  {invoiceOptions.find((option) => option.value === invoiceId)?.label ?? invoiceId}
                </span>
              </div>
            ) : null}
            {invoiceId && selectedInvoiceAmount !== null ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>إجمالي الفاتورة</span>
                <span className={cn("font-semibold", HEADING)}>
                  {formatVoucherAmount(selectedInvoiceAmount)}
                </span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-[#e8edf3] pt-1.5">
              <span className={MUTED}>رصيد المورد الحالي</span>
              <span className={cn("font-semibold", HEADING)}>
                {formatVoucherAmount(supplierBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>رصيد المورد بعد العملية</span>
              <span
                className="font-bold"
                style={{ color: balanceAfter >= 0 ? "#16a34a" : "#dc2626" }}
              >
                {formatVoucherAmount(balanceAfter)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
