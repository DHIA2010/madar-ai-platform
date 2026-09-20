"use client"

// The actual printable credit note (إشعار دائن) for a real return event -- see
// PosInvoicesService.createReturn(). Same 80mm ZATCA-style layout and items-table format as
// ThermalInvoiceReceipt.tsx (kept as two separate components rather than one branching on a
// "mode" prop -- an invoice and a credit note have real, different header fields: a credit note
// names the ORIGINAL sale it corrects). The refund's own real payment lines print the same way an
// invoice's own do -- a refund can be split across more than one method, not just settled as
// account credit.

import { useEffect, useState } from "react"
import QRCode from "qrcode"

import type { InvoiceReturn } from "@/features/pos/services/pos-invoices.service"

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

interface CreditNoteReceiptProps {
  creditNote: InvoiceReturn
  // Falls back to generating it locally when omitted (creditNote.qrCode is a TLV payload string,
  // not an image, either way) -- same contract as ThermalInvoiceReceipt's own qrDataUrl prop.
  qrDataUrl?: string | null
  sellerLogoUrl?: string | null
  // Localized display name per payment method code -- creditNote.payments only ever carries the
  // code, same contract as ThermalInvoiceReceipt's own paymentMethodNames prop. Optional since a
  // caller that never resolved any names still gets a legible fallback (the raw code itself).
  paymentMethodNames?: Record<string, string>
}

export function CreditNoteReceipt({
  creditNote,
  qrDataUrl: providedQrDataUrl,
  sellerLogoUrl,
  paymentMethodNames = {},
}: CreditNoteReceiptProps) {
  const [generatedQrDataUrl, setGeneratedQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (providedQrDataUrl !== undefined) return
    if (!creditNote.qrCode) return
    let cancelled = false
    QRCode.toDataURL(creditNote.qrCode, { margin: 0, width: 180 })
      .then((url) => {
        if (!cancelled) setGeneratedQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setGeneratedQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [creditNote.qrCode, providedQrDataUrl])

  const qrDataUrl = providedQrDataUrl !== undefined ? providedQrDataUrl : generatedQrDataUrl

  return (
    <div
      dir="rtl"
      className="w-full max-w-full bg-white px-4 py-4 text-[12px] leading-[1.5] text-[#0d1b3e]"
    >
      <div className="text-center">
        {sellerLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerLogoUrl}
            alt=""
            className="mx-auto mb-2 h-12 max-w-[60%] object-contain"
          />
        )}
        {/* Document title first, seller name below it -- the inverse hierarchy of the invoice
            receipt (there the seller's own name is the largest text), matching how a credit note
            is a correction document first and foremost, issued BY that seller. */}
        <div className="text-[16px] font-extrabold">إشعار دائن</div>
        <div className="mt-1 text-[13px] font-bold">{creditNote.sellerName || "المنشأة"}</div>
        <div className="mt-2 text-[12px] font-bold">رقم الإشعار: {creditNote.returnNumber}</div>
        {/* The one field that makes this a CORRECTION rather than a standalone document -- always
            traceable back to exactly which sale it returns against. */}
        <div className="text-[12px] font-bold">رقم فاتورة البيع: {creditNote.invoiceNumber}</div>
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {creditNote.sellerAddress && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">عنوان المتجر</span>
          <span>{creditNote.sellerAddress}</span>
        </div>
      )}
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">وقت الفاتورة</span>
        <span>{DATE_TIME_FORMAT.format(new Date(creditNote.createdAt))}</span>
      </div>
      {creditNote.sellerVatNumber && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">الرقم الضريبي</span>
          <span>{creditNote.sellerVatNumber}</span>
        </div>
      )}

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {/* Same grid-based (not <table>) layout as ThermalInvoiceReceipt.tsx, for the same reason:
          an actual <table>'s vertical-align: top proved unreliable once a name wrapped, across
          real print rendering engines. */}
      <div
        className="grid gap-x-1 pb-1.5 text-[9px] text-[#5b6b85]"
        style={{ gridTemplateColumns: "30% 12% 18% 19% 21%" }}
      >
        <span className="px-1 text-start font-bold leading-[1.35]">الاسم</span>
        <span className="px-1 text-center font-bold leading-[1.35]">الكمية</span>
        <span className="px-1 text-center font-bold leading-[1.35]">السعر</span>
        <span className="px-1 text-center font-bold leading-[1.35]">ضريبة القيمة المضافة</span>
        <span className="px-1 text-end font-bold leading-[1.35]">المجموع (شامل الضريبة)</span>
      </div>
      {creditNote.items.map((item, index) => (
        <div
          key={index}
          className="grid items-start gap-x-1 py-1 text-[9px]"
          style={{ gridTemplateColumns: "30% 12% 18% 19% 21%" }}
        >
          {/* Wraps onto as many lines as the full name needs rather than an ellipsis -- the
              row's own items-start keeps the other columns flush with the row's top regardless
              of how many lines this takes. text-right (not text-start) so a wrapped line stays
              pinned to the right edge, not centered. */}
          <span className="px-1 text-right break-words">{item.productName}</span>
          <span className="px-1 text-center">{item.quantity}</span>
          <span className="px-1 text-center">
            {AMOUNT_FORMAT.format(item.quantity > 0 ? item.netAmount / item.quantity : 0)}
          </span>
          <span className="px-1 text-center">{AMOUNT_FORMAT.format(item.taxAmount)}</span>
          <span className="px-1 text-end">
            {AMOUNT_FORMAT.format(item.netAmount + item.taxAmount)}
          </span>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">اجمالي الاصناف</span>
        <span>{creditNote.items.length}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">المبلغ الخاضع للضريبة</span>
        <span>{AMOUNT_FORMAT.format(creditNote.subtotalAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">الخصم</span>
        <span>{AMOUNT_FORMAT.format(creditNote.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">المبلغ الخاضع للضريبة بعد الخصم</span>
        <span>{AMOUNT_FORMAT.format(creditNote.subtotalAmount - creditNote.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">ضريبة القيمة المضافة</span>
        <span>{AMOUNT_FORMAT.format(creditNote.taxAmount)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[14px] font-bold">
        <span>المجموع</span>
        <span>{AMOUNT_FORMAT.format(creditNote.totalAmount)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      <p className="text-[12px] font-bold">المدفوع</p>
      {creditNote.payments.map((payment, index) => (
        <div key={index} className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">
            {paymentMethodNames[payment.paymentMethodCode] ?? payment.paymentMethodCode}
          </span>
          <span>{AMOUNT_FORMAT.format(payment.amount)}</span>
        </div>
      ))}

      <div className="my-3 flex flex-col items-center">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="رمز الاستجابة السريع" className="h-[130px] w-[130px]" />
        ) : (
          <div className="max-w-[220px] rounded-md border border-[#f0c36d] bg-[#fff8e8] px-2 py-2 text-center text-[10px] text-[#8a6116]">
            تعذر إنشاء رمز الاستجابة السريع لهذا الإشعار.
          </div>
        )}
      </div>

      {creditNote.notes && (
        <div className="mt-1 text-center text-[10px] leading-[1.5] text-[#5b6b85]">
          {creditNote.notes}
        </div>
      )}
    </div>
  )
}
