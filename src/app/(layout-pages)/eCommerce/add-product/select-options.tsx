// Icon and tint for every fixed dropdown on the Add Product page. Kept beside the page rather
// than in the design system because the pairings are specific to this form's vocabulary.
//
// Every tint is written out in full: Tailwind generates utilities by scanning the source, so a
// class assembled at runtime produces no CSS and the tile renders unstyled.

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

import type { AppSearchableSelectOption } from "@/components/app"

const BLUE = "bg-[#e8f0ff] text-[#2878ff]"
const GREEN = "bg-[#e4f7ec] text-[#1f9d55]"
const PURPLE = "bg-[#efe9ff] text-[#8b5cf6]"
const AMBER = "bg-[#fff3dc] text-[#e08b00]"
const PINK = "bg-[#ffe9ee] text-[#e0484d]"
const TEAL = "bg-[#e2f6f4] text-[#12a594]"

// The base unit shown on raw materials, simple and weighted products. Values keep the
// "كجم (KG)" shape the form already stored so existing drafts are unaffected.
// The hint names the dimension, and the scale where one exists -- that is what decides whether
// two units can be compared by formula, so it is the useful thing to show rather than a
// restatement of the label.
export const BASE_UNIT_OPTIONS: AppSearchableSelectOption[] = [
  {
    value: "كجم (KG)",
    label: "كجم",
    hint: "وزن · 1000 جرام",
    icon: Weight,
    tint: PURPLE,
    keywords: "kg kilo كيلوجرام",
  },
  { value: "جرام (G)", label: "جرام", hint: "وزن", icon: Weight, tint: GREEN, keywords: "g gram" },
  {
    value: "لتر (L)",
    label: "لتر",
    hint: "حجم · 1000 مل",
    icon: Beaker,
    tint: PINK,
    keywords: "l liter litre",
  },
  { value: "مل (ML)", label: "مل", hint: "حجم", icon: Droplet, tint: AMBER, keywords: "ml مليلتر" },
  {
    value: "حبة (PCS)",
    label: "حبة",
    hint: "عدد",
    icon: Box,
    tint: BLUE,
    keywords: "pcs piece قطعة",
  },
  {
    value: "كرتون (CTN)",
    label: "كرتون",
    hint: "تعبئة · حدد عدد الحبات",
    icon: Boxes,
    tint: TEAL,
    keywords: "ctn carton case صندوق علبة",
  },
]

// The recipe/stock units on a bundle component row. These are the raw unit strings the
// conversion table in the page keys on, so the value is the bare unit with no suffix.
export const COMPONENT_UNIT_OPTIONS: AppSearchableSelectOption[] = [
  { value: "حبة", label: "حبة", hint: "عدد", icon: Box, tint: BLUE, keywords: "pcs piece قطعة" },
  {
    value: "كرتون",
    label: "كرتون",
    hint: "تعبئة · حدد عدد الحبات",
    icon: Boxes,
    tint: TEAL,
    keywords: "ctn carton case صندوق علبة",
  },
  { value: "جرام", label: "جرام", hint: "وزن", icon: Weight, tint: GREEN, keywords: "g gram" },
  {
    value: "كجم",
    label: "كجم",
    hint: "وزن · 1000 جرام",
    icon: Weight,
    tint: PURPLE,
    keywords: "kg kilo",
  },
  { value: "مل", label: "مل", hint: "حجم", icon: Droplet, tint: AMBER, keywords: "ml مليلتر" },
  {
    value: "لتر",
    label: "لتر",
    hint: "حجم · 1000 مل",
    icon: Beaker,
    tint: PINK,
    keywords: "l liter litre",
  },
]

export const PRICING_TYPE_OPTIONS: AppSearchableSelectOption[] = [
  { value: "سعر ثابت", label: "سعر ثابت", hint: "مبلغ واحد لكل طلب", icon: Banknote, tint: GREEN },
  { value: "سعر بالساعة", label: "سعر بالساعة", hint: "يُحتسب حسب المدة", icon: Clock, tint: BLUE },
  { value: "حسب الطلب", label: "حسب الطلب", hint: "يُحدد لكل عميل", icon: Tag, tint: AMBER },
]

export const SERVICE_DURATION_UNIT_OPTIONS: AppSearchableSelectOption[] = [
  { value: "دقيقة", label: "دقيقة", icon: Timer, tint: BLUE },
  { value: "ساعة", label: "ساعة", icon: Hourglass, tint: PURPLE },
  { value: "يوم", label: "يوم", icon: CalendarClock, tint: TEAL },
]

export const DELIVERY_METHOD_OPTIONS: AppSearchableSelectOption[] = [
  { value: "عبر الإنترنت", label: "عبر الإنترنت", icon: Globe, tint: BLUE },
  { value: "في الموقع", label: "في الموقع", icon: Store, tint: PURPLE },
  { value: "لدى العميل", label: "لدى العميل", icon: Handshake, tint: GREEN },
]

export const PRODUCT_LANGUAGE_OPTIONS: AppSearchableSelectOption[] = [
  { value: "العربية", label: "العربية", icon: Languages, tint: GREEN },
  { value: "الإنجليزية", label: "الإنجليزية", icon: Languages, tint: BLUE },
  { value: "متعدد اللغات", label: "متعدد اللغات", icon: Globe, tint: PURPLE },
]

export const CATEGORY_ICON = Tag
export const CATEGORY_TINT = TEAL
export const LOCATION_ICON = MapPin
export const LOCATION_TINT = AMBER
export const COMPONENT_FALLBACK_ICON = Package
export const COMPONENT_FALLBACK_TINT = GREEN
export const DIGITAL_ICON = Laptop
