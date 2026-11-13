// The arithmetic every quotation and invoice shares -- line amounts, the document discount spread
// across VAT categories, VAT per category, advance deductions and retention. The frontend's
// features/invoicing/domain/totals.ts mirrors it for the live preview; the server's numbers are
// the ones saved and sent to ZATCA (zatca-ubl-standard.ts recomputes the same totals from them).
import {
  type ZatcaDocumentAllowance,
  type ZatcaDocumentLine,
  type ZatcaTaxCategory,
  zatcaTaxSubtotals,
} from "../zatca/zatca-ubl-standard"

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export type LineType = "item" | "section" | "note"
export type DiscountType = "amount" | "percent"

export interface LineInput {
  lineType: LineType
  quantity: number
  unitPrice: number
  discountPercent: number
  taxCategory: ZatcaTaxCategory
  taxRate: number
  exemptionCode: string | null
  exemptionReason: string | null
}

export interface ComputedLine {
  netAmount: number
  taxAmount: number
  // The rate that applies: the standard rate for S, zero otherwise.
  effectiveRate: number
}

export interface ComputedDocument {
  lines: ComputedLine[]
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  allowances: ZatcaDocumentAllowance[]
  taxBreakdown: Array<{
    taxCategory: ZatcaTaxCategory
    taxRate: number
    exemptionCode: string | null
    taxableAmount: number
    taxAmount: number
  }>
}

export function computeLine(line: LineInput): ComputedLine {
  if (line.lineType !== "item") return { netAmount: 0, taxAmount: 0, effectiveRate: 0 }
  const effectiveRate = line.taxCategory === "S" ? line.taxRate : 0
  const gross = line.quantity * line.unitPrice
  const netAmount = round2(gross - (gross * line.discountPercent) / 100)
  return { netAmount, taxAmount: round2((netAmount * effectiveRate) / 100), effectiveRate }
}

const categoryKey = (line: LineInput) =>
  `${line.taxCategory}|${line.taxCategory === "S" ? line.taxRate : 0}|${line.exemptionCode ?? ""}`

export function computeDocument(
  lines: LineInput[],
  discount: { type: DiscountType; value: number }
): ComputedDocument {
  const computed = lines.map(computeLine)
  const subtotal = round2(computed.reduce((sum, line) => sum + line.netAmount, 0))
  const requested = discount.type === "percent" ? (subtotal * discount.value) / 100 : discount.value
  const discountAmount = round2(Math.min(Math.max(requested, 0), subtotal))

  // The document discount, spread over the VAT categories in proportion to their amounts (the
  // last category takes the rounding remainder so the parts add up exactly).
  const categories = new Map<string, { line: LineInput; net: number }>()
  lines.forEach((line, index) => {
    if (line.lineType !== "item") return
    const key = categoryKey(line)
    const entry = categories.get(key) ?? { line, net: 0 }
    entry.net += computed[index].netAmount
    categories.set(key, entry)
  })
  const allowances: ZatcaDocumentAllowance[] = []
  if (discountAmount > 0 && subtotal > 0) {
    let remaining = discountAmount
    const entries = [...categories.values()].filter((entry) => entry.net > 0)
    entries.forEach((entry, index) => {
      const share =
        index === entries.length - 1 ? remaining : round2((discountAmount * entry.net) / subtotal)
      remaining = round2(remaining - share)
      allowances.push({
        amount: share,
        taxCategory: entry.line.taxCategory,
        taxRatePercent: entry.line.taxCategory === "S" ? entry.line.taxRate : 0,
        exemptionCode: entry.line.exemptionCode,
        exemptionReason: entry.line.exemptionReason,
      })
    })
  }

  const subtotals = zatcaTaxSubtotals(zatcaLines(lines, computed), allowances)
  const taxAmount = round2(subtotals.reduce((sum, entry) => sum + entry.taxAmount, 0))
  const taxableAmount = round2(subtotal - discountAmount)
  return {
    lines: computed,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    totalAmount: round2(taxableAmount + taxAmount),
    allowances,
    taxBreakdown: subtotals.map((entry) => ({
      taxCategory: entry.taxCategory,
      taxRate: entry.taxRatePercent,
      exemptionCode: entry.exemptionCode,
      taxableAmount: entry.taxableAmount,
      taxAmount: entry.taxAmount,
    })),
  }
}

// The item lines in the shape the ZATCA builder takes (sections and notes aren't invoice lines).
export function zatcaLines(
  lines: Array<LineInput & { description?: string }>,
  computed: ComputedLine[]
): ZatcaDocumentLine[] {
  const result: ZatcaDocumentLine[] = []
  lines.forEach((line, index) => {
    if (line.lineType !== "item") return
    result.push({
      id: String(result.length + 1),
      name: line.description?.trim() || "-",
      quantity: line.quantity,
      netAmount: computed[index].netAmount,
      taxAmount: computed[index].taxAmount,
      taxCategory: line.taxCategory,
      taxRatePercent: line.taxCategory === "S" ? line.taxRate : 0,
      exemptionCode: line.taxCategory === "S" ? null : line.exemptionCode,
      exemptionReason: line.taxCategory === "S" ? null : line.exemptionReason,
    })
  })
  return result
}

// Retention is held back from the works' value before VAT; the buyer still owes the VAT on all
// of it (it isn't a discount, so it stays out of the ZATCA amounts).
export function retentionAmount(taxableAmount: number, retentionPercent: number): number {
  return round2((Math.max(taxableAmount, 0) * Math.max(retentionPercent, 0)) / 100)
}
