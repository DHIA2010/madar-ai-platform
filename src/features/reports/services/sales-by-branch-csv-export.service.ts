import type { SalesByBranchRow } from "../types/ready-report.types"

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

export function exportSalesByBranchToCsv(branches: SalesByBranchRow[]) {
  downloadCsv(
    "sales-by-branch",
    ["Branch", "Total Sales", "Order Count", "Avg Invoice Value", "Items Sold", "Contribution %"],
    branches.map((branch) => [
      branch.workspaceName,
      branch.totalSales.toFixed(2),
      branch.orderCount,
      branch.avgInvoiceValue.toFixed(2),
      branch.itemsSold,
      branch.contributionPercent.toFixed(1),
    ])
  )
}
