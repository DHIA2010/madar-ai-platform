import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { jsPDF } from "jspdf"
import QRCode from "qrcode"

// A POS sale as a PDF, laid out like the printed 80 mm receipt (ThermalInvoiceReceipt.tsx): the
// seller, "فاتورة ضريبية مبسطة", the lines, the totals and the ZATCA QR. Drawn with jsPDF -- light
// enough for the backend task (no browser) -- in IBM Plex Sans Arabic, one of the few open Arabic
// fonts that carries the presentation-form letters jsPDF shapes Arabic into (others drop letters).

export interface InvoicePdfInput {
  invoiceNumber: string
  orderNumber: number | null
  createdAt: string
  sellerName: string | null
  sellerVatNumber: string | null
  sellerAddress: string | null
  customerName: string | null
  customerPhone: string | null
  customerVatNumber: string | null
  items: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }>
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{ label: string; amount: number }>
  // The ZATCA TLV payload (base64) -- drawn as the QR.
  qrCode: string | null
  notes: string | null
}

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "fonts")
let fontCache: { regular: string; bold: string } | null = null
function fonts() {
  fontCache ??= {
    regular: readFileSync(join(FONT_DIR, "IBMPlexSansArabic-Regular.ttf")).toString("base64"),
    bold: readFileSync(join(FONT_DIR, "IBMPlexSansArabic-Bold.ttf")).toString("base64"),
  }
  return fontCache
}

const PAGE_WIDTH = 80
const MARGIN = 5
const RIGHT = PAGE_WIDTH - MARGIN
const LEFT = MARGIN
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const MUTED: [number, number, number] = [91, 107, 133]
const INK: [number, number, number] = [13, 27, 62]

const money = (value: number) => `${value.toFixed(2)} ر.س`

function formatDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso))
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`
}

function newDocument(height: number): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, height], orientation: "portrait" })
  const { regular, bold } = fonts()
  doc.addFileToVFS("IBMPlexSansArabic-Regular.ttf", regular)
  doc.addFont("IBMPlexSansArabic-Regular.ttf", "Plex", "normal")
  doc.addFileToVFS("IBMPlexSansArabic-Bold.ttf", bold)
  doc.addFont("IBMPlexSansArabic-Bold.ttf", "Plex", "bold")
  doc.setFont("Plex", "normal")
  doc.setTextColor(...INK)
  return doc
}

// Splits text into lines no wider than maxWidth (by words; a single long word stays whole).
function wrap(doc: jsPDF, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (current && doc.getTextWidth(candidate) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : [""]
}

// Lays the receipt out top to bottom; with draw = false it only measures. Returns the final y.
function layout(doc: jsPDF, input: InvoicePdfInput, qr: QRCode.QRCode | null, draw: boolean) {
  let y = 8
  const text = (
    value: string,
    x: number,
    options: { size: number; bold?: boolean; align: "right" | "left" | "center"; muted?: boolean }
  ) => {
    doc.setFont("Plex", options.bold ? "bold" : "normal")
    doc.setFontSize(options.size)
    if (!draw) return
    doc.setTextColor(...(options.muted ? MUTED : INK))
    doc.text(value, x, y, { align: options.align })
  }
  const centered = (value: string, size: number, bold = false) => {
    doc.setFont("Plex", bold ? "bold" : "normal")
    doc.setFontSize(size)
    for (const line of wrap(doc, value, CONTENT_WIDTH)) {
      text(line, PAGE_WIDTH / 2, { size, bold, align: "center" })
      y += size * 0.45
    }
  }
  // A label on the right, its value on the left.
  const row = (label: string, value: string, options: { size?: number; bold?: boolean } = {}) => {
    const size = options.size ?? 8.5
    text(label, RIGHT, { size, bold: options.bold, align: "right", muted: !options.bold })
    text(value, LEFT, { size, bold: options.bold, align: "left" })
    y += size * 0.5
  }
  const divider = () => {
    y += 1
    if (draw) {
      doc.setDrawColor(210, 218, 230)
      doc.setLineDashPattern([0.8, 0.8], 0)
      doc.line(LEFT, y, RIGHT, y)
      doc.setLineDashPattern([], 0)
    }
    y += 4
  }

  centered(input.sellerName || "فاتورة", 13, true)
  y += 1
  centered("فاتورة ضريبية مبسطة", 10.5, true)
  divider()

  // Label and value drawn apart: a line mixing Arabic and Latin (e.g. "INV-000068") comes out of
  // jsPDF's Arabic shaping in the wrong order.
  row("رقم الفاتورة", input.invoiceNumber)
  if (input.orderNumber !== null) row("رقم الطلب", String(input.orderNumber))
  if (input.sellerAddress) row("العنوان", input.sellerAddress)
  row("التاريخ", formatDateTime(input.createdAt))
  if (input.sellerVatNumber) row("الرقم الضريبي", input.sellerVatNumber)
  if (input.customerName) row("العميل", input.customerName)
  if (input.customerPhone) row("الجوال", input.customerPhone)
  if (input.customerVatNumber) row("الرقم الضريبي للعميل", input.customerVatNumber)
  divider()

  for (const item of input.items) {
    doc.setFont("Plex", "bold")
    doc.setFontSize(8.5)
    for (const line of wrap(doc, item.productName, CONTENT_WIDTH)) {
      text(line, RIGHT, { size: 8.5, bold: true, align: "right" })
      y += 3.8
    }
    text(`${item.quantity} × ${item.unitPrice.toFixed(2)}`, RIGHT, {
      size: 8,
      align: "right",
      muted: true,
    })
    text(money(item.lineTotal), LEFT, { size: 8.5, align: "left" })
    y += 5
  }
  divider()

  row("عدد الأصناف", String(input.items.length))
  row("الإجمالي قبل الخصم", money(input.subtotalAmount))
  if (input.discountAmount > 0) row("الخصم", `-${money(input.discountAmount)}`)
  row("الخاضع للضريبة", money(input.subtotalAmount - input.discountAmount))
  row("ضريبة القيمة المضافة", money(input.taxAmount))
  y += 1
  row("الإجمالي", money(input.totalAmount), { size: 11, bold: true })
  for (const payment of input.payments) row(payment.label, money(payment.amount))

  if (qr) {
    divider()
    const size = 34
    const cell = size / qr.modules.size
    const left = (PAGE_WIDTH - size) / 2
    if (draw) {
      doc.setFillColor(0, 0, 0)
      for (let r = 0; r < qr.modules.size; r++) {
        for (let c = 0; c < qr.modules.size; c++) {
          if (qr.modules.get(r, c)) {
            doc.rect(left + c * cell, y + r * cell, cell, cell, "F")
          }
        }
      }
    }
    y += size + 5
  }

  if (input.notes) {
    divider()
    for (const line of input.notes.split("\n")) centered(line, 8)
  }
  y += 2
  centered("شكراً لتسوقكم", 9, true)
  centered("أُصدرت عبر مدار", 7)
  return y + 4
}

export function renderInvoicePdf(input: InvoicePdfInput): Buffer {
  const qr = input.qrCode ? QRCode.create(input.qrCode, { errorCorrectionLevel: "M" }) : null
  const height = layout(newDocument(1000), input, qr, false)
  const doc = newDocument(Math.max(height, 60))
  layout(doc, input, qr, true)
  return Buffer.from(doc.output("arraybuffer"))
}
