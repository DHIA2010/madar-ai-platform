"use client"

import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  GripVertical,
  type LucideIcon,
  PieChart,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import GridLayout, { type Layout, WidthProvider } from "react-grid-layout"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppDateRangeFilter,
  AppInput,
  AppLoading,
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSwitch,
  AppTextarea,
} from "@/components/app"

import {
  buildCatalogLabelIndex,
  type CatalogDataSourceOption,
  type Kpi,
  type KpiResult,
  kpiService,
  type ReportFilterOperator,
  type ReportLevelFilter,
  reportsCatalogService,
  reportService,
  type ReportSharing,
} from "../services"
import { KpiWidgetRenderer } from "./kpi-widget-renderer"

const ResponsiveGridLayout = WidthProvider(GridLayout)

const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white p-4"
const PILL_PRIMARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2878ff] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_12px_rgba(40,120,255,0.24)] transition-colors hover:bg-[#1f63d6] disabled:cursor-not-allowed disabled:opacity-60"
const PILL_SECONDARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e1e7f0] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738]"
// Applied to AppInput/AppSelectTrigger via className -- cn() merges these over each component's
// own generic shadcn default (a smaller h-8, tight padding, plain gray border). A soft off-white
// fill turns solid white on focus, alongside a blue border + glow, matching the KPI wizard's fields.
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e1e7f0] bg-[#fafbfd] px-3.5 text-[13px] text-[#0b1738] shadow-none transition-colors placeholder:text-[#95a4bd] hover:border-[#c4d5f0] focus-visible:border-[#2878ff] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12 data-[size=default]:h-10"
const FIELD_TEXTAREA_CLASS =
  "min-h-[92px] resize-none rounded-[10px] border-[#e1e7f0] bg-[#fafbfd] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#0b1738] shadow-none transition-colors placeholder:text-[#95a4bd] hover:border-[#c4d5f0] focus-visible:border-[#2878ff] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12"

const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  eq: "يساوي (=)",
  neq: "لا يساوي (≠)",
  contains: "يحتوي على",
  not_contains: "لا يحتوي على",
}

// Narrower than the viewer's own copy of this class (FILTER_FIELD_CLASS) -- these rows stack
// full-width down the 260px settings column instead of wrapping horizontally across a full-width
// bar, so there's no fixed w-* here; each field just fills its row.
const DEFAULT_FILTER_FIELD_CLASS =
  "h-9 w-full rounded-[8px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738] shadow-none focus-visible:border-[#2878ff] focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12"

// The grid's own coordinate math (react-grid-layout) has no real RTL support -- dragging and
// resizing measure and clamp against the container's physical left edge regardless of `dir`,
// so a page-wide dir="rtl" would silently flip x and produce backwards drags. The grid area is
// kept dir="ltr" for correct interaction; each widget's own text content is re-flipped back to
// dir="rtl" inside CanvasWidget so Arabic labels still read correctly.
const GRID_COLS = 12
const GRID_ROW_HEIGHT = 36
const GRID_MARGIN: [number, number] = [12, 12]
const DEFAULT_WIDGET_W = 6
const DEFAULT_WIDGET_H = 8

interface CategoryMeta {
  label: string
  badgeClassName: string
  iconTileClassName: string
}

// Kept in step with reports-overview-page.tsx's own CATEGORY_META -- same six data-source
// categories, same colors, so a KPI's category badge reads the same wherever it shows up.
const CATEGORY_META: Record<string, CategoryMeta> = {
  sales: {
    label: "المبيعات",
    badgeClassName: "bg-[#eaf1ff] text-[#2878ff]",
    iconTileClassName: "bg-[#eaf1ff] text-[#2878ff]",
  },
  products: {
    label: "المنتجات",
    badgeClassName: "bg-[#f3ecff] text-[#8b5cf6]",
    iconTileClassName: "bg-[#f3ecff] text-[#8b5cf6]",
  },
  inventory: {
    label: "المخزون",
    badgeClassName: "bg-[#fff7e6] text-[#e08b00]",
    iconTileClassName: "bg-[#fff7e6] text-[#e08b00]",
  },
  customers: {
    label: "العملاء",
    badgeClassName: "bg-[#e9f8ef] text-[#1f9d55]",
    iconTileClassName: "bg-[#e9f8ef] text-[#1f9d55]",
  },
  financial: {
    label: "المالية",
    badgeClassName: "bg-[#fdeeee] text-[#e0484d]",
    iconTileClassName: "bg-[#fdeeee] text-[#e0484d]",
  },
  marketing: {
    label: "التسويق",
    badgeClassName: "bg-[#e6fbfa] text-[#0d9488]",
    iconTileClassName: "bg-[#e6fbfa] text-[#0d9488]",
  },
}
const DEFAULT_CATEGORY_META: CategoryMeta = {
  label: "أخرى",
  badgeClassName: "bg-[#eef2f8] text-[#5b6b85]",
  iconTileClassName: "bg-[#eef2f8] text-[#5b6b85]",
}
function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? DEFAULT_CATEGORY_META
}

