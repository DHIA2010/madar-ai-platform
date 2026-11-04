"use client"

import { forwardRef, useState } from "react"
import Image from "next/image"
import { Pencil } from "lucide-react"

import { ASSETS } from "@/constants/assets"

import { AppButton, AppCard, AppDialog, AppTextarea } from "@/components/app"

import type {
  SalesDocumentItem,
  SalesDocumentTotals,
  SalesParty,
  SellerInfo,
} from "../types/crm.types"

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount
  )

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—"

export interface SalesDocumentProps {
  kind: "quote" | "invoice"
  number: string
  issuedAt: string
  // Quote: valid until; invoice: due date.
  dateLabel: string | null
  statusLabel?: string | null
  seller: SellerInfo
  customer: SalesParty
  items: { description: string; quantity: number; unitPrice: number }[]
  totals: SalesDocumentTotals
  notes?: string | null
  footer?: React.ReactNode
  // The terms and conditions printed at the bottom.
  terms?: string | null
  // Invoice: the subscription period it covers.
  subscription?: { start: string; end: string } | null
}

export function toDocumentItems(items: SalesDocumentItem[]) {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPriceHalalas / 100,
  }))
}

// A quote or invoice as the customer sees it -- on screen and printed (the same markup).
export const SalesDocument = forwardRef<HTMLDivElement, SalesDocumentProps>(
  function SalesDocument(props, ref) {
    const title = props.kind === "quote" ? "عرض سعر" : "فاتورة ضريبية"
    return (
      <div
        ref={ref}
        dir="rtl"
        className="mx-auto w-full max-w-[820px] rounded-2xl border border-slate-200 bg-white p-8 text-[#0b1738] shadow-sm print:border-0 print:shadow-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <Image src={ASSETS.logo} alt="مدار" width={778} height={325} className="h-12 w-auto" />
            <div className="mt-3 space-y-0.5 text-[12.5px] leading-6 text-slate-600">
              <p className="font-bold text-[#0b1738]">
                {props.seller.legalName || props.seller.name}
              </p>
              {props.seller.address ? <p>{props.seller.address}</p> : null}
              {props.seller.vatNumber ? <p>الرقم الضريبي: {props.seller.vatNumber}</p> : null}
              {props.seller.commercialRegistration ? (
                <p>السجل التجاري: {props.seller.commercialRegistration}</p>
              ) : null}
              {props.seller.email ? (
                <p dir="ltr" className="text-right">
                  {props.seller.email}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-start sm:text-end">
            <p className="text-[26px] font-black">{title}</p>
            <p className="mt-1 font-mono text-[15px] font-bold" dir="ltr">
              {props.number}
            </p>
            {props.statusLabel ? (
              <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                {props.statusLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-slate-500">
              {props.kind === "quote" ? "مقدم إلى" : "صادرة إلى"}
            </p>
            <p className="mt-1 text-[15px] font-bold">{props.customer.companyName}</p>
            <div className="mt-0.5 space-y-0.5 text-[12.5px] text-slate-600">
              {props.customer.contactName ? <p>{props.customer.contactName}</p> : null}
              {props.customer.phone ? (
                <p dir="ltr" className="text-right">
                  {props.customer.phone}
                </p>
              ) : null}
              {props.customer.email ? (
                <p dir="ltr" className="text-right">
                  {props.customer.email}
                </p>
              ) : null}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px] sm:text-end">
            <div>
              <dt className="text-xs font-bold text-slate-500">تاريخ الإصدار</dt>
              <dd className="mt-1 font-semibold">{date(props.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500">
                {props.kind === "quote" ? "صالح حتى" : "تاريخ الاستحقاق"}
              </dt>
              <dd className="mt-1 font-semibold">{date(props.dateLabel)}</dd>
            </div>
            {props.subscription ? (
              <>
                <div>
                  <dt className="text-xs font-bold text-slate-500">بداية الاشتراك</dt>
                  <dd className="mt-1 font-semibold">{date(props.subscription.start)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">نهاية الاشتراك</dt>
                  <dd className="mt-1 font-semibold">{date(props.subscription.end)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        <table className="mt-6 w-full text-[13px]">
          <thead>
            <tr className="border-b-2 border-slate-200 text-xs text-slate-500">
              <th className="py-2.5 text-start font-bold">البند</th>
              <th className="w-16 py-2.5 text-center font-bold">الكمية</th>
              <th className="w-28 py-2.5 text-end font-bold">سعر الوحدة</th>
              <th className="w-28 py-2.5 text-end font-bold">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-3 font-semibold">{item.description}</td>
                <td className="py-3 text-center">{item.quantity}</td>
                <td className="py-3 text-end">{money(item.unitPrice)}</td>
                <td className="py-3 text-end font-semibold">
                  {money(item.unitPrice * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-[300px] space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-slate-500">المجموع الفرعي</dt>
              <dd className="font-semibold">{money(props.totals.subtotal)} ر.س</dd>
            </div>
            {props.totals.discount > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <dt>الخصم</dt>
                <dd className="font-semibold">− {money(props.totals.discount)} ر.س</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-slate-500">ضريبة القيمة المضافة (15٪)</dt>
              <dd className="font-semibold">{money(props.totals.vat)} ر.س</dd>
            </div>
            <div className="flex justify-between border-t-2 border-slate-200 pt-2.5 text-[16px] font-black">
              <dt>الإجمالي</dt>
              <dd>{money(props.totals.total)} ر.س</dd>
            </div>
          </dl>
        </div>

        {props.notes ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-[12.5px] leading-6 whitespace-pre-wrap text-slate-600">
            {props.notes}
          </div>
        ) : null}
        {props.terms?.trim() ? (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-bold text-slate-500">الشروط والأحكام</p>
            <p className="mt-2 text-[12px] leading-6 whitespace-pre-wrap text-slate-600">
              {props.terms}
            </p>
          </div>
        ) : null}
        {props.footer ? <div className="mt-6">{props.footer}</div> : null}
      </div>
    )
  }
)

// Opens the document alone in a new window, with the page's own styles, and prints it.
export function printSalesDocument(element: HTMLElement | null, title: string) {
  if (!element) return false
  const popup = window.open("", "_blank", "width=900,height=1000")
  if (!popup) return false
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("")
  popup.document.write(
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>${styles}` +
      `<style>body{background:#fff;padding:24px}@page{margin:12mm}</style></head>` +
      `<body>${element.outerHTML}</body></html>`
  )
  popup.document.close()
  popup.addEventListener("load", () => {
    popup.focus()
    popup.print()
  })
  return true
}

// "الشروط والأحكام" beside a quote or invoice: the default ones from the settings, or this
// document's own -- changed (or reset) here without touching any other document.
export function DocumentTermsCard({
  terms,
  defaultTerms,
  onSave,
}: {
  // This document's own terms, or null when it uses the default.
  terms: string | null
  defaultTerms: string
  onSave: (terms: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const effective = terms ?? defaultTerms

  async function save(next: string | null) {
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      // onSave already showed the error; keep the dialog open.
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">الشروط والأحكام</h2>
        <button
          type="button"
          onClick={() => {
            setDraft(effective)
            setEditing(true)
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Pencil className="size-3.5" />
          تعديل
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {terms !== null ? "مخصصة لهذا المستند فقط." : "الشروط الافتراضية من إعدادات المنصة."}
      </p>
      {effective.trim() ? (
        <p className="mt-3 line-clamp-6 text-sm leading-6 whitespace-pre-wrap text-foreground">
          {effective}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          لا توجد شروط. أضفها من الإعدادات أو هنا.
        </p>
      )}
      <AppDialog
        open={editing}
        onOpenChange={setEditing}
        title={<span dir="rtl">الشروط والأحكام لهذا المستند</span>}
        contentClassName="[direction:rtl] max-w-[36rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              className="h-11 flex-1 rounded-[10px]"
              loading={saving}
              onClick={() => void save(draft)}
            >
              حفظ
            </AppButton>
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px]"
              onClick={() => setEditing(false)}
            >
              إلغاء
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="flex flex-col gap-3">
          <AppTextarea
            rows={10}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-[10px] text-sm leading-6"
          />
          <p className="text-xs text-muted-foreground">
            التعديل هنا يخص هذا المستند فقط، ولا يغيّر الشروط الافتراضية.
          </p>
          {terms !== null ? (
            <button
              type="button"
              onClick={() => void save(null)}
              className="w-fit text-sm font-semibold text-primary hover:underline"
            >
              استخدام الشروط الافتراضية
            </button>
          ) : null}
        </div>
      </AppDialog>
    </AppCard>
  )
}
