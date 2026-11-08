// @vitest-environment node

// The products import/export workbook (products-workbook.ts): what the template and the export
// write must read back into the rows POST /v1/products/bulk-import takes -- variants and bundle
// components folded into their product -- and an old-style CSV must still read.
import { describe, expect, it } from "vitest"

import type { ProductDetail } from "./product-list.service"
import { buildProductsWorkbook, parseProductsFile } from "./products-workbook"

function asFile(blob: Blob, name: string) {
  return { name, arrayBuffer: () => blob.arrayBuffer() }
}

function product(overrides: Partial<ProductDetail>): ProductDetail {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    productType: "simple",
    name: "",
    sku: null,
    category: "",
    description: "",
    status: "active",
    baseUnit: null,
    sellPrice: null,
    costPrice: null,
    stockQuantity: null,
    minStock: null,
    imageUrls: [],
    attributes: {},
    components: [],
    variantOptions: [],
    variants: [],
    taxRateId: null,
    priceIncludesTax: false,
    workspaceId: null,
    currency: "SAR",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

describe("products workbook", () => {
  it("reads the Arabic template back into one row per product, every type included", async () => {
    const blob = await buildProductsWorkbook({ locale: "ar", products: null })
    const { rows, orphans } = await parseProductsFile(asFile(blob, "template.xlsx"))

    expect(orphans).toEqual([])
    expect(rows.map((row) => [row.name, row.productType])).toEqual([
      ["قهوة مختصة", "simple"],
      ["تيشيرت قطن", "variable"],
      ["كوب حراري", "variable"],
      ["حبوب بن", "raw"],
      ["وجبة إفطار", "bundle"],
      ["استشارة تسويقية", "service"],
    ])
    expect(rows[0]).toMatchObject({ status: "active", sellPrice: "18", sourceRow: 2 })

    const tshirt = rows[1]
    expect(tshirt.variants).toEqual([
      {
        options: [
          { name: "اللون", value: "أحمر" },
          { name: "المقاس", value: "M" },
        ],
        sku: "TSHIRT-RED-M",
        price: "79",
        stock: "10",
      },
      {
        options: [
          { name: "اللون", value: "أزرق" },
          { name: "المقاس", value: "L" },
        ],
        sku: "TSHIRT-BLUE-L",
        price: "79",
        stock: "4",
      },
    ])
    expect(rows[2].options).toBe("اللون: أسود|أبيض")
    expect(rows[4].components).toEqual([
      { component: "COFFEE", quantity: "1", unit: "حبة", conversionFactor: null },
      { component: "كرواسون", quantity: "1", unit: "حبة", conversionFactor: null },
    ])
  })

  it("reads the English template too", async () => {
    const blob = await buildProductsWorkbook({ locale: "en", products: null })
    const { rows } = await parseProductsFile(asFile(blob, "template.xlsx"))
    expect(rows.map((row) => row.productType)).toEqual([
      "simple",
      "variable",
      "variable",
      "raw",
      "bundle",
      "service",
    ])
    expect(rows[1].variants).toHaveLength(2)
  })

  it("exports products in the layout the import reads back", async () => {
    const flour = product({
      id: "11111111-1111-1111-1111-111111111111",
      productType: "raw",
      name: "دقيق",
      stockQuantity: 50,
      baseUnit: "كجم (KG)",
    })
    const shirt = product({
      id: "22222222-2222-2222-2222-222222222222",
      productType: "variable",
      name: "قميص",
      sku: "SHIRT",
      variantOptions: [{ id: "o1", position: 0, name: "المقاس", values: ["M", "L"] }],
      variants: [
        { id: "v1", position: 0, sku: "SHIRT-M", price: 50, stock: 2, optionValues: ["M"] },
        { id: "v2", position: 1, sku: "SHIRT-L", price: 55, stock: 0, optionValues: ["L"] },
      ],
    })
    const sugar = product({
      id: "33333333-3333-3333-3333-333333333333",
      productType: "raw",
      name: "سكر",
      stockQuantity: 5,
    })
    const cake = product({
      id: "44444444-4444-4444-4444-444444444444",
      productType: "bundle",
      name: "كيك",
      sellPrice: 30,
      components: [
        {
          id: "c1",
          position: 0,
          componentRef: flour.id,
          customName: null,
          customStock: null,
          requiredQuantity: 200,
          requiredUnit: "جرام",
          stockUnit: "كجم",
          conversionFactor: null,
          note: null,
        },
        {
          id: "c2",
          position: 1,
          componentRef: sugar.id,
          customName: null,
          customStock: null,
          requiredQuantity: 1,
          requiredUnit: "حبة",
          stockUnit: "حبة",
          conversionFactor: null,
          note: null,
        },
      ],
    })

    // Sugar is in the catalogue but not exported: the cake names it by name instead of a code.
    const blob = await buildProductsWorkbook({
      locale: "ar",
      products: [flour, shirt, cake],
      catalogue: [flour, shirt, sugar, cake],
    })
    const { rows, orphans } = await parseProductsFile(asFile(blob, "export.xlsx"))

    expect(orphans).toEqual([])
    expect(rows.map((row) => [row.ref, row.name, row.productType])).toEqual([
      ["P1", "دقيق", "raw"],
      ["SHIRT", "قميص", "variable"],
      ["P3", "كيك", "bundle"],
    ])
    expect(rows[1].variants.map((variant) => [variant.options, variant.price])).toEqual([
      [[{ name: "المقاس", value: "M" }], "50"],
      [[{ name: "المقاس", value: "L" }], "55"],
    ])
    expect(rows[2].components.map((component) => component.component)).toEqual(["P1", "سكر"])
  })

  it("reports variants rows whose code matches no product", async () => {
    const ExcelJS = (await import("exceljs")).default
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet("Products").addRows([
      ["Name", "Type", "SKU"],
      ["Shirt", "Variable", "SHIRT"],
    ])
    workbook.addWorksheet("Variants").addRows([
      ["Product code", "Option 1", "Value 1", "Price"],
      ["shirt", "Size", "M", 10],
      ["NOPE", "Size", "L", 10],
    ])
    const buffer = await workbook.xlsx.writeBuffer()
    const { rows, orphans } = await parseProductsFile(asFile(new Blob([buffer]), "mine.xlsx"))

    // Linked by SKU (case-insensitively) when the file has no product code column.
    expect(rows[0].variants).toHaveLength(1)
    expect(orphans).toEqual([{ sheet: "variants", row: 3, ref: "NOPE" }])
  })

  it("still reads the old CSV template", async () => {
    const csv =
      "﻿name,sku,category,type,status,cost_price,sell_price,stock,min_stock,unit,description\n" +
      '"قميص, قطن",SKU-1,ملابس,simple,active,40,89.9,25,5,حبة,\n'
    const { rows } = await parseProductsFile(asFile(new Blob([csv]), "old.csv"))
    expect(rows).toEqual([
      expect.objectContaining({
        name: "قميص, قطن",
        sku: "SKU-1",
        productType: "simple",
        costPrice: "40",
        sellPrice: "89.9",
        stockQuantity: "25",
        sourceRow: 2,
      }),
    ])
  })
})
