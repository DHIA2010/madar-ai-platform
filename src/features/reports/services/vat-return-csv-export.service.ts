import type { VatReturnDto } from "../types/ready-report.types"

function escapeCsvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(
  filenamePrefix: string,
  header: string[],
  rows: Array<Array<string | number>>
) {
  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportVatReturnToCsv(data: VatReturnDto) {
  downloadCsv(
    "vat-return",
    ["Item", "Amount", "Adjustment Amount", "VAT Amount"],
    [
      [
        "Sales - Standard Rated",
        data.sales.standardRated.amount.toFixed(2),
        data.sales.standardRated.adjustmentAmount.toFixed(2),
        data.sales.standardRated.vatAmount.toFixed(2),
      ],
      [
        "Sales - Zero Rated",
        data.sales.zeroRated.amount.toFixed(2),
        data.sales.zeroRated.adjustmentAmount.toFixed(2),
        data.sales.zeroRated.vatAmount.toFixed(2),
      ],
      [
        "Purchases - Standard Rated",
        data.purchases.standardRated.amount.toFixed(2),
        data.purchases.standardRated.adjustmentAmount.toFixed(2),
        data.purchases.standardRated.vatAmount.toFixed(2),
      ],
      [
        "Purchases - Zero Rated",
        data.purchases.zeroRated.amount.toFixed(2),
        data.purchases.zeroRated.adjustmentAmount.toFixed(2),
        data.purchases.zeroRated.vatAmount.toFixed(2),
      ],
      [
        "Expenses",
        data.expenses.amount.toFixed(2),
        data.expenses.adjustmentAmount.toFixed(2),
        data.expenses.vatAmount.toFixed(2),
      ],
      ["Net VAT Due (or Refundable)", "-", "-", data.totals.netVatDue.toFixed(2)],
    ]
  )
}
