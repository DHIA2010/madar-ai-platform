"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { productListService, type ProductRecord } from "@/features/products"

// Only native ("Madar") products have a real row in the products table this backend's purchase
// line items can reference (purchase_line_items.product_id is a real foreign key) -- a synced
// storefront product (Salla/Shopify/Zid) is aggregated read-only from elsewhere and has no row
// here at all, so it can never be purchased/receipted through this flow.
export function useProductCatalog() {
  const t = useTranslations("purchases.errors")
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const items = await productListService.listProducts()
      setProducts(items.filter((item) => item.platform === "Madar"))
    } catch {
      setError(t("loadProducts"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { products, isLoading, error, refetch }
}
