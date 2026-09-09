// Everything that varies by product type, in one place: the seven cards in the selector, the
// page's own title, and the labels that change wording for a service ("حفظ الخدمة", "صورة
// الخدمة"). The section layouts themselves live in AddProduct.tsx and switch on `key`.

import { CalendarDays, Download, GitBranch, Layers, Package, Scale, Sprout } from "lucide-react"

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

// RTL: the first entry lands rightmost, which is where the export starts the row.
export const PRODUCT_TYPES: ProductTypeOption[] = [
  {
    key: "raw",
    title: "مادة خام",
    description: "مادة أولية للمخزون",
    icon: Sprout,
    tint: "bg-[#e9f8ef] text-[#1f9d55]",
    pageTitle: "إضافة مادة خام",
    pageSubtitle: "إضافة مادة أولية للمخزون تستخدم في المنتجات المجمعة أو تباع مباشرة.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 500,
  },
  {
    key: "simple",
    title: "منتج عادي",
    description: "منتج جاهز للبيع",
    icon: Package,
    tint: "bg-[#eef4ff] text-[#2878ff]",
    pageTitle: "إضافة منتج عادي",
    pageSubtitle: "إضافة منتج جاهز للبيع في متجرك.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 500,
  },
  {
    key: "bundle",
    title: "منتج مجمع",
    description: "يتكون من عدة مكونات",
    icon: Layers,
    tint: "bg-[#eef4ff] text-[#2878ff]",
    pageTitle: "إضافة منتج مجمع",
    pageSubtitle: "إنشاء منتج يتكون من عدة مكونات يتم خصمها من المخزون عند البيع.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 500,
  },
  {
    key: "variable",
    title: "منتج متغير",
    description: "متغيرات مثل المقاس",
    icon: GitBranch,
    tint: "bg-[#f3eeff] text-[#8b5cf6]",
    pageTitle: "إضافة منتج متغير",
    pageSubtitle: "إضافة منتج متعدد المتغيرات مثل المقاسات والألوان وغيرها.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 500,
  },
  {
    key: "weighted",
    title: "منتج موزون",
    description: "يُباع بالوزن",
    icon: Scale,
    tint: "bg-[#e6f7f5] text-[#12a594]",
    pageTitle: "إضافة منتج موزون",
    pageSubtitle: "إضافة منتج يباع بالوزن مثل الجرام أو الكيلو.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 500,
  },
  {
    key: "service",
    title: "خدمة",
    description: "خدمة تقدم للعميل",
    icon: CalendarDays,
    tint: "bg-[#fff3e3] text-[#e08b00]",
    pageTitle: "إضافة خدمة جديدة",
    pageSubtitle: "إضافة خدمة تقدم للعميل مثل الاستشارات أو الصيانة أو التوصيل.",
    saveLabel: "حفظ الخدمة",
    imageCardTitle: "صورة الخدمة",
    nameLabel: "اسم الخدمة",
    skuLabel: "رمز الخدمة (SKU)",
    descriptionLabel: "وصف الخدمة",
    descriptionLimit: 500,
  },
  {
    key: "digital",
    title: "منتج رقمي",
    description: "ملف أو رابط تحميل",
    icon: Download,
    tint: "bg-[#e9f8ef] text-[#1f9d55]",
    pageTitle: "إضافة منتج رقمي",
    pageSubtitle: "إضافة منتج رقمي قابل للتحميل أو الوصول الرقمي.",
    saveLabel: "حفظ المنتج",
    imageCardTitle: "صورة المنتج",
    nameLabel: "اسم المنتج",
    skuLabel: "رمز المنتج (SKU)",
    descriptionLabel: "وصف المنتج",
    descriptionLimit: 1000,
  },
]

// A bundled product is identified by its components, and a raw material by its own stock
// record, so neither carries a stock code.
export const TYPES_WITHOUT_SKU: ProductTypeKey[] = ["raw", "bundle"]