interface PlacedWidget {
  localId: string
  kpiId: string
  x: number
  y: number
  w: number
  h: number
}

function PanelHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5 border-b border-[#f1f4f9] pb-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf1ff] text-[#2878ff]">
        <Icon className="size-4.5" />
      </span>
      <div>
        <h2 className={cn("text-[13.5px] font-bold", HEADING)}>{title}</h2>
        {subtitle ? <p className={cn("mt-0.5 text-[11px]", MUTED)}>{subtitle}</p> : null}
      </div>
    </div>
  )
}

function SidebarKpiItem({ kpi, onAdd }: { kpi: Kpi; onAdd: () => void }) {
  const meta = categoryMeta(kpi.category)
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[#e1e7f0] bg-white p-2.5 transition-colors hover:border-[#c4d5f0]">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[8px]",
          meta.iconTileClassName
        )}
      >
        <BarChart3 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[12px] font-bold", HEADING)}>{kpi.name}</p>
        <span
          className={cn(
            "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
            meta.badgeClassName
          )}
        >
          {meta.label}
        </span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#95a4bd] transition-colors hover:bg-[#eaf1ff] hover:text-[#2878ff]"
        aria-label={`إضافة ${kpi.name} إلى التقرير`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

// react-grid-layout clones its children and injects positioning props (style, className, drag
// and resize handlers) directly onto whatever this forwards them to -- a plain named component
// wouldn't receive them without this ref-forwarding + ...rest spread.
const CanvasWidget = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    kpi: Kpi | undefined
    result: KpiResult | undefined
    loading: boolean
    onRemove: () => void
    catalogLabels: ReturnType<typeof buildCatalogLabelIndex>
    "data-grid"?: unknown
  }
>(function CanvasWidget(
  {
    kpi,
    result,
    loading,
    onRemove,
    catalogLabels,
    className,
    children,
    // "data-grid" is stripped so it never reaches the DOM as a broken
    // `data-grid="[object Object]"` attribute -- react-grid-layout already read the real object
    // off this element's props before it ever rendered.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    "data-grid": _dataGrid,
    ...rest
  },
  ref
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "flex flex-col overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[#f1f4f9] px-2 py-1.5">
        {/* Only this handle starts a drag (see draggableHandle below) -- the delete button next
            to it stays clickable instead of being swallowed as a drag start. */}
        <span className="widget-drag-handle flex cursor-grab items-center gap-1 rounded-[6px] p-1 text-[#95a4bd] active:cursor-grabbing">
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-[#e0484d] transition-colors hover:bg-[#fdeeee]"
          aria-label="إزالة المؤشر"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div dir="rtl" className="min-h-0 flex-1">
        {!kpi ? (
          <p className={cn("p-4 text-[12px]", MUTED)}>مؤشر غير معروف</p>
        ) : loading ? (
          <AppLoading variant="chart" />
        ) : result ? (
          <KpiWidgetRenderer
            name={kpi.name}
            displayType={kpi.displayType}
            result={result}
            timeGrouping={kpi.timeGrouping}
            target={kpi.target}
            decimalPlaces={kpi.decimalPlaces}
            fieldLabel={catalogLabels.fieldLabel(kpi.dataSource, kpi.field)}
            dimensionLabel={catalogLabels.dimensionLabel(kpi.dataSource, kpi.groupByDimension)}
            extraFieldLabels={Object.fromEntries(
              kpi.extraFields.map((extra) => [
                extra.field,
                catalogLabels.fieldLabel(kpi.dataSource, extra.field) ?? extra.field,
              ])
            )}
          />
        ) : (
          <p className={cn("p-4 text-[12px]", MUTED)}>تعذر تحميل بيانات المؤشر</p>
        )}
      </div>
      {/* react-resizable appends its own corner resize-handle element into `children` -- this
          must render it (rather than ignoring it, as this component otherwise builds its own
          content) or the handle silently never reaches the DOM and resizing stops working. */}
      {children}
    </div>
  )
})

