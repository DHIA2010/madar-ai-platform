import type { Expense } from "../types"

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

export function exportExpensesToCsv(expenses: Expense[]) {
  downloadCsv(
    "expenses",
    ["Name", "Category", "Branch", "Amount", "Payment Method", "Tax", "Reference", "Date"],
    expenses.map((expense) => [
      expense.name,
      expense.categoryName,
      expense.workspaceName,
      expense.amount.toFixed(2),
      expense.paymentMethod,
      expense.taxInclusive ? "inclusive" : "exclusive",
      expense.referenceNumber,
      expense.expenseDate,
    ])
  )
}
