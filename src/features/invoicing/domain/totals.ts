// The live-preview copy of the backend's invoicing/calculations.ts -- same arithmetic, so what the
// editor shows is what the server saves (the server's numbers win).
import type { DiscountType, DocumentLine, TaxCategory } from "../types/invoicing.types"

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export interface ComputedLine {
  netAmount: number
  taxAmount: number
}

export interface TaxBreakdownEntry {
  taxCategory: TaxCategory
  taxRate: number
  exemptionCode: string | null
  taxableAmount: number
  taxAmount: number
}

export interface DocumentTotals {
  lines: ComputedLine[]
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  breakdown: TaxBreakdownEntry[]
}

const effectiveRate = (line: DocumentLine) => (line.taxCategory === "S" ? line.taxRate : 0)

export function computeLine(line: DocumentLine): ComputedLine {
  if (line.lineType !== "item") return { netAmount: 0, taxAmount: 0 }
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
  const netAmount = round2(gross - (gross * (Number(line.discountPercent) || 0)) / 100)
  return { netAmount, taxAmount: round2((netAmount * effectiveRate(line)) / 100) }
}

const keyOf = (line: DocumentLine) =>
  `${line.taxCategory}|${effectiveRate(line)}|${line.taxCategory === "S" ? "" : (line.exemptionCode ?? "")}`

export function computeTotals(
  lines: DocumentLine[],
  discount: { type: DiscountType; value: number }
): DocumentTotals {
  const computed = lines.map(computeLine)
  const subtotal = round2(computed.reduce((sum, line) => sum + line.netAmount, 0))
  const requested =
    discount.type === "percent" ? (subtotal * (discount.value || 0)) / 100 : discount.value || 0
  const discountAmount = round2(Math.min(Math.max(requested, 0), subtotal))

  const groups = new Map<string, TaxBreakdownEntry & { net: number }>()
  lines.forEach((line, index) => {
    if (line.lineType !== "item") return
    const key = keyOf(line)
    const entry = groups.get(key) ?? {
      taxCategory: line.taxCategory,
      taxRate: effectiveRate(line),
      exemptionCode: line.taxCategory === "S" ? null : line.exemptionCode,
      taxableAmount: 0,
      taxAmount: 0,
      net: 0,
    }
    entry.net += computed[index].netAmount
    groups.set(key, entry)
  })
  // The document discount spread over the categories by amount; the last takes the remainder.
  const entries = [...groups.values()]
  const positive = entries.filter((entry) => entry.net > 0)
  let remaining = discountAmount
  for (const entry of entries) {
    let share = 0
    if (discountAmount > 0 && subtotal > 0 && entry.net > 0) {
      share =
        entry === positive[positive.length - 1]
          ? remaining
          : round2((discountAmount * entry.net) / subtotal)
      remaining = round2(remaining - share)
    }
    entry.taxableAmount = round2(entry.net - share)
    entry.taxAmount = round2((entry.taxableAmount * entry.taxRate) / 100)
  }
  const taxAmount = round2(entries.reduce((sum, entry) => sum + entry.taxAmount, 0))
  const taxableAmount = round2(subtotal - discountAmount)
  return {
    lines: computed,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    totalAmount: round2(taxableAmount + taxAmount),
    breakdown: entries.map((entry) => ({
      taxCategory: entry.taxCategory,
      taxRate: entry.taxRate,
      exemptionCode: entry.exemptionCode,
      taxableAmount: entry.taxableAmount,
      taxAmount: entry.taxAmount,
    })),
  }
}

// The running number of each priced line; sections and notes are not numbered.
export function itemPositions(lines: Pick<DocumentLine, "lineType">[]): number[] {
  const positions: number[] = []
  let count = 0
  for (const line of lines) positions.push(line.lineType === "item" ? (count += 1) : 0)
  return positions
}

export function retentionAmount(taxableAmount: number, percent: number): number {
  return round2((Math.max(taxableAmount, 0) * Math.max(percent, 0)) / 100)
}

export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

export function formatQuantity(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    maximumFractionDigits: 4,
  }).format(value || 0)
}
