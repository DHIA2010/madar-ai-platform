"use client"

import { Fragment, useEffect, useState } from "react"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"

import {
  computeTotals,
  itemPositions,
  retentionAmount,
  round2,
  type TaxBreakdownEntry,
} from "../domain/totals"
import type {
  DiscountType,
  DocumentLine,
  Party,
  QuotationDetail,
  SalesInvoiceDetail,
  Seller,
} from "../types/invoicing.types"

// The printed document is Arabic first with English beside it, whatever language the app is in:
// a Saudi tax invoice must be in Arabic, and most businesses send it to English readers too.
type Label = readonly [ar: string, en: string]

const L = {
  quotation: ["عرض سعر", "Quotation"],
  taxInvoice: ["فاتورة ضريبية", "Tax Invoice"],
  simplified: ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice"],
  creditNote: ["إشعار دائن", "Credit Note"],
  debitNote: ["إشعار مدين", "Debit Note"],
  advance: ["دفعة مقدمة", "Advance Payment"],
  claim: ["مستخلص رقم", "Progress Claim No."],
  draft: ["مسودة", "Draft"],
  number: ["الرقم", "No."],
  revision: ["المراجعة", "Revision"],
  issueDate: ["تاريخ الإصدار", "Issue Date"],
  validUntil: ["صالح حتى", "Valid Until"],
  supplyDate: ["تاريخ التوريد", "Supply Date"],
  supplyPeriod: ["فترة التوريد", "Supply Period"],
  dueDate: ["تاريخ الاستحقاق", "Due Date"],
  reference: ["المرجع / أمر الشراء", "Reference / PO"],
  quotationNo: ["رقم عرض السعر", "Quotation No."],
  originalInvoice: ["الفاتورة الأصلية", "Original Invoice"],
  reason: ["سبب الإشعار", "Reason"],
  paymentMeans: ["طريقة الدفع", "Payment Method"],
  seller: ["البائع", "Seller"],
  buyer: ["العميل", "Customer"],
  vat: ["الرقم الضريبي", "VAT No."],
  cr: ["السجل التجاري", "CR No."],
  address: ["العنوان", "Address"],
  contact: ["جهة الاتصال", "Contact"],
  phone: ["الهاتف", "Phone"],
  email: ["البريد", "Email"],
  subject: ["الموضوع", "Subject"],
  item: ["البيان", "Description"],
  unit: ["الوحدة", "Unit"],
  qty: ["الكمية", "Qty"],
  price: ["سعر الوحدة", "Unit Price"],
  discount: ["الخصم", "Disc."],
  taxable: ["الخاضع للضريبة", "Taxable"],
  vatRate: ["الضريبة", "VAT"],
  vatAmount: ["مبلغ الضريبة", "VAT Amount"],
  lineTotal: ["الإجمالي", "Total"],
  previous: ["السابق", "Prev."],
  current: ["الحالي", "To date"],
  subtotal: ["الإجمالي قبل الخصم", "Subtotal"],
  docDiscount: ["الخصم", "Discount"],
  taxableTotal: ["الإجمالي الخاضع للضريبة", "Total Taxable Amount"],
  vatTotal: ["ضريبة القيمة المضافة", "VAT"],
  zeroRated: ["خاضع لنسبة الصفر", "Zero-rated"],
  exempt: ["معفى", "Exempt"],
  outOfScope: ["خارج النطاق", "Out of scope"],
  total: ["الإجمالي شامل الضريبة", "Total incl. VAT"],
  prepaid: ["يخصم: الدفعة المقدمة", "Less: Advance Payment"],
  retention: ["يخصم: ضمان حسن التنفيذ", "Less: Retention"],
  amountDue: ["الصافي المستحق", "Amount Due"],
  paid: ["المدفوع", "Paid"],
  balance: ["المتبقي", "Balance"],
  advanceDue: ["الدفعة المقدمة المطلوبة", "Advance Payment Required"],
  paymentTerms: ["شروط الدفع", "Payment Terms"],
  terms: ["الشروط والأحكام", "Terms & Conditions"],
  notes: ["ملاحظات", "Notes"],
  sellerSignature: ["اعتماد البائع", "Authorized Signature"],
  buyerSignature: ["موافقة العميل", "Customer Acceptance"],
  signatureName: ["الاسم", "Name"],
  signatureDate: ["التاريخ", "Date"],
  signature: ["التوقيع والختم", "Signature & Stamp"],
  qrCleared: ["فاتورة معتمدة من هيئة الزكاة والضريبة والجمارك", "Cleared by ZATCA"],
  qrReported: ["فاتورة مُبلَّغة لهيئة الزكاة والضريبة والجمارك", "Reported to ZATCA"],
  qrNoteCleared: ["إشعار معتمد من هيئة الزكاة والضريبة والجمارك", "Cleared by ZATCA"],
  qrNoteReported: ["إشعار مُبلَّغ لهيئة الزكاة والضريبة والجمارك", "Reported to ZATCA"],
  sar: ["ر.س", "SAR"],
} satisfies Record<string, Label>

