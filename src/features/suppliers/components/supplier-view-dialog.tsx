"use client"

import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog } from "@/components/app"

import { VAT_TYPE_KEYS } from "../services"
import type { Supplier } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { SupplierStatusBadge } from "./supplier-status-badge"

import { type Locale, localeDirection } from "@/i18n/locales"

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
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  )
}

export function SupplierViewDialog({
  supplier,
  balance,
  onOpenChange,
}: {
  supplier: Supplier | null
  // Real derived balance (see supplier-ledger.service.ts) -- the caller already computed it for
  // the list row, so it's passed in rather than recomputed here.
  balance: number
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("suppliers.view")
  const tKind = useTranslations("suppliers.kind")
  const tPaymentTerms = useTranslations("suppliers.paymentTerms")
  const tAccountType = useTranslations("suppliers.accountType")
  const tVatType = useTranslations("suppliers.vatType")
  const locale = useLocale()
  const dir = localeDirection(locale as Locale)

  return (
    <AppDialog
      open={supplier !== null}
      onOpenChange={onOpenChange}
      title={
        supplier ? (
          <span dir={dir} className="flex items-center gap-3.5">
            <SupplierAvatar name={supplier.name} imageUrl={supplier.imageUrl} className="size-12" />
            <span>
              <span className="block text-[17px] font-extrabold text-[#0b1738]">
                {supplier.name}
              </span>
              <span className="mt-0.5 block text-[11.5px] font-medium text-[#6b7b96]">
                {supplier.code}
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
      {supplier ? (
        <div dir={dir} className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <SupplierStatusBadge status={supplier.status} />
            <p className="text-[13px] font-bold text-[#0b1738]">
              {t("balanceLabel", {
                amount: `${balance < 0 ? "-" : ""}${new Intl.NumberFormat("en-US").format(Math.abs(balance))} $`,
              })}
            </p>
          </div>

          <Section title={t("supplierInfo")}>
            <Field label={t("email")} value={supplier.email} />
            <Field label={t("phone")} value={supplier.phone} />
            <Field label={t("kindLabel")} value={tKind(supplier.kind)} />
            <Field
              label={t("paymentTermsLabel")}
              value={supplier.paymentTerms ? tPaymentTerms(supplier.paymentTerms) : ""}
            />
            <Field label={t("country")} value={supplier.country} />
            <Field label={t("city")} value={supplier.city} />
            <Field label={t("address")} value={supplier.address} />
          </Section>

          <Section title={t("bankInfo")}>
            <Field label={t("bankName")} value={supplier.bankDetails.bankName} />
            <Field label={t("accountName")} value={supplier.bankDetails.accountName} />
            <Field
              label={t("accountTypeLabel")}
              value={tAccountType(supplier.bankDetails.accountType)}
            />
            <Field label={t("accountNumber")} value={supplier.bankDetails.accountNumber} />
            <Field label={t("swiftIban")} value={supplier.bankDetails.swiftIban} />
            <Field label={t("branchCode")} value={supplier.bankDetails.branchCode} />
            <Field label={t("bankCity")} value={supplier.bankDetails.bankCity} />
          </Section>

          <Section title={t("companyInfo")}>
            <Field label={t("companyName")} value={supplier.companyDetails.companyName} />
            <Field label={t("companyEmail")} value={supplier.companyDetails.companyEmail} />
            <Field label={t("companyPhone")} value={supplier.companyDetails.companyPhone} />
            <Field label={t("website")} value={supplier.companyDetails.website} />
            <Field label={t("taxNumber")} value={supplier.companyDetails.taxNumber} />
            <Field
              label={t("vatTypeLabel")}
              value={
                supplier.companyDetails.vatType
                  ? tVatType(VAT_TYPE_KEYS[supplier.companyDetails.vatType])
                  : ""
              }
            />
            <Field label={t("industryType")} value={supplier.companyDetails.industryType} />
          </Section>
        </div>
      ) : null}
    </AppDialog>
  )
}
