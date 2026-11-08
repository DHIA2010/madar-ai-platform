// Pure helpers behind ProductCatalogService.bulkImport(): turning the spreadsheet's plain-string
// cells into the variant matrix and bundle recipe a CreateProductInput carries. Kept apart from
// catalog-service.ts so the parsing rules can be read (and tested) without the persistence around
// them.

import {
  isProductUnit,
  type BulkImportComponentRow,
  type BulkImportVariantRow,
  type ProductComponentInput,
  type ProductUnit,
  type ProductVariantInput,
  type ProductVariantOptionInput,
} from "./catalog-types"

// A combination count past this is almost certainly a typo in the quick-variants cell (a stray
// separator multiplying every option) rather than a real catalogue -- refusing it beats silently
// creating hundreds of variants nobody asked for.
export const MAX_QUICK_VARIANTS = 100

export function parseImportNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null
  const parsed = Number(value.trim().replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

// The quick-variants cell: "اللون: أحمر|أزرق ; المقاس: M|L". Options are split on ";" (or the
// Arabic "؛"), a name from its values on ":", and values on "|" or a comma (Latin or Arabic) --
// whichever the merchant's keyboard reaches first. Returns null when the cell is malformed, so the
// caller can say so instead of guessing.
export function parseQuickOptions(text: string): ProductVariantOptionInput[] | null {
  const options: ProductVariantOptionInput[] = []
  for (const part of text.split(/[;؛]/)) {
    if (part.trim() === "") continue
    const separator = part.indexOf(":")
    if (separator <= 0) return null
    const name = part.slice(0, separator).trim()
    const values = [
      ...new Set(
        part
          .slice(separator + 1)
          .split(/[|,،]/)
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    ]
    if (!name || values.length === 0) return null
    options.push({ name, values })
  }
  return options.length > 0 ? options : null
}

// Every combination of the options' values, in the order a merchant reads them (the first option
// changes slowest) -- the same matrix the Add Product page generates from the same options.
function expandVariantCombinations(options: ProductVariantOptionInput[]): string[][] {
  return options.reduce<string[][]>(
    (combinations, option) =>
      combinations.flatMap((combination) => option.values.map((value) => [...combination, value])),
    [[]]
  )
}

// The variants sheet: one row per variant, each naming its own option/value pairs. Option names
// keep the order they first appear in, and so do each option's values, so the product reads back
// the way the sheet was written. A variant missing one of the options gets a short optionValues
// list, which create()'s own validation reports -- no second rule here to drift from it.
export function buildVariantsFromRows(
  rows: BulkImportVariantRow[],
  fallback: { price: number | null; stock: number | null }
): { variantOptions: ProductVariantOptionInput[]; variants: ProductVariantInput[] } {
  const variantOptions: ProductVariantOptionInput[] = []
  for (const row of rows) {
    for (const pair of row.options) {
      const name = pair.name.trim()
      const value = pair.value.trim()
      if (!name || !value) continue
      let option = variantOptions.find((candidate) => candidate.name === name)
      if (!option) {
        option = { name, values: [] }
        variantOptions.push(option)
      }
      if (!option.values.includes(value)) option.values.push(value)
    }
  }

  const variants = rows.map((row) => {
    const valueByName = new Map(
      row.options
        .filter((pair) => pair.name.trim() && pair.value.trim())
        .map((pair) => [pair.name.trim(), pair.value.trim()])
    )
    return {
      sku: row.sku?.trim() || null,
      price: parseImportNumber(row.price) ?? fallback.price,
      stock: parseImportNumber(row.stock) ?? fallback.stock,
      optionValues: variantOptions
        .map((option) => valueByName.get(option.name))
        .filter((value): value is string => value !== undefined),
    }
  })

  return { variantOptions, variants }
}

// Quick variants all share the product row's price and stock; each gets "<product sku>-<n>" as
// its own stock code so it can still be scanned and pushed to a storefront individually.
export function buildQuickVariants(
  options: ProductVariantOptionInput[],
  base: { sku: string | null; price: number | null; stock: number | null }
): ProductVariantInput[] {
  return expandVariantCombinations(options).map((optionValues, index) => ({
    sku: base.sku ? `${base.sku}-${index + 1}` : null,
    price: base.price,
    stock: base.stock,
    optionValues,
  }))
}

// "حبة (PCS)" -> "حبة": a product's baseUnit carries the picker's English abbreviation, a recipe
// unit does not. Null when the product has no unit the recipe units know.
export function recipeUnitOf(baseUnit: string | null): ProductUnit | null {
  const short = baseUnit?.split(" ")[0]?.trim() ?? ""
  return isProductUnit(short) ? short : null
}

// What a component cell turned into: a catalogue product (with the unit its stock is counted in)
// or a name the bundle keeps by hand, which the repository materializes into a raw material.
export type ResolvedComponentTarget =
  | { kind: "product"; ref: string; stockUnit: ProductUnit | null }
  | { kind: "custom"; name: string }

export function buildComponent(
  row: BulkImportComponentRow,
  target: ResolvedComponentTarget
): ProductComponentInput {
  const typedUnit = row.unit?.trim().split(" ")[0] ?? ""
  const stockUnit =
    target.kind === "product" ? target.stockUnit : isProductUnit(typedUnit) ? typedUnit : null
  // The recipe unit falls back to whatever the stock is counted in (and that to a piece), so a
  // sheet that leaves the unit blank still describes "one of these" -- the common case.
  const requiredUnit = (typedUnit || stockUnit || "حبة") as ProductUnit

  return {
    componentRef: target.kind === "product" ? target.ref : null,
    customName: target.kind === "custom" ? target.name : null,
    customStock: null,
    requiredQuantity: parseImportNumber(row.quantity) ?? 1,
    requiredUnit,
    stockUnit: stockUnit ?? requiredUnit,
    conversionFactor: parseImportNumber(row.conversionFactor),
    note: null,
  }
}

// A stock code for a product the sheet gave none -- most merchants' own lists have no SKU column
// at all. Same shape the Add Product page's "generate" button makes (dated, with a random tail
// that leaves out I, O, 0 and 1), so an imported code reads like any other.
export function generateImportSku(taken: ReadonlySet<string>, now = new Date()): string {
  const datePart = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("")

  for (let attempt = 0; ; attempt += 1) {
    const tail = Array.from({ length: attempt < 40 ? 4 : 8 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
    ).join("")
    const candidate = `SKU-${datePart}-${tail}`
    if (!taken.has(candidate)) return candidate
  }
}
