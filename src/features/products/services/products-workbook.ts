import type { CellValue, Workbook, Worksheet } from "exceljs"

import type {
  BulkImportComponentRow,
  BulkImportProductRow,
  BulkImportVariantRow,
  ProductDetail,
  ProductKind,
} from "./product-list.service"

// The products import/export workbook: an instructions sheet, then one sheet per kind of row --
// products (every type, one row each), variants (variable products) and bundle components --
// linked by the product code. The export writes exactly what the import reads, so a merchant can
// export, edit and import back. A plain CSV is still accepted and read as the products sheet.
//
// Headers, dropdown values and the sample rows live here rather than in messages/*.json: they are
// the file format itself, and the parser has to recognise both languages' headers whatever
// locale the file was downloaded in.

type WorkbookLocale = "ar" | "en"

type Bilingual = Record<WorkbookLocale, string>

interface ColumnSpec<Key extends string> {
  key: Key
  header: Bilingual
  // Extra header spellings accepted on import -- the old CSV template's English keys.
  aliases?: string[]
  width: number
}

const PRODUCT_COLUMNS: ColumnSpec<
  | "ref"
  | "name"
  | "type"
  | "sku"
  | "category"
  | "status"
  | "costPrice"
  | "sellPrice"
  | "stock"
  | "minStock"
  | "unit"
  | "options"
  | "description"
>[] = [
  { key: "ref", header: { ar: "رمز المنتج", en: "Product code" }, aliases: ["ref"], width: 14 },
  { key: "name", header: { ar: "الاسم *", en: "Name *" }, aliases: ["name"], width: 26 },
  { key: "type", header: { ar: "النوع *", en: "Type *" }, aliases: ["type"], width: 16 },
  { key: "sku", header: { ar: "رمز المخزون SKU", en: "SKU" }, width: 16 },
  { key: "category", header: { ar: "التصنيف", en: "Category" }, width: 16 },
  { key: "status", header: { ar: "الحالة", en: "Status" }, width: 12 },
  {
    key: "costPrice",
    header: { ar: "سعر التكلفة", en: "Cost price" },
    aliases: ["cost_price"],
    width: 12,
  },
  {
    key: "sellPrice",
    header: { ar: "سعر البيع", en: "Selling price" },
    aliases: ["sell_price"],
    width: 12,
  },
  { key: "stock", header: { ar: "المخزون", en: "Stock" }, width: 10 },
  {
    key: "minStock",
    header: { ar: "الحد الأدنى للمخزون", en: "Min stock" },
    aliases: ["min_stock"],
    width: 14,
  },
  { key: "unit", header: { ar: "الوحدة", en: "Unit" }, width: 12 },
  {
    key: "options",
    header: { ar: "الخيارات السريعة", en: "Quick variants" },
    aliases: ["options"],
    width: 34,
  },
  { key: "description", header: { ar: "الوصف", en: "Description" }, width: 30 },
]

const VARIANT_OPTION_SLOTS = 3

const VARIANT_COLUMNS: ColumnSpec<string>[] = [
  { key: "ref", header: { ar: "رمز المنتج *", en: "Product code *" }, width: 14 },
  ...Array.from({ length: VARIANT_OPTION_SLOTS }, (_, index) => [
    {
      key: `option${index + 1}`,
      header: { ar: `الخيار ${index + 1}`, en: `Option ${index + 1}` },
      width: 12,
    },
    {
      key: `value${index + 1}`,
      header: { ar: `القيمة ${index + 1}`, en: `Value ${index + 1}` },
      width: 12,
    },
  ]).flat(),
  { key: "sku", header: { ar: "رمز المخزون SKU", en: "SKU" }, width: 16 },
  { key: "price", header: { ar: "السعر", en: "Price" }, width: 10 },
  { key: "stock", header: { ar: "المخزون", en: "Stock" }, width: 10 },
]

const COMPONENT_COLUMNS: ColumnSpec<"ref" | "component" | "quantity" | "unit" | "factor">[] = [
  { key: "ref", header: { ar: "رمز الحزمة *", en: "Bundle code *" }, width: 14 },
  {
    key: "component",
    header: { ar: "المكون (رمز أو SKU أو اسم) *", en: "Component (code, SKU or name) *" },
    width: 30,
  },
  { key: "quantity", header: { ar: "الكمية", en: "Quantity" }, width: 10 },
  { key: "unit", header: { ar: "الوحدة", en: "Unit" }, width: 10 },
  { key: "factor", header: { ar: "معامل التحويل", en: "Conversion factor" }, width: 16 },
]

