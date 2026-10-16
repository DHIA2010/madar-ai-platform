"use client"

import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { isSupportedOrgCurrency } from "../services"
import type { SupplierVoucher } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { formatVoucherAmount, VOUCHER_TYPE_META } from "./supplier-voucher-dialog"

import { type Locale, localeDirection } from "@/i18n/locales"

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
  const t = useTranslations("suppliers.vouchers")
  const tView = useTranslations("suppliers.vouchers.viewDialog")
  const tPaymentMethod = useTranslations("suppliers.vouchers.paymentMethod")
  const locale = useLocale()
  const dir = localeDirection(locale as Locale)
  const { currentOrganization } = useWorkspace()
  const rawOrgCurrency = currentOrganization?.currency ?? ""
  const orgCurrency = isSupportedOrgCurrency(rawOrgCurrency) ? rawOrgCurrency : "SAR"
  const meta = voucher ? VOUCHER_TYPE_META[voucher.type] : null

  return (
    <AppDialog
      open={voucher !== null}
      onOpenChange={onOpenChange}
      title={
        voucher ? (
          <span dir={dir} className="flex items-center gap-3.5">
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
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        "max-w-[32rem] gap-5 p-6"
      )}
      footer={
        <AppButton
          variant="outline"
          className="h-11 w-full rounded-[10px] text-[13.5px] font-semibold"
          onClick={() => onOpenChange(false)}
        >
          {tView("close")}
        </AppButton>
      }
    >
      {voucher && meta ? (
        <div dir={dir} className="space-y-4">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              {t(`type.${voucher.type}.label`)}
            </span>
            <p className="text-[13px] font-bold text-[#0b1738]">
              {tView("amountLabel", {
                amount: formatVoucherAmount(voucher.amount, orgCurrency, locale as Locale),
              })}
            </p>
          </div>

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label={tView("reference")} value={voucher.reference} />
              <Field label={tView("date")} value={voucher.transactionDate} />
              <Field label={tView("paymentMethod")} value={tPaymentMethod(voucher.paymentMethod)} />
              <Field label={tView("linkedInvoice")} value={voucher.purchaseCode ?? "—"} />
            </div>
          </div>

          {voucher.taxInclusive ? (
            <div className="rounded-[12px] border border-[#e1e7f0] p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label={tView("taxInclusive")} value={tView("yes")} />
                <Field
                  label={tView("taxAmount")}
                  value={formatVoucherAmount(voucher.taxAmount, orgCurrency, locale as Locale)}
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-[12px] border border-[#e1e7f0] p-4">
            <p className="mb-1.5 text-[11px] font-semibold text-[#95a4bd]">{tView("notes")}</p>
            <p className="text-[13px] font-medium whitespace-pre-wrap text-[#0b1738]">
              {voucher.notes || "—"}
            </p>
          </div>
        </div>
      ) : null}
    </AppDialog>
  )
}
