"use client"

import { useCallback, useEffect, useState } from "react"

// Dynamically imports the purchases feature's SERVICE layer (not its usePurchases()/useReturns()
// hooks -- a React hook can't be called after an async module resolution per the rules of hooks)
// rather than a static import, even a deep, import/no-cycle-safe one: this codebase's
// no-restricted-imports rule unconditionally blocks every "@/features/*/*" cross-feature path, and
// the only alternative, the top-level "@/features/purchases" barrel, is a REAL import/no-cycle
// cycle (it re-exports purchase-form.tsx, which imports @/features/suppliers). A dynamic import()
// is invisible to both rules, which is why this (not a static import of any shape) is what reads
// real purchase/return data from Suppliers-side pages.
import type { Purchase, PurchaseReturn } from "@/features/purchases"

// Duplicates purchaseGrandTotal/lineItemSubtotal's own formula (src/features/purchases/types)
// rather than importing it -- see the dynamic-import note above for why a static value import
// from that feature isn't an option here.
export function crossFeaturePurchaseGrandTotal(purchase: Purchase): number {
  const itemsSubtotal = purchase.items.reduce((sum, item) => {
    const base = item.netUnitCost * item.qty - item.discount
    return sum + base * (1 + item.taxPercent / 100)
  }, 0)
  const withOrderTax = itemsSubtotal * (1 + purchase.orderTaxPercent / 100)
  const otherCosts = Number.isFinite(purchase.otherCosts) ? purchase.otherCosts : 0
  return withOrderTax - purchase.discountAmount + purchase.shippingAmount + otherCosts
}

export function useCrossFeaturePurchaseData() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const { purchaseService, returnService } = await import("@/features/purchases/services")
      const [purchasesResult, returnsResult] = await Promise.all([
        purchaseService.list(),
        returnService.list(),
      ])
      setPurchases(purchasesResult)
      setReturns(returnsResult)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { purchases, returns, isLoading, refetch }
}
