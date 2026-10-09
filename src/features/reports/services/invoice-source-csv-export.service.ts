// Duplicated from src/features/expenses/services/expense-csv-export.service.ts's own
// escapeCsvCell/downloadCsv helpers -- same per-feature-copy convention as this feature's other
// duplicated constants (e.g. chart-constants.ts).
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

export function exportInvoiceSourceToCsv(
  groups: Array<{
    sourceName: string
    totalSales: number
    invoiceCount: number
    avgInvoiceValue: number
  }>
) {
  downloadCsv(
    "sales-by-invoice-source",
    ["Source", "Total Sales", "Invoice Count", "Avg Invoice Value"],
    groups.map((group) => [
      group.sourceName,
      group.totalSales.toFixed(2),
      group.invoiceCount,
      group.avgInvoiceValue.toFixed(2),
    ])
  )
}
