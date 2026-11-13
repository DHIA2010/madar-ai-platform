// Turning a quotation into an invoice draft: everything not billed yet, a progress claim (each
// line's cumulative completion), chosen lines and quantities, or an advance payment invoice.
import type {
  AdvanceOption,
  DocumentLine,
  InvoiceInput,
  QuotationDetail,
  QuotationLine,
} from "../types/invoicing.types"
import { round2 } from "./totals"

export type ConversionMode = "remaining" | "progress" | "lines" | "advance"

const roundQuantity = (value: number) => Math.round(value * 10_000) / 10_000

function fromQuotationLine(line: QuotationLine, quantity: number): DocumentLine {
  return {
    lineType: line.lineType,
    productId: line.productId,
    quotationLineId: line.lineType === "item" ? line.id : null,
    description: line.description,
    details: line.details,
    unit: line.unit,
    quantity: line.lineType === "item" ? roundQuantity(quantity) : 0,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxCategory: line.taxCategory,
    taxRate: line.taxRate,
    exemptionCode: line.exemptionCode,
    exemptionReason: line.exemptionReason,
    progressPrevious: null,
    progressCurrent: null,
  }
}

// Keeps a section or note only when an item under it is billed.
function pruneStructure(lines: DocumentLine[]): DocumentLine[] {
  const result: DocumentLine[] = []
  let pending: DocumentLine[] = []
  for (const line of lines) {
    if (line.lineType === "section") {
      pending = [line]
    } else if (line.lineType === "note") {
      pending.push(line)
    } else {
      result.push(...pending, line)
      pending = []
    }
  }
  return result
}

export const remainingQuantity = (line: QuotationLine) =>
  Math.max(0, roundQuantity(line.quantity - line.billedQuantity))

// The quotation's document discount, carried over in proportion to what this invoice bills.
function carriedDiscount(quotation: QuotationDetail, billedNet: number) {
  if (quotation.discountType === "percent") {
    return { discountType: "percent" as const, discountValue: quotation.discountValue }
  }
  const share = quotation.subtotal > 0 ? billedNet / quotation.subtotal : 0
  return {
    discountType: "amount" as const,
    discountValue: round2(quotation.discountAmount * share),
  }
}

function baseInput(quotation: QuotationDetail): Omit<InvoiceInput, "lines" | "invoiceKind"> {
  return {
    sector: quotation.sector,
    taxType: "standard",
    quotationId: quotation.id,
    customerId: quotation.customerId,
    customer: quotation.customer,
    title: quotation.title,
    reference: quotation.reference,
    issueDate: new Date().toISOString().slice(0, 10),
    supplyDate: null,
    supplyEndDate: null,
    dueDate: null,
    paymentMeans: "30",
    paymentTerms: quotation.paymentTerms,
    terms: quotation.terms,
    notes: null,
    discountType: "amount",
    discountValue: 0,
    retentionPercent: quotation.retentionPercent,
    claimNumber: null,
    prepayments: [],
  }
}

const lineNet = (line: DocumentLine) =>
  line.lineType === "item"
    ? line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100)
    : 0

export function buildConversion(
  quotation: QuotationDetail,
  mode: ConversionMode,
  options: {
    // progress: each item line's cumulative completion (percent of the contract).
    cumulative?: Record<string, number>
    // lines: the quantity to bill per item line.
    quantities?: Record<string, number>
    // advance: the share of the contract (before VAT) paid in advance.
    advancePercent?: number
    advanceLabel?: string
  }
): InvoiceInput {
  const base = baseInput(quotation)
  if (mode === "advance") {
    const percent = options.advancePercent ?? quotation.advancePercent
    return {
      ...base,
      invoiceKind: "advance",
      retentionPercent: 0,
      lines: [
        {
          lineType: "item",
          productId: null,
          quotationLineId: null,
          description: options.advanceLabel ?? `Advance payment ${percent}%`,
          details: null,
          unit: null,
          quantity: 1,
          unitPrice: round2((quotation.taxableAmount * percent) / 100),
          discountPercent: 0,
          taxCategory: "S",
          taxRate: 15,
          exemptionCode: null,
          exemptionReason: null,
          progressPrevious: null,
          progressCurrent: null,
        },
      ],
    }
  }

  let lines: DocumentLine[]
  if (mode === "progress") {
    lines = quotation.lines.map((line) => {
      if (line.lineType !== "item") return fromQuotationLine(line, 0)
      const previous = line.billedPercent
      const current = Math.min(100, Math.max(previous, options.cumulative?.[line.id] ?? previous))
      return {
        ...fromQuotationLine(line, (line.quantity * (current - previous)) / 100),
        progressPrevious: previous,
        progressCurrent: current,
      }
    })
  } else if (mode === "lines") {
    lines = quotation.lines.map((line) =>
      fromQuotationLine(
        line,
        line.lineType === "item"
          ? Math.min(remainingQuantity(line), options.quantities?.[line.id] ?? 0)
          : 0
      )
    )
  } else {
    lines = quotation.lines.map((line) => fromQuotationLine(line, remainingQuantity(line)))
  }
  lines = pruneStructure(lines.filter((line) => line.lineType !== "item" || line.quantity > 0))
  const billedNet = lines.reduce((sum, line) => sum + lineNet(line), 0)
  return {
    ...base,
    ...carriedDiscount(quotation, billedNet),
    invoiceKind: mode === "progress" ? "progress" : "regular",
    lines,
  }
}

// Whether an invoice with these lines bills everything the quotation still had open.
export function closesQuotation(quotation: QuotationDetail, lines: DocumentLine[]): boolean {
  const billed = new Map<string, number>()
  for (const line of lines) {
    if (line.quotationLineId) {
      billed.set(line.quotationLineId, (billed.get(line.quotationLineId) ?? 0) + line.quantity)
    }
  }
  return quotation.lines.every(
    (line) =>
      line.lineType !== "item" || (billed.get(line.id) ?? 0) >= remainingQuantity(line) - 0.0001
  )
}

// An advance is recovered as the work is billed: each invoice takes back the share of the contract
// it bills, and the one that closes the quotation takes whatever is left. `ceiling` is the most
// (before VAT) this invoice can absorb.
export function suggestPrepayments(
  advances: AdvanceOption[],
  invoice: { billedNet: number; contractNet: number; closes: boolean; ceiling: number }
): InvoiceInput["prepayments"] {
  const share = invoice.contractNet > 0 ? Math.min(1, invoice.billedNet / invoice.contractNet) : 0
  let room = Math.max(0, invoice.ceiling)
  const result: InvoiceInput["prepayments"] = []
  for (const advance of advances) {
    const wanted = invoice.closes ? advance.remainingNet : advance.netAmount * share
    const netAmount = round2(Math.min(wanted, advance.remainingNet, room))
    if (netAmount <= 0) continue
    result.push({ advanceInvoiceId: advance.id, netAmount })
    room = round2(room - netAmount)
  }
  return result
}
