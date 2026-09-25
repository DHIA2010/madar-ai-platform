"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, Edit, FileDown, Plus, RotateCcw, Trash2 } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppContainer,
  AppDateRangeFilter,
  AppEmpty,
  AppLoading,
  AppPage,
  AppPageHeader,
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { Can } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import {
  buildCatalogLabelIndex,
  type CatalogDataSourceOption,
  type CustomReportData,
  type Kpi,
  type ReportDataOverrides,
  type ReportFilterOperator,
  type ReportLevelFilter,
  reportsCatalogService,
  reportService,
  type ReportTimeGrouping,
} from "../services"
import { kpiService } from "../services"
import { KpiWidgetRenderer } from "./kpi-widget-renderer"

const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  eq: "يساوي (=)",
  neq: "لا يساوي (≠)",
  contains: "يحتوي على",
  not_contains: "لا يحتوي على",
}

const FILTER_FIELD_CLASS =
  "h-9 rounded-[8px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738] shadow-none focus-visible:border-[#2878ff] focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12"

// Spelled-out month (matches the PDF header's own "تم إنشاؤه في" date style) rather than
// dateStyle: "medium", which renders as plain DD/MM/YYYY digits for this locale -- much easier to
// read at the small size these chips render at.
const CHIP_DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

// A widget's `order` field doesn't necessarily match where it actually sits in the drag-grid --
// x/y are what place it on screen (gridColumn/gridRow below), and order can drift from that once
// widgets have been dragged around. The PDF export stacks widgets in a single column, so it needs
// their real top-to-bottom, left-to-right reading position, not whatever `order` happens to hold.
function sortWidgetsByPosition<T extends { x: number; y: number }>(widgets: T[]): T[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)
}

// Mirrors the live grid's own row height/gap below (gridAutoRows: 36px, gap-4 = 16px) so an
// exported widget gets exactly the height it actually renders at on screen, instead of one
// fixed guess -- a number card and a table with rows + pagination need very different amounts of
// room, and a single hardcoded height either clips the tall ones or wastes space on the short ones.
const GRID_ROW_PX = 36
const GRID_GAP_PX = 16
function widgetPixelHeight(rowSpan: number): number {
  return rowSpan * GRID_ROW_PX + Math.max(rowSpan - 1, 0) * GRID_GAP_PX
}

