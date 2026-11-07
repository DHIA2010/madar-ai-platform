import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { jsPDF } from "jspdf"
import QRCode from "qrcode"

// A POS sale as a PDF that reproduces the printed 80 mm receipt (ThermalInvoiceReceipt.tsx) block
// for block: receipt title/description, logo, seller, "فاتورة ضريبية مبسطة", invoice and order
// number, the bordered info box, the five-column items table, the totals, the payments, the ZATCA
// QR and the cashier's note -- same labels, same order. Drawn with jsPDF (no browser -- light
// enough for the backend task) in IBM Plex Sans Arabic, one of the few open Arabic fonts carrying
// the presentation-form letters jsPDF shapes Arabic into (others drop letters).

export interface InvoicePdfNoteLine {
  text: string
  bold?: boolean
  align?: string
  fontSize?: number
  color?: string
}

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
  // Who the sale is credited to, when one was picked in the cashier.
  salesPersonName?: string | null
  items: Array<{
    productName: string
    quantity: number
    // The line's net (tax-exclusive, after discounts) amount and its VAT, as on the receipt.
    netAmount: number
    taxAmount: number
  }>
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{ label: string; amount: number }>
  // The ZATCA TLV payload (base64) -- drawn as the QR.
  qrCode: string | null
  notes: string | null
  notesLines?: InvoicePdfNoteLine[] | null
  // The store's logo (PNG or JPEG bytes), and the receipt title/description from the POS settings.
  logo?: { bytes: Buffer; format: "PNG" | "JPEG" } | null
  receiptTitleLines?: InvoicePdfNoteLine[] | null
  receiptDescriptionLines?: InvoicePdfNoteLine[] | null
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

// The receipt is 80 mm wide with px-4 padding; its CSS px sizes become points at 0.75.
const PAGE_WIDTH = 80
const PAD = 4
const RIGHT = PAGE_WIDTH - PAD
const LEFT = PAD
const CONTENT = PAGE_WIDTH - PAD * 2
const pt = (px: number) => px * 0.75
const lineHeight = (sizePt: number) => sizePt * 0.3528 * 1.5
const INK: [number, number, number] = [13, 27, 62]
const MUTED: [number, number, number] = [91, 107, 133]
const BORDER: [number, number, number] = [199, 210, 224]
const HEADER_FILL: [number, number, number] = [247, 249, 252]
// Items table columns, right to left: name, quantity, price, VAT, total (as on the receipt).
const COLUMNS = [0.27, 0.15, 0.18, 0.19, 0.21]

const amount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// "2026/11/7، 3:51 ص" in Saudi time, as the receipt shows it.
function formatDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso))
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""
  const period = part("dayPeriod").toUpperCase() === "PM" ? "م" : "ص"
  return `${part("year")}/${part("month")}/${part("day")}، ${part("hour")}:${part("minute")} ${period}`
}

function hexColor(value: string | undefined): [number, number, number] {
  const hex = (value ?? "").replace("#", "")
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return INK
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ]
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