const CANVAS_FEATURE_HIGHLIGHTS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: PieChart, label: "تصور مرن" },
  { icon: SlidersHorizontal, label: "فلاتر تفاعلية" },
  { icon: BarChart3, label: "مؤشرات متعددة" },
]

function CanvasEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-[18px] bg-[#eaf1ff] text-[#2878ff]">
        <Wand2 className="size-7" />
      </span>
      <div>
        <p className={cn("text-[15px] font-bold", HEADING)}>أضف مؤشرات هنا لبناء تقريرك المخصص</p>
        <p className={cn("mx-auto mt-1.5 max-w-[340px] text-[12px]", MUTED)}>
          اضغط + بجانب أي مؤشر من القائمة لإضافته، ثم اسحبه أو غيّر حجمه بحرية داخل اللوحة.
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {CANVAS_FEATURE_HIGHLIGHTS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-[#e1e7f0] bg-white px-3 py-1.5 text-[11px] font-semibold",
              MUTED
            )}
          >
            <Icon className="size-3.5 text-[#2878ff]" />
            {label}
          </span>
        ))}
      </div>

      <a
        href={ROUTES.reportsKpisNew}
        target="_blank"
        rel="noreferrer"
        className={PILL_PRIMARY_CLASS}
      >
        <Plus className="size-4" />
        إنشاء مؤشر جديد
      </a>
    </div>
  )
}

