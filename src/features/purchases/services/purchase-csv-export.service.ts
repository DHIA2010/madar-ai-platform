import type { Purchase, PurchasePaymentVoucher, PurchaseReturn } from "../types"
import { derivePurchasePaymentStatus, purchaseGrandTotal, purchaseItemCount } from "../types"

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

export function exportPurchasesToCsv(purchases: Purchase[], vouchers: PurchasePaymentVoucher[]) {
  downloadCsv(
    "purchases",
    [
      "Purchase ID",
      "Supplier",
      "Status",
      "Items",
      "Total Amount",
      "Currency",
      "Payment Status",
      "Date",
    ],
    purchases.map((purchase) => [
      purchase.code,
      purchase.supplierName,
      purchase.status,
      purchaseItemCount(purchase.items),
      purchaseGrandTotal(purchase).toFixed(2),
      purchase.currency,
      derivePurchasePaymentStatus(purchase, vouchers),
      purchase.date,
    ])
  )
}

export function exportReturnsToCsv(returns: PurchaseReturn[]) {
  downloadCsv(
    "purchase-returns",
    [
      "Return ID",
      "Purchase ID",
      "Supplier",
      "Return Items",
      "Return Amount",
      "Status",
      "Date",
      "Warehouse",
    ],
    returns.map((entry) => [
      entry.code,
      entry.purchaseCode,
      entry.supplierName,
      entry.returnQty,
      entry.returnAmount.toFixed(2),
      entry.status,
      entry.returnDate,
      entry.warehouseName,
    ])
  )
}