const SHEET_NAMES = {
  instructions: { ar: "التعليمات", en: "Instructions" },
  products: { ar: "المنتجات", en: "Products" },
  variants: { ar: "المتغيرات", en: "Variants" },
  components: { ar: "مكونات الحزم", en: "Bundle components" },
} satisfies Record<string, Bilingual>

const TYPE_LABELS: Record<ProductKind, Bilingual> = {
  simple: { ar: "منتج عادي", en: "Simple" },
  variable: { ar: "منتج متغير", en: "Variable" },
  bundle: { ar: "منتج مجمع", en: "Bundle" },
  raw: { ar: "مادة خام", en: "Raw material" },
  weighted: { ar: "منتج موزون", en: "Weighted" },
  service: { ar: "خدمة", en: "Service" },
  digital: { ar: "منتج رقمي", en: "Digital" },
}

const STATUS_LABELS: Record<"active" | "draft" | "archived", Bilingual> = {
  active: { ar: "نشط", en: "Active" },
  draft: { ar: "مسودة", en: "Draft" },
  archived: { ar: "مؤرشف", en: "Archived" },
}

// The units the Add Product page offers, in the exact form it stores them.
const PRODUCT_UNITS = ["حبة (PCS)", "كرتون (CTN)", "جرام (G)", "كجم (KG)", "مل (ML)", "لتر (L)"]
const RECIPE_UNITS = ["حبة", "كرتون", "جرام", "كجم", "مل", "لتر"]

const INSTRUCTIONS: Record<WorkbookLocale, string[]> = {
  ar: [
    "طريقة تعبئة ملف استيراد المنتجات",
    "",
    "1) ورقة «المنتجات»: صف واحد لكل منتج مهما كان نوعه. اختر النوع من القائمة المنسدلة.",
    "2) «رمز المنتج» رمز قصير من اختيارك يربط المنتج بصفوفه في الورقتين الأخريين (مثل TSHIRT). إن تركته فارغاً يُستخدم الـ SKU ثم الاسم.",
    "",
    "الحقول المطلوبة حسب النوع:",
    "• منتج عادي / موزون: الاسم، SKU، سعر البيع، المخزون",
    "• خدمة: الاسم، SKU، سعر البيع",
    "• منتج رقمي: الاسم، SKU، سعر البيع، الوصف",
    "• مادة خام: الاسم، المخزون (بدون SKU ولا سعر بيع)",
    "• منتج متغير: الاسم، SKU، ثم المتغيرات بإحدى طريقتين أدناه",
    "• منتج مجمع: الاسم، سعر البيع، ثم مكوناته في ورقة «مكونات الحزم»",
    "",
    "المنتج المتغير -- طريقتان:",
    "أ) سريعة: اكتب الخيارات في عمود «الخيارات السريعة» هكذا:  اللون: أحمر|أزرق ; المقاس: M|L",
    "   فتُنشأ كل التركيبات تلقائياً بسعر البيع والمخزون المكتوبين في الصف، وSKU كل متغير = SKU المنتج-1، -2 ...",
    "ب) مفصّلة: صف لكل متغير في ورقة «المتغيرات» بنفس رمز المنتج، مع سعره ومخزونه وSKU خاص به.",
    "   إن وُجدت صفوف في ورقة المتغيرات فهي المعتمدة ويُتجاهل عمود الخيارات السريعة.",
    "",
    "المنتج المجمع: صف لكل مكوّن في ورقة «مكونات الحزم». المكوّن يُكتب برمز منتج من نفس الملف أو SKU أو اسم منتج موجود؛ وإن لم يطابق أي منتج يُنشأ كمادة خام جديدة.",
    "معامل التحويل مطلوب فقط عندما تختلف طبيعة الوحدتين (مثل حبة مقابل كجم).",
    "",
    "التحديث: إذا كان الـ SKU موجوداً مسبقاً يُحدَّث المنتج بدلاً من إنشاء نسخة مكررة (والمادة الخام والحزمة تُطابَق بالاسم). الخلية الفارغة تُبقي القيمة الحالية.",
    "يمكنك تصدير منتجاتك بنفس هذا الملف، تعديلها، ثم استيرادها من جديد.",
  ],
  en: [
    "How to fill in the products import file",
    "",
    "1) “Products” sheet: one row per product, whatever its type. Pick the type from the dropdown.",
    "2) “Product code” is a short code of your choice linking a product to its rows on the other sheets (e.g. TSHIRT). Left blank, the SKU and then the name are used.",
    "",
    "Required fields by type:",
    "• Simple / Weighted: name, SKU, selling price, stock",
    "• Service: name, SKU, selling price",
    "• Digital: name, SKU, selling price, description",
    "• Raw material: name, stock (no SKU or selling price)",
    "• Variable: name, SKU, then its variants in one of the two ways below",
    "• Bundle: name, selling price, then its components on the “Bundle components” sheet",
    "",
    "Variable products -- two ways:",
    "a) Quick: write the options in the “Quick variants” column like:  Color: Red|Blue ; Size: M|L",
    "   Every combination is created with the row's selling price and stock; each variant's SKU is the product SKU-1, -2 ...",
    "b) Detailed: one row per variant on the “Variants” sheet with the same product code, each with its own price, stock and SKU.",
    "   When the Variants sheet has rows for a product, they win and the quick column is ignored.",
    "",
    "Bundles: one row per component on the “Bundle components” sheet. Name a component by a product code from this file, a SKU, or an existing product's name; anything that matches nothing is created as a new raw material.",
    "A conversion factor is only needed when the two units measure different things (e.g. piece vs kg).",
    "",
    "Updating: when a SKU already exists the product is updated instead of duplicated (raw materials and bundles match by name). A blank cell keeps the current value.",
    "You can export your products in this same file, edit them, and import them back.",
  ],
}