export function ReportBuilderPage({ reportId }: { reportId?: string }) {
  const router = useRouter()
  const isEditing = Boolean(reportId)

  const [kpis, setKpis] = useState<Kpi[]>([])
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [catalog, setCatalog] = useState<CatalogDataSourceOption[]>([])
  const [loadingReport, setLoadingReport] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [kpiSearch, setKpiSearch] = useState("")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("sales")
  const [sharing, setSharing] = useState<ReportSharing>("private")
  const [showFilterBar, setShowFilterBar] = useState(true)
  const [showComparison, setShowComparison] = useState(true)
  const [widgets, setWidgets] = useState<PlacedWidget[]>([])

  // The author's own permanent baseline for this report -- saved with it (see handleSave) and
  // applied for everyone who opens it, before their own session-only filter bar (see
  // ReportViewerPage) adjusts anything on top. Same shape/UX as that viewer bar, just persisted.
  const [defaultDateRange, setDefaultDateRange] = useState<DateRange | undefined>(undefined)
  const [defaultReportFilters, setDefaultReportFilters] = useState<ReportLevelFilter[]>([])
  const [filterValueOptions, setFilterValueOptions] = useState<Record<string, string[]>>({})
  const fetchedFilterValueKeysRef = useRef(new Set<string>())
  const [results, setResults] = useState<Record<string, KpiResult>>({})
  const [loadingResults, setLoadingResults] = useState<Record<string, boolean>>({})

  useEffect(() => {
    kpiService
      .list()
      .then(setKpis)
      .finally(() => setLoadingKpis(false))
  }, [])

  useEffect(() => {
    reportsCatalogService.get().then(setCatalog)
  }, [])

  const catalogLabels = useMemo(() => buildCatalogLabelIndex(catalog), [catalog])

  useEffect(() => {
    if (!reportId) return
    reportService
      .get(reportId)
      .then((report) => {
        setName(report.name)
        setDescription(report.description)
        setCategory(report.category)
        setSharing(report.sharing)
        setShowFilterBar(report.displayOptions.showFilterBar ?? true)
        setShowComparison(report.displayOptions.showComparison ?? true)
        if (report.defaultFilters.from && report.defaultFilters.to) {
          setDefaultDateRange({
            from: new Date(report.defaultFilters.from),
            to: new Date(report.defaultFilters.to),
          })
        }
        setDefaultReportFilters(report.defaultFilters.filters ?? [])
        setWidgets(
          [...report.widgets]
            .sort((a, b) => a.order - b.order)
            .map((widget) => ({
              localId: widget.id,
              kpiId: widget.kpiId,
              x: widget.x,
              y: widget.y,
              w: widget.w,
              h: widget.h,
            }))
        )
      })
      .finally(() => setLoadingReport(false))
  }, [reportId])

  const kpiById = useMemo(() => new Map(kpis.map((kpi) => [kpi.id, kpi])), [kpis])

  const filteredKpis = useMemo(() => {
    const query = kpiSearch.trim()
    if (!query) return kpis
    return kpis.filter(
      (kpi) => kpi.name.includes(query) || categoryMeta(kpi.category).label.includes(query)
    )
  }, [kpis, kpiSearch])

  // Every filter field usable across this report -- the union of catalog filterFields for each
  // distinct data source a placed widget's KPI actually reads from, deduped by
  // "dataSource:field" (the same field key can exist on more than one data source). Mirrors
  // ReportViewerPage's own availableFilterFields, just built from the canvas's KPIs instead of a
  // saved report's widgets, since neither exists yet for a brand-new report.
  const availableFilterFields = useMemo(() => {
    const usedDataSources = new Set(
      widgets
        .map((widget) => kpiById.get(widget.kpiId)?.dataSource)
        .filter((value): value is string => Boolean(value))
    )
    const seen = new Set<string>()
    const options: Array<{
      dataSource: string
      field: string
      label: string
      allowedOperators: ReportFilterOperator[]
    }> = []
    for (const source of catalog) {
      if (!usedDataSources.has(source.key)) continue
      for (const filterField of source.filterFields) {
        const key = `${source.key}:${filterField.key}`
        if (seen.has(key)) continue
        seen.add(key)
        options.push({
          dataSource: source.key,
          field: filterField.key,
          label: filterField.label,
          allowedOperators: filterField.allowedOperators,
        })
      }
    }
    return options
  }, [widgets, kpiById, catalog])

  const addDefaultFilter = () => {
    const first = availableFilterFields[0]
    if (!first) return
    setDefaultReportFilters((current) => [
      ...current,
      {
        dataSource: first.dataSource,
        field: first.field,
        operator: first.allowedOperators[0],
        value: "",
      },
    ])
  }

  const updateDefaultFilter = (index: number, patch: Partial<ReportLevelFilter>) => {
    setDefaultReportFilters((current) =>
      current.map((filter, i) => (i === index ? { ...filter, ...patch } : filter))
    )
  }

  const removeDefaultFilter = (index: number) => {
    setDefaultReportFilters((current) => current.filter((_, i) => i !== index))
  }

  // Lazily fetches real distinct values for each filter row's field, cached by
  // "dataSource:field" -- same pattern as ReportViewerPage's own filter bar and the KPI wizard's
  // filter-value dropdown.
  useEffect(() => {
    const neededKeys = Array.from(
      new Set(defaultReportFilters.map((filter) => `${filter.dataSource}:${filter.field}`))
    )
    const missing = neededKeys.filter((key) => !fetchedFilterValueKeysRef.current.has(key))
    for (const key of missing) {
      fetchedFilterValueKeysRef.current.add(key)
      const [filterDataSource, filterField] = key.split(":")
      reportsCatalogService
        .getFilterFieldValues(filterDataSource, filterField, null)
        .then((values) => {
          setFilterValueOptions((current) => ({ ...current, [key]: values }))
        })
        .catch(() => {
          fetchedFilterValueKeysRef.current.delete(key)
        })
    }
  }, [defaultReportFilters])

  useEffect(() => {
    for (const widget of widgets) {
      if (results[widget.kpiId] || loadingResults[widget.kpiId]) continue
      const kpi = kpiById.get(widget.kpiId)
      if (!kpi) continue
      setLoadingResults((current) => ({ ...current, [widget.kpiId]: true }))
      kpiService
        .preview({
          dataSource: kpi.dataSource,
          field: kpi.field,
          aggregation: kpi.aggregation,
          extraFields: kpi.extraFields,
          filters: kpi.filters,
          timeGrouping: kpi.timeGrouping,
          groupByDimension: kpi.groupByDimension,
          compareEnabled: kpi.compareEnabled,
          workspaceId: kpi.workspaceId,
        })
        .then((result) => setResults((current) => ({ ...current, [kpi.id]: result })))
        .catch(() => {})
        .finally(() => setLoadingResults((current) => ({ ...current, [kpi.id]: false })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, kpiById])

  const addKpiToCanvas = (kpiId: string) => {
    setWidgets((current) => {
      // Placed right below whatever is already there, full column width if the canvas is
      // empty (nothing to sit beside yet) or half width otherwise -- close to how Metabase
      // seeds a freshly-added card rather than always defaulting to one fixed size.
      const bottom = current.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
      const w = current.length === 0 ? GRID_COLS : DEFAULT_WIDGET_W
      return [
        ...current,
        { localId: `${kpiId}-${Date.now()}`, kpiId, x: 0, y: bottom, w, h: DEFAULT_WIDGET_H },
      ]
    })
  }

  const handleLayoutChange = (layout: Layout[]) => {
    setWidgets((current) =>
      current.map((widget) => {
        const next = layout.find((item) => item.i === widget.localId)
        return next ? { ...widget, x: next.x, y: next.y, w: next.w, h: next.h } : widget
      })
    )
  }

  const removeWidget = (localId: string) => {
    setWidgets((current) => current.filter((widget) => widget.localId !== localId))
  }

  const handleSave = async () => {
    if (!name.trim() || widgets.length === 0) {
      toast.error("يرجى إدخال اسم التقرير وإضافة مؤشر واحد على الأقل.")
      return
    }
    setSaving(true)
    try {
      const activeDefaultFilters = defaultReportFilters.filter(
        (filter) => filter.value.trim() !== ""
      )
      const input = {
        name: name.trim(),
        description: description.trim(),
        category,
        defaultFilters: {
          ...(defaultDateRange?.from && defaultDateRange?.to
            ? { from: defaultDateRange.from.toISOString(), to: defaultDateRange.to.toISOString() }
            : {}),
          ...(activeDefaultFilters.length > 0 ? { filters: activeDefaultFilters } : {}),
        },
        displayOptions: { showFilterBar, allowExport: true, showComparison },
        sharing,
        status: "active" as const,
        workspaceId: null,
        widgets: widgets.map((widget, index) => ({
          kpiId: widget.kpiId,
          order: index,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
        })),
      }
      if (isEditing && reportId) {
        await reportService.update(reportId, input)
        toast.success("تم تحديث التقرير بنجاح.")
        router.push(ROUTES.reportsCustomView(reportId))
      } else {
        const created = await reportService.create(input)
        toast.success("تم إنشاء التقرير بنجاح.")
        router.push(ROUTES.reportsCustomView(created.id))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التقرير.")
    } finally {
      setSaving(false)
    }
  }

  if (loadingKpis || loadingReport) {
    return (
      <div dir="rtl" className="space-y-3.5">
        <AppLoading variant="page" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf1ff] text-[#2878ff]">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className={cn("text-[19px] font-extrabold", HEADING)}>
              {isEditing ? "تعديل التقرير المخصص" : "إنشاء تقرير مخصص"}
            </h1>
            <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>
              أضف مؤشراتك واسحبها أو غيّر حجمها لبناء تقريرك المخصص
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              router.push(
                isEditing && reportId ? ROUTES.reportsCustomView(reportId) : ROUTES.reports
              )
            }
            className={cn(PILL_SECONDARY_CLASS, saving && "pointer-events-none opacity-60")}
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={PILL_PRIMARY_CLASS}
          >
            <Save className="size-4" />
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[260px_1fr_300px]">
        {/* Settings panel */}
        <div className={PANEL}>
          <PanelHeader icon={SlidersHorizontal} title="إعدادات التقرير" />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className={cn("text-[12px] font-semibold", HEADING)}>اسم التقرير *</label>
              <AppInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label className={cn("text-[12px] font-semibold", HEADING)}>الوصف</label>
              <AppTextarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className={FIELD_TEXTAREA_CLASS}
              />
            </div>
            <div className="flex items-center justify-between rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] px-3 py-2.5">
              <span className={cn("text-[12px] font-semibold", HEADING)}>إظهار شريط الفلاتر</span>
              <AppSwitch checked={showFilterBar} onCheckedChange={setShowFilterBar} />
            </div>
            <div className="flex items-center justify-between rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] px-3 py-2.5">
              <span className={cn("text-[12px] font-semibold", HEADING)}>عرض أرقام المقارنة</span>
              <AppSwitch checked={showComparison} onCheckedChange={setShowComparison} />
            </div>
            <div className="space-y-1.5">
              <label className={cn("text-[12px] font-semibold", HEADING)}>المشاركة</label>
              <AppSelect
                value={sharing}
                onValueChange={(value) => setSharing(value as ReportSharing)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="private">خاص (لي فقط)</AppSelectItem>
                  <AppSelectItem value="organization">المؤسسة بالكامل</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-2 border-t border-[#f1f4f9] pt-4">
              <label className={cn("text-[12px] font-semibold", HEADING)}>الفلاتر الافتراضية</label>
              <p className={cn("text-[11px]", MUTED)}>
                تُطبّق تلقائياً على هذا التقرير لكل من يفتحه. يمكن لمن يعرضه تعديلها مؤقتاً من شريط
                الفلاتر، لكنها تعود إلى ما هو محفوظ هنا عند التحديث.
              </p>

              <AppDateRangeFilter value={defaultDateRange} onChange={setDefaultDateRange} />

              {defaultReportFilters.map((filter, index) => {
                const fieldOption = availableFilterFields.find(
                  (option) =>
                    option.dataSource === filter.dataSource && option.field === filter.field
                )
                const isSubstring =
                  filter.operator === "contains" || filter.operator === "not_contains"
                const valueKey = `${filter.dataSource}:${filter.field}`
                const values = filterValueOptions[valueKey] ?? []
                const valueOptions =
                  filter.value && !values.includes(filter.value)
                    ? [filter.value, ...values]
                    : values

                return (
                  <div
                    key={index}
                    className="space-y-1.5 rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <AppSelect
                        value={valueKey}
                        onValueChange={(value) => {
                          const [nextDataSource, nextField] = value.split(":")
                          const nextOption = availableFilterFields.find(
                            (option) =>
                              option.dataSource === nextDataSource && option.field === nextField
                          )
                          updateDefaultFilter(index, {
                            dataSource: nextDataSource,
                            field: nextField,
                            operator: nextOption?.allowedOperators[0] ?? "eq",
                            value: "",
                          })
                        }}
                      >
                        <AppSelectTrigger className={DEFAULT_FILTER_FIELD_CLASS}>
                          <AppSelectValue />
                        </AppSelectTrigger>
                        <AppSelectContent>
                          {availableFilterFields.map((option) => (
                            <AppSelectItem
                              key={`${option.dataSource}:${option.field}`}
                              value={`${option.dataSource}:${option.field}`}
                            >
                              {option.label}
                            </AppSelectItem>
                          ))}
                        </AppSelectContent>
                      </AppSelect>
                      <button
                        type="button"
                        onClick={() => removeDefaultFilter(index)}
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee]"
                        aria-label="حذف الفلتر"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <AppSelect
                      value={filter.operator}
                      onValueChange={(value) => {
                        const nextOperator = value as ReportFilterOperator
                        const wasSubstring = isSubstring
                        const isNextSubstring =
                          nextOperator === "contains" || nextOperator === "not_contains"
                        updateDefaultFilter(index, {
                          operator: nextOperator,
                          value: wasSubstring === isNextSubstring ? filter.value : "",
                        })
                      }}
                    >
                      <AppSelectTrigger className={DEFAULT_FILTER_FIELD_CLASS}>
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {fieldOption?.allowedOperators.map((op) => (
                          <AppSelectItem key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>

                    {isSubstring ? (
                      <input
                        value={filter.value}
                        onChange={(event) =>
                          updateDefaultFilter(index, { value: event.target.value })
                        }
                        placeholder="القيمة"
                        className={cn(
                          DEFAULT_FILTER_FIELD_CLASS,
                          "px-3 placeholder:text-[#95a4bd]"
                        )}
                      />
                    ) : (
                      <AppSearchableSelect
                        value={filter.value}
                        onChange={(next) => updateDefaultFilter(index, { value: next })}
                        onCreate={(draft) => updateDefaultFilter(index, { value: draft })}
                        options={valueOptions.map((value) => ({ value, label: value }))}
                        placeholder="القيمة"
                        searchPlaceholder="ابحث عن قيمة..."
                        compact
                        hideTriggerMark
                        triggerClassName={cn(DEFAULT_FILTER_FIELD_CLASS, "justify-between")}
                      />
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addDefaultFilter}
                disabled={availableFilterFields.length === 0}
                className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#e1e7f0] bg-white px-3.5 text-[12px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                إضافة فلتر
              </button>
              {availableFilterFields.length === 0 ? (
                <p className={cn("text-[10.5px]", MUTED)}>
                  أضف مؤشراً إلى التقرير أولاً لإتاحة فلاتره.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Canvas -- kept dir="ltr" for correct drag/resize math, see the note above GRID_COLS */}
        <div
          dir="ltr"
          className="min-h-[420px] rounded-[14px] border-2 border-dashed border-[#dbe4f3] bg-[#fafbfd] p-3"
        >
          {widgets.length === 0 ? (
            <div dir="rtl">
              <CanvasEmptyState />
            </div>
          ) : (
            <ResponsiveGridLayout
              className="layout"
              cols={GRID_COLS}
              rowHeight={GRID_ROW_HEIGHT}
              margin={GRID_MARGIN}
              draggableHandle=".widget-drag-handle"
              compactType="vertical"
              onLayoutChange={handleLayoutChange}
            >
              {widgets.map((widget) => (
                <CanvasWidget
                  key={widget.localId}
                  data-grid={{ x: widget.x, y: widget.y, w: widget.w, h: widget.h }}
                  kpi={kpiById.get(widget.kpiId)}
                  result={results[widget.kpiId]}
                  loading={Boolean(loadingResults[widget.kpiId])}
                  onRemove={() => removeWidget(widget.localId)}
                  catalogLabels={catalogLabels}
                />
              ))}
            </ResponsiveGridLayout>
          )}
        </div>

        {/* Sidebar: saved KPIs */}
        <div className={PANEL}>
          <PanelHeader
            icon={BarChart3}
            title="المؤشرات المتاحة"
            subtitle="أضف مؤشراً إلى التقرير"
          />
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[#95a4bd]" />
            <input
              value={kpiSearch}
              onChange={(event) => setKpiSearch(event.target.value)}
              placeholder="ابحث عن مؤشر..."
              className="h-9 w-full rounded-[10px] border border-[#e1e7f0] bg-[#fafbfd] pe-3 ps-8 text-[12px] text-[#0b1738] shadow-none transition-colors placeholder:text-[#95a4bd] hover:border-[#c4d5f0] focus:border-[#2878ff] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[#2878ff]/12"
            />
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {kpis.length === 0 ? (
              <p className={cn("py-6 text-center text-[12px]", MUTED)}>
                لا توجد مؤشرات محفوظة بعد.
              </p>
            ) : filteredKpis.length === 0 ? (
              <p className={cn("py-6 text-center text-[12px]", MUTED)}>لا توجد نتائج مطابقة.</p>
            ) : (
              filteredKpis.map((kpi) => (
                <SidebarKpiItem key={kpi.id} kpi={kpi} onAdd={() => addKpiToCanvas(kpi.id)} />
              ))
            )}
          </div>
          <a
            href={ROUTES.reportsKpisNew}
            target="_blank"
            rel="noreferrer"
            className={cn(PILL_SECONDARY_CLASS, "mt-3 w-full justify-center")}
          >
            <Plus className="size-4" />
            إنشاء مؤشر جديد
          </a>
        </div>
      </div>
    </div>
  )
}
