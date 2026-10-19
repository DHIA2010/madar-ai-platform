// Everything that varies by product type, in one place: the seven cards in the selector, the
// page's own title, and the labels that change wording for a service ("حفظ الخدمة", "صورة
// الخدمة"). The section layouts themselves live in AddProduct.tsx and switch on `key`.
//
// Display text lives in the "products.types" i18n namespace, resolved via getProductTypes(t) --
// this file only keeps the locale-independent facts (key, icon, tint, descriptionLimit).

import { CalendarDays, Download, GitBranch, Layers, Package, Scale, Sprout } from "lucide-react"
import type { useTranslations } from "next-intl"

export type ProductTypeKey =
  | "raw"
  | "simple"
  | "bundle"
  | "variable"
  | "weighted"
  | "digital"
  | "service"

export interface ProductTypeOption {
  key: ProductTypeKey
  title: string
  description: string
  icon: typeof Package
  tint: string
  pageTitle: string
  pageSubtitle: string
  saveLabel: string
  imageCardTitle: string
  nameLabel: string
  skuLabel: string
  descriptionLabel: string
  descriptionLimit: number
}

interface ProductTypeData {
  key: ProductTypeKey
  icon: typeof Package
  tint: string
  descriptionLimit: number
}

// RTL: the first entry lands rightmost, which is where the row starts. Ordered so the everyday
// product types come first and the ones set up once rather than added daily -- a raw material,
// a service -- sit at the end.
const PRODUCT_TYPE_DATA: ProductTypeData[] = [
  { key: "simple", icon: Package, tint: "bg-[#eef4ff] text-[#2878ff]", descriptionLimit: 500 },
  { key: "variable", icon: GitBranch, tint: "bg-[#f3eeff] text-[#8b5cf6]", descriptionLimit: 500 },
  { key: "weighted", icon: Scale, tint: "bg-[#e6f7f5] text-[#12a594]", descriptionLimit: 500 },
  { key: "digital", icon: Download, tint: "bg-[#e9f8ef] text-[#1f9d55]", descriptionLimit: 1000 },
  { key: "bundle", icon: Layers, tint: "bg-[#eef4ff] text-[#2878ff]", descriptionLimit: 500 },
  { key: "raw", icon: Sprout, tint: "bg-[#e9f8ef] text-[#1f9d55]", descriptionLimit: 500 },
  {
    key: "service",
    icon: CalendarDays,
    tint: "bg-[#fff3e3] text-[#e08b00]",
    descriptionLimit: 500,
  },
]

export function getProductTypes(
  t: ReturnType<typeof useTranslations<"products.types">>
): ProductTypeOption[] {
  return PRODUCT_TYPE_DATA.map((data) => ({
    ...data,
    title: t(`${data.key}.title`),
    description: t(`${data.key}.description`),
    pageTitle: t(`${data.key}.pageTitle`),
    pageSubtitle: t(`${data.key}.pageSubtitle`),
    saveLabel: t(`${data.key}.saveLabel`),
    imageCardTitle: t(`${data.key}.imageCardTitle`),
    nameLabel: t(`${data.key}.nameLabel`),
    skuLabel: t(`${data.key}.skuLabel`),
    descriptionLabel: t(`${data.key}.descriptionLabel`),
  }))
}

// A bundled product is identified by its components, and a raw material by its own stock
// record, so neither carries a stock code.
export const TYPES_WITHOUT_SKU: ProductTypeKey[] = ["raw", "bundle"]

// Mirrors the backend's TYPES_REQUIRING_STOCK (products/catalog-types.ts) -- the only types that
// carry their own stock_quantity, and so the only ones a product-level "link to Salla product"
// (for pushing stock on a Madar sale) makes sense for. A bundle has its components linked
// separately instead, and a variable product's own row never carries any stock of its own (only
// its variants do).
export const STOCK_TRACKED_TYPES: ProductTypeKey[] = ["raw", "simple", "weighted"]