export function ReportViewerPage({ reportId }: { reportId: string }) {
  const router = useRouter()
  const { currentOrganization } = useWorkspace()
  const [data, setData] = useState<CustomReportData | null>(null)
  const [kpiById, setKpiById] = useState<Map<string, Kpi>>(new Map())
  const [catalog, setCatalog] = useState<CatalogDataSourceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const exportHeaderRef = useRef<HTMLDivElement>(null)
  const exportWidgetRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // The viewer's own filter bar -- session-only, never saved back to the report. A refresh (or
  // just navigating away and back) drops these and the report renders with whatever was actually
  // configured for it again; a permanent change means editing the report itself, not this bar.
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [viewerFilters, setViewerFilters] = useState<ReportLevelFilter[]>([])
  const [filterValueOptions, setFilterValueOptions] = useState<Record<string, string[]>>({})
  const fetchedFilterValueKeysRef = useRef(new Set<string>())
  const [applyingFilters, setApplyingFilters] = useState(false)
  // The overrides actually last sent to the server -- distinct from dateRange/viewerFilters above,
  // which track the bar's editable draft and can be mid-edit (or already cleared) without that
  // having been applied yet. undefined means "nothing applied this session, showing the report's
  // own saved defaults" -- what the "applied filters" summary below reads to describe what's
  // really driving the data on screen right now.
  const [appliedOverrides, setAppliedOverrides] = useState<ReportDataOverrides | undefined>(
    undefined
  )

  useEffect(() => {
    Promise.all([reportService.getData(reportId), kpiService.list(), reportsCatalogService.get()])
      .then(([reportData, kpis, catalogData]) => {
        setData(reportData)
        setKpiById(new Map(kpis.map((kpi) => [kpi.id, kpi])))
        setCatalog(catalogData)
      })
      .finally(() => setLoading(false))
  }, [reportId])

  // Every filter field usable across this report -- the union of catalog filterFields for each
  // distinct data source any of its widgets' KPIs actually reads from, deduped by
  // "dataSource:field" (the same field key can exist on more than one data source). This is what
  // makes "there's an invoice-status chart, so let me filter by invoice status" possible: the bar
  // only ever offers fields that are actually meaningful for at least one widget on this report.
  const availableFilterFields = useMemo(() => {
    if (!data) return []
    const usedDataSources = new Set(
      data.report.widgets
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
  }, [data, kpiById, catalog])

  const addViewerFilter = () => {
    const first = availableFilterFields[0]
    if (!first) return
    setViewerFilters((current) => [
      ...current,
      {
        dataSource: first.dataSource,
        field: first.field,
        operator: first.allowedOperators[0],
        value: "",
      },
    ])
  }

  const updateViewerFilter = (index: number, patch: Partial<ReportLevelFilter>) => {
    setViewerFilters((current) =>
      current.map((filter, i) => (i === index ? { ...filter, ...patch } : filter))
    )
  }

  const removeViewerFilter = (index: number) => {
    setViewerFilters((current) => current.filter((_, i) => i !== index))
  }

  // Lazily fetches real distinct values for each filter row's field, cached by
  // "dataSource:field" -- same pattern as the KPI wizard's own filter-value dropdown.
  useEffect(() => {
    const neededKeys = Array.from(
      new Set(viewerFilters.map((filter) => `${filter.dataSource}:${filter.field}`))
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
  }, [viewerFilters])

  const applyViewerFilters = async () => {
    setApplyingFilters(true)
    try {
      const overrides: ReportDataOverrides = {}
      if (dateRange?.from && dateRange?.to) {
        overrides.from = dateRange.from.toISOString()
        overrides.to = dateRange.to.toISOString()
      }
      const activeFilters = viewerFilters.filter((filter) => filter.value.trim() !== "")
      if (activeFilters.length > 0) overrides.filters = activeFilters
      const refreshed = await reportService.getData(reportId, overrides)
      setData(refreshed)
      setAppliedOverrides(overrides)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تطبيق الفلاتر.")
    } finally {
      setApplyingFilters(false)
    }
  }

  // Resets the viewer's own session adjustments back to the report's saved defaults -- the
  // author's own permanent baseline filters (set in the builder) still apply, since removing
  // those means editing the report itself, not clearing this session-only bar.
  const clearAllViewerFilters = async () => {
    setApplyingFilters(true)
    try {
      const refreshed = await reportService.getData(reportId)
      setData(refreshed)
      setDateRange(undefined)
      setViewerFilters([])
      setAppliedOverrides(undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر مسح الفلاتر.")
    } finally {
      setApplyingFilters(false)
    }
  }

  // Combines the report's own saved baseline with whatever the viewer has actually applied this
  // session (not just typed into the draft controls) -- mirrors runCustomReport's own
  // date-replaces / filters-are-additive merge, purely for display in the "applied filters"
  // summary below.
  const appliedFilterSummary = useMemo(() => {
    if (!data) return { from: undefined, to: undefined, filters: [] as ReportLevelFilter[] }
    const saved = data.report.defaultFilters
    const from = appliedOverrides?.from ?? saved.from
    const to = appliedOverrides?.to ?? saved.to
    const filters = [...(saved.filters ?? []), ...(appliedOverrides?.filters ?? [])]
    return { from, to, filters }
  }, [data, appliedOverrides])

  // A widget's period pill (see PeriodPill in kpi-widget-renderer.tsx) lets the viewer pick a
  // different time grouping just for their own session -- kept here, never sent back to the KPI,
  // so a refresh always shows whatever grouping is actually saved on it again. Keyed by kpiId.
  const [timeGroupingOverrides, setTimeGroupingOverrides] = useState<
    Record<string, ReportTimeGrouping>
  >({})

  const handleTimeGroupingChange = async (kpi: Kpi, next: ReportTimeGrouping) => {
    try {
      const result = await kpiService.preview({
        dataSource: kpi.dataSource,
        field: kpi.field,
        aggregation: kpi.aggregation,
        extraFields: kpi.extraFields,
        filters: kpi.filters,
        timeGrouping: next,
        groupByDimension: kpi.groupByDimension,
        compareEnabled: kpi.compareEnabled,
        workspaceId: kpi.workspaceId,
      })
      setTimeGroupingOverrides((current) => ({ ...current, [kpi.id]: next }))
      setData((current) =>
        current ? { ...current, results: { ...current.results, [kpi.id]: result } } : current
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تغيير التجميع الزمني.")
    }
  }

  const catalogLabels = useMemo(() => buildCatalogLabelIndex(catalog), [catalog])

  // Shared between the live on-screen grid and the off-screen export tree below, so a widget's
  // field/dimension labels are resolved the exact same way in both places.
  const widgetLabelProps = (kpi: Kpi) => ({
    fieldLabel: catalogLabels.fieldLabel(kpi.dataSource, kpi.field),
    dimensionLabel: catalogLabels.dimensionLabel(kpi.dataSource, kpi.groupByDimension),
    extraFieldLabels: Object.fromEntries(
      kpi.extraFields.map((extra) => [
        extra.field,
        catalogLabels.fieldLabel(kpi.dataSource, extra.field) ?? extra.field,
      ])
    ),
  })

  // Rasterizes the off-screen export tree (report title + every widget, none of the app's
  // sidebar/header/live-grid chrome) into a downloadable PDF -- a direct file, not the OS print
  // dialog's "Save as PDF" detour. html2canvas can't parse the oklch() colors Tailwind v4's
  // default theme tokens use (bg-card, text-muted-foreground, ...), which is why the export tree
  // below and KpiWidgetRenderer itself stick to hardcoded hex colors throughout.
  const handleExportPdf = async () => {
    if (!data || exporting) return
    setExporting(true)
    try {
      // Give the off-screen tree a moment to mount, let ResponsiveContainer measure its now-real
      // width, and let the charts' entrance animation finish before rasterizing them mid-draw.
      await Promise.all([new Promise((resolve) => setTimeout(resolve, 1500)), document.fonts.ready])

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const marginMm = 12
      const pageWidthMm = pdf.internal.pageSize.getWidth()
      const pageHeightMm = pdf.internal.pageSize.getHeight()
      const contentWidthMm = pageWidthMm - marginMm * 2
      let cursorYMm = marginMm
      const canvasScale = 2

      const addNode = async (node: HTMLElement) => {
        // NOT foreignObjectRendering: that mode wraps the captured element -- including its real
        // <svg> charts -- inside html2canvas's OWN outer <svg><foreignObject>, then loads the
        // serialized result through an <img> tag; browsers silently refuse to rasterize an
        // SVG-within-SVG loaded that way (no error, just a blank image), which is exactly what
        // every widget here would hit since each one contains a real recharts <svg>.
        //
        // html2canvas's default renderer draws charts/backgrounds/borders correctly, but has its
        // own bug drawing Arabic text -- three different targeted fixes (foreignObjectRendering,
        // wrapping mixed-script runs in <bdi>, dropping text-overflow:ellipsis) each failed to
        // actually fix it, without ever landing on the exact trigger. Rather than keep guessing at
        // html2canvas's internals, every element marked data-canvas-text (see
        // kpi-widget-renderer.tsx: widget titles, table row labels, pie legend labels, gauge stat
        // text) is hidden from html2canvas's own paint below (color: transparent -- this only
        // affects fill color, not layout, so backgrounds/borders/positioning of everything else
        // are untouched) and its text is instead drawn directly onto the resulting canvas with a
        // single native fillText() call per element. Canvas 2D text rendering shapes/orders Arabic
        // correctly on its own, in every browser, as long as nothing manually splits the string
        // first -- which is exactly what html2canvas's own internal (buggy) text path does and
        // what going around it entirely avoids.
        const textNodes = Array.from(node.querySelectorAll<HTMLElement>("[data-canvas-text]"))
        const textCaptures = textNodes.map((el) => {
          const style = getComputedStyle(el)
          const range = document.createRange()
          range.selectNodeContents(el)
          return {
            el,
            text: el.textContent ?? "",
            color: style.color,
            font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
            previousColor: el.style.color,
            rect: range.getBoundingClientRect(),
          }
        })
        textCaptures.forEach(({ el }) => {
          el.style.color = "transparent"
        })

        const canvas = await html2canvas(node, {
          scale: canvasScale,
          backgroundColor: "#ffffff",
          // The org logo (only external image in this tree) needs this to actually draw instead
          // of silently tainting the canvas -- everything else here is same-origin/inline.
          useCORS: true,
        })

        textCaptures.forEach(({ el, previousColor }) => {
          el.style.color = previousColor
        })

        const ctx = canvas.getContext("2d")
        if (ctx) {
          const nodeRect = node.getBoundingClientRect()
          ctx.save()
          // html2canvas doesn't reset the context's transform after rendering -- it leaves its own
          // internal scale/translate (here, a large translateX compensating for this tree's
          // position:fixed; left:-99999 off-screen placement) baked in. Scaling on top of that
          // without resetting first compounds into a transform that puts every fillText() call
          // tens of thousands of pixels off-canvas (confirmed via getTransform() logging) -- every
          // marked element rendered completely blank, not garbled, in the very first version of
          // this fix. Resetting to identity first guarantees our own scale is the only transform.
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.scale(canvasScale, canvasScale)
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.direction = "rtl"
          for (const capture of textCaptures) {
            if (!capture.text.trim()) continue
            ctx.font = capture.font
            ctx.fillStyle = capture.color
            ctx.fillText(
              capture.text,
              capture.rect.left - nodeRect.left + capture.rect.width / 2,
              capture.rect.top - nodeRect.top + capture.rect.height / 2
            )
          }
          ctx.restore()
        }

        const imgHeightMm = (canvas.height * contentWidthMm) / canvas.width
        if (cursorYMm > marginMm && cursorYMm + imgHeightMm > pageHeightMm - marginMm) {
          pdf.addPage()
          cursorYMm = marginMm
        }
        // JPEG at high quality over PNG -- these are opaque, photo-scale raster captures (charts
        // rasterized at 2x scale), where PNG's lossless encoding costs many MB for no visible gain.
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          marginMm,
          cursorYMm,
          contentWidthMm,
          imgHeightMm
        )
        cursorYMm += imgHeightMm + 6
      }

      if (exportHeaderRef.current) {
        await addNode(exportHeaderRef.current)
      }
      for (const widget of sortWidgetsByPosition(data.report.widgets)) {
        const node = exportWidgetRefs.current.get(widget.id)
        if (node) await addNode(node)
      }

      const safeName = data.report.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "report"
      pdf.save(`${safeName}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <AppPage>
        <AppContainer>
          <AppLoading variant="page" />
        </AppContainer>
      </AppPage>
    )
  }

  if (!data) {
    return (
      <AppPage>
        <AppContainer>
          <AppEmpty title="تعذر تحميل التقرير" />
        </AppContainer>
      </AppPage>
    )
  }

  const { report, results } = data

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "التقارير", href: ROUTES.reports },
            { label: report.name, current: true },
          ]}
          title={report.name}
          subtitle={report.description}
          actions={
            <div className="flex items-center gap-2">
              <AppButton
                variant="outline"
                loading={exporting}
                icon={
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#eef4ff] text-[#2878ff]">
                    <FileDown className="size-3" strokeWidth={2.5} />
                  </span>
                }
                onClick={() => void handleExportPdf()}
                className="h-11 gap-2 rounded-full border-[#e1e7f0] bg-white px-5 text-[13.5px] font-semibold text-[#0b1738] shadow-none transition-all hover:-translate-y-px hover:border-[#c4d5f0] hover:bg-[#fafbfd] hover:shadow-[0_6px_16px_rgba(11,23,56,0.08)] active:translate-y-0"
              >
                {exporting ? "جاري التصدير..." : "تصدير PDF"}
              </AppButton>
              {!report.isSystem ? (
                <Can permission="reports:manage">
                  <AppButton
                    variant="outline"
                    icon={
                      <span className="flex size-5 items-center justify-center rounded-full bg-[#eef4ff] text-[#2878ff]">
                        <Edit className="size-3" strokeWidth={2.5} />
                      </span>
                    }
                    onClick={() => router.push(ROUTES.reportsCustomEdit(report.id))}
                    className="h-11 gap-2 rounded-full border-[#e1e7f0] bg-white px-5 text-[13.5px] font-semibold text-[#0b1738] shadow-none transition-all hover:-translate-y-px hover:border-[#c4d5f0] hover:bg-[#fafbfd] hover:shadow-[0_6px_16px_rgba(11,23,56,0.08)] active:translate-y-0"
                  >
                    تعديل
                  </AppButton>
                </Can>
              ) : null}
            </div>
          }
        />

        {report.displayOptions.showFilterBar ? (
          <div className="rounded-[14px] border border-[#e1e7f0] bg-white p-4">
            {/* What's actually driving the data below right now -- the report's own saved
                baseline plus whatever the viewer applied this session, not just what's currently
                sitting in the (possibly unapplied) draft controls beneath it. */}
            {appliedFilterSummary.from || appliedFilterSummary.filters.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#5b6b85]">الفلاتر المطبقة:</span>
                {appliedFilterSummary.from && appliedFilterSummary.to ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf1ff] px-2.5 py-1 text-[11px] font-semibold text-[#2878ff]">
                    <Calendar className="size-3" />
                    {CHIP_DATE_FORMAT.format(new Date(appliedFilterSummary.from))} -{" "}
                    {CHIP_DATE_FORMAT.format(new Date(appliedFilterSummary.to))}
                  </span>
                ) : null}
                {appliedFilterSummary.filters.map((filter, index) => {
                  const option = availableFilterFields.find(
                    (candidate) =>
                      candidate.dataSource === filter.dataSource && candidate.field === filter.field
                  )
                  return (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full bg-[#eaf1ff] px-2.5 py-1 text-[11px] font-semibold text-[#2878ff]"
                    >
                      {option?.label ?? filter.field} {OPERATOR_LABELS[filter.operator]} «
                      {filter.value}»
                    </span>
                  )
                })}
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-[#95a4bd]">
                لا توجد فلاتر مطبقة حالياً -- يعرض التقرير بياناته الافتراضية.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2.5">
              <AppDateRangeFilter value={dateRange} onChange={setDateRange} />

              {viewerFilters.map((filter, index) => {
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
                    className="flex items-center gap-1.5 rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] p-1.5"
                  >
                    <AppSelect
                      value={valueKey}
                      onValueChange={(value) => {
                        const [nextDataSource, nextField] = value.split(":")
                        const nextOption = availableFilterFields.find(
                          (option) =>
                            option.dataSource === nextDataSource && option.field === nextField
                        )
                        updateViewerFilter(index, {
                          dataSource: nextDataSource,
                          field: nextField,
                          operator: nextOption?.allowedOperators[0] ?? "eq",
                          value: "",
                        })
                      }}
                    >
                      <AppSelectTrigger className={cn(FILTER_FIELD_CLASS, "w-40")}>
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

                    <AppSelect
                      value={filter.operator}
                      onValueChange={(value) => {
                        const nextOperator = value as ReportFilterOperator
                        const wasSubstring = isSubstring
                        const isNextSubstring =
                          nextOperator === "contains" || nextOperator === "not_contains"
                        updateViewerFilter(index, {
                          operator: nextOperator,
                          value: wasSubstring === isNextSubstring ? filter.value : "",
                        })
                      }}
                    >
                      <AppSelectTrigger className={cn(FILTER_FIELD_CLASS, "w-32")}>
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
                          updateViewerFilter(index, { value: event.target.value })
                        }
                        placeholder="القيمة"
                        className={cn(FILTER_FIELD_CLASS, "w-40 px-3 placeholder:text-[#95a4bd]")}
                      />
                    ) : (
                      <AppSearchableSelect
                        value={filter.value}
                        onChange={(next) => updateViewerFilter(index, { value: next })}
                        onCreate={(draft) => updateViewerFilter(index, { value: draft })}
                        options={valueOptions.map((value) => ({ value, label: value }))}
                        placeholder="القيمة"
                        searchPlaceholder="ابحث عن قيمة..."
                        compact
                        hideTriggerMark
                        triggerClassName={cn(FILTER_FIELD_CLASS, "w-40 justify-between")}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeViewerFilter(index)}
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee]"
                      aria-label="حذف الفلتر"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addViewerFilter}
                disabled={availableFilterFields.length === 0}
                className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[#e1e7f0] bg-white px-3.5 text-[12px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                إضافة فلتر
              </button>

              <AppButton
                loading={applyingFilters}
                onClick={() => void applyViewerFilters()}
                className="h-9 rounded-full bg-[#2878ff] px-4 text-[12px] font-semibold text-white shadow-none hover:bg-[#1f63d6]"
              >
                تطبيق
              </AppButton>

              <button
                type="button"
                onClick={() => void clearAllViewerFilters()}
                disabled={
                  applyingFilters || (!dateRange && viewerFilters.length === 0 && !appliedOverrides)
                }
                className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[#e1e7f0] bg-white px-3.5 text-[12px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" />
                مسح الكل
              </button>
            </div>
            <p className="mt-2.5 text-[10.5px] text-[#95a4bd]">
              هذه الفلاتر مؤقتة لهذه الجلسة فقط ولا يتم حفظها -- لتغييرها بشكل دائم عدّل التقرير.
            </p>
          </div>
        ) : null}

        {report.widgets.length === 0 ? (
          <AppEmpty title="لا توجد مؤشرات في هذا التقرير" />
        ) : (
          // A static CSS grid mirroring the builder's 12-column layout (x/w in columns, y/h in
          // rows) -- read-only here, so no drag/resize library is needed, just the same
          // coordinates placed with plain grid-column/grid-row spans.
          <div dir="ltr" className="grid grid-cols-12 gap-4" style={{ gridAutoRows: "36px" }}>
            {[...report.widgets]
              .sort((a, b) => a.order - b.order)
              .map((widget) => {
                const kpi = kpiById.get(widget.kpiId)
                const result = results[widget.kpiId]
                return (
                  <div
                    key={widget.id}
                    dir="rtl"
                    className="overflow-hidden rounded-xl border bg-card"
                    style={{
                      gridColumn: `${widget.x + 1} / span ${widget.w}`,
                      gridRow: `${widget.y + 1} / span ${widget.h}`,
                    }}
                  >
                    {!kpi ? (
                      <p className="p-4 text-sm text-muted-foreground">مؤشر غير معروف</p>
                    ) : !result ? (
                      <AppLoading variant="chart" />
                    ) : (
                      <KpiWidgetRenderer
                        name={kpi.name}
                        displayType={kpi.displayType}
                        result={result}
                        timeGrouping={timeGroupingOverrides[kpi.id] ?? kpi.timeGrouping}
                        target={kpi.target}
                        decimalPlaces={kpi.decimalPlaces}
                        onTimeGroupingChange={(next) => void handleTimeGroupingChange(kpi, next)}
                        // A system KPI can never be edited (see REPORT_SYSTEM_KPI_READONLY in
                        // reports/service.ts) -- omitting this for one falls back to a plain,
                        // non-clickable heading instead of a link that always dead-ends in an
                        // error toast.
                        onTitleClick={
                          kpi.isSystem
                            ? undefined
                            : () => router.push(ROUTES.reportsKpisEdit(kpi.id))
                        }
                        {...widgetLabelProps(kpi)}
                      />
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </AppContainer>

      {/* The tree handleExportPdf() rasterizes into the PDF -- kept off-screen (not display:none,
          html2canvas needs a real layout to measure and capture), mounted only while exporting so
          its charts aren't rendering a second time for no reason the rest of the time. Every color
          here is a hardcoded hex, never a Tailwind semantic class like bg-card/text-muted-
          foreground -- those resolve to oklch() custom properties (Tailwind v4's default theme),
          which html2canvas cannot parse.

          This exact off-screen-at-a-huge-negative-offset + plain default (non-foreignObject)
          html2canvas setup is the one configuration independently confirmed to actually rasterize
          real content -- two different attempts to instead keep it on-screen (covered by an opaque
          loading backdrop, to fix Arabic text rendering or to show export progress) both produced
          a PDF with container borders/backgrounds but blank widget internals, for reasons that
          didn't fully pin down from html2canvas's source; rather than layer another guess on top,
          this reverts to the known-working baseline. The button's own inline loading label covers
          user feedback instead of a full-page overlay. */}
      {exporting ? (
        <div style={{ position: "fixed", top: 0, left: -99999, width: 760 }} dir="rtl">
          <div ref={exportHeaderRef} className="bg-white">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <h1 className="mb-1 text-xl font-bold text-[#0b1738]">{report.name}</h1>
                {report.description ? (
                  <p className="mb-1 text-sm text-[#6b7b96]">{report.description}</p>
                ) : null}
                <p className="text-[11px] text-[#95a4bd]">
                  تم إنشاؤه في{" "}
                  {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date())}
                </p>
              </div>
              {currentOrganization ? (
                <div className="flex shrink-0 items-center gap-2.5">
                  {currentOrganization.logoUrl ? (
                    // A remote org-branding asset -- next/image adds nothing for html2canvas, which
                    // needs a plain <img> it can rasterize directly (same reasoning as
                    // ThermalInvoiceReceipt's own print-only logo).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentOrganization.logoUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-[10px] object-contain"
                    />
                  ) : null}
                  <span
                    data-canvas-text
                    className="overflow-hidden whitespace-nowrap text-[13px] font-bold text-[#0b1738]"
                  >
                    {currentOrganization.name}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Records what was actually driving the data at export time -- same merge of the
                report's saved baseline + this session's applied overrides as the on-screen "الفلاتر
                المطبقة" summary above, so a downloaded PDF is still self-describing once it's no
                longer sitting next to the live filter bar. */}
            {appliedFilterSummary.from || appliedFilterSummary.filters.length > 0 ? (
              <div className="border-t border-[#f1f4f9] px-4 pb-3 pt-3">
                <p data-canvas-text className="mb-1.5 text-[10.5px] font-semibold text-[#5b6b85]">
                  الفلاتر المطبقة على هذا التقرير
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {appliedFilterSummary.from && appliedFilterSummary.to ? (
                    // Mixed RTL/Arabic + LTR numeric-and-hyphen content (a date range) is exactly
                    // the class of text html2canvas's own renderer mis-orders -- data-canvas-text
                    // routes it through the manual fillText redraw in handleExportPdf instead,
                    // same as every other at-risk text node in this tree.
                    <span
                      data-canvas-text
                      className="inline-flex items-center rounded-full bg-[#eaf1ff] px-2.5 py-1 text-[10.5px] font-semibold text-[#2878ff]"
                    >
                      {CHIP_DATE_FORMAT.format(new Date(appliedFilterSummary.from))} -{" "}
                      {CHIP_DATE_FORMAT.format(new Date(appliedFilterSummary.to))}
                    </span>
                  ) : null}
                  {appliedFilterSummary.filters.map((filter, index) => {
                    const option = availableFilterFields.find(
                      (candidate) =>
                        candidate.dataSource === filter.dataSource &&
                        candidate.field === filter.field
                    )
                    return (
                      <span
                        key={index}
                        data-canvas-text
                        className="inline-flex items-center rounded-full bg-[#eaf1ff] px-2.5 py-1 text-[10.5px] font-semibold text-[#2878ff]"
                      >
                        {option?.label ?? filter.field} {OPERATOR_LABELS[filter.operator]} «
                        {filter.value}»
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          {sortWidgetsByPosition(report.widgets).map((widget) => {
            const kpi = kpiById.get(widget.kpiId)
            const result = results[widget.kpiId]
            if (!kpi || !result) return null
            return (
              <div
                key={widget.id}
                ref={(node) => {
                  if (node) exportWidgetRefs.current.set(widget.id, node)
                  else exportWidgetRefs.current.delete(widget.id)
                }}
                className="overflow-hidden rounded-xl border border-[#e1e7f0] bg-white"
                style={{
                  // A table's live on-screen height is sized for its paginated 5-rows-per-page
                  // view -- since the export shows every row instead (see showAllRows below),
                  // that fixed height would just clip most of them. Auto lets the card grow to
                  // fit however many rows it actually has.
                  height: kpi.displayType === "table" ? "auto" : widgetPixelHeight(widget.h),
                  width: 760,
                  marginTop: 12,
                }}
              >
                <KpiWidgetRenderer
                  name={kpi.name}
                  displayType={kpi.displayType}
                  result={result}
                  timeGrouping={timeGroupingOverrides[kpi.id] ?? kpi.timeGrouping}
                  target={kpi.target}
                  decimalPlaces={kpi.decimalPlaces}
                  showAllRows
                  {...widgetLabelProps(kpi)}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </AppPage>
  )
}