interface SampleProduct {
  ref: string
  name: Bilingual
  type: ProductKind
  sku?: string
  category: Bilingual
  costPrice?: number
  sellPrice?: number
  stock?: number
  minStock?: number
  unit?: string
  options?: Bilingual
  description?: Bilingual
}

const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    ref: "COFFEE",
    name: { ar: "قهوة مختصة", en: "Specialty coffee" },
    type: "simple",
    sku: "COFFEE-01",
    category: { ar: "مشروبات", en: "Drinks" },
    costPrice: 6,
    sellPrice: 18,
    stock: 50,
    minStock: 10,
    unit: "حبة (PCS)",
  },
  {
    ref: "TSHIRT",
    name: { ar: "تيشيرت قطن", en: "Cotton T-shirt" },
    type: "variable",
    sku: "TSHIRT",
    category: { ar: "ملابس", en: "Clothing" },
    unit: "حبة (PCS)",
  },
  {
    ref: "MUG",
    name: { ar: "كوب حراري", en: "Travel mug" },
    type: "variable",
    sku: "MUG",
    category: { ar: "أدوات", en: "Accessories" },
    sellPrice: 45,
    stock: 10,
    unit: "حبة (PCS)",
    options: { ar: "اللون: أسود|أبيض", en: "Color: Black|White" },
  },
  {
    ref: "BEANS",
    name: { ar: "حبوب بن", en: "Coffee beans" },
    type: "raw",
    category: { ar: "مواد خام", en: "Raw materials" },
    stock: 20,
    minStock: 5,
    unit: "كجم (KG)",
  },
  {
    ref: "COMBO1",
    name: { ar: "وجبة إفطار", en: "Breakfast combo" },
    type: "bundle",
    category: { ar: "عروض", en: "Offers" },
    sellPrice: 25,
  },
  {
    ref: "CONSULT",
    name: { ar: "استشارة تسويقية", en: "Marketing consultation" },
    type: "service",
    sku: "CONSULT-01",
    category: { ar: "خدمات", en: "Services" },
    sellPrice: 250,
  },
]

