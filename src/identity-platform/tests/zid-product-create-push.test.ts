import { describe, expect, it } from "vitest"

import { mapProductToZidCreateBody } from "../products/zid-product-create-push-service"
import type { ProductView } from "../products/catalog-types"

function buildProduct(overrides: Partial<ProductView>): ProductView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    workspaceId: null,
    productType: "simple",
    name: "Test Product",
    sku: "SKU-1",
    category: "ملابس",
    description: "",
    status: "active",
    currency: "SAR",
    baseUnit: null,
    sellPrice: 100,
    costPrice: 50,
    stockQuantity: 10,
    minStock: null,
    imageUrls: [],
    attributes: {},
    components: [],
    variantOptions: [],
    variants: [],
    taxRateId: null,
    priceIncludesTax: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    producibleQuantity: null,
    ...overrides,
  } as ProductView
}

describe("mapProductToZidCreateBody", () => {
  it("maps a native product's core fields, publishing by status", () => {
    const body = mapProductToZidCreateBody(buildProduct({}))
    expect(body).toEqual({
      name: { ar: "Test Product", en: "Test Product" },
      price: 100,
      sku: "SKU-1",
      is_published: true,
      quantity: 10,
    })
  })

  it("does not publish a draft product", () => {
    expect(mapProductToZidCreateBody(buildProduct({ status: "draft" })).is_published).toBe(false)
  })

  it("synthesizes a SKU when the native product has none", () => {
    const body = mapProductToZidCreateBody(buildProduct({ sku: null }))
    expect(body.sku).toBe("MADAR-11111111-1111-4111-8111-111111111111")
  })
})
