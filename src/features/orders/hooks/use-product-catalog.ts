"use client"

import { useCallback, useEffect, useState } from "react"

import { productListService, type ProductRecord } from "@/features/products"

// Mirrors src/features/purchases/hooks/use-product-catalog.ts exactly -- same "native Madar
// products only" filter, for the same reason: madar_order_items.product_id is a real foreign key
// into the products table (see MadarOrdersService), which a synced storefront product has no row
// in at all.
export function useProductCatalog() {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const items = await productListService.listProducts()
      setProducts(items.filter((item) => item.platform === "Madar"))
    } catch {
      setProducts([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { products, isLoading, refetch }
}