// Lays the receipt out top to bottom; with draw = false it only measures. Returns the final y.
function layout(doc: jsPDF, input: InvoicePdfInput, qr: QRCode.QRCode | null, draw: boolean) {
  let y = PAD

  const font = (sizePt: number, bold = false) => {
    doc.setFont("Plex", bold ? "bold" : "normal")
    doc.setFontSize(sizePt)
  }
  const width = (value: string) => doc.getTextWidth(value)
  // Splits text into lines no wider than maxWidth (by words; one long word stays whole).
  const wrap = (value: string, maxWidth: number): string[] => {
    const lines: string[] = []
    let current = ""
    for (const word of value.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word
      if (current && width(candidate) > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    return lines.length > 0 ? lines : [""]
  }
  // Text whose top sits at `top` (jsPDF places text by its baseline).
  const put = (
    value: string,
    x: number,
    top: number,
    sizePt: number,
    align: "right" | "left" | "center",
    color: [number, number, number] = INK
  ) => {
    if (!draw) return
    doc.setTextColor(...color)
    doc.text(value, x, top + sizePt * 0.3528 * 1.05, { align })
  }
  const dashed = (margin: number) => {
    y += margin
    if (draw) {
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.2)
      doc.setLineDashPattern([0.9, 0.9], 0)
      doc.line(LEFT, y, RIGHT, y)
      doc.setLineDashPattern([], 0)
    }
    y += margin
  }
  const noteLines = (lines: InvoicePdfNoteLine[], defaultPx: number, defaultBold: boolean) => {
    for (const line of lines) {
      if (!line.text.trim()) {
        y += lineHeight(pt(defaultPx))
        continue
      }
      const sizePt = pt(line.fontSize ?? defaultPx)
      font(sizePt, line.bold ?? defaultBold)
      const align = line.align === "left" ? "left" : line.align === "right" ? "right" : "center"
      const x = align === "left" ? LEFT : align === "right" ? RIGHT : PAGE_WIDTH / 2
      for (const piece of wrap(line.text, CONTENT)) {
        put(piece, x, y, sizePt, align, line.color ? hexColor(line.color) : INK)
        y += lineHeight(sizePt)
      }
    }
  }
  // "label: value" centered on one line, drawn as three pieces (label, colon, value) -- jsPDF's
  // Arabic shaping moves a trailing colon to the wrong side and reorders a Latin value
  // (INV-000070), so each sits where a browser would put it: label right, then ":", then value.
  const centeredPair = (label: string, value: string, sizePt: number) => {
    font(sizePt, true)
    const gap = 1
    const colon = ":"
    const total = width(label) + width(colon) + gap + width(value)
    const right = PAGE_WIDTH / 2 + total / 2
    put(label, right, y, sizePt, "right")
    put(colon, right - width(label), y, sizePt, "right")
    put(value, right - width(label) - width(colon) - gap, y, sizePt, "right")
    y += lineHeight(sizePt)
  }

  // Receipt title and description (POS settings), when set.
  const hasTitle = Boolean(input.receiptTitleLines?.some((line) => line.text.trim()))
  const hasDescription = Boolean(input.receiptDescriptionLines?.some((line) => line.text.trim()))
  if (hasTitle || hasDescription) {
    if (hasTitle) noteLines(input.receiptTitleLines!, 14, true)
    if (hasDescription) noteLines(input.receiptDescriptionLines!, 10, false)
    dashed(2)
    y += 1
  }

  if (input.logo) {
    const props = doc.getImageProperties(input.logo.bytes)
    const height = 12
    const logoWidth = Math.min((props.width / props.height) * height, CONTENT * 0.6)
    const logoHeight = (logoWidth / props.width) * props.height
    if (draw) {
      doc.addImage(
        input.logo.bytes,
        input.logo.format,
        (PAGE_WIDTH - logoWidth) / 2,
        y,
        logoWidth,
        logoHeight,
        "logo",
        "FAST"
      )
    }
    y += logoHeight + 2
  }

  font(pt(15), true)
  for (const line of wrap(input.sellerName || "المنشأة", CONTENT)) {
    put(line, PAGE_WIDTH / 2, y, pt(15), "center")
    y += lineHeight(pt(15))
  }
  y += 1.5
  font(pt(13), true)
  put("فاتورة ضريبية مبسطة", PAGE_WIDTH / 2, y, pt(13), "center")
  y += lineHeight(pt(13)) + 1.5
  centeredPair("رقم الفاتورة", input.invoiceNumber, pt(12))

  if (input.orderNumber !== null) {
    y += 1.5
    font(pt(12), true)
    const label = `رقم الطلب: ${input.orderNumber}`
    const boxWidth = width(label) + 6
    const boxHeight = lineHeight(pt(12)) + 2
    if (draw) {
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.25)
      doc.roundedRect((PAGE_WIDTH - boxWidth) / 2, y, boxWidth, boxHeight, 1.2, 1.2, "S")
    }
    put(label, PAGE_WIDTH / 2, y + 1, pt(12), "center")
    y += boxHeight
  }

  dashed(2.5)

  // The bordered info box: label on the right, value on the left, a line under each row.
  const infoRows: Array<[string, string]> = []
  if (input.sellerAddress) infoRows.push(["عنوان المتجر", input.sellerAddress])
  infoRows.push(["وقت الفاتورة", formatDateTime(input.createdAt)])
  if (input.sellerVatNumber) infoRows.push(["الرقم الضريبي", input.sellerVatNumber])
  if (input.customerName) infoRows.push(["اسم العميل", input.customerName])
  if (input.customerPhone) infoRows.push(["جوال العميل", input.customerPhone])
  if (input.customerVatNumber) infoRows.push(["الرقم الضريبي للعميل", input.customerVatNumber])
  if (input.salesPersonName) infoRows.push(["البائع", input.salesPersonName])
  const infoSize = pt(11)
  const infoRow = lineHeight(infoSize) + 2
  const infoTop = y
  infoRows.forEach(([label, value], index) => {
    const top = infoTop + index * infoRow
    font(infoSize)
    put(label, RIGHT - 2, top + 1, infoSize, "right", MUTED)
    put(value, LEFT + 2, top + 1, infoSize, "left")
    if (draw && index < infoRows.length - 1) {
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.2)
      doc.line(LEFT, top + infoRow, RIGHT, top + infoRow)
    }
  })
  if (draw) {
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.25)
    doc.roundedRect(LEFT, infoTop, CONTENT, infoRows.length * infoRow, 1.2, 1.2, "S")
  }
  y = infoTop + infoRows.length * infoRow

  dashed(2.5)

  // The items table: a header row, then one row per line, every cell boxed.
  const cellSize = pt(9)
  const cellLine = lineHeight(cellSize)
  const columnEdges: number[] = [RIGHT]
  for (const share of COLUMNS)
    columnEdges.push(columnEdges[columnEdges.length - 1] - share * CONTENT)
  const cellInner = (index: number) => columnEdges[index] - columnEdges[index + 1] - 2
  const tableTop = y
  const rowBoundaries: number[] = []

  const drawRow = (
    cells: string[],
    options: { bold: boolean; color: [number, number, number]; fill?: boolean }
  ) => {
    font(cellSize, options.bold)
    const wrapped = cells.map((cell, index) => wrap(cell, cellInner(index)))
    const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * cellLine + 2
    if (draw && options.fill) {
      doc.setFillColor(...HEADER_FILL)
      doc.rect(LEFT, y, CONTENT, rowHeight, "F")
    }
    wrapped.forEach((lines, index) => {
      // Name: right; quantity, price, VAT: centered; total: left (the cell's end in RTL).
      const align = index === 0 ? "right" : index === COLUMNS.length - 1 ? "left" : "center"
      const x =
        align === "right"
          ? columnEdges[index] - 1
          : align === "left"
            ? columnEdges[index + 1] + 1
            : (columnEdges[index] + columnEdges[index + 1]) / 2
      lines.forEach((line, lineIndex) => {
        font(cellSize, options.bold)
        put(line, x, y + 1 + lineIndex * cellLine, cellSize, align, options.color)
      })
    })
    y += rowHeight
    rowBoundaries.push(y)
  }

  drawRow(["الاسم", "الكمية", "السعر", "ضريبة القيمة المضافة", "المجموع (شامل الضريبة)"], {
    bold: true,
    color: MUTED,
    fill: true,
  })
  for (const item of input.items) {
    drawRow(
      [
        item.productName,
        String(item.quantity),
        amount(item.quantity > 0 ? item.netAmount / item.quantity : 0),
        amount(item.taxAmount),
        amount(item.netAmount + item.taxAmount),
      ],
      { bold: false, color: INK }
    )
  }
  if (draw) {
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    for (const boundary of rowBoundaries.slice(0, -1)) doc.line(LEFT, boundary, RIGHT, boundary)
    for (const edge of columnEdges.slice(1, -1)) doc.line(edge, tableTop, edge, y)
    doc.setLineWidth(0.25)
    doc.roundedRect(LEFT, tableTop, CONTENT, y - tableTop, 1.2, 1.2, "S")
  }

  dashed(2.5)

  // Totals -- always shown (a tax invoice must show its VAT breakdown).
  const totalsSize = pt(11)
  const totalRow = (label: string, value: string, sizePt = totalsSize, bold = false) => {
    font(sizePt, bold)
    put(label, RIGHT, y, sizePt, "right", bold ? INK : MUTED)
    put(value, LEFT, y, sizePt, "left")
    y += lineHeight(sizePt)
  }
  totalRow("اجمالي الاصناف", String(input.items.length))
  totalRow("المبلغ الخاضع للضريبة", amount(input.subtotalAmount))
  totalRow("الخصم", amount(input.discountAmount))
  totalRow("المبلغ الخاضع للضريبة بعد الخصم", amount(input.subtotalAmount - input.discountAmount))
  totalRow("ضريبة القيمة المضافة", amount(input.taxAmount))
  y += 1
  totalRow("المجموع", amount(input.totalAmount), pt(14), true)

  dashed(2.5)

  for (const payment of input.payments) {
    totalRow(payment.label, `${amount(payment.amount)} ر.س`)
  }

  if (qr) {
    y += 3
    const size = 34
    const cell = size / qr.modules.size
    const left = (PAGE_WIDTH - size) / 2
    if (draw) {
      doc.setFillColor(0, 0, 0)
      for (let r = 0; r < qr.modules.size; r++) {
        for (let c = 0; c < qr.modules.size; c++) {
          if (qr.modules.get(r, c)) doc.rect(left + c * cell, y + r * cell, cell, cell, "F")
        }
      }
    }
    y += size + 3
  }

  // The cashier's note on the order, when one was typed.
  if (input.notesLines?.some((line) => line.text.trim())) {
    noteLines(input.notesLines, 10, false)
  } else if (input.notes?.trim()) {
    noteLines(
      input.notes.split("\n").map((text) => ({ text, color: "#5b6b85" })),
      10,
      false
    )
  }
  return y + PAD
}

export function renderInvoicePdf(input: InvoicePdfInput): Buffer {
  const qr = input.qrCode ? QRCode.create(input.qrCode, { errorCorrectionLevel: "M" }) : null
  const height = layout(newDocument(1000), input, qr, false)
  const doc = newDocument(Math.max(height, 60))
  layout(doc, input, qr, true)
  return Buffer.from(doc.output("arraybuffer"))
}