const PAYMENT_MEANS: Record<string, Label> = {
  "10": ["نقداً", "Cash"],
  "30": ["تحويل بنكي", "Bank transfer"],
  "42": ["إيداع في الحساب البنكي", "Bank deposit"],
  "48": ["بطاقة", "Card"],
  "1": ["غير محدد", "Not specified"],
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value || 0
  )
const quantity = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value || 0)
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "—")

interface Meta {
  label: Label
  value: string
}

export interface PaperData {
  title: Label
  badge: string | null
  draft: boolean
  number: string | null
  seller: Seller
  customer: Party
  subject: string | null
  // Why a credit or debit note was raised.
  reason: string | null
  meta: Meta[]
  lines: DocumentLine[]
  showProgress: boolean
  discount: { type: DiscountType; value: number }
  prepaidAmount: number
  retentionPercent: number
  paidAmount: number
  showBalance: boolean
  advancePercent: number
  paymentTerms: string | null
  terms: string | null
  notes: string | null
  qr: string | null
  qrCaption: Label | null
  signatures: boolean
}

// ZATCA's phase 1 QR (seller, VAT number, time, total, VAT) for a document issued without a
// connected device, so the printout still carries a readable tax QR.
function basicTaxQr(seller: Seller, issuedAt: string, total: number, tax: number): string | null {
  if (!seller.vatNumber) return null
  const encoder = new TextEncoder()
  const bytes: number[] = []
  const fields = [seller.name, seller.vatNumber, issuedAt, total.toFixed(2), tax.toFixed(2)]
  fields.forEach((value, index) => {
    const encoded = encoder.encode(value)
    bytes.push(index + 1, encoded.length, ...encoded)
  })
  return btoa(String.fromCharCode(...bytes))
}

export function quotationPaper(quotation: QuotationDetail): PaperData {
  return {
    title: L.quotation,
    badge: null,
    draft: quotation.status === "draft",
    number: quotation.number,
    seller: quotation.seller,
    customer: quotation.customer,
    subject: quotation.title,
    reason: null,
    meta: [
      { label: L.number, value: quotation.number },
      ...(quotation.revision > 1 ? [{ label: L.revision, value: String(quotation.revision) }] : []),
      { label: L.issueDate, value: day(quotation.issueDate) },
      ...(quotation.validUntil ? [{ label: L.validUntil, value: day(quotation.validUntil) }] : []),
      ...(quotation.reference ? [{ label: L.reference, value: quotation.reference }] : []),
    ],
    lines: quotation.lines,
    showProgress: false,
    discount: { type: quotation.discountType, value: quotation.discountValue },
    prepaidAmount: 0,
    retentionPercent: quotation.retentionPercent,
    paidAmount: 0,
    showBalance: false,
    advancePercent: quotation.advancePercent,
    paymentTerms: quotation.paymentTerms,
    terms: quotation.terms,
    notes: quotation.notes,
    qr: null,
    qrCaption: null,
    signatures: true,
  }
}

