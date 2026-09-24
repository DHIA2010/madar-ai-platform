"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Barcode,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  CircleCheckBig,
  Clock,
  FileText,
  GitBranch,
  GripVertical,
  ImageIcon,
  Info,
  Layers,
  Loader2,
  Package,
  Pencil,
  Percent,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { cairo } from "@/components/design/fonts"
import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import {
  productListService,
  type CreateProductInput,
  type ProductDetail,
  type ProductRecord,
} from "@/features/products/services/product-list.service"
import { taxRatesService, type TaxRate } from "@/features/pos/services/tax-rates.service"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { AppSearchableSelect, type AppSearchableSelectOption } from "@/components/app"

import { PRODUCT_TYPES, type ProductTypeKey, TYPES_WITHOUT_SKU } from "./product-types"
import { DateField } from "./date-field"
import {
  BASE_UNIT_OPTIONS,
  CATEGORY_ICON,
  CATEGORY_TINT,
  COMPONENT_FALLBACK_ICON,
  COMPONENT_FALLBACK_TINT,
  COMPONENT_UNIT_OPTIONS,
  DELIVERY_METHOD_OPTIONS,
  LOCATION_ICON,
  LOCATION_TINT,
  PRICING_TYPE_OPTIONS,
  PRODUCT_LANGUAGE_OPTIONS,
  SERVICE_DURATION_UNIT_OPTIONS,
} from "./select-options"

const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"
const HINT = "mt-1.5 text-[10.5px]"

const NOTES_LIMIT = 500
const STOCK_NOTES_LIMIT = 200
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_GENERATED_VARIANTS = 100

// Each unit reduces to a base dimension so a recipe measured in جرام can be checked against
// stock counted in كجم. Units in different dimensions never convert by formula, which is what
// makes an item-specific pairing (حبة against كجم) ask for a factor instead of guessing.
const UNIT_BASE = {
  حبة: { dimension: "count", factor: 1 },
  // A carton sits in its own dimension rather than in "count" with a factor, because unlike a
  // kilo (always 1000 grams) a carton has no universal size -- 12 bottles of water, 6 of oil,
  // 24 juices. Its size is a property of the product, so it is asked for per product (the
  // packaging field below) or per recipe row (the component table's conversion factor), and can
  // never be assumed by formula.
  كرتون: { dimension: "pack", factor: 1 },
  جرام: { dimension: "mass", factor: 1 },
  كجم: { dimension: "mass", factor: 1000 },
  مل: { dimension: "volume", factor: 1 },
  لتر: { dimension: "volume", factor: 1000 },
} as const satisfies Record<
  string,
  { dimension: "count" | "pack" | "mass" | "volume"; factor: number }
>

// The unit vocabulary is UNIT_BASE's own keys, so there is exactly one place a unit is declared.
type Unit = keyof typeof UNIT_BASE

function convertUnits(quantity: number, from: Unit, to: Unit) {
  const source = UNIT_BASE[from]
  const target = UNIT_BASE[to]
  if (source.dimension !== target.dimension) return null
  return (quantity * source.factor) / target.factor
}

function isUnit(value: string): value is Unit {
  return value in UNIT_BASE
}

// A raw material's own baseUnit ("حبة (PCS)", "كجم (KG)", ...) is the same vocabulary as a
// component row's units, just with the English abbreviation kept on for the product form's own
// display (see baseUnitShort below) -- the bare word before the space is the Unit value itself.
function unitFromBaseUnit(baseUnit: string | null | undefined): Unit | null {
  const short = baseUnit?.split(" ")[0]
  return short && isUnit(short) ? short : null
}

// A component is normally a product picked from inventory. CUSTOM_COMPONENT lets a recipe name
// one that is not in the catalogue yet, so a bundle can be defined before its raw materials
// exist -- that row carries its own name and stock figure instead.
const CUSTOM_COMPONENT = "__custom__"

interface ComponentRow {
  id: string
  productId: string
  customName: string
  customStock: string
  requiredUnit: Unit
  requiredQuantity: string
  stockUnit: Unit
  // How many stock units make one recipe unit, for pairs no formula can bridge.
  conversionFactor: string
  note: string
}

interface VariantOption {
  id: string
  name: string
  values: string[]
  draft: string
}

interface VariantOverride {
  sku: string
  price: string
  stock: string
}

interface ImageDraft {
  id: string
  name: string
  previewUrl: string
  // Present only for a freshly picked local file awaiting upload -- previewUrl is a blob: URL
  // in that case. An image hydrated from an existing product has no file: previewUrl is already
  // the real hosted URL, and nothing needs uploading again on save.
  file: File | null
}

function emptyComponent(): ComponentRow {
  return {
    id: crypto.randomUUID(),
    productId: "",
    customName: "",
    customStock: "",
    requiredUnit: "جرام",
    requiredQuantity: "",
    stockUnit: "كجم",
    conversionFactor: "",
    note: "",
  }
}

function emptyOption(): VariantOption {
  return { id: crypto.randomUUID(), name: "", values: [], draft: "" }
}

