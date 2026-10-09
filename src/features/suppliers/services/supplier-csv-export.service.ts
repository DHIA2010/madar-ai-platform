import type { Supplier } from "../types"

function escapeCsvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Client-side only -- there's no backend export endpoint for this module, so this builds the CSV
// from whatever rows the caller already has (fetched from the real backend) and triggers a
// browser download directly. balanceBySupplierId mirrors the real, derived balance the list page's
// own column shows (see supplier-ledger.service.ts) -- not a stored field on Supplier itself.
export function exportSuppliersToCsv(
  suppliers: Supplier[],
  balanceBySupplierId: Map<string, number>
) {
  const header = [
    "Supplier ID",
    "Supplier",
    "Company Name",
    "Balance",
    "Contact",
    "Email",
    "Status",
    "Country",
  ]
  const rows = suppliers.map((supplier) => [
    supplier.code,
    supplier.name,
    supplier.companyDetails.companyName,
    (balanceBySupplierId.get(supplier.id) ?? 0).toFixed(2),
    supplier.phone,
    supplier.email,
    supplier.status,
    supplier.country,
  ])

  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
