"use client"

// The actual printable Simplified Tax Invoice (فاتورة ضريبية مبسطة) -- an 80mm-width receipt
// rendered from a real completed pos_invoices row, Arabic RTL, ZATCA Phase 1 (Generation Phase)
// layout: seller identity, invoice number/date, line items, VAT breakdown, payment breakdown, and
// the real ZATCA TLV QR (see backend zatca-qr-code.ts) -- never a placeholder or mock screen.

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import QRCode from "qrcode"

import type { Locale } from "@/i18n/locales"
import type { Invoice } from "@/features/pos/services/pos-invoices.service"
import type { NoteLine } from "@/features/pos/services/pos-saved-notes.service"
import { NoteLines } from "@/features/pos/components/NoteLines"

// A line is "real" content once it has non-empty text -- a toggled-on title/description with no
// actual text typed (FormattedNoteEditor.tsx always keeps at least one blank line visible while
// editing) should print nothing at all, not an empty bordered-feeling gap.
function hasLineContent(lines: NoteLine[] | null | undefined): boolean {
  return Boolean(lines?.some((line) => line.text.trim().length > 0))
}

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatAmount(value: number, locale: Locale): string {
  return `${amountFormatter(locale).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

function dateTimeFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

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
  // Settings -> إعدادات الإيصال -> عنوان الإيصال -- the same per-line FORMATTED shape a saved sale
  // note uses (see NoteLines.tsx), read live at print time (never snapshotted on the invoice),
  // same reasoning as sellerLogoUrl above. Rendered only when non-empty, independent of each other
  // (a title with no description, or vice versa, is a valid combination).
  receiptTitleLines?: NoteLine[] | null
  receiptDescriptionLines?: NoteLine[] | null
}

export function ThermalInvoiceReceipt({
  invoice,
  paymentMethodNames,
  qrDataUrl: providedQrDataUrl,
  sellerLogoUrl,
  receiptTitleLines,
  receiptDescriptionLines,
}: ThermalInvoiceReceiptProps) {
  const t = useTranslations("pos.thermalInvoiceReceipt")
  const locale = useLocale() as Locale
  const AMOUNT_FORMAT = amountFormatter(locale)
  const DATE_TIME_FORMAT = dateTimeFormatter(locale)
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
      {(hasLineContent(receiptTitleLines) || hasLineContent(receiptDescriptionLines)) && (
        <div className="mb-3 text-center">
          {hasLineContent(receiptTitleLines) && (
            <NoteLines
              lines={receiptTitleLines ?? null}
              plainText={null}
              className="text-[14px] font-bold"
            />
          )}
          {hasLineContent(receiptDescriptionLines) && (
            <NoteLines
              lines={receiptDescriptionLines ?? null}
              plainText={null}
              className="mt-1 text-[10px] leading-[1.5] text-[#5b6b85]"
            />
          )}
          <div className="my-2 border-t border-dashed border-[#c7d2e0]" />
        </div>
      )}

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
        <div className="text-[15px] font-bold">{invoice.sellerName || t("sellerNameFallback")}</div>
        <div className="mt-2 text-[13px] font-bold">{t("simplifiedTaxInvoice")}</div>
        {/* Its own standalone line, not one more row in the label/value list below -- distinct
            enough to find at a glance, right under the seller's own identity. */}
        <div className="mt-2 text-[12px] font-bold">
          {t("invoiceNumber", { number: invoice.invoiceNumber })}
        </div>
        {invoice.orderNumber !== null && (
          // A bordered box, not just another text line -- same reasoning as the info/items
          // tables below: this is the one number a cashier calls out loud to a waiting customer,
          // so it reads as its own distinct, boxed element rather than blending into the rest of
          // the header text.
          <div className="mt-2 inline-block rounded-md border border-[#c7d2e0] px-3 py-1 text-[12px] font-bold">
            {t("orderNumber", { number: invoice.orderNumber })}
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {/* A bordered box of label/value rows -- same conditional fields and the same underlying
          flex layout as before, just with borders added so it reads as a table, matching how a
          merchant/customer info block typically presents on a printed receipt. */}
      <div className="overflow-hidden rounded-md border border-[#c7d2e0]">
        {invoice.sellerAddress && (
          <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
            <span className="text-[#5b6b85]">{t("storeAddress")}</span>
            <span>{invoice.sellerAddress}</span>
          </div>
        )}
        <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
          <span className="text-[#5b6b85]">{t("invoiceTime")}</span>
          <span>{DATE_TIME_FORMAT.format(new Date(invoice.createdAt))}</span>
        </div>
        {invoice.sellerVatNumber && (
          <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
            <span className="text-[#5b6b85]">{t("vatNumber")}</span>
            <span>{invoice.sellerVatNumber}</span>
          </div>
        )}
        {invoice.customerName && (
          <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
            <span className="text-[#5b6b85]">{t("customerName")}</span>
            <span>{invoice.customerName}</span>
          </div>
        )}
        {invoice.customerPhone && (
          <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
            <span className="text-[#5b6b85]">{t("customerPhone")}</span>
            <span>{invoice.customerPhone}</span>
          </div>
        )}
        {invoice.customerVatNumber && (
          <div className="flex justify-between border-b border-[#c7d2e0] px-2 py-1 text-[11px] last:border-b-0">
            <span className="text-[#5b6b85]">{t("customerVatNumber")}</span>
            <span>{invoice.customerVatNumber}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {/* A CSS grid, not an HTML <table> -- five columns (two of them multi-word) is tight on an
          80mm receipt, and an actual <table>'s vertical-align: top on each <td> proved unreliable
          once the name column wrapped to two lines (print rendering engines have long-standing
          quirks aligning table-cell content that a browser tab preview doesn't reproduce). Plain
          text never centers vertically in a block box on its own, so every column already starts
          flush at the row's own top edge with no extra alignment needed, regardless of how much
          any one cell wraps -- no such quirk to work around. Borders are added on the grid cells
          themselves (not by switching to <table>) to get the same boxed look without reintroducing
          that quirk -- border-e on every cell but the last gives the vertical dividers, border-b on
          every row but the last gives the horizontal ones; letting cells stretch to the row's full
          height (the grid default) is what keeps those border-e dividers reaching the row's real
          bottom instead of stopping partway down wherever a short cell's own single line ends. No
          gap-x here -- the 5 columns already sum to 100% of the row's width, and a gap on top of
          that pushes the row wider than its container; with this box's own overflow-hidden (added
          for the rounded corners), that excess silently clipped the last column instead of just
          looking a little cramped. Each cell's own px-1 padding is what gives the visual spacing
          instead. Column widths give "الكمية" (quantity) enough room for its own header label --
          at the old 12% it sat flush against both of its own dividers with no breathing room,
          which read as a missing border even though one was there; "الاسم" (name) gives up the
          difference since it already wraps onto extra lines for a long product name anyway. */}
      <div className="overflow-hidden rounded-md border border-[#c7d2e0]">
        <div
          className="grid border-b border-[#c7d2e0] bg-[#f7f9fc] text-[9px] text-[#5b6b85]"
          style={{ gridTemplateColumns: "27% 15% 18% 19% 21%" }}
        >
          <span className="border-e border-[#c7d2e0] px-1 py-1 text-start font-bold leading-[1.35]">
            {t("columns.name")}
          </span>
          <span className="border-e border-[#c7d2e0] px-1 py-1 text-center font-bold leading-[1.35]">
            {t("columns.quantity")}
          </span>
          <span className="border-e border-[#c7d2e0] px-1 py-1 text-center font-bold leading-[1.35]">
            {t("columns.price")}
          </span>
          <span className="border-e border-[#c7d2e0] px-1 py-1 text-center font-bold leading-[1.35]">
            {t("columns.vat")}
          </span>
          <span className="px-1 py-1 text-end font-bold leading-[1.35]">
            {t("columns.totalWithTax")}
          </span>
        </div>
        {invoice.items.map((item, index) => (
          <div
            key={index}
            className="grid border-b border-[#c7d2e0] text-[9px] last:border-b-0"
            style={{ gridTemplateColumns: "27% 15% 18% 19% 21%" }}
          >
            {/* Wraps onto as many lines as the full name needs rather than an ellipsis -- plain
                grid stretch (the default, no items-start) is what keeps the dividers between
                columns reaching the row's full height when the name wraps: items-start used to
                size each short cell to its own single line of text, leaving its border-e divider
                stopping short partway down the row instead of reaching the row's real bottom
                border. Letting cells stretch to the row's full height fixes that -- the text
                itself still sits flush at the top of its now-taller cell, since plain text never
                centers vertically in a block box on its own. text-right (not text-start) so a
                wrapped line stays pinned to the right edge, not centered. */}
            <span className="border-e border-[#c7d2e0] px-1 py-1 text-right break-words">
              {item.productName}
            </span>
            <span className="border-e border-[#c7d2e0] px-1 py-1 text-center">{item.quantity}</span>
            {/* This line's own net (tax-exclusive) unit price -- item.netAmount already accounts
                for gross/net product pricing and every discount, so dividing by quantity gives the
                real effective per-unit price, not the raw as-charged unitPrice (which stays gross
                when the product's price includes tax). */}
            <span className="border-e border-[#c7d2e0] px-1 py-1 text-center">
              {AMOUNT_FORMAT.format(item.quantity > 0 ? item.netAmount / item.quantity : 0)}
            </span>
            <span className="border-e border-[#c7d2e0] px-1 py-1 text-center">
              {AMOUNT_FORMAT.format(item.taxAmount)}
            </span>
            <span className="px-1 py-1 text-end">
              {AMOUNT_FORMAT.format(item.netAmount + item.taxAmount)}
            </span>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {/* Always shown, unconditionally -- a real tax invoice is legally required to show its VAT
          breakdown, so this is never something a merchant can toggle off. */}
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">{t("totalItems")}</span>
        <span>{invoice.items.length}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">{t("taxableAmount")}</span>
        <span>{AMOUNT_FORMAT.format(invoice.subtotalAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">{t("discount")}</span>
        <span>{AMOUNT_FORMAT.format(invoice.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">{t("taxableAfterDiscount")}</span>
        <span>{AMOUNT_FORMAT.format(invoice.subtotalAmount - invoice.discountAmount)}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#5b6b85]">{t("vat")}</span>
        <span>{AMOUNT_FORMAT.format(invoice.taxAmount)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[14px] font-bold">
        <span>{t("total")}</span>
        <span>{AMOUNT_FORMAT.format(invoice.totalAmount)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-[#c7d2e0]" />

      {invoice.payments.map((payment, index) => (
        <div key={index} className="flex justify-between text-[11px]">
          <span className="text-[#5b6b85]">
            {paymentMethodNames[payment.paymentMethodCode] ?? payment.paymentMethodCode}
          </span>
          <span>{formatAmount(payment.amount, locale)}</span>
        </div>
      ))}

      <div className="my-3 flex flex-col items-center">
        {qrDataUrl ? (
          // A locally-generated data: URI, not a remote image -- next/image cannot optimize one.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt={t("qrAlt")} className="h-[130px] w-[130px]" />
        ) : (
          // A QR is generated for every sale regardless of the seller's tax profile (see
          // invoices-service.ts's create()), so reaching this branch means the QR image itself
          // failed to render -- a technical hiccup, not a missing VAT number.
          <div className="max-w-[220px] rounded-md border border-[#f0c36d] bg-[#fff8e8] px-2 py-2 text-center text-[10px] text-[#8a6116]">
            {t("qrFailed")}
          </div>
        )}
      </div>

      {/* The cashier's own note on this order (added via the cart's "ملاحظة" button) -- printed
          only when one was actually typed, same as every other optional field on this receipt. */}
      <NoteLines
        lines={invoice.notesLines}
        plainText={invoice.notes}
        className="mt-1 text-[10px] leading-[1.5] text-[#5b6b85]"
      />
    </div>
  )
}
