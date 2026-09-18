"use client"

// The actual printable Simplified Tax Invoice (فاتورة ضريبية مبسطة) -- an 80mm-width receipt
// rendered from a real completed pos_invoices row, Arabic RTL, ZATCA Phase 1 (Generation Phase)
// layout: seller identity, invoice number/date, line items, VAT breakdown, payment breakdown, and
// the real ZATCA TLV QR (see backend zatca-qr-code.ts) -- never a placeholder or mock screen.

import { useEffect, useState } from "react"
import QRCode from "qrcode"

import type { Invoice } from "@/features/pos/services/pos-invoices.service"

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

interface ThermalInvoiceReceiptProps {
  invoice: Invoice
  // Localized display name per payment method code (e.g. { cash: "نقداً" }) -- the invoice itself
  // only stores the code, and this component has no service call of its own to resolve one.
  paymentMethodNames: Record<string, string>
  // Pre-rendered QR image (a data: URI), when the caller already generated one -- e.g.
  // CashierPage awaits this before opening the browser's print dialog, so the print target never
  // fires window.print() with a still-loading QR. Falls back to generating it locally when
  // omitted (invoice.qrCode is a TLV payload string, not an image, either way).
  qrDataUrl?: string | null
  // The organization's CURRENT logo (Settings -> شعار المنشأة), read live rather than snapshotted
  // on the invoice -- unlike seller name/VAT/address, a logo is branding, not a fiscal fact ZATCA
  // requires to stay frozen at issuance time; a reprint of an old invoice is expected to show
  // today's logo, exactly like any other POS/receipt system.
  sellerLogoUrl?: string | null
}

export function ThermalInvoiceReceipt({
  invoice,
  paymentMethodNames,
  qrDataUrl: providedQrDataUrl,
  sellerLogoUrl,
}: ThermalInvoiceReceiptProps) {
  const [generatedQrDataUrl, setGeneratedQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (providedQrDataUrl !== undefined) return
    if (!invoice.qrCode) return
    let cancelled = false
    QRCode.toDataURL(invoice.qrCode, { margin: 0, width: 180 })
      .then((url) => {
        if (!cancelled) setGeneratedQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setGeneratedQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [invoice.qrCode, providedQrDataUrl])

  const qrDataUrl = providedQrDataUrl !== undefined ? providedQrDataUrl : generatedQrDataUrl

  return (
    <div
      dir="rtl"
      className="w-full max-w-full bg-white px-4 py-4 text-[12px] leading-[1.5] text-[#0d1b3e]"
    >
      <div className="text-center">
        {sellerLogoUrl && (
          // A remote org-branding asset -- next/image adds nothing on a print-only, one-shot render.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerLogoUrl}
            alt=""
            className="mx-auto mb-2 h-12 max-w-[60%] object-contain"
          />
        )}
        <div className="text-[15px] font-bold">{invoice.sellerName || "المنشأة"}</div>
        <div className="mt-2 text-[13px] font-bold">فاتورة ضريبية مبسطة</div>
        {/* Its own standalone line, not one more row in the label/value list below -- distinct
            enough to find at a glance, right under the seller's own identity. */}
        <div className="mt-2 text-[12px] font-bold">رقم الفاتورة: {invoice.invoiceNumber}</div>
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {invoice.sellerAddress && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">عنوان المتجر</span>
          <span>{invoice.sellerAddress}</span>
        </div>
      )}
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">وقت الفاتورة</span>
        <span>{DATE_TIME_FORMAT.format(new Date(invoice.createdAt))}</span>
      </div>
      {invoice.sellerVatNumber && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">الرقم الضريبي</span>
          <span>{invoice.sellerVatNumber}</span>
        </div>
      )}
      {invoice.customerName && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">العميل</span>
          <span>{invoice.customerName}</span>
        </div>
      )}

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {/* A CSS grid, not an HTML <table> -- five columns (two of them multi-word) is tight on an
          80mm receipt, and an actual <table>'s vertical-align: top on each <td> proved unreliable
          once the name column wrapped to two lines (print rendering engines have long-standing
          quirks aligning table-cell content that a browser tab preview doesn't reproduce). A grid
          row's own items-start guarantees every column starts flush at the row's own top edge
          regardless of how much any one cell wraps, with no such quirk to work around. */}
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
      {invoice.items.map((item, index) => (
        <div
          key={index}
          className="grid items-start gap-x-1 py-1 text-[9px]"
          style={{ gridTemplateColumns: "30% 12% 18% 19% 21%" }}
        >
          {/* truncate keeps this to a single line regardless of name length -- a wider name
              column (see gridTemplateColumns above) means truncation rarely kicks in for a
              typical name, but a genuinely long one still gets an ellipsis instead of wrapping
              and pushing the row's other columns out of vertical alignment again. */}
          <span className="truncate px-1 text-start" title={item.productName}>
            {item.productName}
          </span>
          <span className="px-1 text-center">{item.quantity}</span>
          {/* This line's own net (tax-exclusive) unit price -- item.netAmount already accounts
              for gross/net product pricing and every discount, so dividing by quantity gives the
              real effective per-unit price, not the raw as-charged unitPrice (which stays gross
              when the product's price includes tax). */}
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

      {/* Always shown, unconditionally -- a real tax invoice is legally required to show its VAT
          breakdown, so this is never something a merchant can toggle off. */}
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">اجمالي الاصناف</span>
        <span>{invoice.items.length}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">المبلغ الخاضع للضريبة</span>
        <span>{AMOUNT_FORMAT.format(invoice.subtotalAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">الخصم</span>
        <span>{AMOUNT_FORMAT.format(invoice.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">المبلغ الخاضع للضريبة بعد الخصم</span>
        <span>{AMOUNT_FORMAT.format(invoice.subtotalAmount - invoice.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">ضريبة القيمة المضافة</span>
        <span>{AMOUNT_FORMAT.format(invoice.taxAmount)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[14px] font-bold">
        <span>المجموع</span>
        <span>{AMOUNT_FORMAT.format(invoice.totalAmount)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {invoice.payments.map((payment, index) => (
        <div key={index} className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">
            {paymentMethodNames[payment.paymentMethodCode] ?? payment.paymentMethodCode}
          </span>
          <span>{formatAmount(payment.amount)}</span>
        </div>
      ))}

      <div className="my-3 flex flex-col items-center">
        {qrDataUrl ? (
          // A locally-generated data: URI, not a remote image -- next/image cannot optimize one.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="رمز الاستجابة السريع" className="h-[130px] w-[130px]" />
        ) : (
          // A QR is generated for every sale regardless of the seller's tax profile (see
          // invoices-service.ts's create()), so reaching this branch means the QR image itself
          // failed to render -- a technical hiccup, not a missing VAT number.
          <div className="max-w-[220px] rounded-md border border-[#f0c36d] bg-[#fff8e8] px-2 py-2 text-center text-[10px] text-[#8a6116]">
            تعذر إنشاء رمز الاستجابة السريع لهذه الفاتورة.
          </div>
        )}
      </div>

      {/* The cashier's own note on this order (added via the cart's "ملاحظة" button) -- printed
          only when one was actually typed, same as every other optional field on this receipt. */}
      {invoice.notes && (
        <div className="mt-1 text-center text-[10px] leading-[1.5] text-[#5b6b85]">
          {invoice.notes}
        </div>
      )}
    </div>
  )
}