export function invoicePaper(invoice: SalesInvoiceDetail): PaperData {
  const title =
    invoice.documentType === "credit_note"
      ? L.creditNote
      : invoice.documentType === "debit_note"
        ? L.debitNote
        : invoice.taxType === "standard"
          ? L.taxInvoice
          : L.simplified
  const badge =
    invoice.documentType !== "invoice"
      ? null
      : invoice.invoiceKind === "advance"
        ? `${L.advance[0]} · ${L.advance[1]}`
        : invoice.invoiceKind === "progress"
          ? `${L.claim[0]} ${invoice.claimNumber ?? 1} · ${L.claim[1]} ${invoice.claimNumber ?? 1}`
          : null
  const issued = invoice.status !== "draft"
  const means = PAYMENT_MEANS[invoice.paymentMeans]
  const qr = !issued
    ? null
    : (invoice.zatca.qrCode ??
      basicTaxQr(
        invoice.seller,
        invoice.issuedAt ?? `${invoice.issueDate}T00:00:00Z`,
        invoice.totalAmount,
        invoice.taxAmount
      ))
  return {
    title,
    badge,
    draft: !issued,
    number: invoice.number,
    seller: invoice.seller,
    customer: invoice.customer,
    subject: invoice.title,
    reason: invoice.adjustmentReason,
    meta: [
      { label: L.number, value: invoice.number ?? "—" },
      { label: L.issueDate, value: day(invoice.issueDate) },
      ...(invoice.supplyDate
        ? [
            invoice.supplyEndDate && invoice.supplyEndDate !== invoice.supplyDate
              ? {
                  label: L.supplyPeriod,
                  value: `${day(invoice.supplyDate)} → ${day(invoice.supplyEndDate)}`,
                }
              : { label: L.supplyDate, value: day(invoice.supplyDate) },
          ]
        : []),
      ...(invoice.dueDate ? [{ label: L.dueDate, value: day(invoice.dueDate) }] : []),
      ...(invoice.reference ? [{ label: L.reference, value: invoice.reference }] : []),
      ...(invoice.quotationNumber
        ? [{ label: L.quotationNo, value: invoice.quotationNumber }]
        : []),
      ...(invoice.originalInvoiceNumber
        ? [{ label: L.originalInvoice, value: invoice.originalInvoiceNumber }]
        : []),
      ...(invoice.documentType === "invoice" && means
        ? [{ label: L.paymentMeans, value: `${means[0]} · ${means[1]}` }]
        : []),
    ],
    lines: invoice.lines,
    showProgress: invoice.invoiceKind === "progress",
    discount: { type: invoice.discountType, value: invoice.discountValue },
    prepaidAmount: invoice.prepaidAmount,
    retentionPercent: invoice.retentionPercent,
    paidAmount: invoice.paidAmount,
    showBalance: issued && invoice.documentType === "invoice" && invoice.paidAmount > 0,
    advancePercent: 0,
    paymentTerms: invoice.paymentTerms,
    terms: invoice.terms,
    notes: invoice.notes,
    qr,
    qrCaption:
      invoice.zatca.status === "cleared"
        ? invoice.documentType === "invoice"
          ? L.qrCleared
          : L.qrNoteCleared
        : invoice.zatca.status === "reported"
          ? invoice.documentType === "invoice"
            ? L.qrReported
            : L.qrNoteReported
          : null,
    signatures: invoice.sector === "contracting" && invoice.documentType === "invoice",
  }
}

function Bi({ label, className }: { label: Label; className?: string }) {
  return (
    <span className={className}>
      {label[0]}
      <span className="mr-1.5 text-[0.82em] font-normal text-[#7a8699]" dir="ltr">
        {label[1]}
      </span>
    </span>
  )
}

function addressLines(address: Party["address"]): string {
  return [
    [address.buildingNumber, address.street].filter(Boolean).join(" "),
    address.district,
    [address.city, address.postalCode].filter(Boolean).join(" "),
    address.secondaryNumber ? `الرقم الفرعي ${address.secondaryNumber}` : null,
    address.countryCode && address.countryCode !== "SA" ? address.countryCode : null,
  ]
    .filter(Boolean)
    .join("، ")
}

