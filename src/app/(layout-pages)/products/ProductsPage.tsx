"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { endOfDay, isWithinInterval, startOfDay } from "date-fns"
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
import { useLocale, useTranslations } from "next-intl"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
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
import { AppDateRangeFilter, AppSearchableSelect } from "@/components/app"
import { Can } from "@/features/authentication/components"
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

// The filter values (and the ProductStatus/inventory-status keys they double as) drive the
// filtering, so only their display is localised -- this maps each raw value to the i18n key
// suffix that carries its translated label, resolved via useTranslations("products.filters")
// at the call site (filterLabel() below). "products.filters.status"/"products.filters.
// inventoryStatus" are also reused directly for the status/inventory pills elsewhere on this
// page, so there's exactly one translated string per concept, not one per place it's shown.
const FILTER_LABEL_KEYS: Record<string, string> = {
  "All Platforms": "platform.all",
  Shopify: "platform.shopify",
  Salla: "platform.salla",
  Zid: "platform.zid",
  Madar: "platform.madar",
  "All Categories": "category.all",
  "All Inventory Status": "inventoryStatus.all",
  "In Stock": "inventoryStatus.inStock",
  "Low Stock": "inventoryStatus.lowStock",
  "Out of Stock": "inventoryStatus.outOfStock",
  "All Status": "status.all",
  Active: "status.active",
  Draft: "status.draft",
  Archived: "status.archived",
  "All Product Types": "productType.all",
  simple: "productType.simple",
  variable: "productType.variable",
  weighted: "productType.weighted",
  bundle: "productType.bundle",
  raw: "productType.raw",
  digital: "productType.digital",
  service: "productType.service",
}

function filterLabel(
  value: string,
  tFilters: ReturnType<typeof useTranslations<"products.filters">>,
  tTypes: ReturnType<typeof useTranslations<"products.types">>
): string {
  const key = FILTER_LABEL_KEYS[value]
  if (!key) return value
  if (key.startsWith("productType.") && key !== "productType.all") {
    return tTypes(`${key.slice("productType.".length)}.title`)
  }
  return tFilters(key)
}

const STATUS_PILL_CLASS: Record<ProductStatus, string> = {
  Active: "bg-[#e9f8ef] text-[#1f9d55]",
  Draft: "bg-[#eef4ff] text-[#2878ff]",
  Archived: "bg-[#eef2f8] text-[#5b6b85]",
}

const INVENTORY_PILL_CLASS: Record<string, string> = {
  "In Stock": "bg-[#e9f8ef] text-[#1f9d55]",
  "Low Stock": "bg-[#fff7e6] text-[#e08b00]",
  "Out of Stock": "bg-[#fdeeee] text-[#e0484d]",
}

function dateFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

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
  const t = useTranslations("products.list")
  const locale = useLocale()
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
          aria-label={t("rowActions.actionsLabel", { name: product.name })}
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
        className={cn(
          cairo.className,
          "w-52 rounded-[12px]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onView)}
        >
          <Eye className="size-4" />
          {t("rowActions.viewDetails")}
        </DropdownMenuItem>

        <Can permission="products:edit">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-[12.5px]"
            disabled={!isNative}
            title={isNative ? undefined : t("rowActions.importedTitle")}
            onSelect={afterClose(onEdit)}
          >
            <Pencil className="size-4" />
            {t("rowActions.edit")}
          </DropdownMenuItem>
        </Can>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          disabled={!product.sku}
          onSelect={afterClose(onCopySku)}
        >
          <Copy className="size-4" />
          {t("rowActions.copySku")}
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onExport)}
        >
          <Download className="size-4" />
          {t("rowActions.exportThis")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <Can permission="products:delete">
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-[12.5px] text-[#e0484d] focus:text-[#e0484d]"
            disabled={!isNative}
            title={isNative ? undefined : t("rowActions.importedTitle")}
            onSelect={afterClose(onDelete)}
          >
            <Trash2 className="size-4" />
            {t("rowActions.delete")}
          </DropdownMenuItem>
        </Can>
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
function downloadProductsImportTemplateCsv(t: ReturnType<typeof useTranslations<"products.list">>) {
  downloadImportCsv(`${t("importTemplate.filename")}.csv`, [
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
    [
      t("importTemplate.row1Name"),
      "SKU-1001",
      t("importTemplate.row1Category"),
      "simple",
      "active",
      "40",
      "89.9",
      "25",
      "5",
      t("importTemplate.row1Unit"),
      "",
    ],
    [
      t("importTemplate.row2Name"),
      "",
      t("importTemplate.row2Category"),
      "raw",
      "active",
      "",
      "",
      "100",
      "10",
      t("importTemplate.row2Unit"),
      "",
    ],
    [
      t("importTemplate.row3Name"),
      "SKU-2002",
      t("importTemplate.row3Category"),
      "service",
      "active",
      "",
      "250",
      "",
      "",
      "",
      "",
    ],
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
  const t = useTranslations("products.list")
  const tTypes = useTranslations("products.types")
  const locale = useLocale()
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
      toast.error(t("toasts.selectCsvFirst"))
      return
    }
    setIsImporting(true)
    try {
      const outcome = await productListService.bulkImportProducts(rows)
      setResult(outcome)
      if (outcome.created > 0) {
        toast.success(t("toasts.importSuccess", { count: outcome.created }))
        onImported()
      }
    } catch {
      toast.error(t("toasts.importError"))
    } finally {
      setIsImporting(false)
    }
  }

  const importableTypeNames = IMPORTABLE_PRODUCT_TYPES.map((key) => tTypes(`${key}.title`)).join(
    t("importDialog.listSeparator")
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isImporting) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn(
          cairo.className,
          "sm:max-w-[28rem]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DialogHeader className="text-right">
          <DialogTitle className="text-[15px] font-extrabold text-[#0b1738]">
            {t("importDialog.title")}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-6 text-[#6b7b96]">
            {t("importDialog.description", { types: importableTypeNames })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-[#c7d3e3] bg-[#fafbfd] px-4 py-6 text-center hover:border-[#93a6c9]">
            <Upload className="size-5 text-[#2878ff]" />
            <span className="text-[12px] font-semibold text-[#0b1738]">
              {fileName ?? t("importDialog.chooseFile")}
            </span>
            <span className="text-[10.5px] text-[#6b7b96]">
              {rows.length > 0
                ? t("importDialog.rowsFound", { count: rows.length })
                : t("importDialog.columnsHint")}
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
            onClick={() => downloadProductsImportTemplateCsv(t)}
            className="self-start text-[11.5px] font-semibold text-[#2878ff] hover:underline"
          >
            {t("importDialog.downloadTemplate")}
          </button>

          {result ? (
            <div className="rounded-[10px] border border-[#e1e7f0] p-3">
              <p className="text-[12.5px] font-bold text-[#0b1738]">
                {t("importDialog.resultSummary", { created: result.created })}
                {result.skipped.length > 0
                  ? t("importDialog.resultSkippedSuffix", { count: result.skipped.length })
                  : ""}
              </p>
              {result.skipped.length > 0 ? (
                <ul className="mt-1.5 flex max-h-[180px] flex-col gap-0.5 overflow-y-auto">
                  {result.skipped.map((entry) => (
                    <li key={entry.row} className="text-[11px] text-[#6b7b96]">
                      {t("importDialog.rowError", { row: entry.row + 1, reason: entry.reason })}
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
              ? t("importDialog.importing")
              : rows.length > 0
                ? t("importDialog.importButtonWithCount", { count: rows.length })
                : t("importDialog.importButton")}
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-[10px] px-5 text-[13px] font-semibold"
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
          >
            {t("importDialog.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProductsPage() {
  const t = useTranslations("products.list")
  const tFilters = useTranslations("products.filters")
  const tTypes = useTranslations("products.types")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const activityDateFormat = dateFormatter(locale as Locale)
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
      setLoadError(t("loadError"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

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
        label: t("kpis.total.label"),
        value: filteredProducts.length.toLocaleString(),
        footnote: t("kpis.total.footnote"),
        icon: Package,
        tone: "blue",
      },
      {
        label: t("kpis.active.label"),
        value: activeCount.toLocaleString(),
        footnote: t("kpis.active.footnote"),
        icon: CheckCircle2,
        tone: "green",
      },
      {
        label: t("kpis.lowStock.label"),
        value: lowOrOutOfStockCount.toLocaleString(),
        footnote: t("kpis.lowStock.footnote"),
        icon: AlertTriangle,
        tone: "rose",
      },
      {
        label: t("kpis.inventoryValue.label"),
        value: formatCurrency(inventoryValue),
        footnote: t("kpis.inventoryValue.footnote"),
        icon: Wallet,
        tone: "violet",
      },
    ]
  }, [filteredProducts, t])

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
      toast.error(t("toasts.cannotChangeImported"))
      return
    }

    setBulkStatusUpdating(true)
    try {
      const result = await productListService.bulkUpdateStatus(
        nativeSelected.map((product) => product.id),
        nextStatus
      )
      const skipped = selectedProducts.length - nativeSelected.length
      toast.success(t("toasts.statusUpdateSuccess", { count: result.updated }), {
        description: skipped > 0 ? t("toasts.statusUpdateSkipped", { count: skipped }) : undefined,
      })
      setSelectedIds(new Set())
      await loadProducts()
    } catch (error) {
      const errorStatus = error instanceof AppError ? error.status : undefined
      toast.error(
        errorStatus === 403 ? t("toasts.noEditPermission") : t("toasts.statusUpdateError"),
        {
          description: errorStatus === 403 ? t("toasts.contactOwnerEdit") : undefined,
        }
      )
    } finally {
      setBulkStatusUpdating(false)
    }
  }

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) {
      toast.error(t("toasts.copyNothingToCopy", { label }))
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("toasts.copiedSuccess", { label }), { description: value })
    } catch {
      // Clipboard access is refused outside a secure context and in some embedded browsers.
      toast.error(t("toasts.copyError", { label }), { description: value })
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return

    setDeletingId(pendingDelete.id)
    try {
      await productListService.deleteProduct(pendingDelete.id)
      toast.success(t("toasts.deleteSuccess"), { description: pendingDelete.name })
      setPendingDelete(null)
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(pendingDelete.id)
        return next
      })
      await loadProducts()
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? t("toasts.noDeletePermission") : t("toasts.deleteError"), {
        description:
          status === 403
            ? t("toasts.contactOwnerDelete")
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
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")}
      dir={localeDirection(locale as Locale)}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, actions left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("heading")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("subheading")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Can permission="products:import">
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                onClick={() => setIsImportOpen(true)}
              >
                {t("import")}
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
                {t("export")}
                <Download className="size-4" />
              </Button>
            </Can>

            <Can permission="products:create">
              <Button
                asChild
                className="h-11 gap-2 rounded-[10px] bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
              >
                <Link href={ROUTES.productsAdd}>
                  {t("addProduct")}
                  <Plus className="size-4" />
                </Link>
              </Button>
            </Can>
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
            <AppDateRangeFilter
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
                  label: filterLabel(option, tFilters, tTypes),
                }))}
                triggerClassName={FILTER_TRIGGER_CLASS}
              />
            ))}

            <div className="relative ms-auto w-full md:w-[225px]">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#95a4bd]" />
              <Input
                placeholder={t("searchPlaceholder")}
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
                  { key: "table", label: t("viewTable"), icon: List },
                  { key: "grid", label: t("viewGrid"), icon: LayoutGrid },
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
              {t("productCount", { count: filteredProducts.length })}
            </span>

            {selectedProducts.length > 0 ? (
              <>
                <span className={cn("text-[12px]", MUTED)}>
                  {t("selectedCount", { count: selectedProducts.length })}
                </span>

                <Can permission="products:edit">
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
                        {t("changeStatus")}
                      </button>
                    </DropdownMenuTrigger>

                    {/* Radix portals this to document.body, which does not inherit the page's dir. */}
                    <DropdownMenuContent
                      align="end"
                      className={cn(
                        cairo.className,
                        "w-44 rounded-[12px]",
                        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
                      )}
                    >
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-[12.5px]"
                        onSelect={() => void applyBulkStatus("active")}
                      >
                        {tFilters("status.active")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-[12.5px]"
                        onSelect={() => void applyBulkStatus("draft")}
                      >
                        {tFilters("status.draft")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-[12.5px]"
                        onSelect={() => void applyBulkStatus("archived")}
                      >
                        {tFilters("status.archived")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
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
              {t("loadingProducts")}
            </div>
          ) : loadError ? (
            <div className="rounded-[12px] border border-[#f7c9ca] bg-[#fdeeee] px-4 py-8 text-center text-[12.5px] text-[#e0484d]">
              {loadError}
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="rounded-[12px] border border-[#eef2f8] px-4 py-12 text-center">
              <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("emptyTitle")}</p>
              <p className={cn("mt-2 text-[12px]", MUTED)}>{t("emptyDescription")}</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedProducts.map((product) => {
                const status = {
                  label: filterLabel(product.status, tFilters, tTypes),
                  className: STATUS_PILL_CLASS[product.status],
                }
                const inventory = {
                  label: filterLabel(getInventoryStatus(product.availableStock), tFilters, tTypes),
                  className: INVENTORY_PILL_CLASS[getInventoryStatus(product.availableStock)],
                }

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
                        {t("availableSuffix", { count: product.availableStock.toLocaleString() })}
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
                        aria-label={t("table.selectAll")}
                        className="size-4 cursor-pointer accent-[#2878ff]"
                        checked={allOnPageSelected}
                        onChange={togglePage}
                      />
                    </th>
                    {[
                      { key: "product", label: t("table.columns.product"), align: "text-right" },
                      { key: "sku", label: t("table.columns.sku"), align: "text-center" },
                      { key: "category", label: t("table.columns.category"), align: "text-center" },
                      { key: "status", label: t("table.columns.status"), align: "text-center" },
                      {
                        key: "inventory",
                        label: t("table.columns.inventory"),
                        align: "text-center",
                      },
                      { key: "stock", label: t("table.columns.stock"), align: "text-center" },
                      { key: "cost", label: t("table.columns.cost"), align: "text-center" },
                      { key: "price", label: t("table.columns.price"), align: "text-center" },
                      { key: "platform", label: t("table.columns.platform"), align: "text-center" },
                      { key: "actions", label: t("table.columns.actions"), align: "text-center" },
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
                    const status = {
                      label: filterLabel(product.status, tFilters, tTypes),
                      className: STATUS_PILL_CLASS[product.status],
                    }
                    const inventory = {
                      label: filterLabel(
                        getInventoryStatus(product.availableStock),
                        tFilters,
                        tTypes
                      ),
                      className: INVENTORY_PILL_CLASS[getInventoryStatus(product.availableStock)],
                    }

                    return (
                      <tr
                        key={product.id}
                        className="border-b border-[#f4f7fb] transition-colors hover:bg-[#f8fafd]"
                      >
                        <td className="px-3 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={t("table.selectRow", { name: product.name })}
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
                            onCopySku={() => copyToClipboard(product.sku, t("skuLabel"))}
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
                    ? t("noResults")
                    : t("showingRange", {
                        from: (currentPage - 1) * pageSize + 1,
                        to: Math.min(currentPage * pageSize, filteredProducts.length),
                        total: filteredProducts.length,
                      })}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>{t("itemsPerPage")}</span>
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
                  aria-label={t("pagination.first")}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label={t("pagination.previous")}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
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
                  aria-label={t("pagination.next")}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("pagination.last")}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="size-4 rtl:rotate-180" />
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
            "gap-0 rounded-[18px] p-0 sm:max-w-[42rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
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
                      ? t("detail.addedInMadar")
                      : t("detail.importedFrom", { platform: detailProduct.platform })}
                  </DialogDescription>

                  {/* The same pills the table uses, so the two read as one system. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        STATUS_PILL_CLASS[detailProduct.status]
                      )}
                    >
                      {filterLabel(detailProduct.status, tFilters, tTypes)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        INVENTORY_PILL_CLASS[getInventoryStatus(detailProduct.availableStock)]
                      )}
                    >
                      {filterLabel(
                        getInventoryStatus(detailProduct.availableStock),
                        tFilters,
                        tTypes
                      )}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={t("detail.close")}
                  className="shrink-0 cursor-pointer rounded-full p-1 text-[#95a4bd] transition-colors hover:bg-[#f2f5fa] hover:text-[#0b1738]"
                  onClick={() => setDetailProduct(null)}
                >
                  <X className="size-4" />
                </button>
              </DialogHeader>

              {/* The three figures someone opens this for, given room to be read at a glance. */}
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-[#eef2f8] border-b border-[#eef2f8]">
                <DetailStat
                  label={t("detail.sellingPrice")}
                  value={formatCurrency(detailProduct.sellingPrice, detailProduct.currency)}
                  emphasis
                />
                <DetailStat
                  label={t("detail.costPrice")}
                  value={
                    detailProduct.costPrice === null
                      ? "—"
                      : formatCurrency(detailProduct.costPrice, detailProduct.currency)
                  }
                />
                <DetailStat
                  label={t("detail.availableStock")}
                  value={detailProduct.availableStock.toLocaleString()}
                />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-5">
                <DetailRow
                  icon={Tag}
                  label={t("detail.sku")}
                  value={detailProduct.sku || t("detail.noSkuForType")}
                  muted={!detailProduct.sku}
                />
                <DetailRow
                  icon={LayoutGrid}
                  label={t("detail.category")}
                  value={detailProduct.category || "—"}
                />
                <DetailRow
                  icon={Wallet}
                  label={t("detail.margin")}
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
                  label={t("detail.lastUpdated")}
                  value={activityDateFormat.format(new Date(detailProduct.activityDate))}
                />
              </dl>

              {/* RTL: the primary action is written first so it sits at the right of the group. */}
              <DialogFooter className="mx-0 mb-0 flex-row items-center gap-2 rounded-b-[18px] border-t border-[#eef2f8] bg-[#fafbfe] p-4 sm:justify-start">
                {detailProduct.platform === "Madar" ? (
                  <>
                    <Can permission="products:edit">
                      <Button
                        className="h-10 gap-2 rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1f66e0]"
                        onClick={() => {
                          const id = detailProduct.id
                          setDetailProduct(null)
                          router.push(`${ROUTES.productsAdd}?id=${encodeURIComponent(id)}`)
                        }}
                      >
                        <Pencil className="size-4" />
                        {t("detail.edit")}
                      </Button>
                    </Can>
                    <Can permission="products:delete">
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
                        {t("detail.delete")}
                      </Button>
                    </Can>
                  </>
                ) : (
                  <p className="text-[11.5px] text-[#6b7b96]">
                    {t("detail.managedElsewhere", { platform: detailProduct.platform })}
                  </p>
                )}

                <Button
                  variant="ghost"
                  className="ms-auto h-10 rounded-[10px] px-4 text-[12.5px] font-semibold text-[#5b6b85]"
                  onClick={() => setDetailProduct(null)}
                >
                  {t("detail.close")}
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
        <DialogContent
          className={cn(
            cairo.className,
            "sm:max-w-[28rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className="text-[15px] font-extrabold text-[#0b1738]">
              {t("deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-6 text-[#6b7b96]">
              {t("deleteDialog.descriptionBefore")}{" "}
              <span className="font-bold text-[#0b1738]">{pendingDelete?.name}</span>{" "}
              {t("deleteDialog.descriptionAfter")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              className="bg-[#e0484d] text-white hover:bg-[#c93f44]"
              disabled={deletingId !== null}
              onClick={() => void confirmDelete()}
            >
              {deletingId !== null ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
            </Button>
            <Button
              variant="outline"
              disabled={deletingId !== null}
              onClick={() => setPendingDelete(null)}
            >
              {tCommon("cancel")}
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
