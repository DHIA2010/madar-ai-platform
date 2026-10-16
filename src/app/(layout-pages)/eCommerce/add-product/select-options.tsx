// Icon and tint for every fixed dropdown on the Add Product page. Kept beside the page rather
// than in the design system because the pairings are specific to this form's vocabulary.
//
// Every tint is written out in full: Tailwind generates utilities by scanning the source, so a
// class assembled at runtime produces no CSS and the tile renders unstyled.
//
// Display text (label/hint) lives in the "products" i18n namespace, resolved via the
// getXxxOptions(t) functions below -- `value` stays the original Arabic string on purpose (see
// each section's comment): it's the data the form persists and, for component units, the key the
// unit-conversion table in AddProduct.tsx looks up by, so translating it would silently break
// stored drafts and that lookup.

import {
  Banknote,
  Beaker,
  Box,
  Boxes,
  CalendarClock,
  Clock,
  Droplet,
  Globe,
  Handshake,
  Hourglass,
  Languages,
  Laptop,
  MapPin,
  Package,
  Store,
  Tag,
  Timer,
  Weight,
} from "lucide-react"
import type { useTranslations } from "next-intl"

import type { AppSearchableSelectOption } from "@/components/app"

const BLUE = "bg-[#e8f0ff] text-[#2878ff]"
const GREEN = "bg-[#e4f7ec] text-[#1f9d55]"
const PURPLE = "bg-[#efe9ff] text-[#8b5cf6]"
const AMBER = "bg-[#fff3dc] text-[#e08b00]"
const PINK = "bg-[#ffe9ee] text-[#e0484d]"
const TEAL = "bg-[#e2f6f4] text-[#12a594]"

type ProductsTranslator = ReturnType<typeof useTranslations<"products">>

// The base unit shown on raw materials, simple and weighted products. Values keep the
// "كجم (KG)" shape the form already stored so existing drafts are unaffected.
// The hint names the dimension, and the scale where one exists -- that is what decides whether
// two units can be compared by formula, so it is the useful thing to show rather than a
// restatement of the label.
export function getBaseUnitOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    {
      value: "كجم (KG)",
      label: t("units.kg.label"),
      hint: t("units.kg.hint"),
      icon: Weight,
      tint: PURPLE,
      keywords: "kg kilo كيلوجرام",
    },
    {
      value: "جرام (G)",
      label: t("units.g.label"),
      hint: t("units.g.hint"),
      icon: Weight,
      tint: GREEN,
      keywords: "g gram",
    },
    {
      value: "لتر (L)",
      label: t("units.l.label"),
      hint: t("units.l.hint"),
      icon: Beaker,
      tint: PINK,
      keywords: "l liter litre",
    },
    {
      value: "مل (ML)",
      label: t("units.ml.label"),
      hint: t("units.ml.hint"),
      icon: Droplet,
      tint: AMBER,
      keywords: "ml مليلتر",
    },
    {
      value: "حبة (PCS)",
      label: t("units.pcs.label"),
      hint: t("units.pcs.hint"),
      icon: Box,
      tint: BLUE,
      keywords: "pcs piece قطعة",
    },
    {
      value: "كرتون (CTN)",
      label: t("units.ctn.label"),
      hint: t("units.ctn.hint"),
      icon: Boxes,
      tint: TEAL,
      keywords: "ctn carton case صندوق علبة",
    },
  ]
}

// The recipe/stock units on a bundle component row. These are the raw unit strings the
// conversion table in the page keys on, so the value is the bare unit with no suffix.
export function getComponentUnitOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    {
      value: "حبة",
      label: t("units.pcs.label"),
      hint: t("units.pcs.hint"),
      icon: Box,
      tint: BLUE,
      keywords: "pcs piece قطعة",
    },
    {
      value: "كرتون",
      label: t("units.ctn.label"),
      hint: t("units.ctn.hint"),
      icon: Boxes,
      tint: TEAL,
      keywords: "ctn carton case صندوق علبة",
    },
    {
      value: "جرام",
      label: t("units.g.label"),
      hint: t("units.g.hint"),
      icon: Weight,
      tint: GREEN,
      keywords: "g gram",
    },
    {
      value: "كجم",
      label: t("units.kg.label"),
      hint: t("units.kg.hint"),
      icon: Weight,
      tint: PURPLE,
      keywords: "kg kilo",
    },
    {
      value: "مل",
      label: t("units.ml.label"),
      hint: t("units.ml.hint"),
      icon: Droplet,
      tint: AMBER,
      keywords: "ml مليلتر",
    },
    {
      value: "لتر",
      label: t("units.l.label"),
      hint: t("units.l.hint"),
      icon: Beaker,
      tint: PINK,
      keywords: "l liter litre",
    },
  ]
}

export function getPricingTypeOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    {
      value: "سعر ثابت",
      label: t("pricingType.fixed.label"),
      hint: t("pricingType.fixed.hint"),
      icon: Banknote,
      tint: GREEN,
    },
    {
      value: "سعر بالساعة",
      label: t("pricingType.hourly.label"),
      hint: t("pricingType.hourly.hint"),
      icon: Clock,
      tint: BLUE,
    },
    {
      value: "حسب الطلب",
      label: t("pricingType.custom.label"),
      hint: t("pricingType.custom.hint"),
      icon: Tag,
      tint: AMBER,
    },
  ]
}

export function getServiceDurationUnitOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    { value: "دقيقة", label: t("serviceDuration.minute"), icon: Timer, tint: BLUE },
    { value: "ساعة", label: t("serviceDuration.hour"), icon: Hourglass, tint: PURPLE },
    { value: "يوم", label: t("serviceDuration.day"), icon: CalendarClock, tint: TEAL },
  ]
}

export function getDeliveryMethodOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    { value: "عبر الإنترنت", label: t("deliveryMethod.online"), icon: Globe, tint: BLUE },
    { value: "في الموقع", label: t("deliveryMethod.onsite"), icon: Store, tint: PURPLE },
    { value: "لدى العميل", label: t("deliveryMethod.atCustomer"), icon: Handshake, tint: GREEN },
  ]
}

export function getProductLanguageOptions(t: ProductsTranslator): AppSearchableSelectOption[] {
  return [
    { value: "العربية", label: t("language.arabic"), icon: Languages, tint: GREEN },
    { value: "الإنجليزية", label: t("language.english"), icon: Languages, tint: BLUE },
    { value: "متعدد اللغات", label: t("language.multilingual"), icon: Globe, tint: PURPLE },
  ]
}

export const CATEGORY_ICON = Tag
export const CATEGORY_TINT = TEAL
export const LOCATION_ICON = MapPin
export const LOCATION_TINT = AMBER
export const COMPONENT_FALLBACK_ICON = Package
export const COMPONENT_FALLBACK_TINT = GREEN
export const DIGITAL_ICON = Laptop
