import { describe, expect, it } from "vitest"

import { mapProductToSallaCreateBody } from "../products/salla-product-create-push-service"
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
    imageUrls: ["https://cdn.example.com/a.jpg"],
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

describe("mapProductToSallaCreateBody -- simple product", () => {
  it("maps a simple product's core fields and marks it sale/hidden by status", () => {
    const body = mapProductToSallaCreateBody(buildProduct({}))
    expect(body).toMatchObject({
      name: "Test Product",
      price: 100,
      product_type: "product",
      sku: "SKU-1",
      quantity: 10,
      status: "sale",
      images: [{ original: "https://cdn.example.com/a.jpg" }],
    })
    expect(body.options).toBeUndefined()
  })

  it("marks a draft product hidden", () => {
    const body = mapProductToSallaCreateBody(buildProduct({ status: "draft" }))
    expect(body.status).toBe("hidden")
  })

  it("maps service and digital types to their own Salla product_type", () => {
    expect(mapProductToSallaCreateBody(buildProduct({ productType: "service" })).product_type).toBe(
      "service"
    )
    expect(mapProductToSallaCreateBody(buildProduct({ productType: "digital" })).product_type).toBe(
      "digital"
    )
  })
})

describe("mapProductToSallaCreateBody -- variable product", () => {
  it("builds one option group with per-value price/quantity resolved from the matching variant", () => {
    const body = mapProductToSallaCreateBody(
      buildProduct({
        productType: "variable",
        sellPrice: null,
        stockQuantity: null,
        variantOptions: [{ id: "opt-1", position: 0, name: "المقاس", values: ["S", "M"] }],
        variants: [
          { id: "var-1", position: 0, sku: "SKU-S", price: 80, stock: 3, optionValues: ["S"] },
          { id: "var-2", position: 1, sku: "SKU-M", price: 85, stock: 5, optionValues: ["M"] },
        ],
      })
    )

    expect(body.quantity).toBeUndefined()
    expect(body.price).toBe(80) // the minimum variant price, used as the base/required price
    expect(body.options).toEqual([
      {
        name: "المقاس",
        required: true,
        display_type: "text",
        values: [
          { name: "S", price: 80, quantity: 3, is_default: true },
          { name: "M", price: 85, quantity: 5, is_default: false },
        ],
      },
    ])
  })
})
