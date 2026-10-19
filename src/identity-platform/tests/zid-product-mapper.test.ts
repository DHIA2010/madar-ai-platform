import { describe, expect, it } from "vitest"

import {
  mapZidProductToCreateInput,
  type ZidProductApiPayload,
} from "../products/zid-product-mapper"

describe("mapZidProductToCreateInput", () => {
  it("maps a real confirmed non-infinite-stock product correctly", () => {
    // Trimmed from the real confirmed test-product payload created/deleted this session.
    const payload: ZidProductApiPayload = {
      id: "a94357e3-d849-4a14-8313-ff10baadd12f",
      name: { ar: "منتج اختبار مدار", en: "Madar Test Product" },
      sku: "MADAR-TEST-1",
      price: 25,
      cost: null,
      is_published: false,
      categories: [],
      images: [],
      stocks: [{ is_infinite: false, available_quantity: 5 }],
    }

    const result = mapZidProductToCreateInput(payload, "متجر زد")

    expect(result).toMatchObject({
      productType: "simple",
      name: "Madar Test Product",
      sku: "MADAR-TEST-1",
      status: "archived",
      sellPrice: 25,
      costPrice: null,
      stockQuantity: 5,
    })
  })

  it("sums available_quantity across multiple non-infinite stock locations", () => {
    const payload: ZidProductApiPayload = {
      id: 1,
      name: "Multi-location",
      stocks: [
        { is_infinite: false, available_quantity: 3 },
        { is_infinite: false, available_quantity: 7 },
      ],
    }
    expect(mapZidProductToCreateInput(payload, "fallback").stockQuantity).toBe(10)
  })

  it("treats an infinite-stock product as a large sentinel, not 0", () => {
    // Trimmed from the real confirmed shape (product a2ec12be..., is_infinite: true, quantity:
    // null) -- this is the common case: `quantity` is null, the real signal lives in stocks[].
    const payload: ZidProductApiPayload = {
      id: "a2ec12be-6921-4f48-861a-835acd98e11f",
      name: { ar: "سونى A7 الاصدار التالت", en: "Sony A7S III" },
      sku: "Z.17912260930644538",
      price: 10000,
      cost: 9800,
      quantity: null,
      is_published: true,
      categories: [{ name: { en: "Digital Camera", ar: "كاميرات" } }],
      stocks: [{ is_infinite: true, available_quantity: null }],
    }

    const result = mapZidProductToCreateInput(payload, "fallback")
    expect(result.stockQuantity).toBeGreaterThan(1000)
    expect(result).toMatchObject({
      name: "Sony A7S III",
      sku: "Z.17912260930644538",
      category: "Digital Camera",
      status: "active",
      sellPrice: 10000,
      costPrice: 9800,
    })
  })

  it("falls back to a generated name/sku/category and 0 stock when nothing else is available", () => {
    const payload: ZidProductApiPayload = { id: 42 }
    const result = mapZidProductToCreateInput(payload, "متجر زد")
    expect(result.name).toBe("Zid #42")
    expect(result.sku).toBe("ZID-42")
    expect(result.category).toBe("متجر زد")
    expect(result.stockQuantity).toBe(0)
    expect(result.status).toBe("archived")
  })

  it("prefers Arabic when no English name is given, matching normalizeZidProduct's precedent", () => {
    const payload: ZidProductApiPayload = { id: 1, name: { ar: "اسم عربي" } }
    expect(mapZidProductToCreateInput(payload, "fallback").name).toBe("اسم عربي")
  })
})
