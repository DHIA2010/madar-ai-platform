"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Landmark } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateField,
  AppDialog,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { isSupportedOrgCurrency, type SupportedOrgCurrency } from "../services"
import type { SupplierVoucherPaymentMethod, SupplierVoucherType } from "../types"

import type { Locale } from "@/i18n/locales"

// Same design language as CustomerStatement's own سند dialog -- duplicated locally rather than
// imported, matching this codebase's per-feature-duplication convention for page-local styling.
export const HEADING = "text-[#0d1b3e]"
export const MUTED = "text-[#5b6b85]"
export const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

// Suppliers has no real tax-settings backend of its own to read a live rate from (this whole
// module is frontend-only) -- same hardcoded fallback CustomerStatement itself falls back to.
export const VOUCHER_VAT_RATE = 0.15

// Display text (label/verb, payment-method name) lives in the "suppliers.vouchers" i18n
// namespace, resolved via useTranslations("suppliers.vouchers") at each call site -- this object
// only keeps the locale-independent visual facts.
export const VOUCHER_TYPE_META: Record<
  SupplierVoucherType,
  { icon: typeof ArrowDownCircle; color: string; bg: string }
> = {
  receipt: { icon: ArrowDownCircle, color: "#16a34a", bg: "#f0fdf4" },
  payment: { icon: ArrowUpCircle, color: "#dc2626", bg: "#fef2f2" },
}

export const PAYMENT_METHOD_OPTIONS: Array<{
  code: SupplierVoucherPaymentMethod
  icon: typeof Banknote
}> = [
  { code: "cash", icon: Banknote },
  { code: "card", icon: CreditCard },
  { code: "transfer", icon: Landmark },
]

