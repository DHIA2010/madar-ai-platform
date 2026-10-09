// Real supplier balance, derived from the actual purchases/returns/vouchers now that a real
// backend exists for all three -- replaces the old computeSupplierBalance's self-admitted fake
// approximation ("no real ledger, so debit = -3% of totalPurchase"). Same direction convention
// supplier-statement.tsx's own buildSupplierTransactions already uses: purchase/receipt move the
// balance toward "we owe the supplier more" (+1), return/payment move it the other way (-1).
// Structural (not imported) types -- avoids a cross-feature type import into this file for the
// same reason supplier-statement.tsx's own dynamic-import note explains (purchase-form.tsx
// imports @/features/suppliers, so a static import back would be a real import/no-cycle cycle).

export interface SupplierLedgerPurchase {
  supplierId: string
  grandTotal: number
}

export interface SupplierLedgerReturn {
  supplierId: string
  returnAmount: number
}

export interface SupplierLedgerVoucher {
  supplierId: string
  type: "receipt" | "payment"
  amount: number
}

export function computeSupplierBalance(
  supplierId: string,
  purchases: SupplierLedgerPurchase[],
  returns: SupplierLedgerReturn[],
  vouchers: SupplierLedgerVoucher[]
): number {
  let balance = 0
  for (const purchase of purchases) {
    if (purchase.supplierId === supplierId) balance += purchase.grandTotal
  }
  for (const entry of returns) {
    if (entry.supplierId === supplierId) balance -= entry.returnAmount
  }
  for (const voucher of vouchers) {
    if (voucher.supplierId !== supplierId) continue
    balance += voucher.type === "receipt" ? voucher.amount : -voucher.amount
  }
  return balance
}