const SAMPLE_VARIANTS: Array<{
  ref: string
  options: Array<[Bilingual, Bilingual]>
  sku: string
  price: number
  stock: number
}> = [
  {
    ref: "TSHIRT",
    options: [
      [
        { ar: "اللون", en: "Color" },
        { ar: "أحمر", en: "Red" },
      ],
      [
        { ar: "المقاس", en: "Size" },
        { ar: "M", en: "M" },
      ],
    ],
    sku: "TSHIRT-RED-M",
    price: 79,
    stock: 10,
  },
  {
    ref: "TSHIRT",
    options: [
      [
        { ar: "اللون", en: "Color" },
        { ar: "أزرق", en: "Blue" },
      ],
      [
        { ar: "المقاس", en: "Size" },
        { ar: "L", en: "L" },
      ],
    ],
    sku: "TSHIRT-BLUE-L",
    price: 79,
    stock: 4,
  },
]

const SAMPLE_COMPONENTS: Array<{
  ref: string
  component: Bilingual
  quantity: number
  unit: string
}> = [
  { ref: "COMBO1", component: { ar: "COFFEE", en: "COFFEE" }, quantity: 1, unit: "حبة" },
  { ref: "COMBO1", component: { ar: "كرواسون", en: "Croissant" }, quantity: 1, unit: "حبة" },
]

// Enough rows for the dropdowns to reach wherever a merchant will realistically type.
const VALIDATED_ROWS = 1000

const HEADER_FILL = "FF2878FF"

async function loadExcel() {
  // Loaded on demand: the library is large and only the import/export dialogs need it.
  const excel = await import("exceljs")
  // CommonJS package: bundlers expose it under default, Node's ESM loader as the namespace.
  return excel.default ?? excel
}

function addSheet<Key extends string>(
  workbook: Workbook,
  name: string,
  columns: ColumnSpec<Key>[],
  locale: WorkbookLocale
): Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: locale === "ar" }],
  })
  sheet.columns = columns.map((column) => ({
    key: column.key,
    header: column.header[locale],
    width: column.width,
  }))
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
  header.height = 22
  return sheet
}

function addListValidation(
  sheet: Worksheet,
  columnIndex: number,
  values: string[],
  strict: boolean
) {
  const letter = sheet.getColumn(columnIndex).letter
  for (let row = 2; row <= VALIDATED_ROWS; row += 1) {
    sheet.getCell(`${letter}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${values.join(",")}"`],
      // A unit outside the list is still a valid free-text unit, so it only warns.
      showErrorMessage: true,
      errorStyle: strict ? "stop" : "warning",
    }
  }
}

function columnNumber<Key extends string>(columns: ColumnSpec<Key>[], key: Key): number {
  return columns.findIndex((column) => column.key === key) + 1
}

// Every product's code: its own SKU when it has one, otherwise a generated P1, P2 ... -- a raw
// material or bundle has no SKU, and its components still need something to point at.
function exportRefs(products: ProductDetail[]): Map<string, string> {
  const refs = new Map<string, string>()
  let generated = 0
  for (const product of products) {
    if (product.sku) {
      refs.set(product.id, product.sku)
    } else {
      generated += 1
      refs.set(product.id, `P${generated}`)
    }
  }
  return refs
}

