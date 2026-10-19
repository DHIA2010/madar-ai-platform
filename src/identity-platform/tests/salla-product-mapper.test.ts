import { describe, expect, it } from "vitest"

import {
  mapSallaProductToCreateInput,
  type SallaProductApiPayload,
} from "../products/salla-product-mapper"

describe("mapSallaProductToCreateInput -- simple product", () => {
  it("maps a plain product with no options/skus to a stock-tracked simple product", () => {
    const payload: SallaProductApiPayload = {
      id: 496668399,
      name: "diaa",
      sku: "101010",
      price: { amount: 109, currency: "SAR" },
      cost_price: "50",
      quantity: 9,
      is_available: true,
      categories: [{ name: "الفساتين" }],
      main_image: "https://cdn.files.salla.network/main.webp",
      images: [{ url: "https://cdn.files.salla.network/main.webp" }],
    }

    const result = mapSallaProductToCreateInput(payload, "متجر سلة")

    expect(result).toMatchObject({
      productType: "simple",
      name: "diaa",
      sku: "101010",
      category: "الفساتين",
      status: "active",
      currency: "SAR",
      sellPrice: 109,
      costPrice: 50,
      stockQuantity: 9,
      imageUrls: ["https://cdn.files.salla.network/main.webp"],
      variantOptions: [],
      variants: [],
    })
  })

  it("falls back to a generated name/sku/category when Salla's own fields are empty", () => {
    const payload: SallaProductApiPayload = {
      id: 394235146,
      quantity: 0,
      is_available: false,
    }

    const result = mapSallaProductToCreateInput(payload, "متجر سلة")

    expect(result.name).toBe("Salla #394235146")
    expect(result.sku).toBe("SALLA-394235146")
    expect(result.category).toBe("متجر سلة")
    expect(result.status).toBe("draft")
    expect(result.sellPrice).toBe(0)
    expect(result.stockQuantity).toBe(0)
  })
})

describe("mapSallaProductToCreateInput -- variable product", () => {
  it("maps a product with one option group and several skus to a variable product", () => {
    // Trimmed from a real confirmed payload (product 1667037701, "تنورة") -- one option group
    // ("المقاس"/size) with 5 values, and 4 skus each carrying their own stock_quantity and a
    // related_option_values id resolving back to one of those values.
    const payload: SallaProductApiPayload = {
      id: 1667037701,
      name: "تنورة",
      sku: null,
      price: { amount: 86, currency: "SAR" },
      cost_price: 0,
      is_available: true,
      categories: [],
      options: [
        {
          id: 266591475,
          name: "المقاس",
          purpose: "variants",
          values: [
            { id: 1465459335, name: "44 - XL" },
            { id: 556155264, name: "42 - L" },
            { id: 1929601153, name: "40 - M" },
          ],
        },
      ],
      skus: [
        {
          id: 1707844412,
          sku: null,
          price: { amount: 83, currency: "SAR" },
          stock_quantity: 0,
          related_option_values: [1506461060], // intentionally unresolved -- not in options above
        },
        {
          id: 932233789,
          sku: null,
          price: { amount: 83, currency: "SAR" },
          stock_quantity: 1,
          related_option_values: [1465459335],
        },
        {
          id: 25026878,
          sku: null,
          regular_price: { amount: 279, currency: "SAR" },
          stock_quantity: 2,
          related_option_values: [556155264],
        },
      ],
    }

    const result = mapSallaProductToCreateInput(payload, "متجر سلة")

    expect(result.productType).toBe("variable")
    expect(result.sellPrice).toBeNull()
    expect(result.stockQuantity).toBeNull()
    expect(result.variantOptions).toEqual([
      { name: "المقاس", values: ["44 - XL", "42 - L", "40 - M"] },
    ])
    expect(result.variants).toEqual([
      { sku: null, price: 83, stock: 0, optionValues: [""] }, // unresolved id -> blank
      { sku: null, price: 83, stock: 1, optionValues: ["44 - XL"] },
      { sku: null, price: 279, stock: 2, optionValues: ["42 - L"] },
    ])
  })

  it("uses a synthetic top-level sku when Salla's own is null, even for a variable product", () => {
    const payload: SallaProductApiPayload = {
      id: 1167158793,
      name: "فستان",
      sku: null,
      is_available: true,
      options: [{ id: 1, name: "اللون", purpose: "variants", values: [{ id: 10, name: "أحمر" }] }],
      skus: [
        {
          id: 100,
          sku: null,
          price: { amount: 50 },
          stock_quantity: 3,
          related_option_values: [10],
        },
      ],
    }

    const result = mapSallaProductToCreateInput(payload, "متجر سلة")

    expect(result.sku).toBe("SALLA-1167158793")
  })
})