function PartyBox({
  title,
  name,
  rows,
}: {
  title: Label
  name: string
  rows: Array<{ label: Label; value: string | null }>
}) {
  return (
    <div className="rounded-[10px] border border-[#dfe4ec] p-3">
      <p className="text-[9.5px] font-bold tracking-wide text-[#4f46e5]">
        <Bi label={title} />
      </p>
      <p className="mt-1 text-[13px] leading-5 font-extrabold text-[#0b1738]">{name || "—"}</p>
      <dl className="mt-1.5 space-y-0.5 text-[10.5px] leading-[1.55] text-[#28344a]">
        {rows
          .filter((row) => row.value)
          .map((row) => (
            <div key={row.label[1]} className="flex gap-1.5">
              <dt className="shrink-0 text-[#7a8699]">{row.label[0]}:</dt>
              <dd className="min-w-0 break-words" dir="auto">
                {row.value}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

function QrImage({ value }: { value: string }) {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { margin: 0, width: 260, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSource(url)
      })
      .catch(() => {
        if (!cancelled) setSource(null)
      })
    return () => {
      cancelled = true
    }
  }, [value])
  if (!source) return <div className="size-[104px] rounded-md bg-[#f1f3f7]" />
  // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not an asset
  return <img src={source} alt="ZATCA QR" className="size-[104px]" />
}

const CATEGORY_LABEL: Record<string, Label> = {
  Z: L.zeroRated,
  E: L.exempt,
  O: L.outOfScope,
}

function vatLabel(entry: TaxBreakdownEntry): string {
  if (entry.taxCategory === "S") return `${L.vatTotal[0]} ${entry.taxRate}% · ${L.vatTotal[1]}`
  const label = CATEGORY_LABEL[entry.taxCategory]
  return `${label[0]} · ${label[1]}`
}

// The A4 document as the customer receives it -- used on screen as the preview and for printing.
export function DocumentPaper({ data, className }: { data: PaperData; className?: string }) {
  const totals = computeTotals(data.lines, data.discount)
  const retention = retentionAmount(totals.taxableAmount, data.retentionPercent)
  const amountDue = round2(totals.totalAmount - data.prepaidAmount - retention)
  const hasDiscountColumn = data.lines.some(
    (line) => line.lineType === "item" && line.discountPercent > 0
  )
  const columns = 7 + (hasDiscountColumn ? 1 : 0) + (data.showProgress ? 2 : 0)
  const { seller, customer } = data
  const positions = itemPositions(data.lines)

  return (
    <article
      dir="rtl"
      lang="ar"
      className={cn(
        "invoicing-paper relative mx-auto w-full max-w-[210mm] bg-white px-[11mm] py-[11mm] text-[11px] leading-[1.6] text-[#0b1738]",
        className
      )}
    >
      {data.draft ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-[28deg] text-[110px] font-black tracking-widest text-[#0b1738]/[0.045] select-none">
            {L.draft[0]}
          </span>
        </div>
      ) : null}

      <header className="relative flex items-start justify-between gap-6 border-b-2 border-[#0b1738] pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {seller.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the merchant's own logo URL
            <img
              src={seller.logoUrl}
              alt=""
              className="size-[58px] shrink-0 rounded-[10px] object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[17px] leading-6 font-extrabold">{seller.name}</p>
            <p className="mt-0.5 text-[10.5px] text-[#4a586f]">
              {[
                seller.vatNumber ? `${L.vat[0]}: ${seller.vatNumber}` : null,
                seller.commercialRegistration
                  ? `${L.cr[0]}: ${seller.commercialRegistration}`
                  : null,
              ]
                .filter(Boolean)
                .join("  |  ")}
            </p>
            <p className="text-[10.5px] text-[#4a586f]">{addressLines(seller.address)}</p>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[20px] leading-7 font-black text-[#0b1738]">{data.title[0]}</p>
          <p className="text-[11px] font-semibold tracking-wide text-[#4f46e5]" dir="ltr">
            {data.title[1].toUpperCase()}
          </p>
          {data.badge ? (
            <p className="mt-1.5 inline-block rounded-full bg-[#eef0ff] px-2.5 py-0.5 text-[10px] font-bold text-[#4f46e5]">
              {data.badge}
            </p>
          ) : null}
        </div>
      </header>

      <section className="relative mt-4 grid grid-cols-[1fr_1fr_auto] gap-3">
        <PartyBox
          title={L.seller}
          name={seller.name}
          rows={[
            { label: L.vat, value: seller.vatNumber },
            { label: L.cr, value: seller.commercialRegistration },
            { label: L.address, value: addressLines(seller.address) || null },
            { label: L.phone, value: seller.phone },
            { label: L.email, value: seller.email },
          ]}
        />
        <PartyBox
          title={L.buyer}
          name={customer.name}
          rows={[
            { label: L.vat, value: customer.vatNumber },
            {
              label:
                customer.idScheme === "CRN" || !customer.idScheme ? L.cr : ["رقم الهوية", "ID"],
              value: customer.idValue,
            },
            { label: L.address, value: addressLines(customer.address) || null },
            { label: L.contact, value: customer.contactName },
            { label: L.phone, value: customer.phone },
            { label: L.email, value: customer.email },
          ]}
        />
        <dl className="max-w-[200px] min-w-[150px] space-y-1 rounded-[10px] bg-[#f6f7fb] p-3 text-[10.5px]">
          {data.meta.map((row) => (
            <div key={row.label[1]}>
              <dt className="text-[9.5px] text-[#7a8699]">
                <Bi label={row.label} />
              </dt>
              <dd className="font-bold break-words text-[#0b1738]" dir="auto">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {data.subject ? (
        <p className="relative mt-3 rounded-[8px] border border-dashed border-[#d5dbe6] px-3 py-1.5 text-[11.5px]">
          <span className="text-[#7a8699]">{L.subject[0]}: </span>
          <span className="font-bold">{data.subject}</span>
        </p>
      ) : null}

      {data.reason ? (
        <p className="relative mt-2 rounded-[8px] border border-dashed border-[#d5dbe6] px-3 py-1.5 text-[11.5px]">
          <Bi label={L.reason} className="text-[#7a8699]" />
          <span className="text-[#7a8699]">: </span>
          <span className="font-bold" dir="auto">
            {data.reason}
          </span>
        </p>
      ) : null}

      <table className="relative mt-4 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-[#0b1738] text-white">
            {(
              [
                { label: ["#", ""] as Label, className: "w-[26px] text-center" },
                { label: L.item, className: "text-right" },
                { label: L.unit, className: "w-[52px] text-center" },
                ...(data.showProgress
                  ? [
                      { label: L.previous, className: "w-[44px] text-center" },
                      { label: L.current, className: "w-[44px] text-center" },
                    ]
                  : []),
                { label: L.qty, className: "w-[54px] text-center" },
                { label: L.price, className: "w-[70px] text-center" },
                ...(hasDiscountColumn
                  ? [{ label: L.discount, className: "w-[42px] text-center" }]
                  : []),
                { label: L.taxable, className: "w-[76px] text-center" },
                { label: L.vatRate, className: "w-[64px] text-center" },
                { label: L.lineTotal, className: "w-[80px] text-center" },
              ] as Array<{ label: Label; className: string }>
            ).map((column, index) => (
              <th
                key={index}
                className={cn(
                  "px-1.5 py-1.5 text-[9.5px] leading-[1.35] font-bold first:rounded-s-[6px] last:rounded-e-[6px]",
                  column.className
                )}
              >
                {column.label[0]}
                {column.label[1] ? (
                  <span className="block text-[8px] font-normal opacity-75" dir="ltr">
                    {column.label[1]}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, index) => {
            if (line.lineType === "section") {
              return (
                <tr key={index} className="break-inside-avoid">
                  <td
                    colSpan={columns + 1}
                    className="border-b border-[#dfe4ec] bg-[#f1f3fb] px-2 py-1.5 text-[11px] font-extrabold text-[#28306b]"
                  >
                    {line.description}
                  </td>
                </tr>
              )
            }
            if (line.lineType === "note") {
              return (
                <tr key={index} className="break-inside-avoid">
                  <td />
                  <td
                    colSpan={columns}
                    className="border-b border-[#eef1f6] px-1.5 py-1 text-[10px] whitespace-pre-line text-[#5b6b85] italic"
                  >
                    {line.description}
                  </td>
                </tr>
              )
            }
            const position = positions[index]
            const computed = totals.lines[index]
            const rate =
              line.taxCategory === "S" ? `${line.taxRate}%` : CATEGORY_LABEL[line.taxCategory][0]
            return (
              <tr key={index} className="break-inside-avoid border-b border-[#eef1f6] align-top">
                <td className="px-1.5 py-1.5 text-center text-[#7a8699]">{position}</td>
                <td className="px-1.5 py-1.5">
                  <p className="font-bold">{line.description}</p>
                  {line.details ? (
                    <p className="mt-0.5 text-[9.5px] leading-[1.55] whitespace-pre-line text-[#5b6b85]">
                      {line.details}
                    </p>
                  ) : null}
                  {line.taxCategory !== "S" && line.exemptionReason ? (
                    <p className="mt-0.5 text-[9px] text-[#7a8699]">{line.exemptionReason}</p>
                  ) : null}
                </td>
                <td className="px-1.5 py-1.5 text-center">{line.unit ?? "—"}</td>
                {data.showProgress ? (
                  <Fragment>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">
                      {line.progressPrevious === null ? "—" : `${quantity(line.progressPrevious)}%`}
                    </td>
                    <td className="px-1.5 py-1.5 text-center font-bold tabular-nums">
                      {line.progressCurrent === null ? "—" : `${quantity(line.progressCurrent)}%`}
                    </td>
                  </Fragment>
                ) : null}
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {quantity(line.quantity)}
                </td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">{money(line.unitPrice)}</td>
                {hasDiscountColumn ? (
                  <td className="px-1.5 py-1.5 text-center tabular-nums">
                    {line.discountPercent > 0 ? `${quantity(line.discountPercent)}%` : "—"}
                  </td>
                ) : null}
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {money(computed.netAmount)}
                </td>
                <td className="px-1.5 py-1.5 text-center tabular-nums">
                  {money(computed.taxAmount)}
                  <span className="block text-[8.5px] text-[#7a8699]">{rate}</span>
                </td>
                <td className="px-1.5 py-1.5 text-center font-bold tabular-nums">
                  {money(computed.netAmount + computed.taxAmount)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <section className="relative mt-4 flex break-inside-avoid items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-3">
          {data.qr ? (
            <div className="flex items-center gap-3">
              <QrImage value={data.qr} />
              {data.qrCaption ? (
                <p className="max-w-[170px] text-[9.5px] leading-[1.6] text-[#4a586f]">
                  {data.qrCaption[0]}
                  <span className="block text-right text-[#7a8699]" dir="ltr">
                    {data.qrCaption[1]}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {data.paymentTerms ? (
            <div>
              <p className="text-[10px] font-bold text-[#4f46e5]">
                <Bi label={L.paymentTerms} />
              </p>
              <p className="text-[10.5px] whitespace-pre-line text-[#28344a]">
                {data.paymentTerms}
              </p>
            </div>
          ) : null}
        </div>

        <dl className="w-[300px] shrink-0 text-[11px]">
          {(
            [
              {
                label: `${L.subtotal[0]} · ${L.subtotal[1]}`,
                value: totals.subtotal,
                show: totals.discountAmount > 0,
              },
              {
                label: `${L.docDiscount[0]} · ${L.docDiscount[1]}`,
                value: -totals.discountAmount,
                show: totals.discountAmount > 0,
              },
              {
                label: `${L.taxableTotal[0]} · ${L.taxableTotal[1]}`,
                value: totals.taxableAmount,
                show: true,
              },
              ...totals.breakdown.map((entry) => ({
                label: vatLabel(entry),
                value: entry.taxAmount,
                show: true,
              })),
            ] as Array<{ label: string; value: number; show: boolean }>
          )
            .filter((row) => row.show)
            .map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 border-b border-[#eef1f6] py-1.5"
              >
                <dt className="text-[#4a586f]">{row.label}</dt>
                <dd className="font-bold tabular-nums">{money(row.value)}</dd>
              </div>
            ))}
          <div className="mt-1 flex items-center justify-between gap-3 rounded-[8px] bg-[#0b1738] px-3 py-2 text-white">
            <dt className="text-[11.5px] font-bold">
              {L.total[0]}
              <span className="mr-1.5 text-[9px] font-normal opacity-75" dir="ltr">
                {L.total[1]}
              </span>
            </dt>
            <dd className="text-[13.5px] font-black tabular-nums">
              {money(totals.totalAmount)}{" "}
              <span className="text-[9.5px] font-normal">{L.sar[0]}</span>
            </dd>
          </div>
          {data.prepaidAmount > 0 ? (
            <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] py-1.5">
              <dt className="text-[#4a586f]">{`${L.prepaid[0]} · ${L.prepaid[1]}`}</dt>
              <dd className="font-bold tabular-nums">{money(-data.prepaidAmount)}</dd>
            </div>
          ) : null}
          {retention > 0 && !data.advancePercent && data.title !== L.quotation ? (
            <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] py-1.5">
              <dt className="text-[#4a586f]">{`${L.retention[0]} ${quantity(data.retentionPercent)}% · ${L.retention[1]}`}</dt>
              <dd className="font-bold tabular-nums">{money(-retention)}</dd>
            </div>
          ) : null}
          {data.title !== L.quotation && (data.prepaidAmount > 0 || retention > 0) ? (
            <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
              <dt className="font-extrabold">{`${L.amountDue[0]} · ${L.amountDue[1]}`}</dt>
              <dd className="font-black tabular-nums">{money(amountDue)}</dd>
            </div>
          ) : null}
          {data.showBalance ? (
            <Fragment>
              <div className="flex items-center justify-between gap-3 border-t border-[#eef1f6] py-1.5">
                <dt className="text-[#4a586f]">{`${L.paid[0]} · ${L.paid[1]}`}</dt>
                <dd className="font-bold tabular-nums">{money(data.paidAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
                <dt className="font-extrabold">{`${L.balance[0]} · ${L.balance[1]}`}</dt>
                <dd className="font-black tabular-nums">
                  {money(Math.max(amountDue - data.paidAmount, 0))}
                </dd>
              </div>
            </Fragment>
          ) : null}
          {data.title === L.quotation && data.advancePercent > 0 ? (
            <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] py-1.5">
              <dt className="text-[#4a586f]">{`${L.advanceDue[0]} ${quantity(data.advancePercent)}%`}</dt>
              <dd className="font-bold tabular-nums">
                {money(round2((totals.totalAmount * data.advancePercent) / 100))}
              </dd>
            </div>
          ) : null}
          {data.title === L.quotation && data.retentionPercent > 0 ? (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-[#4a586f]">{`${L.retention[0].replace("يخصم: ", "")} ${quantity(data.retentionPercent)}%`}</dt>
              <dd className="font-bold tabular-nums">{money(retention)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {data.terms || data.notes ? (
        <section className="relative mt-5 grid gap-3 border-t border-[#dfe4ec] pt-3 text-[10.5px]">
          {data.terms ? (
            <div className="break-inside-avoid">
              <p className="text-[10px] font-bold text-[#4f46e5]">
                <Bi label={L.terms} />
              </p>
              <p className="mt-0.5 leading-[1.75] whitespace-pre-line text-[#28344a]">
                {data.terms}
              </p>
            </div>
          ) : null}
          {data.notes ? (
            <div className="break-inside-avoid">
              <p className="text-[10px] font-bold text-[#4f46e5]">
                <Bi label={L.notes} />
              </p>
              <p className="mt-0.5 leading-[1.75] whitespace-pre-line text-[#28344a]">
                {data.notes}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {data.signatures ? (
        <section className="relative mt-7 grid break-inside-avoid grid-cols-2 gap-8 text-[10.5px]">
          {[L.sellerSignature, L.buyerSignature].map((title) => (
            <div key={title[1]} className="rounded-[10px] border border-[#dfe4ec] p-3">
              <p className="font-bold">
                <Bi label={title} />
              </p>
              {[L.signatureName, L.signatureDate, L.signature].map((row) => (
                <p key={row[1]} className="mt-4 flex items-end gap-2 text-[#7a8699]">
                  <span className="shrink-0">{row[0]}</span>
                  <span className="flex-1 border-b border-dotted border-[#b6c0d0]" />
                </p>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      <footer className="relative mt-6 border-t border-[#eef1f6] pt-2 text-center text-[9.5px] text-[#7a8699]">
        {[seller.name, seller.phone, seller.email, seller.website].filter(Boolean).join("  •  ")}
      </footer>
    </article>
  )
}