// Builds the workbook: the sample template when products is null, otherwise an export of those
// products. catalogue is every product the export may point at (a bundle's components can be
// products that were not themselves selected for export).
export async function buildProductsWorkbook(input: {
  locale: WorkbookLocale
  products: ProductDetail[] | null
  catalogue?: ProductDetail[]
}): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const { locale } = input
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Madar"

  const instructions = workbook.addWorksheet(SHEET_NAMES.instructions[locale], {
    views: [{ rightToLeft: locale === "ar" }],
  })
  instructions.getColumn(1).width = 120
  INSTRUCTIONS[locale].forEach((line, index) => {
    const cell = instructions.getCell(index + 1, 1)
    cell.value = line
    cell.alignment = { wrapText: true, vertical: "top" }
    if (index === 0) cell.font = { bold: true, size: 14 }
  })

  const productsSheet = addSheet(workbook, SHEET_NAMES.products[locale], PRODUCT_COLUMNS, locale)
  const variantsSheet = addSheet(workbook, SHEET_NAMES.variants[locale], VARIANT_COLUMNS, locale)
  const componentsSheet = addSheet(
    workbook,
    SHEET_NAMES.components[locale],
    COMPONENT_COLUMNS,
    locale
  )

  if (input.products === null) {
    for (const sample of SAMPLE_PRODUCTS) {
      productsSheet.addRow({
        ref: sample.ref,
        name: sample.name[locale],
        type: TYPE_LABELS[sample.type][locale],
        sku: sample.sku,
        category: sample.category[locale],
        status: STATUS_LABELS.active[locale],
        costPrice: sample.costPrice,
        sellPrice: sample.sellPrice,
        stock: sample.stock,
        minStock: sample.minStock,
        unit: sample.unit,
        options: sample.options?.[locale],
        description: sample.description?.[locale],
      })
    }
    for (const sample of SAMPLE_VARIANTS) {
      variantsSheet.addRow({
        ref: sample.ref,
        ...Object.fromEntries(
          sample.options.flatMap(([name, value], index) => [
            [`option${index + 1}`, name[locale]],
            [`value${index + 1}`, value[locale]],
          ])
        ),
        sku: sample.sku,
        price: sample.price,
        stock: sample.stock,
      })
    }
    for (const sample of SAMPLE_COMPONENTS) {
      componentsSheet.addRow({
        ref: sample.ref,
        component: sample.component[locale],
        quantity: sample.quantity,
        unit: sample.unit,
      })
    }
  } else {
    const catalogue = input.catalogue ?? input.products
    const refs = exportRefs(catalogue)
    const exportedIds = new Set(input.products.map((product) => product.id))
    const byId = new Map(catalogue.map((product) => [product.id, product]))

    for (const product of input.products) {
      const ref = refs.get(product.id) ?? product.name
      productsSheet.addRow({
        ref,
        name: product.name,
        type: TYPE_LABELS[product.productType]?.[locale] ?? product.productType,
        sku: product.sku ?? undefined,
        category: product.category || undefined,
        status: STATUS_LABELS[product.status]?.[locale] ?? product.status,
        costPrice: product.costPrice ?? undefined,
        sellPrice:
          product.productType === "variable" ? undefined : (product.sellPrice ?? undefined),
        stock:
          product.productType === "variable" ? undefined : (product.stockQuantity ?? undefined),
        minStock: product.minStock ?? undefined,
        unit: product.baseUnit ?? undefined,
        description: product.description || undefined,
      })

      for (const variant of product.variants) {
        variantsSheet.addRow({
          ref,
          ...Object.fromEntries(
            product.variantOptions.slice(0, VARIANT_OPTION_SLOTS).flatMap((option, index) => [
              [`option${index + 1}`, option.name],
              [`value${index + 1}`, variant.optionValues[index] ?? ""],
            ])
          ),
          sku: variant.sku ?? undefined,
          price: variant.price ?? undefined,
          stock: variant.stock ?? undefined,
        })
      }

      for (const component of product.components) {
        const target = component.componentRef ? byId.get(component.componentRef) : undefined
        // A component exported alongside it is named by its code; one outside the export by
        // something the import can still find it by -- its SKU, or failing that its name.
        const name = target
          ? exportedIds.has(target.id)
            ? refs.get(target.id)
            : (target.sku ?? target.name)
          : (component.customName ?? component.componentRef)
        componentsSheet.addRow({
          ref,
          component: name ?? "",
          quantity: component.requiredQuantity,
          unit: component.requiredUnit,
          factor: component.conversionFactor ?? undefined,
        })
      }
    }
  }

  // Added last: a validation materializes its cells, and addRow() appends after the last row
  // holding any -- set first, the dropdowns would push the data down to row 1001.
  addListValidation(
    productsSheet,
    columnNumber(PRODUCT_COLUMNS, "type"),
    Object.values(TYPE_LABELS).map((label) => label[locale]),
    true
  )
  addListValidation(
    productsSheet,
    columnNumber(PRODUCT_COLUMNS, "status"),
    Object.values(STATUS_LABELS).map((label) => label[locale]),
    true
  )
  addListValidation(productsSheet, columnNumber(PRODUCT_COLUMNS, "unit"), PRODUCT_UNITS, false)
  addListValidation(componentsSheet, columnNumber(COMPONENT_COLUMNS, "unit"), RECIPE_UNITS, true)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------------------------