// Generated SKUs are dated so they sort sensibly and carry a short random tail. The alphabet
// omits I, O, 0 and 1 so a code read off a label cannot be mistyped.
function generateSku(taken: ReadonlySet<string>) {
  const stamp = new Date()
  const datePart = [
    String(stamp.getFullYear()).slice(2),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
  ].join("")

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const tail = Array.from({ length: attempt < 40 ? 4 : 6 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
    ).join("")
    const candidate = `SKU-${datePart}-${tail}`
    if (!taken.has(candidate)) return candidate
  }

  return `SKU-${datePart}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

// Settings -> الضرائب -> "الأسعار تشمل الضريبة" -> "الاختيار يدوي أثناء إضافة المنتج" replaces
// this form's read-only hint with this actual dropdown.
const PRICE_TAX_MODE_OPTIONS: AppSearchableSelectOption[] = [
  { value: "excluded", label: "السعر غير شامل الضريبة" },
  { value: "included", label: "السعر شامل الضريبة" },
]

const NUMBER_AR = new Intl.NumberFormat("ar-SA-u-nu-latn")
const MONEY_AR = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const DATE_AR = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

export default function AddProduct() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Lets a component row's edit action open that row's picker.
  const componentTriggers = useRef<Record<string, HTMLButtonElement | null>>({})
  // A manually-named row has an input instead of a picker; the edit action targets whichever
  // of the two that row actually rendered.
  const componentNameInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const { currentUser } = useAuth()
  const { currentOrganization } = useWorkspace()
  const router = useRouter()
  // The same form serves both jobs: with ?id= it loads that product and saves over it, without
  // it creates a new one. Duplicating this page for editing would mean maintaining seven
  // type-specific layouts twice.
  const editingId = useSearchParams().get("id")
  const isEditing = editingId !== null

  // The ordinary product is the common case and the first card in the row, so the page opens on
  // it rather than on a bundle.
  const [productType, setProductType] = useState<ProductTypeKey>("simple")

  // Shared identity
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  // Null means "use the organization's default rate" (Settings -> الضرائب). "" is this field's
  // own not-yet-chosen state on screen -- AppSearchableSelect has no concept of a null value, so
  // it is translated to/from null only where the payload is built and where an existing product
  // is loaded (see buildPayload and the load effect below).
  const [taxRateId, setTaxRateId] = useState("")
  // Settings -> الضرائب -> "الأسعار تشمل الضريبة" has three modes: a fixed org-wide default (no
  // picker here -- a brand-new product just follows it, see the effect below), or "manual"
  // (taxPriceEntryMode === "manual"), which shows the dropdown below instead so a merchant who
  // genuinely sells some products gross and some net can decide per product. An existing product
  // being edited keeps its own value regardless of what the organization default is now, since
  // switching the org-wide setting for "new products only" is explicitly meant to leave
  // already-created products alone.
  const [priceIncludesTax, setPriceIncludesTax] = useState(false)
  const isManualTaxMode = currentOrganization?.settings.taxPriceEntryMode === "manual"
  // Shown right under every price field when not in manual mode -- the only place a merchant sees
  // which convention the typed number will actually be saved under.
  const priceTaxHint = priceIncludesTax ? "السعر شامل الضريبة" : "السعر غير شامل الضريبة"
  useEffect(() => {
    if (isEditing) return
    setPriceIncludesTax(currentOrganization?.settings.taxPricesIncludeTax ?? false)
  }, [isEditing, currentOrganization])
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  useEffect(() => {
    taxRatesService
      .list()
      .then(setTaxRates)
      .catch(() => setTaxRates([]))
  }, [])
  const [published, setPublished] = useState(true)
  const [images, setImages] = useState<ImageDraft[]>([])
  const [internalNotes, setInternalNotes] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [scrollToError, setScrollToError] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(false)

  // Stock and pricing
  const [baseUnit, setBaseUnit] = useState(BASE_UNIT_OPTIONS[0].value)
  const [stockQty, setStockQty] = useState("")
  const [minStock, setMinStock] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [sellPrice, setSellPrice] = useState("")
  const [supplier, setSupplier] = useState("")
  const [stockNotes, setStockNotes] = useState("")
  const [stockLocation, setStockLocation] = useState("")
  // How many base units make one carton, for this product. Empty until the author says.
  const [unitsPerCarton, setUnitsPerCarton] = useState("")
  // The piece-measured product a carton packages.
  const [linkedUnitProductId, setLinkedUnitProductId] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [barcode, setBarcode] = useState("")
  const [countryOfOrigin, setCountryOfOrigin] = useState("")
  const [minPurchase, setMinPurchase] = useState("")

  // Service
  const [pricingType, setPricingType] = useState(PRICING_TYPE_OPTIONS[0].value)
  const [serviceDuration, setServiceDuration] = useState("")
  const [serviceDurationUnit, setServiceDurationUnit] = useState(
    SERVICE_DURATION_UNIT_OPTIONS[1].value
  )
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHOD_OPTIONS[0].value)
  const [bookingEnabled, setBookingEnabled] = useState(false)

  // Digital
  const [offerPrice, setOfferPrice] = useState("")
  const [systemRequirements, setSystemRequirements] = useState("")
  const [productLanguage, setProductLanguage] = useState(PRODUCT_LANGUAGE_OPTIONS[0].value)

  // Bundle
  const [components, setComponents] = useState<ComponentRow[]>([emptyComponent()])

  // Variants
  const [options, setOptions] = useState<VariantOption[]>([emptyOption()])
  const [variantOverrides, setVariantOverrides] = useState<Record<string, VariantOverride>>({})
  const [excludedVariants, setExcludedVariants] = useState<ReadonlySet<string>>(new Set())
  const [selectedVariants, setSelectedVariants] = useState<ReadonlySet<string>>(new Set())
  const [bulkPrice, setBulkPrice] = useState("")
  const [bulkStock, setBulkStock] = useState("")
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [extraOpen, setExtraOpen] = useState(true)

  const [catalogue, setCatalogue] = useState<ProductRecord[]>([])
  const [catalogueLoaded, setCatalogueLoaded] = useState(false)

  // Every ProductTypeKey has an entry, so the fallback is unreachable -- it exists only to keep
  // the type non-optional. It is written as the first entry rather than a positional index, so
  // reordering PRODUCT_TYPES cannot quietly change which type a lookup miss lands on.
  const type = PRODUCT_TYPES.find((entry) => entry.key === productType) ?? PRODUCT_TYPES[0]
  const isBundle = productType === "bundle"
  const isVariable = productType === "variable"
  const isService = productType === "service"
  const showsSku = !TYPES_WITHOUT_SKU.includes(productType)

  // The catalogue backs both the category list and the bundle's component picker. A product
  // record carries no type, so "only مادة خام is selectable" cannot be enforced here.
  useEffect(() => {
    let cancelled = false

    productListService
      .listProducts()
      .then((products) => {
        if (cancelled) return
        setCatalogue(products)
        setCatalogueLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setCatalogueLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      images.forEach((image) => {
        if (image.file) URL.revokeObjectURL(image.previewUrl)
      })
    }
  }, [images])

  useEffect(() => {
    if (scrollToError === 0) return

    const target = document.querySelector<HTMLElement>("[data-field-error='true']")
    if (!target) return

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.querySelector<HTMLElement>("input, textarea, [role='combobox']")?.focus({
      preventScroll: true,
    })
  }, [scrollToError])

  // A long form with no create API behind it is exactly where an accidental refresh hurts most.
  // Client-side navigation is not covered -- only the browser can be asked to confirm here.
  useEffect(() => {
    const dirty = name.trim() !== "" || description.trim() !== "" || images.length > 0
    if (!dirty) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [name, description, images.length])

  // Hydrates the whole form from a stored product. Numbers become strings because every input
  // on this page is a controlled text field -- and null must become "" rather than "null".
  useEffect(() => {
    if (!editingId) return
    let cancelled = false

    const asText = (value: number | null | undefined) =>
      value === null || value === undefined ? "" : String(value)

    setLoadingProduct(true)
    productListService
      .getProduct(editingId)
      .then((product: ProductDetail) => {
        if (cancelled) return

        setProductType(product.productType)
        setName(product.name)
        setSku(product.sku ?? "")
        setCategory(product.category)
        setTaxRateId(product.taxRateId ?? "")
        setPriceIncludesTax(product.priceIncludesTax)
        setDescription(product.description)
        setPublished(product.status === "active")
        setBaseUnit(product.baseUnit || BASE_UNIT_OPTIONS[0].value)
        setSellPrice(asText(product.sellPrice))
        setCostPrice(asText(product.costPrice))
        setStockQty(asText(product.stockQuantity))
        setMinStock(asText(product.minStock))

        const attributes = (product.attributes ?? {}) as Record<string, unknown>
        const text = (key: string) => (attributes[key] == null ? "" : String(attributes[key]))
        setUnitsPerCarton(text("unitsPerCarton"))
        setLinkedUnitProductId(text("linkedUnitProductId"))
        setSupplier(text("supplier"))
        setStockNotes(text("stockNotes"))
        setStockLocation(text("stockLocation"))
        setBatchNumber(text("batchNumber"))
        setBrand(text("brand"))
        setModel(text("model"))
        setBarcode(text("barcode"))
        setCountryOfOrigin(text("countryOfOrigin"))
        setMinPurchase(text("minPurchase"))
        setInternalNotes(text("internalNotes"))
        setExpiryDate(text("expiryDate"))
        setOfferPrice(text("offerPrice"))
        setSystemRequirements(text("systemRequirements"))
        if (attributes.pricingType) setPricingType(String(attributes.pricingType))
        if (attributes.serviceDurationUnit)
          setServiceDurationUnit(String(attributes.serviceDurationUnit))
        if (attributes.deliveryMethod) setDeliveryMethod(String(attributes.deliveryMethod))
        if (attributes.productLanguage) setProductLanguage(String(attributes.productLanguage))
        setBookingEnabled(attributes.bookingEnabled === true)
        // One field backs both, so whichever the stored type uses is the one to restore.
        setServiceDuration(
          text(product.productType === "bundle" ? "preparationMinutes" : "serviceDuration")
        )

        if (product.components.length > 0) {
          setComponents(
            product.components.map((component) => ({
              id: crypto.randomUUID(),
              productId: component.componentRef ?? CUSTOM_COMPONENT,
              customName: component.customName ?? "",
              customStock: asText(component.customStock),
              requiredUnit: component.requiredUnit as Unit,
              requiredQuantity: asText(component.requiredQuantity),
              stockUnit: component.stockUnit as Unit,
              conversionFactor: asText(component.conversionFactor),
              note: component.note ?? "",
            }))
          )
        }

        if (product.variantOptions.length > 0) {
          setOptions(
            product.variantOptions.map((option) => ({
              id: crypto.randomUUID(),
              name: option.name,
              values: option.values,
              draft: "",
            }))
          )
          setOptionsOpen(true)
        }

        if (product.variants.length > 0) {
          setVariantOverrides(
            Object.fromEntries(
              product.variants.map((variant) => [
                variant.optionValues.join(" / "),
                {
                  sku: variant.sku ?? "",
                  price: asText(variant.price),
                  stock: asText(variant.stock),
                },
              ])
            )
          )
        }

        if (product.imageUrls.length > 0) {
          setImages(
            product.imageUrls.map((url) => ({
              id: crypto.randomUUID(),
              name: url.split("/").pop() ?? url,
              previewUrl: url,
              file: null,
            }))
          )
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("تعذر تحميل المنتج للتعديل.")
      })
      .finally(() => {
        if (cancelled) return
        setLoadingProduct(false)
      })

    return () => {
      cancelled = true
    }
  }, [editingId])

  const knownCategories = useMemo(
    () => [...new Set(catalogue.map((product) => product.category).filter(Boolean))].sort(),
    [catalogue]
  )
  const knownSkus = useMemo(
    () => new Set(catalogue.map((product) => product.sku).filter(Boolean)),
    [catalogue]
  )
  const productById = useMemo(
    () => new Map(catalogue.map((product) => [product.id, product])),
    [catalogue]
  )

  // The list is the set of categories other products already use. A category the author has
  // just typed is not among them yet -- it only becomes "known" once a product carrying it is
  // saved -- so it is added here, otherwise the trigger would fall back to the placeholder and
  // the choice would look lost.
  const categoryOptions = useMemo<AppSearchableSelectOption[]>(() => {
    const names =
      knownCategories.includes(category) || category.trim() === ""
        ? knownCategories
        : [category, ...knownCategories]

    return names.map((option) => ({
      value: option,
      label: option,
      icon: CATEGORY_ICON,
      tint: CATEGORY_TINT,
    }))
  }, [knownCategories, category])

  // "" (never a real tax_rates id) stands for "use the organization's default rate" -- always
  // first, and never absent even if the organization has somehow ended up with no rates at all.
  const taxRateOptions = useMemo<AppSearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: "استخدام المعدل الافتراضي",
        icon: Percent,
        tint: "bg-[#eef4ff] text-[#2878ff]",
      },
      ...taxRates.map((rate) => ({
        value: rate.id,
        label: `${rate.name} (${rate.ratePercent}%)`,
        icon: Percent,
        tint: "bg-[#f3eeff] text-[#8b5cf6]",
      })),
    ],
    [taxRates]
  )

  // A bundle is assembled from raw materials, so the picker offers those alone rather than the
  // whole catalogue. Products synced from a storefront carry no type at all (productType is
  // null for them), and a finished storefront product is not a raw material anyway, so they are
  // excluded too -- which is also what stops the list being the wall of near-duplicate finished
  // goods it used to be.
  const rawMaterials = useMemo(
    () => catalogue.filter((product) => product.productType === "raw"),
    [catalogue]
  )

  // Candidates a carton can package: products this organisation authored that are counted in
  // pieces. A synced storefront product carries no unit, so it cannot be linked -- there is
  // nothing to say how many of it a carton holds.
  const pieceProductOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      catalogue
        .filter(
          (product) => product.platform === "Madar" && (product.baseUnit ?? "").startsWith("حبة")
        )
        .map((product) => ({
          value: product.id,
          label: product.name,
          hint: [`${NUMBER_AR.format(product.availableStock)} حبة في المخزون`, product.sku || null]
            .filter(Boolean)
            .join(" · "),
          imageUrl: product.image,
          icon: COMPONENT_FALLBACK_ICON,
          tint: COMPONENT_FALLBACK_TINT,
          keywords: `${product.sku} ${product.category}`,
        })),
    [catalogue]
  )

  const linkedUnitProduct = catalogue.find((product) => product.id === linkedUnitProductId) ?? null

  const componentOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      rawMaterials.map((product) => ({
        value: product.id,
        label: product.name,
        // Two raw materials can share a name, so the stock figure and category are what tell
        // them apart in the list.
        hint: [
          `${NUMBER_AR.format(product.availableStock)} في المخزون`,
          product.category || null,
          product.sku || null,
        ]
          .filter(Boolean)
          .join(" · "),
        imageUrl: product.image,
        icon: COMPONENT_FALLBACK_ICON,
        tint: COMPONENT_FALLBACK_TINT,
        keywords: `${product.sku} ${product.category}`,
      })),
    [rawMaterials]
  )

  /* ---------------------------------------------------------------- bundle */

  const resolvedComponents = useMemo(() => {
    return components.map((row) => {
      const isCustom = row.productId === CUSTOM_COMPONENT
      const product = isCustom ? null : (productById.get(row.productId) ?? null)

      const label = isCustom ? row.customName.trim() : (product?.name ?? "")
      const stock = isCustom
        ? row.customStock.trim() === "" || Number.isNaN(Number(row.customStock))
          ? null
          : Number(row.customStock)
        : (product?.availableStock ?? null)

      const required = Number(row.requiredQuantity)
      const hasRequired = row.requiredQuantity.trim() !== "" && required > 0
      const hasSource = label !== "" && stock !== null

      const sameDimension =
        UNIT_BASE[row.stockUnit].dimension === UNIT_BASE[row.requiredUnit].dimension
      const factor = Number(row.conversionFactor)
      const hasFactor = row.conversionFactor.trim() !== "" && factor > 0

      const stockInRequiredUnit =
        stock === null
          ? null
          : sameDimension
            ? convertUnits(stock, row.stockUnit, row.requiredUnit)
            : hasFactor
              ? stock / factor
              : null

      return {
        row,
        isCustom,
        product,
        label,
        stock,
        required: hasRequired ? required : null,
        needsConversion: !sameDimension,
        incompatibleUnits: hasSource && hasRequired && !sameDimension && !hasFactor,
        producible:
          hasSource && hasRequired && stockInRequiredUnit !== null
            ? Math.floor(stockInRequiredUnit / required)
            : null,
      }
    })
  }, [components, productById])

  const completeComponents = resolvedComponents.filter((entry) => entry.producible !== null)

  // The bundle can only be produced as many times as its scarcest component allows.
  const limiting = completeComponents.reduce<(typeof completeComponents)[number] | null>(
    (lowest, entry) =>
      lowest === null || (entry.producible ?? 0) < (lowest.producible ?? 0) ? entry : lowest,
    null
  )
  const availableProduction = limiting?.producible ?? null

  const updateComponent = (id: string, patch: Partial<ComponentRow>) =>
    setComponents((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  /* -------------------------------------------------------------- variants */

  const filledOptions = options.filter(
    (option) => option.name.trim() !== "" && option.values.length > 0
  )

  // Every combination of the option values, in the order the options were added. The cap is a
  // guard against a combinatorial blow-up (4 options x 6 values is already 1296 rows); when it
  // bites, the table says so rather than quietly dropping combinations.
  const { generatedVariants, variantsTruncated } = useMemo(() => {
    if (filledOptions.length === 0) return { generatedVariants: [], variantsTruncated: false }

    const total = filledOptions.reduce((count, option) => count * option.values.length, 1)

    let combinations: string[][] = [[]]
    for (const option of filledOptions) {
      const next: string[][] = []
      for (const combination of combinations) {
        for (const value of option.values) {
          if (next.length >= MAX_GENERATED_VARIANTS) break
          next.push([...combination, value])
        }
      }
      combinations = next
    }

    return {
      generatedVariants: combinations.map((values) => ({ key: values.join(" / "), values })),
      variantsTruncated: total > MAX_GENERATED_VARIANTS,
    }
  }, [filledOptions])

  // Not every combination is real -- a size may not come in every colour -- so a row can be
  // excluded without deleting the option value that produced it.
  const activeVariants = generatedVariants.filter((variant) => !excludedVariants.has(variant.key))
  const excludedCount = generatedVariants.length - activeVariants.length

  const variantOverride = (key: string): VariantOverride =>
    variantOverrides[key] ?? { sku: "", price: "", stock: "" }

  const updateVariant = (key: string, patch: Partial<VariantOverride>) =>
    setVariantOverrides((current) => ({
      ...current,
      [key]: { ...variantOverride(key), ...patch },
    }))

  const toggleVariantSelection = (key: string) =>
    setSelectedVariants((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  // Fills price and quantity across many rows at once -- pricing 24 variants one cell at a time
  // is the most tedious part of this form. Scope is the selection when there is one, otherwise
  // every row in the table, so a full sheet does not require ticking every box first.
  //
  // Applied on an explicit press rather than as the field is typed: writing on each keystroke
  // put 1, then 12, then 120 into every row, and made an intermediate value impossible to undo.
  const applyBulkValues = () => {
    const patch: Partial<VariantOverride> = {}
    if (bulkPrice.trim() !== "") patch.price = bulkPrice.trim()
    if (bulkStock.trim() !== "") patch.stock = bulkStock.trim()

    if (Object.keys(patch).length === 0) {
      toast.error("أدخل سعراً أو كمية لتطبيقها.")
      return
    }

    const targets =
      selectedVariants.size > 0
        ? [...selectedVariants]
        : activeVariants.map((variant) => variant.key)

    if (targets.length === 0) return

    setVariantOverrides((current) => {
      const next = { ...current }
      targets.forEach((key) => {
        next[key] = { ...(next[key] ?? { sku: "", price: "", stock: "" }), ...patch }
      })
      return next
    })

    setBulkPrice("")
    setBulkStock("")
    toast.success(`تم التطبيق على ${NUMBER_AR.format(targets.length)} متغير.`)
  }

  const excludeVariants = (keys: Iterable<string>) => {
    setExcludedVariants((current) => {
      const next = new Set(current)
      for (const key of keys) next.add(key)
      return next
    })
    setSelectedVariants(new Set())
  }

  // Derives every variant SKU from the base code plus a short tag per value, so the codes stay
  // readable and tied to the parent product. Arabic values carry no ASCII letters to abbreviate,
  // and a SKU with Arabic in it breaks barcodes and most CSV imports -- those fall back to the
  // value's position in its own option, which stays unique and printable.
  const generateVariantSkus = () => {
    const base = sku.trim() || generateSku(knownSkus)
    if (!sku.trim()) setSku(base)

    setVariantOverrides((current) => {
      const next = { ...current }
      generatedVariants.forEach((variant) => {
        const suffix = variant.values
          .map((value, index) => {
            const ascii = value
              .replace(/[^a-zA-Z0-9]/g, "")
              .slice(0, 3)
              .toUpperCase()
            if (ascii) return ascii
            const position = filledOptions[index]?.values.indexOf(value) ?? 0
            return `V${position + 1}`
          })
          .join("-")
        next[variant.key] = { ...variantOverride(variant.key), sku: `${base}-${suffix}` }
      })
      return next
    })
  }

  /* ----------------------------------------------------------------- images */

  const addImages = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const accepted: ImageDraft[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: صيغة غير مدعومة. المسموح PNG أو JPG أو WebP.`)
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: الحجم يتجاوز 10MB.`)
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        file,
      })
    }

    if (accepted.length > 0) setImages((current) => [...current, ...accepted])
  }

  const removeImage = (id: string) =>
    setImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target?.file) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })

  /* -------------------------------------------------------------- validation */

  const errors = {
    name: name.trim() ? null : `${type.nameLabel} مطلوب`,
    category: category.trim() ? null : "الفئة مطلوبة",
    sku: !showsSku || sku.trim() ? null : `${type.skuLabel} مطلوب`,
    description: productType !== "digital" || description.trim() ? null : "وصف المنتج مطلوب",
    components:
      !isBundle || completeComponents.length > 0
        ? null
        : "أضف مكوناً واحداً على الأقل مع الكمية المطلوبة",
    options: !isVariable || filledOptions.length > 0 ? null : "أضف خياراً واحداً على الأقل بقيمه",
    // A variable product carries no price of its own -- each variant is priced in the table
    // below -- so requiring the (non-existent) سعر البيع field here made every variable product
    // unsavable with no field to point the user at.
    variantPrices:
      !isVariable ||
      (activeVariants.length > 0 &&
        activeVariants.every((variant) => variantOverride(variant.key).price.trim() !== ""))
        ? null
        : "حدد سعراً لكل متغير قبل الحفظ",
    price:
      productType === "raw" || isVariable || isService || sellPrice.trim() !== ""
        ? null
        : "السعر مطلوب",
    servicePrice: !isService || sellPrice.trim() !== "" ? null : "السعر مطلوب",
    stock:
      ["simple", "raw", "weighted"].includes(productType) && stockQty.trim() === ""
        ? "الكمية الحالية في المخزون مطلوبة"
        : null,
    // A carton with nothing to package is not a sellable thing -- selling one has to deduct
    // from some piece-measured product's stock.
    linkedUnitProduct:
      baseUnit.startsWith("كرتون") && linkedUnitProductId === ""
        ? "اختر المنتج المرتبط المباع بالحبة"
        : null,
  }
  const isValid = Object.values(errors).every((error) => error === null)

  // Optional numbers are sent as null rather than 0: an untouched cost field means "not stated",
  // which is a different fact from "costs nothing".
  const optionalNumber = (raw: string): number | null => {
    if (raw.trim() === "") return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  const buildPayload = (asDraft: boolean, imageUrls: string[]): CreateProductInput => ({
    productType,
    name: name.trim(),
    // The server drops this for the types that carry no stock code, but sending null keeps the
    // request honest about what was actually entered.
    sku: showsSku ? sku.trim() || null : null,
    category: category.trim(),
    description: description.trim(),
    status: asDraft ? "draft" : published ? "active" : "draft",
    taxRateId: taxRateId || null,
    priceIncludesTax,
    baseUnit: baseUnit || null,
    sellPrice: optionalNumber(sellPrice),
    costPrice: optionalNumber(costPrice),
    stockQuantity: optionalNumber(stockQty),
    minStock: optionalNumber(minStock),
    imageUrls,
    attributes: {
      unitsPerCarton: packagingApplies ? optionalNumber(unitsPerCarton) : null,
      linkedUnitProductId: packagingApplies ? linkedUnitProductId || null : null,
      supplier: supplier.trim() || null,
      stockNotes: stockNotes.trim() || null,
      stockLocation: stockLocation.trim() || null,
      batchNumber: batchNumber.trim() || null,
      brand: brand.trim() || null,
      model: model.trim() || null,
      barcode: barcode.trim() || null,
      countryOfOrigin: countryOfOrigin.trim() || null,
      minPurchase: optionalNumber(minPurchase),
      internalNotes: internalNotes.trim() || null,
      expiryDate: expiryDate || null,
      pricingType: isService ? pricingType : null,
      serviceDuration: optionalNumber(serviceDuration),
      serviceDurationUnit: isService ? serviceDurationUnit : null,
      deliveryMethod: isService ? deliveryMethod : null,
      bookingEnabled: isService ? bookingEnabled : null,
      offerPrice: optionalNumber(offerPrice),
      systemRequirements: systemRequirements.trim() || null,
      productLanguage: productType === "digital" ? productLanguage : null,
      preparationMinutes: isBundle ? optionalNumber(serviceDuration) : null,
    },
    components: isBundle
      ? resolvedComponents
          .filter((entry) => entry.label !== "" && entry.required !== null)
          .map((entry) => ({
            componentRef: entry.isCustom ? null : entry.row.productId || null,
            customName: entry.isCustom ? entry.row.customName.trim() : null,
            customStock: entry.isCustom ? optionalNumber(entry.row.customStock) : null,
            requiredQuantity: Number(entry.row.requiredQuantity),
            requiredUnit: entry.row.requiredUnit,
            stockUnit: entry.row.stockUnit,
            conversionFactor: optionalNumber(entry.row.conversionFactor),
            note: entry.row.note.trim() || null,
          }))
      : [],
    variantOptions: isVariable
      ? filledOptions.map((option) => ({ name: option.name.trim(), values: option.values }))
      : [],
    variants: isVariable
      ? activeVariants.map((variant) => {
          const override = variantOverride(variant.key)
          return {
            sku: override.sku.trim() || null,
            price: optionalNumber(override.price),
            stock: optionalNumber(override.stock),
            optionValues: variant.values,
          }
        })
      : [],
  })

  const cancel = () => router.push(ROUTES.products)

  // The server validates the same rules again and answers with a field map, so its verdict is
  // shown against the fields rather than as one opaque failure.
  const applyServerErrors = (details: unknown): string[] => {
    if (!details || typeof details !== "object") return []
    const fields = (details as { fields?: Record<string, string> }).fields
    if (!fields || typeof fields !== "object") return []
    return Object.entries(fields).map(([field, message]) => `${field}: ${message}`)
  }

  const submit = async (asDraft: boolean) => {
    setShowErrors(true)

    if (!asDraft && !isValid) {
      toast.error("أكمل الحقول المطلوبة قبل الحفظ.")
      // "Complete the required fields" is useless on a form this tall if the offending field is
      // three sections away, so bump a token that scrolls to the first one once it has rendered.
      setScrollToError((current) => current + 1)
      return
    }
    if (asDraft && !name.trim()) {
      toast.error(`أدخل ${type.nameLabel} لحفظه كمسودة.`)
      return
    }

    setSaving(true)

    // Uploaded first and separately from the save itself: a failure here is "couldn't upload a
    // photo", a distinct, more specific problem than "couldn't save the product".
    let imageUrls: string[]
    try {
      imageUrls = await Promise.all(
        images.map((image) =>
          image.file
            ? productListService.uploadImage(image.file)
            : Promise.resolve(image.previewUrl)
        )
      )
    } catch {
      toast.error("تعذر رفع إحدى الصور.", { description: "تحقق من الاتصال وحاول مرة أخرى." })
      setSaving(false)
      return
    }

    try {
      const payload = buildPayload(asDraft, imageUrls)
      const saved = isEditing
        ? await productListService.updateProduct(editingId, payload)
        : await productListService.createProduct(payload)

      toast.success(
        isEditing ? "تم حفظ التعديلات." : asDraft ? "تم حفظ المسودة." : `تم حفظ ${type.title}.`,
        { description: saved.sku ? `رمز المنتج: ${saved.sku}` : saved.name }
      )
      // The form is deliberately not cleared before navigating: if the push fails the work is
      // still on screen.
      router.push(ROUTES.products)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      const serverFields = error instanceof AppError ? applyServerErrors(error.details) : []

      if (status === 404) {
        toast.error("المنتج غير موجود.", { description: "ربما تم حذفه من جهاز آخر." })
      } else if (status === 409) {
        toast.error("رمز المنتج (SKU) مستخدم بالفعل.", {
          description: "غيّر الرمز أو استخدم زر التوليد التلقائي.",
        })
      } else if (status === 403) {
        toast.error(
          isEditing ? "لا تملك صلاحية تعديل المنتجات." : "لا تملك صلاحية إنشاء المنتجات.",
          {
            description: `تواصل مع مالك الحساب لمنحك صلاحية products:${isEditing ? "edit" : "create"}.`,
          }
        )
      } else if (serverFields.length > 0) {
        toast.error("تعذر حفظ المنتج — راجع الحقول التالية.", {
          description: serverFields.slice(0, 4).join(" · "),
        })
      } else {
        toast.error(isEditing ? "تعذر حفظ التعديلات." : "تعذر حفظ المنتج.", {
          description: error instanceof Error ? error.message : "حدث خطأ غير متوقع. حاول مرة أخرى.",
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const baseUnitShort = baseUnit.split(" ")[0]

  // Only a carton needs a pack size. A product already counted in pieces is the base itself --
  // asking how many pieces are in a carton would be asking about a different product.
  const packagingApplies = baseUnitShort === "كرتون"
  const perCarton = Number(unitsPerCarton)
  const hasPackaging = packagingApplies && unitsPerCarton.trim() !== "" && perCarton > 0

  // Splits a quantity into whole cartons and the pieces left over, which is how stock is read
  // on a shelf: "1 carton and 11 pieces" rather than 1.92 cartons. When the base unit is the
  // carton itself the quantity is already in cartons, so the split runs the other way.
  const packagingBreakdown = (() => {
    if (!hasPackaging) return null
    const quantity = Number(stockQty)
    if (stockQty.trim() === "" || !Number.isFinite(quantity) || quantity < 0) return null

    const pieces = baseUnitShort === "كرتون" ? quantity * perCarton : quantity
    const cartons = Math.floor(pieces / perCarton)
    const remainder = Math.round((pieces - cartons * perCarton) * 1000) / 1000

    return { pieces, cartons, remainder }
  })()

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 pb-28 pt-5")} dir="rtl">
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
          <Link href={ROUTES.products} className="transition-colors hover:text-[#2878ff]">
            المنتجات
          </Link>
          <ChevronLeft className="size-3.5 text-[#b6c2d4]" />
          <span className={cn("font-semibold", HEADING)}>
            {isEditing ? "تعديل منتج" : "إضافة منتج جديد"}
          </span>
        </nav>

        {/* RTL: the icon is written first so it lands to the right of the title. */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
            <type.icon className="size-5" />
          </span>
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {isEditing ? `تعديل ${type.title}` : type.pageTitle}
            </h1>
            <p className={cn("mt-1 text-[12.5px]", MUTED)}>{type.pageSubtitle}</p>
          </div>
        </div>

        {loadingProduct ? (
          <div className="flex items-center gap-2 rounded-[12px] border border-[#cfe0ff] bg-[#f2f7ff] px-4 py-2.5">
            <Loader2 className="size-4 animate-spin text-[#2878ff]" />
            <p className={cn("text-[12px]", HEADING)}>جارٍ تحميل بيانات المنتج...</p>
          </div>
        ) : null}

        <section className={cn(PANEL, "p-4 md:p-5")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {PRODUCT_TYPES.map((option) => {
              const isSelected = option.key === productType

              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={isSelected}
                  // The type decides which sections exist, so switching it on an existing
                  // product would silently discard its components or variants. Editing keeps
                  // the type it was saved with.
                  disabled={isEditing && !isSelected}
                  title={
                    isEditing && !isSelected
                      ? "لا يمكن تغيير نوع منتج محفوظ — أنشئ منتجاً جديداً بالنوع المطلوب"
                      : undefined
                  }
                  className={cn(
                    "rounded-[12px] border p-3.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40",
                    isSelected
                      ? "border-[#2878ff] bg-[#f7faff] shadow-[0_0_0_3px_rgba(40,120,255,0.12)]"
                      : "border-[#e1e7f0] hover:border-[#c4d5f0]",
                    isEditing && !isSelected
                      ? "cursor-not-allowed opacity-45 hover:border-[#e1e7f0]"
                      : "cursor-pointer"
                  )}
                  onClick={() => setProductType(option.key)}
                >
                  <div className="relative">
                    {isSelected ? (
                      <span className="absolute end-0 -top-1 flex size-4 items-center justify-center rounded-full bg-[#2878ff] text-white">
                        <CircleCheckBig className="size-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "mx-auto flex size-10 items-center justify-center rounded-[12px]",
                        option.tint
                      )}
                    >
                      <option.icon className="size-5" />
                    </span>
                  </div>
                  <p className={cn("mt-2.5 text-[13px] font-extrabold", HEADING)}>{option.title}</p>
                  <p className={cn("mt-1 text-[10.5px] leading-[16px]", MUTED)}>
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* RTL: the main form is written first so it lands on the right, aside on the left. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className={cn(PANEL, "p-4 md:p-5")}>
              <SectionHeading
                icon={FileText}
                title="المعلومات الأساسية"
                subtitle={
                  productType === "raw"
                    ? "أدخل تفاصيل المادة الخام"
                    : isService
                      ? "أدخل تفاصيل الخدمة الرئيسية"
                      : "أدخل تفاصيل المنتج الرئيسي"
                }
              />

              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label={type.nameLabel} required error={showErrors ? errors.name : null}>
                  <Input
                    value={name}
                    aria-label={type.nameLabel}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={type.nameLabel}
                    className={FIELD_CLASS}
                  />
                </Field>

                <Field label="الفئة" required error={showErrors ? errors.category : null}>
                  {/* Creatable: a category is just a name carried on the product, so a new one
                      is typed here and joins the list once a product using it is saved. The
                      control handles an empty catalogue on its own -- with nothing to pick
                      from, typing is the only path and the create row is the whole panel. */}
                  <AppSearchableSelect
                    value={category}
                    options={categoryOptions}
                    onChange={setCategory}
                    onCreate={setCategory}
                    createLabel={(draft) => `إضافة فئة "${draft}"`}
                    placeholder="اختر الفئة أو اكتب فئة جديدة"
                    searchPlaceholder="ابحث أو اكتب فئة جديدة..."
                    emptyLabel="لا توجد فئة مطابقة"
                    ariaLabel="الفئة"
                  />
                </Field>

                <Field label="الضريبة">
                  {/* Null (the "" option) means this product follows whatever the organization's
                      default rate is at the time of each sale -- re-read fresh every time, never
                      frozen to today's default. Only set this when the product genuinely needs
                      its own rate (e.g. an exempt or zero-rated item). */}
                  <AppSearchableSelect
                    value={taxRateId}
                    options={taxRateOptions}
                    onChange={setTaxRateId}
                    placeholder="استخدام المعدل الافتراضي"
                    ariaLabel="الضريبة"
                  />
                </Field>

                {showsSku ? (
                  <Field label={type.skuLabel} required error={showErrors ? errors.sku : null}>
                    {/* RTL: the field is written first so the generate action sits on its left. */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={sku}
                        aria-label={type.skuLabel}
                        onChange={(event) => setSku(event.target.value)}
                        placeholder="SKU-001"
                        className={FIELD_CLASS}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 gap-1.5 rounded-[12px] border-[#c4d5f0] bg-[#eef4ff] px-3 text-[11.5px] font-semibold text-[#2878ff] hover:bg-[#e2ecff]"
                        onClick={() => setSku(generateSku(knownSkus))}
                      >
                        توليد تلقائي
                        <Sparkles className="size-3.5" />
                      </Button>
                    </div>
                  </Field>
                ) : null}

                <div className="md:col-span-2 lg:col-span-3">
                  <Field
                    label={type.descriptionLabel}
                    required={productType === "digital"}
                    error={showErrors ? errors.description : null}
                  >
                    <Textarea
                      value={description}
                      maxLength={type.descriptionLimit}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={`${type.descriptionLabel}...`}
                      className="min-h-[84px] rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"
                    />
                    <p className={cn(HINT, MUTED)}>
                      {description.length}/{type.descriptionLimit}
                    </p>
                  </Field>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------- مادة خام */}
            {productType === "raw" ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <SectionHeading
                  icon={Boxes}
                  title="المخزون والتسعير"
                  subtitle="حدد كمية المخزون الحالية وتكلفة الشراء"
                />

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="وحدة القياس الأساسية" required>
                    <UnitSelect value={baseUnit} onChange={setBaseUnit} />
                  </Field>

                  <Field
                    label="الكمية الحالية في المخزون"
                    required
                    error={showErrors ? errors.stock : null}
                  >
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={stockQty}
                      aria-label="الكمية الحالية في المخزون"
                      onChange={(event) => setStockQty(event.target.value)}
                      placeholder="0"
                      className={FIELD_CLASS}
                    />
                    {packagingBreakdown ? (
                      <PackagingReadout
                        breakdown={packagingBreakdown}
                        perCarton={perCarton}
                        linkedName={linkedUnitProduct?.name ?? null}
                      />
                    ) : null}
                  </Field>

                  <Field label="الحد الأدنى للمخزون">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={minStock}
                      aria-label="الحد الأدنى للمخزون"
                      onChange={(event) => setMinStock(event.target.value)}
                      placeholder="0"
                      className={FIELD_CLASS}
                    />
                    <p className={cn(HINT, MUTED)}>سيتم تنبيهك عند الوصول إلى هذا الحد</p>
                  </Field>

                  {/* Only asked for when the product is counted in pieces or cartons -- a carton's
                      size is a fact about this product, not about the unit itself. */}
                  {packagingApplies ? (
                    <>
                      <Field
                        label="المنتج المرتبط (بالحبة)"
                        required
                        error={showErrors ? errors.linkedUnitProduct : null}
                      >
                        <AppSearchableSelect
                          value={linkedUnitProductId}
                          options={pieceProductOptions}
                          onChange={setLinkedUnitProductId}
                          placeholder="اختر المنتج المباع بالحبة"
                          searchPlaceholder="ابحث في المنتجات بالحبة..."
                          emptyLabel={
                            pieceProductOptions.length === 0
                              ? "لا يوجد منتج مقاس بالحبة بعد"
                              : "لا يوجد منتج مطابق"
                          }
                          ariaLabel="المنتج المرتبط"
                        />
                        <p className={cn(HINT, MUTED)}>
                          الكرتون تعبئة لهذا المنتج — بيع كرتون يخصم من مخزونه
                        </p>
                      </Field>

                      <Field label="عدد الحبات في الكرتون" required>
                        <SuffixInput
                          value={unitsPerCarton}
                          onChange={setUnitsPerCarton}
                          suffix="حبة"
                          label="عدد الحبات في الكرتون"
                        />
                        <p className={cn(HINT, MUTED)}>
                          {hasPackaging && linkedUnitProduct
                            ? `1 كرتون = ${NUMBER_AR.format(perCarton)} حبة من ${linkedUnitProduct.name}`
                            : "يربط كمية الكرتون بكمية الحبة"}
                        </p>
                      </Field>
                    </>
                  ) : null}

                  <Field label="سعر الشراء (التكلفة)">
                    <MoneyInput value={costPrice} onChange={setCostPrice} label="سعر الشراء" />
                    <p className={cn(HINT, MUTED)}>سعر الشراء لكل {baseUnitShort}</p>
                  </Field>

                  <Field label="المورد (اختياري)">
                    <Input
                      value={supplier}
                      aria-label="المورد"
                      onChange={(event) => setSupplier(event.target.value)}
                      placeholder="اسم المورد"
                      className={FIELD_CLASS}
                    />
                  </Field>

                  <Field label="ملاحظات المخزون (اختياري)">
                    <Textarea
                      value={stockNotes}
                      maxLength={STOCK_NOTES_LIMIT}
                      onChange={(event) => setStockNotes(event.target.value)}
                      placeholder="مثال: تاريخ الدفعة، رقم الفاتورة..."
                      className="min-h-[76px] rounded-[12px] border-[#e1e7f0] bg-white text-[13px] placeholder:text-[#95a4bd]"
                    />
                    <p className={cn(HINT, MUTED)}>
                      {stockNotes.length}/{STOCK_NOTES_LIMIT}
                    </p>
                  </Field>
                </div>
              </section>
            ) : null}

            {/* ---------------------------------------------------- منتج عادي */}
            {productType === "simple" ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <SectionHeading
                  icon={Layers}
                  title="السعر والمخزون"
                  subtitle="حدد سعر المنتج وكميات المخزون"
                />

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="سعر البيع" required error={showErrors ? errors.price : null}>
                    <MoneyInput value={sellPrice} onChange={setSellPrice} label="سعر البيع" />
                    <PriceTaxIndicator
                      isManualTaxMode={isManualTaxMode}
                      priceIncludesTax={priceIncludesTax}
                      setPriceIncludesTax={setPriceIncludesTax}
                      priceTaxHint={priceTaxHint}
                    />
                  </Field>

                  <Field label="سعر التكلفة">
                    <MoneyInput value={costPrice} onChange={setCostPrice} label="سعر التكلفة" />
                  </Field>

                  <Field
                    label="الكمية الحالية في المخزون"
                    required
                    error={showErrors ? errors.stock : null}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={stockQty}
                      aria-label="الكمية الحالية في المخزون"
                      onChange={(event) => setStockQty(event.target.value)}
                      placeholder="0"
                      className={FIELD_CLASS}
                    />
                    {packagingBreakdown ? (
                      <PackagingReadout
                        breakdown={packagingBreakdown}
                        perCarton={perCarton}
                        linkedName={linkedUnitProduct?.name ?? null}
                      />
                    ) : null}
                  </Field>

                  <Field label="الحد الأدنى للمخزون">
                    <Input
                      type="number"
                      min={0}
                      value={minStock}
                      aria-label="الحد الأدنى للمخزون"
                      onChange={(event) => setMinStock(event.target.value)}
                      placeholder="0"
                      className={FIELD_CLASS}
                    />
                    <p className={cn(HINT, MUTED)}>سيتم تنبيهك عند الوصول إلى هذا الحد</p>
                  </Field>

                  {/* Only asked for when the product is counted in pieces or cartons -- a carton's
                      size is a fact about this product, not about the unit itself. */}
                  {packagingApplies ? (
                    <>
                      <Field
                        label="المنتج المرتبط (بالحبة)"
                        required
                        error={showErrors ? errors.linkedUnitProduct : null}
                      >
                        <AppSearchableSelect
                          value={linkedUnitProductId}
                          options={pieceProductOptions}
                          onChange={setLinkedUnitProductId}
                          placeholder="اختر المنتج المباع بالحبة"
                          searchPlaceholder="ابحث في المنتجات بالحبة..."
                          emptyLabel={
                            pieceProductOptions.length === 0
                              ? "لا يوجد منتج مقاس بالحبة بعد"
                              : "لا يوجد منتج مطابق"
                          }
                          ariaLabel="المنتج المرتبط"
                        />
                        <p className={cn(HINT, MUTED)}>
                          الكرتون تعبئة لهذا المنتج — بيع كرتون يخصم من مخزونه
                        </p>
                      </Field>

                      <Field label="عدد الحبات في الكرتون" required>
                        <SuffixInput
                          value={unitsPerCarton}
                          onChange={setUnitsPerCarton}
                          suffix="حبة"
                          label="عدد الحبات في الكرتون"
                        />
                        <p className={cn(HINT, MUTED)}>
                          {hasPackaging && linkedUnitProduct
                            ? `1 كرتون = ${NUMBER_AR.format(perCarton)} حبة من ${linkedUnitProduct.name}`
                            : "يربط كمية الكرتون بكمية الحبة"}
                        </p>
                      </Field>
                    </>
                  ) : null}

                  <Field label="وحدة القياس" required>
                    <UnitSelect value={baseUnit} onChange={setBaseUnit} />
                  </Field>

                  <Field label="موقع المخزون">
                    {/* RTL: the tile is written first so it lands to the right of the field. */}
                    <div className="flex items-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-2.5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-[8px]",
                          LOCATION_TINT
                        )}
                      >
                        <LOCATION_ICON className="size-4" />
                      </span>
                      <Input
                        value={stockLocation}
                        aria-label="موقع المخزون"
                        onChange={(event) => setStockLocation(event.target.value)}
                        placeholder="المستودع الرئيسي"
                        className="h-11 rounded-none border-0 bg-transparent p-0 text-[13px] focus-visible:ring-0"
                      />
                    </div>
                  </Field>
                </div>
              </section>
            ) : null}

            {/* ------------------------------------------------- منتج موزون */}
            {productType === "weighted" ? (
              <>
                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={Layers}
                    title="معلومات الوزن والتسعير"
                    subtitle="حدد وحدة الوزن وسعر المنتج وإعدادات البيع"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="وحدة الوزن الأساسية" required>
                      <UnitSelect value={baseUnit} onChange={setBaseUnit} />
                    </Field>

                    <Field
                      label={`سعر البيع لل${baseUnitShort}`}
                      required
                      error={showErrors ? errors.price : null}
                    >
                      <MoneyInput value={sellPrice} onChange={setSellPrice} label="سعر البيع" />
                      <PriceTaxIndicator
                        isManualTaxMode={isManualTaxMode}
                        priceIncludesTax={priceIncludesTax}
                        setPriceIncludesTax={setPriceIncludesTax}
                        priceTaxHint={priceTaxHint}
                      />
                    </Field>

                    <Field label="الحد الأدنى للشراء">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={minPurchase}
                        aria-label="الحد الأدنى للشراء"
                        onChange={(event) => setMinPurchase(event.target.value)}
                        placeholder="0.1"
                        className={FIELD_CLASS}
                      />
                      <p className={cn(HINT, MUTED)}>أقل كمية يمكن شراؤها (بال{baseUnitShort})</p>
                    </Field>
                  </div>

                  <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-[#cfe0ff] bg-[#f2f7ff] px-4 py-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-[#2878ff]" />
                    <div>
                      <p className={cn("text-[11.5px] font-semibold leading-5", HEADING)}>
                        سيتم احتساب السعر تلقائياً بناءً على الوزن الذي يحدده العميل عند الشراء.
                      </p>
                      <p className={cn("mt-0.5 text-[11px]", MUTED)}>
                        {sellPrice.trim() && Number(sellPrice) > 0
                          ? `مثال: 0.5 ${baseUnitShort} × ${NUMBER_AR.format(Number(sellPrice))} ريال = ${MONEY_AR.format(Number(sellPrice) * 0.5)} ريال.`
                          : `مثال: 0.5 ${baseUnitShort} × سعر ال${baseUnitShort} = السعر النهائي.`}
                      </p>
                    </div>
                  </div>
                </section>

                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={Boxes}
                    title="مخزون المنتج"
                    subtitle="حدد كمية المخزون الحالية"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label="الكمية الحالية في المخزون"
                      required
                      error={showErrors ? errors.stock : null}
                    >
                      <SuffixInput
                        value={stockQty}
                        aria-label="الكمية الحالية في المخزون"
                        onChange={setStockQty}
                        suffix={baseUnitShort}
                        label="الكمية الحالية في المخزون"
                      />
                      {packagingBreakdown ? (
                        <PackagingReadout
                          breakdown={packagingBreakdown}
                          perCarton={perCarton}
                          linkedName={linkedUnitProduct?.name ?? null}
                        />
                      ) : null}
                    </Field>

                    <Field label="الحد الأدنى للمخزون">
                      <SuffixInput
                        value={minStock}
                        aria-label="الحد الأدنى للمخزون"
                        onChange={setMinStock}
                        suffix={baseUnitShort}
                        label="الحد الأدنى للمخزون"
                      />
                      <p className={cn(HINT, MUTED)}>سيتم تنبيهك عند الوصول إلى هذا الحد</p>
                    </Field>

                    {/* No carton packaging here: a weighted product is sold by the kilo, and its
                        unit selector offers weights only -- there is no piece to package. */}
                  </div>
                </section>
              </>
            ) : null}

            {/* ------------------------------------------------------- خدمة */}
            {isService ? (
              <>
                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={Layers}
                    title="التسعير والمدة"
                    subtitle="حدد سعر الخدمة ومدة تقديمها"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="نوع التسعير" required>
                      <AppSearchableSelect
                        value={pricingType}
                        options={PRICING_TYPE_OPTIONS}
                        onChange={setPricingType}
                        ariaLabel="نوع التسعير"
                      />
                    </Field>

                    <Field label="السعر" required error={showErrors ? errors.servicePrice : null}>
                      <MoneyInput value={sellPrice} onChange={setSellPrice} label="السعر" />
                      <PriceTaxIndicator
                        isManualTaxMode={isManualTaxMode}
                        priceIncludesTax={priceIncludesTax}
                        setPriceIncludesTax={setPriceIncludesTax}
                        priceTaxHint={priceTaxHint}
                      />
                    </Field>

                    <Field label="مدة الخدمة">
                      {/* RTL: the value is written first so its unit sits on the left. */}
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={serviceDuration}
                          aria-label="مدة الخدمة"
                          onChange={(event) => setServiceDuration(event.target.value)}
                          placeholder="1"
                          className={FIELD_CLASS}
                        />
                        <div className="w-[128px] shrink-0">
                          <AppSearchableSelect
                            value={serviceDurationUnit}
                            options={SERVICE_DURATION_UNIT_OPTIONS}
                            onChange={setServiceDurationUnit}
                            ariaLabel="وحدة مدة الخدمة"
                          />
                        </div>
                      </div>
                      <p className={cn(HINT, MUTED)}>المدة الافتراضية لتقديم الخدمة</p>
                    </Field>
                  </div>
                </section>

                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={CalendarDays}
                    title="التوفر والحجز (اختياري)"
                    subtitle="حدد مواعيد التوفر إذا كانت الخدمة تتطلب حجزاً مسبقاً"
                  />

                  <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-[#cfe0ff] bg-[#f2f7ff] px-4 py-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-[#2878ff]" />
                    <p className={cn("text-[11.5px] leading-5", HEADING)}>
                      يمكنك لاحقاً ربط الخدمة مع تقويم المواعيد لإدارة الحجوزات تلقائياً.
                    </p>
                  </div>

                  {/* RTL: the copy is written first so the switch sits on the left. */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <Label
                        htmlFor="booking"
                        className={cn("cursor-pointer text-[13px] font-extrabold", HEADING)}
                      >
                        تفعيل الحجز المسبق
                      </Label>
                      <p className={cn("mt-1 text-[11px]", MUTED)}>
                        السماح للعملاء بحجز مواعيد لهذه الخدمة
                      </p>
                    </div>
                    <Switch
                      id="booking"
                      checked={bookingEnabled}
                      onCheckedChange={setBookingEnabled}
                      className="h-6 w-11 data-[state=checked]:bg-[#2878ff] [&>span]:size-5"
                    />
                  </div>
                </section>
              </>
            ) : null}

            {/* -------------------------------------------------- منتج رقمي */}
            {productType === "digital" ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <SectionHeading icon={Layers} title="التسعير" subtitle="حدد سعر المنتج الرقمي" />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="السعر" required error={showErrors ? errors.price : null}>
                    <MoneyInput value={sellPrice} onChange={setSellPrice} label="السعر" />
                    <PriceTaxIndicator
                      isManualTaxMode={isManualTaxMode}
                      priceIncludesTax={priceIncludesTax}
                      setPriceIncludesTax={setPriceIncludesTax}
                      priceTaxHint={priceTaxHint}
                    />
                  </Field>

                  <Field label="سعر العرض (اختياري)">
                    <MoneyInput value={offerPrice} onChange={setOfferPrice} label="سعر العرض" />
                  </Field>
                </div>
              </section>
            ) : null}

            {/* ------------------------------------------------ منتج متغير */}
            {isVariable ? (
              <>
                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={GitBranch}
                    title="المتغيرات"
                    subtitle="أضف خيارات المتغيرات مثل المقاسات والألوان. يمكنك دمج أكثر من خيار."
                  />

                  {showErrors && errors.options ? (
                    <p className="mt-3 text-[11px] text-[#e0484d]">{errors.options}</p>
                  ) : null}

                  <div className="mt-4 space-y-2.5">
                    {options.map((option, index) => (
                      <div
                        key={option.id}
                        className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] p-3"
                      >
                        <GripVertical className="size-4 shrink-0 text-[#c0cbdc]" />

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={cn("text-[11.5px] font-semibold", MUTED)}>
                            {optionLabel(index)}:
                          </span>
                          <Input
                            value={option.name}
                            aria-label="اسم الخيار"
                            placeholder="المقاس"
                            className={cn(FIELD_CLASS, "h-9 w-[120px] text-[12px]")}
                            onChange={(event) =>
                              setOptions((current) =>
                                current.map((item) =>
                                  item.id === option.id
                                    ? { ...item, name: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </div>

                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          {option.values.map((value) => (
                            <span
                              key={value}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0b1738] ring-1 ring-[#e1e7f0]"
                            >
                              {value}
                              <button
                                type="button"
                                aria-label={`حذف ${value}`}
                                className="cursor-pointer text-[#b6c2d4] transition-colors hover:text-[#e0484d]"
                                onClick={() =>
                                  setOptions((current) =>
                                    current.map((item) =>
                                      item.id === option.id
                                        ? {
                                            ...item,
                                            values: item.values.filter((entry) => entry !== value),
                                          }
                                        : item
                                    )
                                  )
                                }
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}

                          <Input
                            value={option.draft}
                            aria-label="إضافة قيمة"
                            placeholder="أضف قيمة ثم Enter"
                            className={cn(FIELD_CLASS, "h-9 min-w-[150px] flex-1 text-[12px]")}
                            onChange={(event) =>
                              setOptions((current) =>
                                current.map((item) =>
                                  item.id === option.id
                                    ? { ...item, draft: event.target.value }
                                    : item
                                )
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return
                              event.preventDefault()
                              const value = option.draft.trim()
                              if (!value || option.values.includes(value)) return
                              setOptions((current) =>
                                current.map((item) =>
                                  item.id === option.id
                                    ? { ...item, values: [...item.values, value], draft: "" }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>

                        <button
                          type="button"
                          aria-label="حذف الخيار"
                          className="shrink-0 cursor-pointer text-[#e0484d] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
                          disabled={options.length === 1}
                          onClick={() =>
                            setOptions((current) => current.filter((item) => item.id !== option.id))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      className="h-10 gap-2 rounded-[12px] border-dashed border-[#c4d5f0] bg-white px-4 text-[12px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
                      onClick={() => setOptions((current) => [...current, emptyOption()])}
                    >
                      إضافة خيار آخر
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </section>

                <section className={cn(PANEL, "p-4 md:p-5")}>
                  {/* RTL: the heading is written first so it lands right, the action left. */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <SectionHeading
                      icon={Boxes}
                      title={`المتغيرات الناتجة (${activeVariants.length})`}
                      subtitle="سيتم إنشاء متغير لكل توليفة من الخيارات. يمكنك تعديل التفاصيل لكل متغير."
                    />
                    <Button
                      variant="outline"
                      className="h-10 shrink-0 gap-2 rounded-[12px] border-[#c4d5f0] bg-white px-4 text-[12px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
                      disabled={activeVariants.length === 0}
                      onClick={generateVariantSkus}
                    >
                      توليد جميع SKU تلقائياً
                      <RefreshCcw className="size-4" />
                    </Button>
                  </div>

                  {variantsTruncated ? (
                    <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-[#f3ddb0] bg-[#fdf7ec] px-4 py-3">
                      <Info className="mt-0.5 size-4 shrink-0 text-[#e08b00]" />
                      <p className={cn("text-[11.5px] leading-5", HEADING)}>
                        عدد التوليفات يتجاوز الحد الأقصى، لذلك يتم عرض أول{" "}
                        {NUMBER_AR.format(MAX_GENERATED_VARIANTS)} متغير فقط. قلّل عدد القيم أو
                        الخيارات لعرضها جميعاً.
                      </p>
                    </div>
                  ) : null}

                  {excludedCount > 0 ? (
                    /* RTL: the copy is written first so the undo action sits on the left. */
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#e1e7f0] bg-[#fafbfe] px-4 py-2.5">
                      <p className={cn("text-[11.5px]", MUTED)}>
                        تم استبعاد {NUMBER_AR.format(excludedCount)} متغير من هذا المنتج.
                      </p>
                      <button
                        type="button"
                        className="cursor-pointer text-[11.5px] font-semibold text-[#2878ff] transition-opacity hover:opacity-70"
                        onClick={() => setExcludedVariants(new Set())}
                      >
                        استعادة الكل
                      </button>
                    </div>
                  ) : null}

                  {showErrors && errors.variantPrices ? (
                    <p
                      data-field-error="true"
                      className="mt-3 text-[11px] font-semibold text-[#e0484d]"
                    >
                      {errors.variantPrices}
                    </p>
                  ) : null}

                  {/* Always on screen once there are rows: the previous version only appeared
                      after ticking a checkbox, which made filling a 24-row sheet require ticking
                      24 boxes to discover the shortcut that exists for exactly that case. */}
                  {activeVariants.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-[#c4d5f0] bg-[#f2f7ff] px-4 py-2.5">
                      <p className={cn("text-[11.5px] font-bold", HEADING)}>
                        تطبيق سريع
                        <span className={cn("ms-1.5 font-semibold", MUTED)}>
                          {selectedVariants.size > 0
                            ? `على ${NUMBER_AR.format(selectedVariants.size)} محدد`
                            : `على الكل (${NUMBER_AR.format(activeVariants.length)})`}
                        </span>
                      </p>

                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={bulkPrice}
                        aria-label="سعر موحد"
                        placeholder="السعر"
                        className="h-9 w-[110px] rounded-[10px] border-[#c4d5f0] bg-white text-[12px]"
                        onChange={(event) => setBulkPrice(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            applyBulkValues()
                          }
                        }}
                      />
                      <Input
                        type="number"
                        min={0}
                        value={bulkStock}
                        aria-label="كمية موحدة"
                        placeholder="الكمية"
                        className="h-9 w-[110px] rounded-[10px] border-[#c4d5f0] bg-white text-[12px]"
                        onChange={(event) => setBulkStock(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            applyBulkValues()
                          }
                        }}
                      />

                      <Button
                        className="h-9 gap-1.5 rounded-[10px] bg-[#2878ff] px-4 text-[12px] font-semibold text-white hover:bg-[#1f66e0]"
                        disabled={bulkPrice.trim() === "" && bulkStock.trim() === ""}
                        onClick={applyBulkValues}
                      >
                        تطبيق
                        <CircleCheckBig className="size-3.5" />
                      </Button>

                      {selectedVariants.size > 0 ? (
                        <>
                          <button
                            type="button"
                            className="cursor-pointer text-[11.5px] font-semibold text-[#e0484d] transition-opacity hover:opacity-70"
                            onClick={() => excludeVariants(selectedVariants)}
                          >
                            استبعاد المحدد
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "ms-auto cursor-pointer text-[11.5px] font-semibold transition-opacity hover:opacity-70",
                              MUTED
                            )}
                            onClick={() => setSelectedVariants(new Set())}
                          >
                            إلغاء التحديد
                          </button>
                        </>
                      ) : (
                        <p className={cn("ms-auto text-[10.5px]", MUTED)}>
                          حدد صفوفاً لتطبيق القيم عليها وحدها
                        </p>
                      )}
                    </div>
                  ) : null}

                  {activeVariants.length === 0 ? (
                    <div
                      className={cn(
                        "mt-4 rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] px-4 py-8 text-center text-[12.5px]",
                        MUTED
                      )}
                    >
                      {excludedCount > 0
                        ? "تم استبعاد كل التوليفات. استعد بعضها أو أضف قيمة جديدة."
                        : "أضف خياراً واحداً على الأقل بقيمه لتوليد المتغيرات."}
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-center">
                        <thead>
                          <tr>
                            <th className="border-b border-[#eef2f8] px-2 py-3">
                              <input
                                type="checkbox"
                                aria-label="تحديد كل المتغيرات"
                                className="size-4 cursor-pointer accent-[#2878ff]"
                                checked={
                                  selectedVariants.size > 0 &&
                                  selectedVariants.size === activeVariants.length
                                }
                                ref={(node) => {
                                  if (node)
                                    node.indeterminate =
                                      selectedVariants.size > 0 &&
                                      selectedVariants.size < activeVariants.length
                                }}
                                onChange={(event) =>
                                  setSelectedVariants(
                                    event.target.checked
                                      ? new Set(activeVariants.map((variant) => variant.key))
                                      : new Set()
                                  )
                                }
                              />
                            </th>
                            {[
                              "صورة",
                              ...filledOptions.map((option) => option.name),
                              "SKU",
                              "السعر",
                              "الكمية في المخزون",
                              "الحالة",
                              "إجراء",
                            ].map((label, index) => (
                              <th
                                key={`${label}-${index}`}
                                className={cn(
                                  "border-b border-[#eef2f8] px-2 py-3 text-[11px] font-semibold",
                                  MUTED
                                )}
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeVariants.map((variant) => {
                            const override = variantOverride(variant.key)
                            const stock = Number(override.stock)
                            const inStock = override.stock.trim() !== "" && stock > 0

                            return (
                              <tr
                                key={variant.key}
                                className={cn(
                                  "border-b border-[#f4f7fb]",
                                  selectedVariants.has(variant.key) && "bg-[#f7faff]"
                                )}
                              >
                                <td className="px-2 py-3">
                                  <input
                                    type="checkbox"
                                    aria-label={`تحديد ${variant.key}`}
                                    className="size-4 cursor-pointer accent-[#2878ff]"
                                    checked={selectedVariants.has(variant.key)}
                                    onChange={() => toggleVariantSelection(variant.key)}
                                  />
                                </td>
                                <td className="px-2 py-3">
                                  <span className="mx-auto flex size-9 items-center justify-center rounded-[10px] border border-[#eef2f8] bg-[#fafbfe]">
                                    <ImageIcon className="size-4 text-[#b6c2d4]" />
                                  </span>
                                </td>

                                {variant.values.map((value, index) => (
                                  <td
                                    key={index}
                                    className={cn("px-2 py-3 text-[12px] font-semibold", HEADING)}
                                  >
                                    {value}
                                  </td>
                                ))}

                                <td className="px-2 py-3">
                                  <Input
                                    value={override.sku}
                                    aria-label={`SKU ${variant.key}`}
                                    placeholder="—"
                                    className={cn(FIELD_CLASS, "h-9 w-[178px] text-[11.5px]")}
                                    onChange={(event) =>
                                      updateVariant(variant.key, { sku: event.target.value })
                                    }
                                  />
                                </td>

                                <td className="px-2 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={override.price}
                                    aria-label={`سعر ${variant.key}`}
                                    placeholder="0.00"
                                    className={cn(
                                      FIELD_CLASS,
                                      "h-9 w-[92px] text-center text-[12px]"
                                    )}
                                    onChange={(event) =>
                                      updateVariant(variant.key, { price: event.target.value })
                                    }
                                  />
                                </td>

                                <td className="px-2 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={override.stock}
                                    aria-label={`مخزون ${variant.key}`}
                                    placeholder="0"
                                    className={cn(
                                      FIELD_CLASS,
                                      "h-9 w-[74px] text-center text-[12px]"
                                    )}
                                    onChange={(event) =>
                                      updateVariant(variant.key, { stock: event.target.value })
                                    }
                                  />
                                </td>

                                <td className="px-2 py-3">
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                                      inStock
                                        ? "bg-[#e9f8ef] text-[#1f9d55]"
                                        : "bg-[#fdeeee] text-[#e0484d]"
                                    )}
                                  >
                                    {inStock ? "متوفر" : "نفد"}
                                  </span>
                                </td>

                                {/* Every cell in the row is already an input, so there is no
                                    separate "edit" action to offer -- only excluding the row. */}
                                <td className="px-2 py-3">
                                  <button
                                    type="button"
                                    aria-label={`استبعاد ${variant.key}`}
                                    title="استبعاد هذه التوليفة من المنتج"
                                    className="cursor-pointer text-[#e0484d] transition-opacity hover:opacity-70"
                                    onClick={() => excludeVariants([variant.key])}
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            ) : null}

            {/* ------------------------------------------------- منتج مجمع */}
            {isBundle ? (
              <>
                <section className={cn(PANEL, "p-4 md:p-5")}>
                  <SectionHeading
                    icon={Layers}
                    title="السعر"
                    subtitle="حدد السعر الذي يُباع به هذا المنتج المجمع (لا يُحتسب تلقائياً من تكلفة المكونات)"
                  />

                  <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Field label="سعر البيع" required error={showErrors ? errors.price : null}>
                      <MoneyInput value={sellPrice} onChange={setSellPrice} label="سعر البيع" />
                      <PriceTaxIndicator
                        isManualTaxMode={isManualTaxMode}
                        priceIncludesTax={priceIncludesTax}
                        setPriceIncludesTax={setPriceIncludesTax}
                        priceTaxHint={priceTaxHint}
                      />
                    </Field>
                  </div>
                </section>

                <section className={cn(PANEL, "p-4 md:p-5")}>
                  {/* RTL: the heading is written first so it lands right, the action left. */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <SectionHeading
                      icon={Boxes}
                      title="المكونات (المواد الخام)"
                      subtitle="اختر المكونات من المخزون وحدد الكميات المطلوبة لكل وحدة من هذا المنتج"
                    />
                    <Button
                      variant="outline"
                      className="h-10 shrink-0 gap-2 rounded-[12px] border-[#c4d5f0] bg-white px-4 text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
                      onClick={() => setComponents((current) => [...current, emptyComponent()])}
                    >
                      إضافة مكون
                      <Plus className="size-4" />
                    </Button>
                  </div>

                  {/* The picker offers raw materials only, so the notice is about those rather
                      than the catalogue as a whole -- a shop full of finished products still has
                      nothing to assemble a bundle from. */}
                  {catalogueLoaded && rawMaterials.length === 0 ? (
                    <div className="mt-4 rounded-[12px] border border-[#cfe0ff] bg-[#f2f7ff] px-4 py-3">
                      <p className={cn("text-[11.5px] leading-5", HEADING)}>
                        لا توجد مواد خام في المخزون بعد — يمكنك إضافة المكونات يدوياً الآن وربطها
                        بالمخزون لاحقاً، أو إنشاء مادة خام من نوع &quot;مادة خام&quot; أولاً.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[700px] text-center">
                      <thead>
                        <tr>
                          {[
                            { key: "index", label: "#", align: "w-8 text-center" },
                            { key: "component", label: "المكون", align: "text-right" },
                            { key: "unit", label: "وحدة القياس", align: "text-center" },
                            { key: "required", label: "الكمية المطلوبة", align: "text-center" },
                            { key: "stock", label: "المخزون الحالي", align: "text-center" },
                            { key: "producible", label: "متوفر للإنتاج", align: "text-center" },
                            { key: "note", label: "ملاحظات", align: "text-center" },
                            { key: "actions", label: "إجراء", align: "text-center" },
                          ].map((column) => (
                            <th
                              key={column.key}
                              className={cn(
                                "border-b border-[#eef2f8] px-2 py-3 text-[11px] font-semibold",
                                MUTED,
                                column.align
                              )}
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resolvedComponents.map((entry, index) => (
                          <tr key={entry.row.id} className="border-b border-[#f4f7fb]">
                            <td className={cn("px-2 py-3 text-[11.5px]", MUTED)}>{index + 1}</td>

                            {/* RTL: the thumbnail is written first so it lands to the right. */}
                            <td className="px-2 py-3 text-right">
                              <div className="flex items-center gap-2">
                                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#eef2f8] bg-[#fafbfe]">
                                  {entry.product?.image ? (
                                    /* Remote store images cannot use the default loader. */
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={entry.product.image}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <Boxes className="size-4 text-[#b6c2d4]" />
                                  )}
                                </span>

                                {entry.isCustom ? (
                                  <div className="flex min-w-0 flex-1 items-center gap-1">
                                    <Input
                                      ref={(node) => {
                                        componentNameInputs.current[entry.row.id] = node
                                      }}
                                      value={entry.row.customName}
                                      aria-label="اسم المكون"
                                      placeholder="اسم المكون"
                                      className="h-8 min-w-0 flex-1 rounded-[8px] border-[#e1e7f0] bg-white text-[12px] font-bold text-[#0b1738]"
                                      onChange={(event) =>
                                        updateComponent(entry.row.id, {
                                          customName: event.target.value,
                                        })
                                      }
                                    />
                                    {/* Switching back to the picker is only worth offering when
                                        there is something in the catalogue to pick, and a bare x
                                        beside a trash icon reads as a second delete -- so it is
                                        hidden on an empty inventory. */}
                                    {catalogue.length > 0 ? (
                                      <button
                                        type="button"
                                        title="اختيار من المخزون بدلاً من ذلك"
                                        aria-label="اختيار من المخزون بدلاً من ذلك"
                                        className="shrink-0 cursor-pointer text-[#95a4bd] transition-colors hover:text-[#0b1738]"
                                        onClick={() =>
                                          updateComponent(entry.row.id, {
                                            productId: "",
                                            customName: "",
                                            customStock: "",
                                          })
                                        }
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  <AppSearchableSelect
                                    value={entry.row.productId}
                                    options={componentOptions}
                                    onChange={(next) => {
                                      // A raw material already declares its own unit when it was
                                      // created -- defaulting the recipe row to that unit means
                                      // the current-stock figure is labelled correctly from the
                                      // start (same dimension, no conversion factor needed)
                                      // instead of always starting at جرام/كجم regardless of
                                      // what the product actually is.
                                      const unit = unitFromBaseUnit(productById.get(next)?.baseUnit)
                                      updateComponent(entry.row.id, {
                                        productId: next,
                                        ...(unit ? { requiredUnit: unit, stockUnit: unit } : {}),
                                      })
                                    }}
                                    placeholder="اختر المكون"
                                    searchPlaceholder="ابحث في المواد الخام..."
                                    emptyLabel={
                                      rawMaterials.length === 0
                                        ? "لا توجد مواد خام في المخزون بعد"
                                        : "لا توجد مادة خام مطابقة"
                                    }
                                    ariaLabel="المكون"
                                    compact
                                    hideTriggerMark
                                    triggerRef={(node) => {
                                      componentTriggers.current[entry.row.id] = node
                                    }}
                                    triggerClassName="h-auto border-0 bg-transparent p-0 font-bold shadow-none hover:border-0 focus-visible:ring-0"
                                    footer={(close) => (
                                      <button
                                        type="button"
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-right text-[12px] font-semibold text-[#2878ff] transition-colors hover:bg-[#eef4ff]"
                                        onClick={() => {
                                          updateComponent(entry.row.id, {
                                            productId: CUSTOM_COMPONENT,
                                          })
                                          close()
                                        }}
                                      >
                                        <Plus className="size-4 shrink-0" />
                                        مكون جديد غير موجود في المخزون
                                      </button>
                                    )}
                                  />
                                )}
                              </div>
                            </td>

                            <td className="px-2 py-3">
                              <AppSearchableSelect
                                value={entry.row.requiredUnit}
                                options={COMPONENT_UNIT_OPTIONS}
                                onChange={(next) => {
                                  const unit = next as Unit
                                  const comparable =
                                    UNIT_BASE[unit].dimension ===
                                    UNIT_BASE[entry.row.stockUnit].dimension
                                  updateComponent(entry.row.id, {
                                    requiredUnit: unit,
                                    ...(comparable ? {} : { stockUnit: unit }),
                                  })
                                }}
                                ariaLabel="وحدة القياس"
                                searchPlaceholder="البحث عن وحدة قياس..."
                                compact
                                triggerClassName="w-[104px]"
                              />
                            </td>

                            <td className="px-2 py-3">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={entry.row.requiredQuantity}
                                aria-label="الكمية المطلوبة"
                                onChange={(event) =>
                                  updateComponent(entry.row.id, {
                                    requiredQuantity: event.target.value,
                                  })
                                }
                                placeholder="0"
                                className={cn(FIELD_CLASS, "h-9 w-[74px] text-center text-[12px]")}
                              />
                            </td>

                            {/* Stock comes from the product record, which carries no unit of its
                                own -- the unit beside it is what the user declares it is counted
                                in, and it drives the conversion. */}
                            <td className="px-2 py-3">
                              {entry.isCustom || entry.product ? (
                                <div className="flex items-center justify-center gap-1">
                                  {entry.isCustom ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={entry.row.customStock}
                                      aria-label="المخزون الحالي"
                                      placeholder="0"
                                      className="h-8 w-[62px] rounded-[8px] border-[#e1e7f0] bg-white text-center text-[12px]"
                                      onChange={(event) =>
                                        updateComponent(entry.row.id, {
                                          customStock: event.target.value,
                                        })
                                      }
                                    />
                                  ) : (
                                    <span className={cn("text-[12px] font-semibold", MUTED)}>
                                      {NUMBER_AR.format(entry.product?.availableStock ?? 0)}
                                    </span>
                                  )}
                                  <AppSearchableSelect
                                    value={entry.row.stockUnit}
                                    options={COMPONENT_UNIT_OPTIONS}
                                    onChange={(next) =>
                                      updateComponent(entry.row.id, { stockUnit: next as Unit })
                                    }
                                    ariaLabel="وحدة المخزون"
                                    searchPlaceholder="البحث عن وحدة قياس..."
                                    compact
                                    hideTriggerMark
                                    triggerClassName="h-auto w-auto border-0 bg-transparent p-0 font-semibold text-[#6b7b96] shadow-none hover:border-0 focus-visible:ring-0"
                                  />
                                </div>
                              ) : (
                                <span className={cn("text-[12px]", MUTED)}>—</span>
                              )}

                              {entry.needsConversion && (entry.isCustom || entry.product) ? (
                                <div className="mt-1.5 flex items-center justify-center gap-1">
                                  <span className={cn("text-[10px]", MUTED)}>
                                    1 {entry.row.requiredUnit} =
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={entry.row.conversionFactor}
                                    aria-label={`كم ${entry.row.stockUnit} في 1 ${entry.row.requiredUnit}`}
                                    placeholder="?"
                                    className={cn(
                                      "h-7 w-[52px] rounded-[8px] bg-white text-center text-[11px]",
                                      entry.incompatibleUnits
                                        ? "border-[#f7c9ca]"
                                        : "border-[#e1e7f0]"
                                    )}
                                    onChange={(event) =>
                                      updateComponent(entry.row.id, {
                                        conversionFactor: event.target.value,
                                      })
                                    }
                                  />
                                  <span className={cn("text-[10px]", MUTED)}>
                                    {entry.row.stockUnit}
                                  </span>
                                </div>
                              ) : null}
                            </td>

                            <td className="px-2 py-3">
                              {entry.incompatibleUnits ? (
                                <span
                                  className="text-[10.5px] font-semibold leading-[15px] text-[#e08b00]"
                                  title={`حدد كم ${entry.row.stockUnit} في 1 ${entry.row.requiredUnit}`}
                                >
                                  حدد معامل التحويل
                                </span>
                              ) : entry.producible === null ? (
                                <span className={cn("text-[12px]", MUTED)}>—</span>
                              ) : (
                                <span
                                  className={cn(
                                    "text-[13px] font-extrabold",
                                    entry === limiting ? "text-[#e08b00]" : HEADING
                                  )}
                                >
                                  {NUMBER_AR.format(entry.producible)}
                                </span>
                              )}
                            </td>

                            <td className="px-2 py-3">
                              <Input
                                value={entry.row.note}
                                aria-label="ملاحظات"
                                onChange={(event) =>
                                  updateComponent(entry.row.id, { note: event.target.value })
                                }
                                placeholder="—"
                                className={cn(FIELD_CLASS, "h-9 w-[96px] text-[12px]")}
                              />
                            </td>

                            {/* RTL: delete is written first so it sits right of edit. */}
                            <td className="px-2 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  aria-label="حذف المكون"
                                  className="cursor-pointer text-[#e0484d] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={components.length === 1}
                                  onClick={() =>
                                    setComponents((current) =>
                                      current.filter((row) => row.id !== entry.row.id)
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </button>
                                {/* On a catalogue row this opens the picker; a manual row has no
                                    picker to open, so it focuses the name it does have. Without
                                    the second branch the button did nothing at all on those rows. */}
                                <button
                                  type="button"
                                  aria-label="تعديل المكون"
                                  title="تعديل المكون"
                                  className="cursor-pointer text-[#2878ff] transition-opacity hover:opacity-70"
                                  onClick={() => {
                                    const trigger = componentTriggers.current[entry.row.id]
                                    if (trigger) {
                                      trigger.click()
                                      return
                                    }
                                    componentNameInputs.current[entry.row.id]?.focus()
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {showErrors && errors.components ? (
                    <p className="mt-3 text-[11px] text-[#e0484d]">{errors.components}</p>
                  ) : null}

                  {/* RTL: the headline is written first so it lands on the right, the
                      calculation next, and the deduction notice at the left. */}
                  <div className="mt-4 rounded-[14px] border border-[#bfe8cf] bg-[#f2fbf6] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[#1f9d55]">
                          <Boxes className="size-5" />
                        </span>
                        <div>
                          <p className={cn("text-[12.5px] font-extrabold", HEADING)}>
                            الكمية المتاحة للإنتاج
                          </p>
                          <p className="mt-0.5 text-[22px] font-extrabold leading-tight text-[#1f9d55]">
                            {availableProduction === null
                              ? "—"
                              : `${NUMBER_AR.format(availableProduction)} وحدة`}
                          </p>
                          <p className={cn("mt-0.5 text-[10.5px]", MUTED)}>
                            بناءً على أقل مكون متوفر في المخزون
                          </p>
                        </div>
                      </div>

                      {limiting ? (
                        <div className="flex items-center gap-2">
                          <CalcCell
                            label="المخزون الحالي"
                            value={`${NUMBER_AR.format(limiting.stock ?? 0)} ${limiting.row.stockUnit}`}
                          />
                          <span className={cn("text-[13px] font-bold", MUTED)}>÷</span>
                          <CalcCell
                            label="الكمية المطلوبة"
                            value={`${NUMBER_AR.format(limiting.required ?? 0)} ${limiting.row.requiredUnit} لكل وحدة`}
                          />
                          <span className={cn("text-[13px] font-bold", MUTED)}>=</span>
                          <CalcCell
                            label="النتيجة"
                            value={NUMBER_AR.format(limiting.producible ?? 0)}
                            emphasis
                          />
                        </div>
                      ) : null}

                      <div className="flex max-w-[250px] items-start gap-2">
                        <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-[#1f9d55]" />
                        <p className={cn("text-[11px] leading-[18px]", HEADING)}>
                          سيتم خصم كميات المكونات تلقائياً من المخزون عند كل عملية بيع.
                        </p>
                      </div>
                    </div>

                    {limiting ? (
                      <p className={cn("mt-3 border-t border-[#cdeadb] pt-3 text-[11px]", HEADING)}>
                        أقل مكون متوفر هو <span className="font-extrabold">{limiting.label}</span>،
                        لذلك الكمية القصوى المتاحة للإنتاج هي{" "}
                        <span className="font-extrabold">
                          {NUMBER_AR.format(limiting.producible ?? 0)} وحدة
                        </span>
                        .
                      </p>
                    ) : (
                      <p className={cn("mt-3 border-t border-[#cdeadb] pt-3 text-[11px]", MUTED)}>
                        أضف مكوناً واحداً على الأقل مع كميته المطلوبة لحساب الكمية المتاحة للإنتاج.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : null}

            {/* Optional variants, for the types where they are secondary. */}
            {productType === "simple" || isBundle ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 text-right"
                  aria-expanded={optionsOpen}
                  onClick={() => setOptionsOpen((current) => !current)}
                >
                  <SectionHeading
                    icon={GitBranch}
                    title="الخيارات والمتغيرات (اختياري)"
                    subtitle={
                      isBundle
                        ? "أضف خيارات مثل الحجم أو الإضافات (مثال: حجم كبير، دجاج إضافي)."
                        : "أضف متغيرات مثل المقاسات أو الألوان إذا كان هذا المنتج يحتوي على عدة خيارات"
                    }
                  />
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-[#95a4bd] transition-transform",
                      optionsOpen && "rotate-180"
                    )}
                  />
                </button>

                {optionsOpen ? (
                  <div className="mt-4 space-y-2.5">
                    {options.map((option, index) => (
                      <div key={option.id} className="flex flex-wrap items-center gap-2.5">
                        <Input
                          value={option.name}
                          aria-label="اسم الخيار"
                          placeholder={`${optionLabel(index)} (مثال: الحجم)`}
                          className={cn(FIELD_CLASS, "h-10 min-w-[180px] flex-1")}
                          onChange={(event) =>
                            setOptions((current) =>
                              current.map((item) =>
                                item.id === option.id ? { ...item, name: event.target.value } : item
                              )
                            )
                          }
                        />
                        <Input
                          value={option.values.join("، ")}
                          aria-label="قيم الخيار"
                          placeholder="القيم مفصولة بفاصلة (كبير، وسط، صغير)"
                          className={cn(FIELD_CLASS, "h-10 min-w-[220px] flex-[2]")}
                          onChange={(event) =>
                            setOptions((current) =>
                              current.map((item) =>
                                item.id === option.id
                                  ? {
                                      ...item,
                                      values: event.target.value
                                        .split(/[،,]/)
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label="حذف الخيار"
                          className="shrink-0 cursor-pointer text-[#e0484d] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
                          disabled={options.length === 1}
                          onClick={() =>
                            setOptions((current) => current.filter((item) => item.id !== option.id))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      className="h-10 w-full rounded-[12px] border-dashed border-[#c4d5f0] bg-white text-[12px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
                      onClick={() => setOptions((current) => [...current, emptyOption()])}
                    >
                      إضافة خيار
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* --------------------------------------------- معلومات إضافية */}
            {isVariable ? null : (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <SectionHeading
                  icon={Settings2}
                  title="معلومات إضافية"
                  subtitle={
                    productType === "raw"
                      ? "تفاصيل إضافية عن المادة الخام"
                      : isService
                        ? "تفاصيل إضافية عن الخدمة"
                        : "تفاصيل إضافية عن المنتج"
                  }
                />

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="ملاحظات داخلية (اختياري)">
                    <Textarea
                      value={internalNotes}
                      maxLength={NOTES_LIMIT}
                      onChange={(event) => setInternalNotes(event.target.value)}
                      placeholder="أضف أي ملاحظات داخلية..."
                      className="min-h-[84px] rounded-[12px] border-[#e1e7f0] bg-white text-[13px] placeholder:text-[#95a4bd]"
                    />
                    <p className={cn(HINT, MUTED)}>
                      {internalNotes.length}/{NOTES_LIMIT}
                    </p>
                  </Field>

                  {productType === "raw" ? (
                    <>
                      <Field label="رقم الدفعة (اختياري)">
                        <Input
                          value={batchNumber}
                          aria-label="رقم الدفعة"
                          onChange={(event) => setBatchNumber(event.target.value)}
                          placeholder="LOT-001"
                          className={FIELD_CLASS}
                        />
                      </Field>
                      <Field label="تاريخ الانتهاء (اختياري)">
                        <DateInput value={expiryDate} onChange={setExpiryDate} />
                      </Field>
                    </>
                  ) : null}

                  {productType === "simple" ? (
                    <>
                      <Field label="تاريخ الانتهاء (اختياري)">
                        <DateInput value={expiryDate} onChange={setExpiryDate} />
                      </Field>
                      <Field label="علامة تجارية (اختياري)">
                        <Input
                          value={brand}
                          aria-label="العلامة التجارية"
                          onChange={(event) => setBrand(event.target.value)}
                          placeholder="العلامة التجارية"
                          className={FIELD_CLASS}
                        />
                      </Field>
                      <Field label="رمز الباركود (اختياري)">
                        {/* RTL: the field is written first so the icon sits on the left. */}
                        <div className="flex overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white">
                          <Input
                            value={barcode}
                            aria-label="رمز الباركود"
                            onChange={(event) => setBarcode(event.target.value)}
                            placeholder="6281234567890"
                            className="h-11 rounded-none border-0 bg-transparent text-[13px] focus-visible:ring-0"
                          />
                          <span className="flex w-12 shrink-0 items-center justify-center border-s border-[#e1e7f0] bg-[#f8fafd] text-[#95a4bd]">
                            <Barcode className="size-4" />
                          </span>
                        </div>
                      </Field>
                    </>
                  ) : null}

                  {productType === "weighted" ? (
                    <>
                      <Field label="تاريخ الانتهاء (اختياري)">
                        <DateInput value={expiryDate} onChange={setExpiryDate} />
                      </Field>
                      <Field label="بلد المنشأ (اختياري)">
                        <Input
                          value={countryOfOrigin}
                          aria-label="بلد المنشأ"
                          onChange={(event) => setCountryOfOrigin(event.target.value)}
                          placeholder="المملكة العربية السعودية"
                          className={FIELD_CLASS}
                        />
                      </Field>
                    </>
                  ) : null}

                  {isService ? (
                    <Field label="طريقة تقديم الخدمة">
                      <AppSearchableSelect
                        value={deliveryMethod}
                        options={DELIVERY_METHOD_OPTIONS}
                        onChange={setDeliveryMethod}
                        ariaLabel="طريقة تقديم الخدمة"
                      />
                    </Field>
                  ) : null}

                  {productType === "digital" ? (
                    <>
                      <Field label="متطلبات النظام (اختياري)">
                        <Textarea
                          value={systemRequirements}
                          maxLength={NOTES_LIMIT}
                          onChange={(event) => setSystemRequirements(event.target.value)}
                          placeholder="مثال: يحتاج إلى PDF أو برنامج معين..."
                          className="min-h-[84px] rounded-[12px] border-[#e1e7f0] bg-white text-[13px] placeholder:text-[#95a4bd]"
                        />
                        <p className={cn(HINT, MUTED)}>
                          {systemRequirements.length}/{NOTES_LIMIT}
                        </p>
                      </Field>
                      <Field label="لغة المنتج (اختياري)">
                        <AppSearchableSelect
                          value={productLanguage}
                          options={PRODUCT_LANGUAGE_OPTIONS}
                          onChange={setProductLanguage}
                          ariaLabel="لغة المنتج"
                        />
                      </Field>
                    </>
                  ) : null}

                  {isBundle ? (
                    <>
                      <Field label="مدة التحضير (اختياري)">
                        <SuffixInput
                          value={serviceDuration}
                          onChange={setServiceDuration}
                          suffix="دقيقة"
                          label="مدة التحضير"
                        />
                      </Field>
                      <Field label="تاريخ الإنتهاء (اختياري)">
                        <DateInput value={expiryDate} onChange={setExpiryDate} />
                      </Field>
                    </>
                  ) : null}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className={cn(PANEL, "p-4 md:p-5")}>
              <SectionHeading icon={ImageIcon} title={type.imageCardTitle} subtitle="" />

              {images.length > 0 ? (
                <div className="mt-4 space-y-2.5">
                  <div className="relative overflow-hidden rounded-[12px] border border-[#e1e7f0]">
                    {/* Object URLs from a File cannot go through the next/image loader. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={images[0].previewUrl}
                      alt={images[0].name}
                      className="h-[150px] w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute start-2.5 top-2.5 flex cursor-pointer items-center gap-1.5 rounded-full bg-[#0b1738]/85 px-3 py-1.5 text-[10.5px] font-semibold text-white backdrop-blur transition-colors hover:bg-[#0b1738]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Pencil className="size-3" />
                      تعديل الصورة
                    </button>
                    <button
                      type="button"
                      aria-label="حذف الصورة"
                      className="absolute end-2.5 top-2.5 flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0b1738]/85 text-white backdrop-blur transition-colors hover:bg-[#e0484d]"
                      onClick={() => removeImage(images[0].id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* RTL: thumbnails run right to left, with the add tile at the end. The first
                      image is the one shown in the preview above and in every listing, so it is
                      marked, and any thumbnail can be promoted into that slot. */}
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((image, index) => {
                      const isPrimary = index === 0

                      return (
                        <div
                          key={image.id}
                          className={cn(
                            "group relative aspect-square overflow-hidden rounded-[10px] border bg-[#fafbfe]",
                            isPrimary
                              ? "border-[#2878ff] ring-1 ring-[#2878ff]"
                              : "border-[#e1e7f0]"
                          )}
                        >
                          <button
                            type="button"
                            aria-label={
                              isPrimary
                                ? `${image.name} — الصورة الرئيسية`
                                : `اجعل ${image.name} الصورة الرئيسية`
                            }
                            className="size-full cursor-pointer"
                            disabled={isPrimary}
                            onClick={() =>
                              setImages((current) => [
                                image,
                                ...current.filter((entry) => entry.id !== image.id),
                              ])
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image.previewUrl}
                              alt={image.name}
                              className="size-full object-cover"
                            />
                          </button>

                          {isPrimary ? (
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#2878ff] py-0.5 text-center text-[8.5px] font-bold text-white">
                              رئيسية
                            </span>
                          ) : null}

                          <button
                            type="button"
                            aria-label={`حذف ${image.name}`}
                            className="absolute end-1 top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#e0484d] opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => removeImage(image.id)}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      )
                    })}

                    <button
                      type="button"
                      aria-label="إضافة صورة"
                      className="flex aspect-square cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-[#cfd9e8] bg-white text-[#95a4bd] transition-colors hover:border-[#2878ff] hover:text-[#2878ff]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-4 flex w-full cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-[#cfe0ff] bg-[#f8fbff] px-4 py-8 transition-colors hover:border-[#2878ff]"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    addImages(event.dataTransfer.files)
                  }}
                >
                  <span className="flex size-11 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
                    <ImageIcon className="size-5" />
                  </span>
                  <span className={cn("mt-3 text-[12.5px] font-bold", HEADING)}>
                    اسحب وأفلت الصورة هنا
                  </span>
                  <span className={cn("mt-1 text-[11px]", MUTED)}>أو اضغط للاختيار من الجهاز</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(event) => {
                  addImages(event.target.files)
                  event.target.value = ""
                }}
              />

              <p className={cn("mt-2.5 text-center text-[10.5px]", MUTED)}>
                PNG, JPG, WebP حتى 10MB
              </p>
            </section>

            <section className={cn(PANEL, "p-4 md:p-5")}>
              <SectionHeading
                icon={Send}
                title="حالة النشر"
                subtitle={`تحكم في ظهور ${isService ? "الخدمة" : "المنتج"} في المتجر`}
                roundIcon
              />

              {/* RTL: the switch is written first so it sits to the right of its label. */}
              <div className="mt-5 flex items-center gap-3">
                <Switch
                  id="published"
                  checked={published}
                  onCheckedChange={setPublished}
                  className="h-6 w-11 data-[state=checked]:bg-[#2878ff] [&>span]:size-5"
                />
                <Label
                  htmlFor="published"
                  className={cn("cursor-pointer text-[15px] font-extrabold", HEADING)}
                >
                  {published ? "منشور" : "غير منشور"}
                </Label>
              </div>

              <p className={cn("mt-3 text-[10.5px]", MUTED)}>
                {published
                  ? `${isService ? "ستظهر الخدمة" : "سيظهر المنتج"} في جميع قنوات البيع المتصلة`
                  : `${isService ? "لن تظهر الخدمة" : "لن يظهر المنتج"} للعملاء حتى يتم النشر`}
              </p>
            </section>

            {/* The brand/model fields live in the aside for a variable product, matching the
                export, since its main column is taken up by the variants table. */}
            {isVariable ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 text-right"
                  aria-expanded={extraOpen}
                  onClick={() => setExtraOpen((current) => !current)}
                >
                  <SectionHeading icon={Settings2} title="معلومات إضافية" subtitle="" />
                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-[#95a4bd] transition-transform",
                      extraOpen && "rotate-180"
                    )}
                  />
                </button>

                {extraOpen ? (
                  <div className="mt-4 space-y-3.5">
                    <Field label="العلامة التجارية (اختياري)">
                      <Input
                        value={brand}
                        aria-label="العلامة التجارية"
                        onChange={(event) => setBrand(event.target.value)}
                        placeholder="Nike"
                        className={FIELD_CLASS}
                      />
                    </Field>
                    <Field label="الموديل (اختياري)">
                      <Input
                        value={model}
                        aria-label="الموديل"
                        onChange={(event) => setModel(event.target.value)}
                        placeholder="Air Max"
                        className={FIELD_CLASS}
                      />
                    </Field>
                    <Field label="ملاحظات داخلية (اختياري)">
                      <Textarea
                        value={internalNotes}
                        maxLength={NOTES_LIMIT}
                        onChange={(event) => setInternalNotes(event.target.value)}
                        className="min-h-[76px] rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
                      />
                      <p className={cn(HINT, MUTED)}>
                        {internalNotes.length}/{NOTES_LIMIT}
                      </p>
                    </Field>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className={cn(PANEL, "p-4 md:p-5")}>
              <SectionHeading icon={Info} title="معلومات سريعة" subtitle="" />

              <div className="mt-4 space-y-3">
                {/* Dates are the draft's own, not a stored record -- nothing is saved yet. */}
                <QuickFact
                  icon={CalendarDays}
                  label="تاريخ الإضافة"
                  value={DATE_AR.format(new Date())}
                />
                <QuickFact icon={Clock} label="آخر تحديث" value={DATE_AR.format(new Date())} />
                <QuickFact
                  icon={User}
                  label="أضيف بواسطة"
                  value={currentUser?.fullName || currentUser?.email || "—"}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* RTL: the primary action is written first so it sits at the right of the pair. */}
      <div className="sticky bottom-0 z-30 -mx-6 border-t border-[#e1e7f0] bg-white/95 px-6 py-3 backdrop-blur">
        {/* was `fixed inset-x-0`: that draws over the app sidebar's own help card since it
            positions against the whole viewport rather than this page's own column. `sticky`
            stays pinned to the bottom without leaving this column's real width; the negative
            margin cancels the admin shell's own p-6 so the bar still reaches this column's
            edges. */}
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-end gap-2.5">
          {/* Both are disabled while a save is in flight, so a double click cannot create the
              product twice -- there is no idempotency key on this endpoint. */}
          <Button
            className="h-11 gap-2 rounded-[12px] bg-[#2878ff] px-6 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
            disabled={saving}
            onClick={() => void submit(false)}
          >
            {saving ? "جارٍ الحفظ..." : isEditing ? "حفظ التعديلات" : type.saveLabel}
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          </Button>
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-[12px] border-[#e1e7f0] bg-white px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
            disabled={saving}
            onClick={() => void submit(true)}
          >
            حفظ كمسودة
            <Tag className="size-4" />
          </Button>
          {/* RTL: written last so it sits at the far left, away from the save actions -- it is
              the destructive-by-omission choice and should not be the easy one to hit. */}
          <Button
            variant="ghost"
            className="h-11 rounded-[12px] px-5 text-[13px] font-semibold text-[#6b7b96] hover:bg-[#f2f5fa] hover:text-[#0b1738]"
            disabled={saving}
            onClick={cancel}
          >
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}

const OPTION_ORDINALS = ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"]

function optionLabel(index: number) {
  return OPTION_ORDINALS[index] ?? `الخيار ${index + 1}`
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  roundIcon = false,
}: {
  icon: typeof Package
  title: string
  subtitle: string
  roundIcon?: boolean
}) {
  // RTL: the icon tile is written first so it lands rightmost, with the copy beside it.
  return (
    <div className="flex flex-1 items-start gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center bg-[#eef4ff] text-[#2878ff]",
          roundIcon ? "rounded-full" : "rounded-[12px]"
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div>
        <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{title}</h2>
        {subtitle ? <p className={cn("mt-1 text-[11.5px] leading-5", MUTED)}>{subtitle}</p> : null}
      </div>
    </div>
  )
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  children: React.ReactNode
}) {
  // The marker is what submit() scrolls to -- it has to sit on the wrapper so the label scrolls
  // into view with the field, not just the field itself.
  return (
    <div data-field-error={error ? "true" : undefined}>
      <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
        {label}
        {required ? <span className="text-[#e0484d]"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{error}</p> : null}
    </div>
  )
}

function MoneyInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  // RTL: the field is written first so the currency chip sits on the left, as in the export.
  return (
    <div className="flex overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white">
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
        className="h-11 rounded-none border-0 bg-transparent text-[13px] focus-visible:ring-0"
      />
      <span
        className={cn(
          "flex w-14 shrink-0 items-center justify-center border-s border-[#e1e7f0] bg-[#f8fafd] text-[11.5px] font-semibold",
          MUTED
        )}
      >
        ريال
      </span>
    </div>
  )
}

// Sits right under every sell-price field. In manual mode (Settings -> الضرائب -> "الأسعار تشمل
// الضريبة" -> "الاختيار يدوي أثناء إضافة المنتج") this is a real dropdown the merchant picks per
// product; otherwise it's the same read-only hint text as before, reflecting the org's fixed
// default.
function PriceTaxIndicator({
  isManualTaxMode,
  priceIncludesTax,
  setPriceIncludesTax,
  priceTaxHint,
}: {
  isManualTaxMode: boolean
  priceIncludesTax: boolean
  setPriceIncludesTax: (next: boolean) => void
  priceTaxHint: string
}) {
  if (isManualTaxMode) {
    return (
      <div className="mt-1.5">
        <AppSearchableSelect
          value={priceIncludesTax ? "included" : "excluded"}
          options={PRICE_TAX_MODE_OPTIONS}
          onChange={(value) => setPriceIncludesTax(value === "included")}
          ariaLabel="شمول الضريبة"
          compact
        />
      </div>
    )
  }
  return <p className={cn(HINT, MUTED)}>{priceTaxHint}</p>
}

function SuffixInput({
  value,
  onChange,
  suffix,
  label,
}: {
  value: string
  onChange: (next: string) => void
  suffix: string
  label: string
}) {
  return (
    <div className="flex overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white">
      <Input
        type="number"
        min={0}
        step="any"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="h-11 rounded-none border-0 bg-transparent text-[13px] focus-visible:ring-0"
      />
      <span
        className={cn(
          "flex w-16 shrink-0 items-center justify-center border-s border-[#e1e7f0] bg-[#f8fafd] text-[11.5px] font-semibold",
          MUTED
        )}
      >
        {suffix}
      </span>
    </div>
  )
}

function DateInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <DateField value={value} onChange={onChange} />
}

function UnitSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <AppSearchableSelect
      value={value}
      options={BASE_UNIT_OPTIONS}
      onChange={onChange}
      ariaLabel="وحدة القياس"
      searchPlaceholder="البحث عن وحدة قياس..."
    />
  )
}

function QuickFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package
  label: string
  value: string
}) {
  // RTL: the copy is written first so the icon tile sits on the left, as in the export.
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-right">
        <p className={cn("text-[11.5px] font-bold", HEADING)}>{label}</p>
        <p className={cn("mt-0.5 text-[11px]", MUTED)}>{value}</p>
      </div>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f2f5fa] text-[#5b6b85]">
        <Icon className="size-4" />
      </span>
    </div>
  )
}

function PackagingReadout({
  breakdown,
  perCarton,
  linkedName,
}: {
  breakdown: { pieces: number; cartons: number; remainder: number }
  perCarton: number
  linkedName: string | null
}) {
  const { cartons, remainder, pieces } = breakdown

  // Read out both ways round: the shelf figure (whole cartons plus loose pieces) and the total
  // in single units, since a stock count is done in one and a sale happens in the other.
  const shelf =
    remainder === 0
      ? `${NUMBER_AR.format(cartons)} كرتون`
      : cartons === 0
        ? `${NUMBER_AR.format(remainder)} حبة`
        : `${NUMBER_AR.format(cartons)} كرتون و ${NUMBER_AR.format(remainder)} حبة`

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-[10px] bg-[#f2fbf6] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#1f9d55]">{shelf}</span>
      <span className="text-[10.5px] text-[#6b7b96]">
        = {NUMBER_AR.format(pieces)} حبة{linkedName ? ` من ${linkedName}` : ""} · الكرتون{" "}
        {NUMBER_AR.format(perCarton)} حبة
      </span>
    </div>
  )
}

function CalcCell({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-[10px] bg-white px-3 py-2 text-center">
      <p
        className={cn(
          "text-[12px] font-extrabold leading-tight",
          emphasis ? "text-[#1f9d55]" : HEADING
        )}
      >
        {value}
      </p>
      <p className={cn("mt-0.5 text-[9.5px]", MUTED)}>{label}</p>
    </div>
  )
}