// Vouchers have no currency field of their own -- their amount is always treated as already being
// in the organization's default currency, so this only needs to label the number correctly, never
// convert it (see currency-conversion.service.ts for the suppliers/purchases that do need real
// cross-currency conversion before they reach this kind of formatter).
export function formatVoucherAmount(
  value: number,
  currency: SupportedOrgCurrency,
  locale: Locale
): string {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  if (currency === "USD") return `${formatted} $`
  return locale === "ar" ? `${formatted} ر.س` : `${formatted} SAR`
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
  const t = useTranslations("suppliers.vouchers")
  const tDialog = useTranslations("suppliers.vouchers.dialog")
  const tPaymentMethod = useTranslations("suppliers.vouchers.paymentMethod")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { currentOrganization } = useWorkspace()
  const rawOrgCurrency = currentOrganization?.currency ?? ""
  const orgCurrency: SupportedOrgCurrency = isSupportedOrgCurrency(rawOrgCurrency)
    ? rawOrgCurrency
    : "SAR"
  const meta = VOUCHER_TYPE_META[type]
  const typeLabel = t(`type.${type}.label`)
  const Icon = meta.icon
  const numericAmount = Math.round((Number(amount) || 0) * 100) / 100
  const taxAmount = taxInclusive
    ? Math.round((numericAmount - numericAmount / (1 + VOUCHER_VAT_RATE)) * 100) / 100
    : 0
  // A receipt moves the balance toward "we owe the supplier more" (+1), a payment reduces it
  // (-1) -- same sign convention buildSupplierTransactions (SupplierStatement) uses.
  const direction = type === "receipt" ? 1 : -1
  const balanceAfter = supplierBalance + direction * numericAmount
  const subtitle = tDialog(type === "receipt" ? "receiptSubtitle" : "paymentSubtitle")

  return (
    <AppDialog
      open={true}
      onOpenChange={(next) => {
        if (!next && !isSaving) onCancel()
      }}
      contentClassName={cn(
        "w-[92vw] max-w-[34rem] rounded-[16px] p-5",
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
      )}
      title={
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className={cn("text-[15px] font-extrabold", HEADING)}>{typeLabel}</span>
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
            {isSaving ? tDialog("saving") : tDialog("save", { type: typeLabel })}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isSaving}
            onClick={onCancel}
          >
            {tCommon("cancel")}
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {tDialog("dateLabel")}
            </label>
            <AppDateField value={transactionDate} onChange={onTransactionDateChange} />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {tDialog("referenceLabel")}
            </label>
            <input
              disabled
              value={tDialog("referencePlaceholder")}
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-[11px] text-[#8098b4]")}
            />
          </div>
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {tDialog("supplierLabel")} <span className="text-[#dc2626]">*</span>
          </label>
          <AppSearchableSelect
            value={supplierId}
            onChange={onSupplierIdChange}
            options={supplierOptions}
            disabled={supplierLocked}
            placeholder={tDialog("supplierPlaceholder")}
            searchPlaceholder={tDialog("supplierSearchPlaceholder")}
            emptyLabel={tDialog("supplierEmptyLabel")}
            ariaLabel={tDialog("supplierLabel")}
            triggerClassName="h-11"
          />
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {tDialog("invoiceLabel")}
          </label>
          <AppSearchableSelect
            value={invoiceId}
            onChange={onInvoiceIdChange}
            options={[{ value: "", label: tDialog("invoiceNoLink") }, ...invoiceOptions]}
            disabled={!supplierId || invoiceOptions.length === 0}
            placeholder={tDialog("invoiceNoLink")}
            searchPlaceholder={tDialog("invoiceSearchPlaceholder")}
            emptyLabel={tDialog("invoiceEmptyLabel")}
            ariaLabel={tDialog("invoiceAriaLabel")}
            triggerClassName="h-11"
          />
          {supplierId && invoiceOptions.length === 0 ? (
            <p className="mt-1 text-[10.5px] text-[#95a4bd]">{tDialog("noInvoicesForSupplier")}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {tDialog("paymentMethodLabel")} <span className="text-[#dc2626]">*</span>
            </label>
            <AppSearchableSelect
              value={paymentMethod}
              onChange={(value) => onPaymentMethodChange(value as SupplierVoucherPaymentMethod)}
              options={PAYMENT_METHOD_OPTIONS.map((method) => ({
                value: method.code,
                label: tPaymentMethod(method.code),
                icon: method.icon,
              }))}
              placeholder={tDialog("paymentMethodPlaceholder")}
              ariaLabel={tDialog("paymentMethodLabel")}
              triggerClassName="h-11"
            />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {tDialog("amountLabel")} <span className="text-[#dc2626]">*</span>
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
            <span className={HEADING}>{tDialog("taxInclusiveLabel")}</span>
          </label>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {tDialog("taxLabel")}
            </label>
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
            {tDialog("notesLabel")}
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
          <p className={cn("mb-2 text-[12px] font-bold", HEADING)}>{tDialog("summaryTitle")}</p>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <div className="flex items-center justify-between">
              <span className={MUTED}>{tDialog("summaryAmount")}</span>
              <span className={cn("font-semibold", HEADING)}>
                {formatVoucherAmount(numericAmount, orgCurrency, locale as Locale)}
              </span>
            </div>
            {taxInclusive ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>{tDialog("summaryTax")}</span>
                <span className={cn("font-semibold", HEADING)}>
                  {formatVoucherAmount(taxAmount, orgCurrency, locale as Locale)}
                </span>
              </div>
            ) : null}
            {invoiceId ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>{tDialog("summaryLinkedInvoice")}</span>
                <span className={cn("font-semibold", HEADING)}>
                  {invoiceOptions.find((option) => option.value === invoiceId)?.label ?? invoiceId}
                </span>
              </div>
            ) : null}
            {invoiceId && selectedInvoiceAmount !== null ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>{tDialog("summaryInvoiceTotal")}</span>
                <span className={cn("font-semibold", HEADING)}>
                  {formatVoucherAmount(selectedInvoiceAmount, orgCurrency, locale as Locale)}
                </span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-[#e8edf3] pt-1.5">
              <span className={MUTED}>{tDialog("summaryCurrentBalance")}</span>
              <span className={cn("font-semibold", HEADING)}>
                {formatVoucherAmount(supplierBalance, orgCurrency, locale as Locale)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>{tDialog("summaryBalanceAfter")}</span>
              <span
                className="font-bold"
                style={{ color: balanceAfter >= 0 ? "#16a34a" : "#dc2626" }}
              >
                {formatVoucherAmount(balanceAfter, orgCurrency, locale as Locale)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
