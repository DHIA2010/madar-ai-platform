"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  getMonth,
  getYear,
  isWithinInterval,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import {
  AlertTriangle,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Globe,
  Loader2,
  Package,
  Pencil,
  Search,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Wallet,
  X,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Upload,
  type LucideIcon,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { cairo } from "@/components/design/fonts"
import {
  productListService,
  type BulkImportProductResult,
  type BulkImportProductRow,
  type ProductRecord,
} from "@/features/products/services/product-list.service"

import { Button } from "@/components/ui/button"
import { AppSearchableSelect } from "@/components/app"
import { Can } from "@/features/authentication/components"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ProductStatus = ProductRecord["status"]
type ProductRow = ProductRecord

// Colours and radii from the products SVG export, matching the campaigns/stores surfaces.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FILTER_TRIGGER_CLASS =
  "h-10 w-[184px] rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"

// The filter values drive the filtering, so only their display is localised.
const FILTER_LABEL_AR: Record<string, string> = {
  "All Platforms": "جميع المنصات",
  "All Categories": "جميع الفئات",
  "All Inventory Status": "جميع حالات المخزون",
  "All Status": "جميع الحالات",
  Shopify: "Shopify",
  Salla: "Salla",
  Zid: "Zid",
  Madar: "مدار",
  "In Stock": "متوفر",
  "Low Stock": "مخزون منخفض",
  "Out of Stock": "نفدت الكمية",
  Active: "نشط",
  Draft: "مسودة",
  Archived: "مؤرشف",
  "All Product Types": "جميع أنواع المنتجات",
  simple: "منتج عادي",
  variable: "منتج متغير",
  weighted: "منتج موزون",
  bundle: "منتج مجمع",
  raw: "مادة خام",
  digital: "منتج رقمي",
  service: "خدمة",
}

const STATUS_PILL_AR: Record<ProductStatus, { label: string; className: string }> = {
  Active: { label: "نشط", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  Draft: { label: "مسودة", className: "bg-[#eef4ff] text-[#2878ff]" },
  Archived: { label: "مؤرشف", className: "bg-[#eef2f8] text-[#5b6b85]" },
}

const INVENTORY_PILL_AR: Record<string, { label: string; className: string }> = {
  "In Stock": { label: "متوفر", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  "Low Stock": { label: "مخزون منخفض", className: "bg-[#fff7e6] text-[#e08b00]" },
  "Out of Stock": { label: "نفدت الكمية", className: "bg-[#fdeeee] text-[#e0484d]" },
}

const ARABIC_DATE = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

const FALLBACK_PRODUCT_IMAGE = "/products/01.png"
// "Madar" covers products authored on the Add Product page rather than synced from a
// storefront -- GET /v1/products returns both sources in one list.
const platformOptions = ["All Platforms", "Shopify", "Salla", "Zid", "Madar"]
const inventoryStatusOptions = ["All Inventory Status", "In Stock", "Low Stock", "Out of Stock"]
const statusOptions = ["All Status", "Active", "Draft", "Archived"]
// Only a native (Madar) product ever carries one of these -- a synced storefront product's
// productType is always null, so it simply never matches any option here but "all".
const productTypeOptions = [
  "All Product Types",
  "simple",
  "variable",
  "weighted",
  "bundle",
  "raw",
  "digital",
  "service",
]
const monthOptions = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const yearOptions = Array.from({ length: 21 }, (_, index) => 2018 + index)

function getDateRangePresets(): Array<{ label: string; range: DateRange }> {
  const today = new Date()
  const lastMonth = subMonths(today, 1)

  return [
    { label: "Yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Last 7 Days", range: { from: subDays(today, 6), to: today } },
    { label: "Last 30 Days", range: { from: subDays(today, 29), to: today } },
    { label: "This Month", range: { from: startOfMonth(today), to: endOfMonth(today) } },
    { label: "Last Month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
  ]
}

// Defaults to SAR since every commerce connector MADAR supports today (Salla, Shopify stores
// configured for KSA, Zid) is Saudi-market -- uses the product's own currency when the sync
// captured one (currently only Salla's payload carries an explicit currency code).
function formatCurrency(value: number, currency: string | null = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "SAR",
    maximumFractionDigits: 2,
  }).format(value)
}

interface ProductKpiCardData {
  label: string
  value: string
  footnote: string
  icon: LucideIcon
  tone: "blue" | "green" | "rose" | "violet"
}

const PRODUCT_KPI_TONE_CLASSNAMES: Record<ProductKpiCardData["tone"], string> = {
  blue: "bg-[#eef4ff] text-[#2878ff]",
  green: "bg-[#e9f8ef] text-[#1f9d55]",
  rose: "bg-[#fdeeee] text-[#e0484d]",
  violet: "bg-[#f3eeff] text-[#8b5cf6]",
}

function ProductKpiCard({ kpi }: { kpi: ProductKpiCardData }) {
  const Icon = kpi.icon

  return (
    <div className={cn(PANEL, "p-4")}>
      {/* RTL: the label/value block is written first so it lands on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[12px] leading-[18px]", MUTED)}>{kpi.label}</p>
          <p className={cn("mt-1.5 text-[22px] font-extrabold leading-tight", HEADING)}>
            {kpi.value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
            PRODUCT_KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>

      {/* The export shows a sparkline and a month-over-month delta. listProducts returns the
          current catalogue only -- no history and no series -- so neither can be computed.
          The card states what the figure actually covers instead. */}
      <p className={cn("mt-3 border-t border-[#f1f4f9] pt-2.5 text-[10.5px]", MUTED)}>
        {kpi.footnote}
      </p>
    </div>
  )
}

function getInventoryStatus(stock: number) {
  if (stock === 0) {
    return "Out of Stock"
  }

  if (stock <= 30) {
    return "Low Stock"
  }

  return "In Stock"
}

// Only products authored in Madar are ours to change. A synced storefront row belongs to
// Salla/Shopify/Zid -- deleting it here would be undone by the next sync -- so that entry is
// disabled with the reason rather than hidden or, worse, offered and silently ineffective.
function DetailStat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="px-4 py-3.5 text-center">
      <p className={cn("text-[10.5px]", MUTED)}>{label}</p>
      <p
        className={cn(
          "mt-1 text-[15px] font-extrabold",
          emphasis ? "text-[#1f9d55]" : "text-[#0b1738]"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  muted?: boolean
}) {
  // RTL: the tile is written first so it lands to the right of the text.
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f2f5fa] text-[#5b6b85]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className={cn("text-[10.5px]", MUTED)}>{label}</dt>
        <dd
          className={cn(
            "mt-0.5 truncate text-[12.5px] font-semibold",
            muted ? MUTED : "text-[#0b1738]"
          )}
        >
          {value}
        </dd>
      </div>
    </div>
  )
}

function ProductRowActions({
  product,
  busy,
  onView,
  onEdit,
  onCopySku,
  onExport,
  onDelete,
}: {
  product: ProductRow
  busy: boolean
  onView: () => void
  onEdit: () => void
  onCopySku: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const isNative = product.platform === "Madar"

  // Radix locks pointer events on the body while the menu is open and releases them as it
  // closes. Opening a dialog in the same tick mounts it under that lock and the whole page stops
  // responding, so the action is deferred by a tick. preventDefault must NOT be called here --
  // on onSelect it suppresses the close itself, which leaves the lock in place permanently.
  const afterClose = (action: () => void) => () => {
    setTimeout(action, 0)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`إجراءات ${product.name}`}
          disabled={busy}
          className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:bg-[#f4f7fc] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </button>
      </DropdownMenuTrigger>

      {/* Radix portals this to document.body, which does not inherit the page's dir. */}
      <DropdownMenuContent
        align="end"
        className={cn(cairo.className, "w-52 rounded-[12px] [direction:rtl]")}
      >
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onView)}
        >
          <Eye className="size-4" />
          عرض التفاصيل
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          disabled={!isNative}
          title={isNative ? undefined : "المنتجات المستوردة من المتجر تُدار من المتجر نفسه"}
          onSelect={afterClose(onEdit)}
        >
          <Pencil className="size-4" />
          تعديل المنتج
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          disabled={!product.sku}
          onSelect={afterClose(onCopySku)}
        >
          <Copy className="size-4" />
          نسخ رمز المنتج
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onExport)}
        >
          <Download className="size-4" />
          تصدير هذا المنتج
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px] text-[#e0484d] focus:text-[#e0484d]"
          disabled={!isNative}
          title={isNative ? undefined : "المنتجات المستوردة من المتجر تُدار من المتجر نفسه"}
          onSelect={afterClose(onDelete)}
        >
          <Trash2 className="size-4" />
          حذف المنتج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PlatformIcon({ platform }: { platform: ProductRow["platform"] }) {
  if (platform === "Shopify") {
    return <ShoppingBag className="size-4" />
  }

  if (platform === "Salla") {
    return <Store className="size-4" />
  }

  if (platform === "Zid") {
    return <Globe className="size-4" />
  }

  return <Store className="size-4" />
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) {
    return "الفترة الزمنية"
  }

  if (!range.to) {
    return ARABIC_DATE.format(range.from)
  }

  return `${ARABIC_DATE.format(range.from)} - ${ARABIC_DATE.format(range.to)}`
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value?.from ?? new Date())
  const [rangeAnchor, setRangeAnchor] = useState<Date | undefined>(undefined)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDisplayMonth(value?.from ?? new Date())
          setRangeAnchor(value?.from && !value?.to ? value.from : undefined)
        } else {
          setRangeAnchor(undefined)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-[205px] justify-between gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-3.5 text-[12.5px] font-normal text-[#0b1738] hover:border-[#c4d5f0] hover:bg-white"
        >
          <CalendarIcon className="size-4 shrink-0 text-[#95a4bd]" />
          <span className="truncate">{formatDateRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <Select
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[7.75rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {monthOptions.map((monthLabel, index) => (
                  <SelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {monthLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(yearValue)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setYear(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[6rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-56 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {yearOptions.map((yearOption) => (
                  <SelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Calendar
          mode="range"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={(next, selectedDay) => {
            if (!selectedDay) {
              onChange(next)
              return
            }

            if (!rangeAnchor) {
              onChange({ from: selectedDay, to: undefined })
              setRangeAnchor(selectedDay)
              return
            }

            const from = selectedDay < rangeAnchor ? selectedDay : rangeAnchor
            const to = selectedDay < rangeAnchor ? rangeAnchor : selectedDay

            onChange({ from, to })
            setRangeAnchor(undefined)
            setOpen(false)
          }}
          numberOfMonths={1}
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          captionLayout="label"
          formatters={{
            formatWeekdayName: (date) => format(date, "EEE"),
          }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            button_previous:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            button_next:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-foreground",
            weekdays: "mb-1.5 grid grid-cols-7 gap-1.5",
            weekday:
              "h-6 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            week: "mt-1.5 grid grid-cols-7 gap-1.5",
            day: "rounded-full text-foreground",
            day_button:
              "size-8 rounded-full border border-transparent bg-transparent text-xs font-medium text-foreground transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today:
              "rounded-full border border-sky-400/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-foreground",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-foreground",
            range_start:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            range_end:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {getDateRangePresets().map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => {
                onChange(preset.range)
                setRangeAnchor(undefined)
                setDisplayMonth(preset.range.from ?? new Date())
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange(undefined)
              setRangeAnchor(undefined)
              setDisplayMonth(new Date())
              setOpen(false)
            }}
          >
            Clear Date
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-400 px-3.5 text-sm font-semibold text-foreground shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
            onClick={() => {
              const today = new Date()
              onChange({ from: today, to: today })
              setRangeAnchor(undefined)
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// The 5 product types a single flat CSV row can fully describe -- mirrors
// catalog-types.ts's FLAT_IMPORTABLE_TYPES. A bundle needs component references to other
// products and a variable product needs a variant matrix, neither of which fits one row, so
// ProductCatalogService.bulkImport() skips (and reports) either with a reason instead.
const IMPORTABLE_PRODUCT_TYPES = ["simple", "raw", "weighted", "service", "digital"] as const

function toImportCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function downloadImportCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(toImportCsvCell).join(",")).join("\n")
  // A leading BOM so Excel (the realistic destination for this file) opens Arabic text as UTF-8
  // instead of guessing a legacy codepage and mangling it.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// One example row per importable type, so opening the template teaches the format instead of
// just naming its columns -- a blank sku/stock/description cell only being wrong for SOME types
// is much easier to grasp from a working example than from a rule written out in prose.
function downloadProductsImportTemplateCsv() {
  downloadImportCsv("نموذج-استيراد-المنتجات.csv", [
    [
      "name",
      "sku",
      "category",
      "type",
      "status",
      "cost_price",
      "sell_price",
      "stock",
      "min_stock",
      "unit",
      "description",
    ],
    ["قميص قطن", "SKU-1001", "ملابس", "simple", "active", "40", "89.9", "25", "5", "حبة", ""],
    ["دقيق فاخر", "", "مواد خام", "raw", "active", "", "", "100", "10", "كجم", ""],
    ["استشارة تسويقية", "SKU-2002", "خدمات", "service", "active", "", "250", "", "", "", ""],
  ])
}

// A small RFC4180-ish parser -- handles quoted fields (so a name containing a comma still reads
// as one cell) without pulling in a CSV library. Same approach as customers-overview.tsx's own
// parseCsv -- each feature keeps its own rather than sharing one for four-to-eleven columns.
function parseImportCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
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
      if (char === "\r" && text[i + 1] === "\n") i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""))
}

// Maps by header name (case-insensitive) rather than fixed column order, so a file with the
// columns in a different order -- or missing optional ones entirely -- still imports correctly.
function csvToProductImportRows(text: string): BulkImportProductRow[] {
  const rows = parseImportCsv(text)
  if (rows.length === 0) return []

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const columnIndex = (name: string) => header.indexOf(name)
  const cellAt = (cells: string[], name: string) => {
    const index = columnIndex(name)
    return index >= 0 ? (cells[index] ?? "").trim() || null : null
  }

  return rows.slice(1).map((cells) => ({
    name: cellAt(cells, "name") ?? "",
    sku: cellAt(cells, "sku"),
    category: cellAt(cells, "category"),
    productType: cellAt(cells, "type"),
    status: cellAt(cells, "status"),
    costPrice: cellAt(cells, "cost_price"),
    sellPrice: cellAt(cells, "sell_price"),
    stockQuantity: cellAt(cells, "stock"),
    minStock: cellAt(cells, "min_stock"),
    baseUnit: cellAt(cells, "unit"),
    description: cellAt(cells, "description"),
  }))
}

function ImportProductsDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkImportProductRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<BulkImportProductResult | null>(null)

  const reset = () => {
    setFileName(null)
    setRows([])
    setResult(null)
  }

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    const text = await file.text()
    setRows(csvToProductImportRows(text))
  }

  const submit = async () => {
    if (rows.length === 0) {
      toast.error("اختر ملف CSV يحتوي على منتجات أولاً.")
      return
    }
    setIsImporting(true)
    try {
      const outcome = await productListService.bulkImportProducts(rows)
      setResult(outcome)
      if (outcome.created > 0) {
        toast.success(`تم إضافة ${outcome.created} منتج.`)
        onImported()
      }
    } catch {
      toast.error("تعذر استيراد الملف.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isImporting) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className={cn(cairo.className, "sm:max-w-[28rem] [direction:rtl]")}>
        <DialogHeader className="text-right">
          <DialogTitle className="text-[15px] font-extrabold text-[#0b1738]">
            استيراد منتجات
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-6 text-[#6b7b96]">
            ارفع ملف CSV لإضافة عدة منتجات دفعة واحدة. يدعم الاستيراد أنواع المنتجات:{" "}
            {IMPORTABLE_PRODUCT_TYPES.join("، ")} -- أما الحزم والمنتجات متعددة الخيارات فتُضاف
            يدوياً من صفحة إضافة منتج، لأنها تحتاج اختيار مكونات أو متغيرات لا تتسع لها خانة واحدة
            في الجدول.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-[#c7d3e3] bg-[#fafbfd] px-4 py-6 text-center hover:border-[#93a6c9]">
            <Upload className="size-5 text-[#2878ff]" />
            <span className="text-[12px] font-semibold text-[#0b1738]">
              {fileName ?? "اضغط لاختيار ملف CSV"}
            </span>
            <span className="text-[10.5px] text-[#6b7b96]">
              {rows.length > 0
                ? `تم العثور على ${rows.length} صف`
                : "الأعمدة: name, sku, category, type, status, cost_price, sell_price, stock, min_stock, unit, description"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
                event.target.value = ""
              }}
            />
          </label>

          <button
            type="button"
            onClick={downloadProductsImportTemplateCsv}
            className="self-start text-[11.5px] font-semibold text-[#2878ff] hover:underline"
          >
            تحميل نموذج CSV
          </button>

          {result ? (
            <div className="rounded-[10px] border border-[#e1e7f0] p-3">
              <p className="text-[12.5px] font-bold text-[#0b1738]">
                تم إضافة {result.created} منتج
                {result.skipped.length > 0 ? `، وتخطي ${result.skipped.length} صف` : ""}
              </p>
              {result.skipped.length > 0 ? (
                <ul className="mt-1.5 flex max-h-[180px] flex-col gap-0.5 overflow-y-auto">
                  {result.skipped.map((entry) => (
                    <li key={entry.row} className="text-[11px] text-[#6b7b96]">
                      السطر {entry.row + 1} في الملف: {entry.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="h-10 gap-2 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
            disabled={isImporting || rows.length === 0}
            onClick={() => void submit()}
          >
            {isImporting
              ? "جارٍ الاستيراد..."
              : `استيراد ${rows.length > 0 ? `(${rows.length})` : ""}`}
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-[10px] px-5 text-[13px] font-semibold"
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState("All Categories")
  const [platform, setPlatform] = useState("All Platforms")
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("All Inventory Status")
  const [statusFilter, setStatusFilter] = useState("All Status")
  const [productTypeFilter, setProductTypeFilter] = useState("All Product Types")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const router = useRouter()
  const [detailProduct, setDetailProduct] = useState<ProductRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProductRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)

  // Hoisted out of the effect so a delete can refresh the same way the first load does,
  // instead of the two drifting into separate fetch paths.
  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const items = await productListService.listProducts()
      setProducts(items)
    } catch (error) {
      // Logged rather than swallowed: a silent generic message here previously hid a real
      // client-side bug (a malformed endpoint URL) that never even reached the backend.
      console.error("Failed to load products", error)
      setLoadError("Couldn't load products from your connected stores. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const dynamicCategoryOptions = useMemo(() => {
    const realCategories = Array.from(
      new Set(products.map((product) => product.category).filter((value) => value.length > 0))
    ).sort((a, b) => a.localeCompare(b))
    return ["All Categories", ...realCategories]
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = `${product.name} ${product.sku} ${product.category}`
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesCategory = category === "All Categories" || product.category === category
      const matchesPlatform = platform === "All Platforms" || product.platform === platform
      const matchesInventoryStatus =
        inventoryStatusFilter === "All Inventory Status" ||
        getInventoryStatus(product.availableStock) === inventoryStatusFilter
      const matchesStatus = statusFilter === "All Status" || product.status === statusFilter
      const matchesProductType =
        productTypeFilter === "All Product Types" || product.productType === productTypeFilter
      // Presets and single-day calendar picks land on a specific instant (e.g. "now" for the
      // Today preset, midnight for a plain day click), not a full-day span -- widening to
      // startOfDay/endOfDay here is what makes a same-day product actually match instead of
      // only matching a product updated at that exact millisecond.
      const matchesDateRange =
        !dateRange?.from ||
        isWithinInterval(new Date(product.activityDate), {
          start: startOfDay(dateRange.from),
          end: endOfDay(dateRange.to ?? dateRange.from),
        })

      return (
        matchesSearch &&
        matchesCategory &&
        matchesPlatform &&
        matchesInventoryStatus &&
        matchesStatus &&
        matchesProductType &&
        matchesDateRange
      )
    })
  }, [
    category,
    dateRange,
    inventoryStatusFilter,
    platform,
    productTypeFilter,
    products,
    search,
    statusFilter,
  ])

  const productKpiCards = useMemo<ProductKpiCardData[]>(() => {
    const activeCount = filteredProducts.filter((product) => product.status === "Active").length
    const lowOrOutOfStockCount = filteredProducts.filter(
      (product) => getInventoryStatus(product.availableStock) !== "In Stock"
    ).length
    const inventoryValue = filteredProducts.reduce(
      (sum, product) => sum + (product.costPrice ?? 0) * product.availableStock,
      0
    )

    return [
      {
        label: "إجمالي المنتجات",
        value: filteredProducts.length.toLocaleString(),
        footnote: "من جميع المتاجر المتصلة",
        icon: Package,
        tone: "blue",
      },
      {
        label: "المنتجات النشطة",
        value: activeCount.toLocaleString(),
        footnote: "منشورة وظاهرة للعملاء",
        icon: CheckCircle2,
        tone: "green",
      },
      {
        label: "منتجات منخفضة المخزون",
        value: lowOrOutOfStockCount.toLocaleString(),
        footnote: "المخزون 30 وحدة أو أقل",
        icon: AlertTriangle,
        tone: "rose",
      },
      {
        label: "قيمة المخزون",
        value: formatCurrency(inventoryValue),
        footnote: "بسعر التكلفة للكمية المتاحة",
        icon: Wallet,
        tone: "violet",
      },
    ]
  }, [filteredProducts])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // The checkboxes in the export are wired to the export button: with a selection the CSV
  // covers exactly those rows, without one it covers everything the filters left.
  const selectedProducts = useMemo(
    () => filteredProducts.filter((product) => selectedIds.has(product.id)),
    [filteredProducts, selectedIds]
  )
  const exportRows = selectedProducts.length > 0 ? selectedProducts : filteredProducts
  const allOnPageSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((product) => selectedIds.has(product.id))

  const toggleProduct = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const togglePage = () =>
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allOnPageSelected) {
        paginatedProducts.forEach((product) => next.delete(product.id))
      } else {
        paginatedProducts.forEach((product) => next.add(product.id))
      }
      return next
    })

  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)

  // Products list -- "select several, change their status" quick action. Only a native (Madar)
  // product can actually be changed here -- a synced storefront product is managed from the
  // store itself (same isNative rule the per-row edit/delete actions already enforce), so a
  // selection mixing both silently changes just the native ones and says so.
  const applyBulkStatus = async (nextStatus: "draft" | "active" | "archived") => {
    const nativeSelected = selectedProducts.filter((product) => product.platform === "Madar")
    if (nativeSelected.length === 0) {
      toast.error("لا يمكن تغيير حالة المنتجات المستوردة من المتجر من هنا.")
      return
    }

    setBulkStatusUpdating(true)
    try {
      const result = await productListService.bulkUpdateStatus(
        nativeSelected.map((product) => product.id),
        nextStatus
      )
      const skipped = selectedProducts.length - nativeSelected.length
      toast.success(`تم تحديث حالة ${result.updated} منتج.`, {
        description:
          skipped > 0
            ? `تم تجاوز ${skipped} منتج مستورد من المتجر -- يُدار من المتجر نفسه.`
            : undefined,
      })
      setSelectedIds(new Set())
      await loadProducts()
    } catch (error) {
      const errorStatus = error instanceof AppError ? error.status : undefined
      toast.error(
        errorStatus === 403 ? "لا تملك صلاحية تعديل المنتجات." : "تعذر تحديث حالة المنتجات.",
        {
          description:
            errorStatus === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية products:edit." : undefined,
        }
      )
    } finally {
      setBulkStatusUpdating(false)
    }
  }

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) {
      toast.error(`لا يوجد ${label} لهذا المنتج.`)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`تم نسخ ${label}.`, { description: value })
    } catch {
      // Clipboard access is refused outside a secure context and in some embedded browsers.
      toast.error(`تعذر النسخ — انسخ ${label} يدوياً.`, { description: value })
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return

    setDeletingId(pendingDelete.id)
    try {
      await productListService.deleteProduct(pendingDelete.id)
      toast.success("تم حذف المنتج.", { description: pendingDelete.name })
      setPendingDelete(null)
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(pendingDelete.id)
        return next
      })
      await loadProducts()
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? "لا تملك صلاحية حذف المنتجات." : "تعذر حذف المنتج.", {
        description:
          status === 403
            ? "تواصل مع مالك الحساب لمنحك صلاحية products:delete."
            : error instanceof Error
              ? error.message
              : undefined,
      })
    } finally {
      setDeletingId(null)
    }
  }

  function exportToCSV(rows: ProductRow[]) {
    const headers = [
      "Product",
      "SKU",
      "Category",
      "Status",
      "Inventory Status",
      "Available Stock",
      "Cost Price",
      "Selling Price",
      "Platform",
    ]

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.sku,
          row.category,
          row.status,
          getInventoryStatus(row.availableStock),
          row.availableStock,
          row.costPrice,
          row.sellingPrice,
          row.platform,
        ].join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "products-analytics.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  const filterSelects: Array<{
    value: string
    onChange: (next: string) => void
    options: readonly string[]
  }> = [
    { value: statusFilter, onChange: setStatusFilter, options: statusOptions },
    { value: category, onChange: setCategory, options: dynamicCategoryOptions },
    {
      value: inventoryStatusFilter,
      onChange: setInventoryStatusFilter,
      options: inventoryStatusOptions,
    },
    { value: productTypeFilter, onChange: setProductTypeFilter, options: productTypeOptions },
    { value: platform, onChange: setPlatform, options: platformOptions },
  ]

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, actions left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>المنتجات</h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>
              إدارة منتجاتك ومتابعة المخزون والأداء عبر جميع المتاجر المتصلة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Can permission="products:import">
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                onClick={() => setIsImportOpen(true)}
              >
                استيراد
                <Upload className="size-4" />
              </Button>
            </Can>

            <Can permission="products:export">
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                disabled={exportRows.length === 0}
                onClick={() => exportToCSV(exportRows)}
              >
                تصدير
                <Download className="size-4" />
              </Button>
            </Can>

            <Button
              asChild
              className="h-11 gap-2 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
            >
              <Link href={ROUTES.productsAdd}>
                إضافة منتج
                <Plus className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {productKpiCards.map((kpi) => (
            <ProductKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <div className={cn(PANEL, "space-y-4 p-4 md:p-5")}>
          {/* RTL: the date range is written first so it sits on the right, search last. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <DateRangeFilter
              value={dateRange}
              onChange={(next) => {
                setDateRange(next)
                setPage(1)
              }}
            />

            {filterSelects.map((filter, index) => (
              <AppSearchableSelect
                key={index}
                value={filter.value}
                onChange={(next) => {
                  filter.onChange(next)
                  setPage(1)
                }}
                options={filter.options.map((option) => ({
                  value: option,
                  label: FILTER_LABEL_AR[option] ?? option,
                }))}
                triggerClassName={FILTER_TRIGGER_CLASS}
              />
            ))}

            <div className="relative ms-auto w-full md:w-[225px]">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#95a4bd]" />
              <Input
                placeholder="البحث في المنتجات أو SKU..."
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white pe-9 text-[12.5px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>

          {/* RTL: the view toggle is written first so it sits on the right. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#f1f4f9] pt-3.5">
            <div className="flex items-center gap-1 rounded-[10px] bg-[#f2f5fa] p-1">
              {(
                [
                  { key: "table", label: "عرض جدول", icon: List },
                  { key: "grid", label: "عرض شبكي", icon: LayoutGrid },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={viewMode === option.key}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-[8px] px-3 py-1.5 transition-colors",
                    viewMode === option.key
                      ? "bg-white text-[#2878ff] shadow-[0_1px_3px_rgba(11,23,56,0.12)]"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                  onClick={() => setViewMode(option.key)}
                >
                  <option.icon className="size-4" />
                </button>
              ))}
            </div>

            <span className="text-[12px] font-semibold text-[#2878ff]">
              {filteredProducts.length} منتج
            </span>

            {selectedProducts.length > 0 ? (
              <>
                <span className={cn("text-[12px]", MUTED)}>{selectedProducts.length} محدد</span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={bulkStatusUpdating}
                      className="flex items-center gap-1.5 rounded-[8px] border border-[#e1e7f0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0b1738] transition-colors hover:border-[#c4d5f0] hover:bg-[#f4f7fc] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkStatusUpdating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      تغيير الحالة
                    </button>
                  </DropdownMenuTrigger>

                  {/* Radix portals this to document.body, which does not inherit the page's dir. */}
                  <DropdownMenuContent
                    align="end"
                    className={cn(cairo.className, "w-44 rounded-[12px] [direction:rtl]")}
                  >
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-[12.5px]"
                      onSelect={() => void applyBulkStatus("active")}
                    >
                      {STATUS_PILL_AR.Active.label}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-[12.5px]"
                      onSelect={() => void applyBulkStatus("draft")}
                    >
                      {STATUS_PILL_AR.Draft.label}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-[12.5px]"
                      onSelect={() => void applyBulkStatus("archived")}
                    >
                      {STATUS_PILL_AR.Archived.label}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>

          {isLoading ? (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-[12px] border border-[#eef2f8] py-16 text-[12.5px]",
                MUTED
              )}
            >
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل المنتجات من متاجرك المتصلة...
            </div>
          ) : loadError ? (
            <div className="rounded-[12px] border border-[#f7c9ca] bg-[#fdeeee] px-4 py-8 text-center text-[12.5px] text-[#e0484d]">
              {loadError}
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="rounded-[12px] border border-[#eef2f8] px-4 py-12 text-center">
              <p className={cn("text-[13.5px] font-bold", HEADING)}>
                لا توجد منتجات مطابقة للفلاتر الحالية
              </p>
              <p className={cn("mt-2 text-[12px]", MUTED)}>
                جرّب تغيير المنصة أو الفئة أو حالة المخزون أو الفترة الزمنية.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedProducts.map((product) => {
                const status = STATUS_PILL_AR[product.status]
                const inventory = INVENTORY_PILL_AR[getInventoryStatus(product.availableStock)]

                return (
                  <div key={product.id} className="rounded-[12px] border border-[#e1e7f0] p-4">
                    {/* Static export mode cannot use the default next/image loader here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image ?? FALLBACK_PRODUCT_IMAGE}
                      alt={product.name}
                      className="mx-auto h-24 w-24 rounded-[10px] border border-[#eef2f8] bg-[#fafbfe] object-contain p-2"
                    />
                    <p className={cn("mt-3 truncate text-[13px] font-extrabold", HEADING)}>
                      {product.name}
                    </p>
                    <p className={cn("mt-0.5 truncate text-[11px]", MUTED)}>{product.category}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                          inventory.className
                        )}
                      >
                        {inventory.label}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[#f1f4f9] pt-2.5">
                      <span className={cn("text-[11px]", MUTED)}>
                        {product.availableStock.toLocaleString()} متاح
                      </span>
                      <span className={cn("text-[12.5px] font-extrabold", HEADING)}>
                        {formatCurrency(product.sellingPrice, product.currency)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-center">
                <thead>
                  <tr>
                    <th className="border-b border-[#eef2f8] px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="تحديد كل المنتجات في الصفحة"
                        className="size-4 cursor-pointer accent-[#2878ff]"
                        checked={allOnPageSelected}
                        onChange={togglePage}
                      />
                    </th>
                    {[
                      { key: "product", label: "المنتج", align: "text-right" },
                      { key: "sku", label: "SKU", align: "text-center" },
                      { key: "category", label: "الفئة", align: "text-center" },
                      { key: "status", label: "الحالة", align: "text-center" },
                      { key: "inventory", label: "حالة المخزون", align: "text-center" },
                      { key: "stock", label: "الكمية المتاحة", align: "text-center" },
                      { key: "cost", label: "سعر التكلفة", align: "text-center" },
                      { key: "price", label: "سعر البيع", align: "text-center" },
                      { key: "platform", label: "المنصة", align: "text-center" },
                      { key: "actions", label: "إجراءات", align: "text-center" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] px-3 py-3 text-[11px] font-semibold",
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
                  {paginatedProducts.map((product) => {
                    const status = STATUS_PILL_AR[product.status]
                    const inventory = INVENTORY_PILL_AR[getInventoryStatus(product.availableStock)]

                    return (
                      <tr
                        key={product.id}
                        className="border-b border-[#f4f7fb] transition-colors hover:bg-[#f8fafd]"
                      >
                        <td className="px-3 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`تحديد ${product.name}`}
                            className="size-4 cursor-pointer accent-[#2878ff]"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                          />
                        </td>

                        <td className="px-3 py-3.5 text-right">
                          {/* RTL: the thumbnail is written first so it lands to the right. */}
                          <div className="flex items-center justify-start gap-2.5">
                            {/* Static export mode cannot use the default next/image loader. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={product.image ?? FALLBACK_PRODUCT_IMAGE}
                              alt={product.name}
                              width={40}
                              height={40}
                              className="size-10 shrink-0 rounded-[10px] border border-[#eef2f8] bg-[#fafbfe] object-contain p-1"
                            />
                            <div className="min-w-0">
                              <p className={cn("truncate text-[12.5px] font-bold", HEADING)}>
                                {product.name}
                              </p>
                              <p className={cn("truncate text-[11px]", MUTED)}>
                                {product.platform}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className={cn("px-3 py-3.5 text-[11.5px]", MUTED)}>
                          {product.sku || "—"}
                        </td>
                        <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                          {product.category}
                        </td>

                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                              status.className
                            )}
                          >
                            {status.label}
                          </span>
                        </td>

                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                              inventory.className
                            )}
                          >
                            {inventory.label}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-[12.5px] tabular-nums text-[#334155]">
                          {product.availableStock.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-[12.5px] tabular-nums text-[#334155]">
                          {product.costPrice === null
                            ? "—"
                            : formatCurrency(product.costPrice, product.currency)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3.5 text-[12.5px] font-bold tabular-nums",
                            HEADING
                          )}
                        >
                          {formatCurrency(product.sellingPrice, product.currency)}
                        </td>

                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 text-[12px] font-semibold",
                              HEADING
                            )}
                          >
                            <PlatformIcon platform={product.platform} />
                            {product.platform}
                          </span>
                        </td>

                        <td className="px-3 py-3.5">
                          <ProductRowActions
                            product={product}
                            busy={deletingId === product.id}
                            onView={() => setDetailProduct(product)}
                            onEdit={() =>
                              router.push(
                                `${ROUTES.productsAdd}?id=${encodeURIComponent(product.id)}`
                              )
                            }
                            onCopySku={() => copyToClipboard(product.sku, "رمز المنتج")}
                            onExport={() => exportToCSV([product])}
                            onDelete={() => setPendingDelete(product)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !loadError ? (
            <div className="flex flex-col gap-3 border-t border-[#f1f4f9] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
              {/* RTL: count and page size on the right, pager on the left. */}
              <div className="flex items-center gap-3">
                <span className={cn("text-[12px]", MUTED)}>
                  {filteredProducts.length === 0
                    ? "لا توجد نتائج"
                    : `عرض ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredProducts.length)} من ${filteredProducts.length}`}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>عدد العناصر في الصفحة</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(next) => {
                      setPageSize(Number(next))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="h-9 w-[74px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50].map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label="الصفحة الأولى"
                  onClick={() => setPage(1)}
                >
                  <ChevronsRight className="size-4" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label="الصفحة السابقة"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronRight className="size-4" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
                  const pageNumber = Math.max(1, first) + index
                  if (pageNumber > totalPages) return null

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      className={cn(
                        "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-[8px] border px-2 text-[12px] font-bold transition-colors",
                        pageNumber === currentPage
                          ? "border-[#2878ff] bg-white text-[#2878ff]"
                          : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                      )}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  )
                })}

                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label="الصفحة التالية"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label="الصفحة الأخيرة"
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsLeft className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Details. The old version was a flat label/value grid: no image, status and stock shown
          as plain text while the table beside it used coloured pills, and no way to act on what
          you were looking at without closing and reopening the row menu. */}
      <Dialog
        open={detailProduct !== null}
        onOpenChange={(open) => !open && setDetailProduct(null)}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            cairo.className,
            // sm:-prefixed because DialogContent's own sm:max-w-sm would otherwise win.
            "gap-0 rounded-[18px] p-0 sm:max-w-[42rem] [direction:rtl]"
          )}
        >
          {detailProduct ? (
            <>
              {/* RTL: the image is written first so it lands to the right of the name. */}
              <DialogHeader className="flex-row items-start gap-3.5 space-y-0 border-b border-[#eef2f8] p-5 text-right">
                <span className="size-14 shrink-0 overflow-hidden rounded-[12px] border border-[#eef2f8] bg-[#fafbfe]">
                  {/* Static export mode cannot use the default next/image loader here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detailProduct.image ?? FALLBACK_PRODUCT_IMAGE}
                    alt=""
                    className="size-full object-contain p-1.5"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-[16px] font-extrabold text-[#0b1738]">
                    {detailProduct.name}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[11.5px] text-[#6b7b96]">
                    {detailProduct.platform === "Madar"
                      ? "منتج تمت إضافته في مدار"
                      : `منتج مستورد من ${detailProduct.platform}`}
                  </DialogDescription>

                  {/* The same pills the table uses, so the two read as one system. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        STATUS_PILL_AR[detailProduct.status].className
                      )}
                    >
                      {STATUS_PILL_AR[detailProduct.status].label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        INVENTORY_PILL_AR[getInventoryStatus(detailProduct.availableStock)]
                          .className
                      )}
                    >
                      {INVENTORY_PILL_AR[getInventoryStatus(detailProduct.availableStock)].label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="إغلاق"
                  className="shrink-0 cursor-pointer rounded-full p-1 text-[#95a4bd] transition-colors hover:bg-[#f2f5fa] hover:text-[#0b1738]"
                  onClick={() => setDetailProduct(null)}
                >
                  <X className="size-4" />
                </button>
              </DialogHeader>

              {/* The three figures someone opens this for, given room to be read at a glance. */}
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-[#eef2f8] border-b border-[#eef2f8]">
                <DetailStat
                  label="سعر البيع"
                  value={formatCurrency(detailProduct.sellingPrice, detailProduct.currency)}
                  emphasis
                />
                <DetailStat
                  label="سعر التكلفة"
                  value={
                    detailProduct.costPrice === null
                      ? "—"
                      : formatCurrency(detailProduct.costPrice, detailProduct.currency)
                  }
                />
                <DetailStat
                  label="الكمية المتاحة"
                  value={detailProduct.availableStock.toLocaleString()}
                />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-5">
                <DetailRow
                  icon={Tag}
                  label="رمز المنتج"
                  value={detailProduct.sku || "لا يوجد رمز لهذا النوع"}
                  muted={!detailProduct.sku}
                />
                <DetailRow icon={LayoutGrid} label="الفئة" value={detailProduct.category || "—"} />
                <DetailRow
                  icon={Wallet}
                  label="هامش الربح"
                  // Only shown when both figures are real -- a margin against an unknown cost
                  // would be an invented number.
                  value={
                    detailProduct.costPrice === null || detailProduct.sellingPrice <= 0
                      ? "—"
                      : `${formatCurrency(
                          detailProduct.sellingPrice - detailProduct.costPrice,
                          detailProduct.currency
                        )} · ${Math.round(
                          ((detailProduct.sellingPrice - detailProduct.costPrice) /
                            detailProduct.sellingPrice) *
                            100
                        )}%`
                  }
                  muted={detailProduct.costPrice === null}
                />
                <DetailRow
                  icon={CalendarIcon}
                  label="آخر تحديث"
                  value={ARABIC_DATE.format(new Date(detailProduct.activityDate))}
                />
              </dl>

              {/* RTL: the primary action is written first so it sits at the right of the group. */}
              <DialogFooter className="mx-0 mb-0 flex-row items-center gap-2 rounded-b-[18px] border-t border-[#eef2f8] bg-[#fafbfe] p-4 sm:justify-start">
                {detailProduct.platform === "Madar" ? (
                  <>
                    <Button
                      className="h-10 gap-2 rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1f66e0]"
                      onClick={() => {
                        const id = detailProduct.id
                        setDetailProduct(null)
                        router.push(`${ROUTES.productsAdd}?id=${encodeURIComponent(id)}`)
                      }}
                    >
                      <Pencil className="size-4" />
                      تعديل المنتج
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 gap-2 rounded-[10px] border-[#f7c9ca] px-4 text-[12.5px] font-semibold text-[#e0484d] hover:bg-[#fdeeee]"
                      onClick={() => {
                        const target = detailProduct
                        setDetailProduct(null)
                        setTimeout(() => setPendingDelete(target), 0)
                      }}
                    >
                      <Trash2 className="size-4" />
                      حذف
                    </Button>
                  </>
                ) : (
                  <p className="text-[11.5px] text-[#6b7b96]">
                    هذا المنتج يُدار من {detailProduct.platform} ولا يمكن تعديله هنا.
                  </p>
                )}

                <Button
                  variant="ghost"
                  className="ms-auto h-10 rounded-[10px] px-4 text-[12.5px] font-semibold text-[#5b6b85]"
                  onClick={() => setDetailProduct(null)}
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Deleting is not undoable from this screen, so it asks first and names the product. */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className={cn(cairo.className, "sm:max-w-[28rem] [direction:rtl]")}>
          <DialogHeader className="text-right">
            <DialogTitle className="text-[15px] font-extrabold text-[#0b1738]">
              حذف المنتج؟
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-6 text-[#6b7b96]">
              سيتم حذف <span className="font-bold text-[#0b1738]">{pendingDelete?.name}</span> من
              قائمة المنتجات. لن يظهر بعد ذلك في المتجر أو في التقارير.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              className="bg-[#e0484d] text-white hover:bg-[#c93f44]"
              disabled={deletingId !== null}
              onClick={() => void confirmDelete()}
            >
              {deletingId !== null ? "جارٍ الحذف..." : "حذف"}
            </Button>
            <Button
              variant="outline"
              disabled={deletingId !== null}
              onClick={() => setPendingDelete(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportProductsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => void loadProducts()}
      />
    </div>
  )
}
