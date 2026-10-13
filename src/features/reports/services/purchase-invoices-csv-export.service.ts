import type { PurchaseInvoiceRow } from "../types/ready-report.types"

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

export function exportPurchaseInvoicesToCsv(rows: PurchaseInvoiceRow[]) {
  downloadCsv(
    "purchase-invoices",
    [
      "Date",
      "Supplier",
      "Supplier Invoice Number",
      "Supplier Tax Number",
      "Item Count",
      "Amount Before Tax",
      "VAT Amount",
      "Total",
    ],
    rows.map((row) => [
      row.date,
      row.supplierName,
      row.referenceNumber ?? "",
      row.supplierTaxNumber ?? "",
      row.itemCount,
      row.amountBeforeTax.toFixed(2),
      row.vatAmount.toFixed(2),
      row.total.toFixed(2),
    ])
  )
}