// Reading a file back

// A row on the variants / components sheet whose code matches no product in the file.
export interface OrphanRow {
  sheet: "variants" | "components"
  row: number
  ref: string
}

interface ParsedProductsFile {
  rows: BulkImportProductRow[]
  orphans: OrphanRow[]
}

interface RawRow {
  rowNumber: number
  cells: Record<string, string | null>
}

function normalizeHeader(value: string): string {
  return value.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase()
}

function headerLookup<Key extends string>(columns: ColumnSpec<Key>[]): Map<string, Key> {
  const lookup = new Map<string, Key>()
  for (const column of columns) {
    for (const spelling of [column.header.ar, column.header.en, ...(column.aliases ?? [])]) {
      lookup.set(normalizeHeader(spelling), column.key)
    }
  }
  return lookup
}

const PRODUCT_HEADERS = headerLookup(PRODUCT_COLUMNS)
const VARIANT_HEADERS = headerLookup(VARIANT_COLUMNS)
const COMPONENT_HEADERS = headerLookup(COMPONENT_COLUMNS)

function labelLookup<Code extends string>(labels: Record<Code, Bilingual>): Map<string, Code> {
  const lookup = new Map<string, Code>()
  for (const [code, label] of Object.entries(labels) as Array<[Code, Bilingual]>) {
    lookup.set(code.toLowerCase(), code)
    lookup.set(label.ar.toLowerCase(), code)
    lookup.set(label.en.toLowerCase(), code)
  }
  return lookup
}

const TYPE_BY_LABEL = labelLookup(TYPE_LABELS)
const STATUS_BY_LABEL = labelLookup(STATUS_LABELS)

// A dropdown label ("منتج متغير") back to its code ("variable"); anything unrecognised passes
// through unchanged so the backend reports it by what the merchant actually typed.
function toCode(lookup: Map<string, string>, value: string | null): string | null {
  if (!value) return null
  return lookup.get(value.trim().toLowerCase()) ?? value
}

function cellText(value: CellValue): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    if ("richText" in value)
      return (
        value.richText
          .map((part) => part.text)
          .join("")
          .trim() || null
      )
    if ("result" in value) return cellText((value.result ?? null) as CellValue)
    if ("text" in value) return String(value.text).trim() || null
  }
  return null
}

// Reads a sheet's rows by header name rather than column position, so a file whose columns were
// reordered -- or that lacks optional ones -- still imports correctly.
function rowsFromTable<Key extends string>(
  table: Array<{ rowNumber: number; values: Array<string | null> }>,
  headers: Map<string, Key>
): RawRow[] {
  const [head, ...body] = table
  if (!head) return []
  const keys = head.values.map((value) => (value ? headers.get(normalizeHeader(value)) : undefined))
  return body
    .map(({ rowNumber, values }) => {
      const cells: Record<string, string | null> = {}
      keys.forEach((key, index) => {
        if (key) cells[key] = values[index] ?? null
      })
      return { rowNumber, cells }
    })
    .filter((row) => Object.values(row.cells).some((value) => value))
}

function sheetTable(sheet: Worksheet) {
  const table: Array<{ rowNumber: number; values: Array<string | null> }> = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: Array<string | null> = []
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(cellText(row.getCell(column).value))
    }
    table.push({ rowNumber, values })
  })
  return table
}

// Which sheet is which is told by its headers, not its name or position, so a renamed or
// reordered sheet still reads.
function sheetMatches(
  table: Array<{ values: Array<string | null> }>,
  headers: Map<string, string>,
  required: string
): boolean {
  const head = table[0]?.values ?? []
  return head.some((value) => value !== null && headers.get(normalizeHeader(value)) === required)
}

function linkKey(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase()
  return key ? key : null
}

