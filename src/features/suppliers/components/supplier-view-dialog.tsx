"use client"

import type { ReactNode } from "react"

import { AppButton, AppDialog } from "@/components/app"

import { SUPPLIER_CURRENCIES, VAT_TYPE_OPTIONS } from "../services"
import type { Supplier } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { SupplierStatusBadge } from "./supplier-status-badge"

const KIND_LABEL: Record<Supplier["kind"], string> = { local: "محلي", international: "دولي" }
const PAYMENT_TERMS_LABEL: Record<NonNullable<Supplier["paymentTerms"]>, string> = {
  prepaid: "دفع مسبق",
  cod: "الدفع عند الاستلام",
  net15: "صافي 15 يومًا",
  net30: "صافي 30 يومًا",
  net45: "صافي 45 يومًا",
  net60: "صافي 60 يومًا",
}
const ACCOUNT_TYPE_LABEL: Record<Supplier["bankDetails"]["accountType"], string> = {
  savings: "توفير",
  current: "جاري",
  other: "أخرى",
}
const CURRENCY_LABEL: Record<string, string> = Object.fromEntries(
  SUPPLIER_CURRENCIES.map((currency) => [currency.value, currency.label])
)
const VAT_TYPE_LABEL: Record<
  NonNullable<Supplier["companyDetails"]["vatType"]>,
  string
> = Object.fromEntries(VAT_TYPE_OPTIONS.map((option) => [option.value, option.label])) as Record<
  NonNullable<Supplier["companyDetails"]["vatType"]>,
  string
>

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
  return (
    <AppDialog
      open={supplier !== null}
      onOpenChange={onOpenChange}
      title={
        supplier ? (
          <span dir="rtl" className="flex items-center gap-3.5">
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
      contentClassName="[direction:rtl] max-w-[38rem] gap-5 p-6"
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
      {supplier ? (
        <div dir="rtl" className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
          <div className="flex items-center justify-between rounded-[12px] bg-[#f7f9fd] px-4 py-3">
            <SupplierStatusBadge status={supplier.status} />
            <p className="text-[13px] font-bold text-[#0b1738]">
              الرصيد: {balance < 0 ? "-" : ""}
              {new Intl.NumberFormat("en-US").format(Math.abs(balance))} $
            </p>
          </div>

          <Section title="بيانات المورد">
            <Field label="البريد الإلكتروني" value={supplier.email} />
            <Field label="رقم الهاتف" value={supplier.phone} />
            <Field label="نوع المورد" value={KIND_LABEL[supplier.kind]} />
            <Field
              label="شروط الدفع"
              value={supplier.paymentTerms ? PAYMENT_TERMS_LABEL[supplier.paymentTerms] : ""}
            />
            <Field label="الدولة" value={supplier.country} />
            <Field label="المدينة" value={supplier.city} />
            <Field label="العنوان" value={supplier.address} />
          </Section>

          <Section title="البيانات البنكية">
            <Field label="اسم البنك" value={supplier.bankDetails.bankName} />
            <Field label="اسم الحساب" value={supplier.bankDetails.accountName} />
            <Field
              label="نوع الحساب"
              value={ACCOUNT_TYPE_LABEL[supplier.bankDetails.accountType]}
            />
            <Field label="رقم الحساب" value={supplier.bankDetails.accountNumber} />
            <Field
              label="العملة"
              value={CURRENCY_LABEL[supplier.bankDetails.currency] ?? supplier.bankDetails.currency}
            />
            <Field label="Swift / IBAN" value={supplier.bankDetails.swiftIban} />
            <Field label="رمز الفرع" value={supplier.bankDetails.branchCode} />
            <Field label="مدينة البنك" value={supplier.bankDetails.bankCity} />
          </Section>

          <Section title="بيانات الشركة">
            <Field label="اسم الشركة" value={supplier.companyDetails.companyName} />
            <Field label="بريد الشركة" value={supplier.companyDetails.companyEmail} />
            <Field label="هاتف الشركة" value={supplier.companyDetails.companyPhone} />
            <Field label="الموقع الإلكتروني" value={supplier.companyDetails.website} />
            <Field label="الرقم الضريبي" value={supplier.companyDetails.taxNumber} />
            <Field
              label="نوع الضريبة"
              value={
                supplier.companyDetails.vatType
                  ? VAT_TYPE_LABEL[supplier.companyDetails.vatType]
                  : ""
              }
            />
            <Field label="نوع النشاط" value={supplier.companyDetails.industryType} />
          </Section>
        </div>
      ) : null}
    </AppDialog>
  )
}
