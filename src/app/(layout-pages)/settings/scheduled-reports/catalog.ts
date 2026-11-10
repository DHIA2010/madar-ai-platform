// التقارير المجدولة على واتساب: one category per Madar app (plus reports across all of them),
// each holding the report templates that can be scheduled for it. A template with a screen is
// set up there; the rest of a category is "coming soon" until its reports are built.

import {
  ClipboardList,
  LayoutGrid,
  Megaphone,
  type LucideIcon,
  MonitorSmartphone,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react"

import { ROUTES } from "@/constants/routes"

export const REPORT_CATEGORIES = [
  "pos",
  "ecommerce",
  "advertising",
  "procurement",
  "expenses",
  "all",
] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]

export const isReportCategory = (value: string): value is ReportCategory =>
  (REPORT_CATEGORIES as readonly string[]).includes(value)

export interface ReportTemplate {
  key: "daily-report"
  icon: LucideIcon
  href: string
}

export interface CategoryMeta {
  icon: LucideIcon
  // Tile and accent colours.
  tile: string
  accent: string
  templates: ReportTemplate[]
}

export const CATEGORY_META: Record<ReportCategory, CategoryMeta> = {
  pos: {
    icon: MonitorSmartphone,
    tile: "bg-[#eaf1ff] text-[#2563eb]",
    accent: "group-hover:border-[#bcd2ff]",
    templates: [{ key: "daily-report", icon: ClipboardList, href: ROUTES.settingsDailyReport }],
  },
  ecommerce: {
    icon: ShoppingBag,
    tile: "bg-[#f3ecff] text-[#7c3aed]",
    accent: "group-hover:border-[#dccbff]",
    templates: [],
  },
  advertising: {
    icon: Megaphone,
    tile: "bg-[#fff1e6] text-[#ea580c]",
    accent: "group-hover:border-[#fed7aa]",
    templates: [],
  },
  procurement: {
    icon: Truck,
    tile: "bg-[#e7f8ee] text-[#16a34a]",
    accent: "group-hover:border-[#bbf7d0]",
    templates: [],
  },
  expenses: {
    icon: Wallet,
    tile: "bg-[#fdeeee] text-[#dc2626]",
    accent: "group-hover:border-[#fecaca]",
    templates: [],
  },
  all: {
    icon: LayoutGrid,
    tile: "bg-[#eef2f7] text-[#334155]",
    accent: "group-hover:border-[#cbd5e1]",
    templates: [],
  },
}

export const categoryHref = (category: ReportCategory) =>
  `${ROUTES.settingsScheduledReports}/${category}`