function assemble(
  products: RawRow[],
  variants: RawRow[],
  components: RawRow[]
): ParsedProductsFile {
  const rows: BulkImportProductRow[] = products.map(({ rowNumber, cells }) => ({
    name: cells.name ?? "",
    sku: cells.sku ?? null,
    category: cells.category ?? null,
    productType: toCode(TYPE_BY_LABEL, cells.type ?? null),
    status: toCode(STATUS_BY_LABEL, cells.status ?? null),
    costPrice: cells.costPrice ?? null,
    sellPrice: cells.sellPrice ?? null,
    stockQuantity: cells.stock ?? null,
    minStock: cells.minStock ?? null,
    baseUnit: cells.unit ?? null,
    description: cells.description ?? null,
    ref: cells.ref ?? null,
    options: cells.options ?? null,
    variants: [],
    components: [],
    sourceRow: rowNumber,
  }))

  // A variants / components row finds its product by code, then SKU, then name -- the order the
  // instructions sheet promises.
  const byKey = new Map<string, BulkImportProductRow>()
  for (const field of ["name", "sku", "ref"] as const) {
    for (const row of rows) {
      const key = linkKey(row[field])
      if (key) byKey.set(key, row)
    }
  }

  const orphans: OrphanRow[] = []

  for (const { rowNumber, cells } of variants) {
    const product = byKey.get(linkKey(cells.ref) ?? "")
    if (!product) {
      orphans.push({ sheet: "variants", row: rowNumber, ref: cells.ref ?? "" })
      continue
    }
    const variant: BulkImportVariantRow = {
      options: Array.from({ length: VARIANT_OPTION_SLOTS }, (_, index) => ({
        name: cells[`option${index + 1}`] ?? "",
        value: cells[`value${index + 1}`] ?? "",
      })).filter((pair) => pair.name && pair.value),
      sku: cells.sku ?? null,
      price: cells.price ?? null,
      stock: cells.stock ?? null,
    }
    product.variants.push(variant)
  }

  for (const { rowNumber, cells } of components) {
    const product = byKey.get(linkKey(cells.ref) ?? "")
    if (!product || !cells.component) {
      orphans.push({ sheet: "components", row: rowNumber, ref: cells.ref ?? "" })
      continue
    }
    const component: BulkImportComponentRow = {
      component: cells.component,
      quantity: cells.quantity ?? null,
      unit: cells.unit ?? null,
      conversionFactor: cells.factor ?? null,
    }
    product.components.push(component)
  }

  return { rows, orphans }
}

// A small RFC4180-ish parser -- handles quoted fields (so a name containing a comma still reads
// as one cell) without pulling in a CSV library.
function parseCsvTable(text: string) {
  const table: Array<{ rowNumber: number; values: Array<string | null> }> = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let line = 1
  let rowStart = 1

  const pushRow = () => {
    row.push(field)
    if (row.some((cell) => cell.trim() !== "")) {
      table.push({ rowNumber: rowStart, values: row.map((cell) => cell.trim() || null) })
    }
    row = []
    field = ""
    rowStart = line
  }

  const source = text.replace(/^﻿/, "")
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        if (char === "\n") line += 1
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1
      line += 1
      pushRow()
    } else {
      field += char
    }
  }
  if (field !== "" || row.length > 0) pushRow()

  return table
}

export async function parseProductsFile(file: {
  name: string
  arrayBuffer: () => Promise<ArrayBuffer>
}): Promise<ParsedProductsFile> {
  const buffer = await file.arrayBuffer()

  if (file.name.toLowerCase().endsWith(".csv")) {
    const table = parseCsvTable(new TextDecoder("utf-8").decode(buffer))
    return assemble(rowsFromTable(table, PRODUCT_HEADERS), [], [])
  }

  const ExcelJS = await loadExcel()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  let products: RawRow[] = []
  let variants: RawRow[] = []
  let components: RawRow[] = []
  for (const sheet of workbook.worksheets) {
    const table = sheetTable(sheet)
    // Components first: its "رمز الحزمة" sheet has no name column, but the products sheet is the
    // only one with a name column, so the checks never overlap.
    if (sheetMatches(table, COMPONENT_HEADERS, "component")) {
      components = rowsFromTable(table, COMPONENT_HEADERS)
    } else if (sheetMatches(table, VARIANT_HEADERS, "option1")) {
      variants = rowsFromTable(table, VARIANT_HEADERS)
    } else if (sheetMatches(table, PRODUCT_HEADERS, "name")) {
      products = rowsFromTable(table, PRODUCT_HEADERS)
    }
  }

  return assemble(products, variants, components)
}
