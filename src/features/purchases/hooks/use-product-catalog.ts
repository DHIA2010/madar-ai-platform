"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { productListService, type ProductRecord } from "@/features/products"

// Only a row with a real products.id (isNative: true -- authored here, or synced and
// auto-promoted/linked) can be referenced by this backend's purchase line items
// (purchase_line_items.product_id is a real foreign key) -- a raw, still-unpromoted synced
// storefront row is aggregated read-only from elsewhere and has no row here at all, so it can
// never be purchased/receipted through this flow.
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
      setProducts(items.filter((item) => item.isNative))
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
