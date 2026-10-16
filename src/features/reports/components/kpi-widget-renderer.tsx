"use client"

import { type ReactNode, useId, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  type LucideIcon,
  Percent,
  Search,
  Target,
  TrendingUp,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

import { AppSelect, AppSelectContent, AppSelectItem, AppSelectTrigger } from "@/components/app"

import type { ReportDisplayType, ReportTimeGrouping } from "../services/catalog.service"
import type { KpiResult } from "../services/kpi.service"

import type { Locale } from "@/i18n/locales"

type KpiWidgetTranslator = ReturnType<typeof useTranslations<"reports.kpiWidget">>

const HEADING = "text-[#0b1738]"
const MUTED = "text-[#95a4bd]"

const PIE_COLORS = [
  "#2878ff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#64748b",
]

// The demo mockups label English "K"/"M" suffixes even in an otherwise Arabic-RTL UI -- kept as
// literal Latin suffixes here to match, only the numeral formatting itself is locale-aware.
function formatCompact(value: number, locale: Locale, decimalPlaces = 1): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (abs >= 1_000) {
    const thousands = value / 1_000
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`
  }
  return formatNumber(value, locale, decimalPlaces)
}

// ar-SA/en-US format both digits and dates against locale defaults (Eastern Arabic-Indic numerals,
// the Hijri calendar) in some ICU builds -- the Unicode extensions below force Western digits and
// the Gregorian calendar so numbers/months match the plain Gregorian data the backend returns.
function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}
function gregorianLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US-u-ca-gregory"
}

// decimalPlaces defaults to 1 -- the fixed rounding every KPI used before it became a
// user-configurable per-KPI setting (see kpi-wizard-page.tsx's decimal-places step).
function formatNumber(value: number, locale: Locale, decimalPlaces = 1): string {
  return new Intl.NumberFormat(numberLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  }).format(value)
}

function roundToPlaces(value: number, decimalPlaces: number): number {
  return Number(value.toFixed(decimalPlaces))
}

function formatPointLabel(
  label: string,
  locale: Locale,
  timeGrouping?: ReportTimeGrouping
): string {
  if (!label) return ""
  const date = new Date(label)
  if (Number.isNaN(date.getTime())) {
    // Not a date -- a dimension/category label (product name, payment method, ...), as-is.
    return label
  }
  if (timeGrouping === "day" || timeGrouping === "week") {
    return new Intl.DateTimeFormat(gregorianLocale(locale), {
      month: "long",
      day: "numeric",
    }).format(date)
  }
  if (timeGrouping === "quarter" || timeGrouping === "year") {
    return new Intl.DateTimeFormat(gregorianLocale(locale), { year: "numeric" }).format(date)
  }
  return new Intl.DateTimeFormat(gregorianLocale(locale), {
    month: "long",
    year: "2-digit",
  }).format(date)
}

// The first table/legend column shows a date bucket for a time-series KPI or a category value for
// a dimension-breakdown KPI -- `dimensionLabel` (the catalog's real label for that dimension, e.g.
// "حالة الفاتورة") is the most exact when the caller has it; otherwise fall back to a label that's
// still specific to what's actually in the column rather than a generic "الاسم".
function nameColumnLabel(
  timeGrouping: ReportTimeGrouping | undefined,
  dimensionLabel: string | undefined,
  t: KpiWidgetTranslator
): string {
  if (dimensionLabel) return dimensionLabel
  if (timeGrouping && timeGrouping !== "none") return t("dateColumnLabel")
  return t("categoryColumnLabel")
}

function timeGroupingLabel(timeGrouping: ReportTimeGrouping, t: KpiWidgetTranslator): string {
  return t(`timeGroupingLabels.${timeGrouping}` as "timeGroupingLabels.day")
}
const KNOWN_TIME_GROUPINGS: ReportTimeGrouping[] = ["day", "week", "month", "quarter", "year"]

const PERIOD_PILL_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e1e7f0] bg-[#fafbfd] px-3 py-1.5 text-[11px] font-semibold text-[#5b6b85]"

function PeriodPill({
  timeGrouping,
  onChange,
}: {
  timeGrouping?: ReportTimeGrouping
  // When provided, the pill becomes a live control: picking a different grouping re-runs just
  // this one widget with it. Session-only -- the caller never saves this back to the KPI, so a
  // refresh (or reopening the report) shows whatever grouping is actually saved again. Permanently
  // changing it means editing the KPI itself. Omitted entirely (e.g. inside the PDF export tree,
  // where clicking anything is meaningless) falls back to the plain static pill.
  onChange?: (next: ReportTimeGrouping) => void
}) {
  const t = useTranslations("reports.kpiWidget")
  if (!timeGrouping || timeGrouping === "none" || !KNOWN_TIME_GROUPINGS.includes(timeGrouping)) {
    return null
  }
  if (!onChange) {
    return (
      <span className={PERIOD_PILL_CLASS}>
        <Calendar className="size-3.5" />
        {timeGroupingLabel(timeGrouping, t)}
      </span>
    )
  }
  return (
    <AppSelect value={timeGrouping} onValueChange={(next) => onChange(next as ReportTimeGrouping)}>
      <AppSelectTrigger
        aria-label={t("timeGroupingChangeAriaLabel")}
        className={cn(
          PERIOD_PILL_CLASS,
          "h-auto gap-1.5 transition-colors hover:border-[#c4d5f0] [&_svg]:size-3.5 [&_svg]:text-[#5b6b85] [&_svg]:opacity-100"
        )}
      >
        <Calendar className="size-3.5" />
        {timeGroupingLabel(timeGrouping, t)}
      </AppSelectTrigger>
      <AppSelectContent
        position="popper"
        align="end"
        // Radix's default "item-aligned" mode computes its fixed position by trying to overlay
        // the selected item directly on the trigger, which breaks down for a trigger far down a
        // long scrollable report page (it pinned the menu to the bottom of the whole document,
        // off-screen). "popper" anchors off the trigger's live bounding rect instead, the same
        // mode every other popover-style menu in this app already uses.
        sideOffset={4}
      >
        {KNOWN_TIME_GROUPINGS.map((key) => (
          <AppSelectItem key={key} value={key}>
            {timeGroupingLabel(key, t)}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelect>
  )
}

function ComparisonRow({
  changePercent,
  decimalPlaces,
}: {
  changePercent: number | null
  decimalPlaces: number
}) {
  const t = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  if (changePercent === null) return null
  const isUp = changePercent >= 0
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-bold",
          isUp ? "bg-[#eafaf0] text-[#16a34a]" : "bg-[#fdecec] text-[#dc2626]"
        )}
      >
        {isUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
        {formatNumber(Math.abs(changePercent), locale, decimalPlaces)}%
      </span>
      <span className={MUTED}>{t("comparisonPrevPeriod")}</span>
    </div>
  )
}

// Shared 3-column header row for every chart-type widget: value/actions physically on the right,
// title centered, the period pill physically on the left -- matches every reference mockup.
// Tailwind's `truncate` = overflow:hidden + text-overflow:ellipsis + white-space:nowrap. In the
// exported PDF specifically, every element using it (this title, TableCard/PieCard row labels)
// rendered Arabic text with disconnected, non-joined, garbled glyphs, while plain Arabic text with
// no ellipsis (e.g. column headers) rendered perfectly -- a suspiciously exact correlation across
// every broken spot. (A first attempt assumed a mixed-script/bidi-boundary cause and wrapped runs
// in <bdi>; verification showed that made no difference at all, disproving it.) Dropping just
// text-overflow:ellipsis (keeping the single-line, no-wrap, no-overflow behavior) tests text-
// overflow itself as the trigger -- html2canvas has its own dedicated ellipsis-rendering code path,
// and this app's content is essentially always RTL, a combination that's easy to leave under-
// tested upstream. Text that's actually too long to fit is silently clipped instead of showing
// "…", a minor cosmetic tradeoff against Arabic legibility in the one place that matters (the
// downloaded file).
const SINGLE_LINE_CLIP = "overflow-hidden whitespace-nowrap"

function CardHeaderRow({
  title,
  rightSlot,
  leftSlot,
  onTitleClick,
}: {
  title: string
  rightSlot?: ReactNode
  leftSlot?: ReactNode
  // Opens this widget's KPI in the editor. Omitted inside the PDF export tree, where clicking
  // anything is meaningless -- falls back to a plain, non-interactive heading.
  onTitleClick?: () => void
}) {
  const t = useTranslations("reports.kpiWidget")
  // The side columns size to their own content (auto) and the title takes whatever is left
  // (minmax(0,1fr), so it can shrink to 0 and truncate) -- equal thirds let a wide rightSlot
  // (e.g. the table's search box + export button) overflow its column and visually collide with
  // the title instead of squeezing it.
  return (
    <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-b border-[#f1f4f9] pb-3">
      <div className="flex min-w-0 flex-col items-start gap-1">{rightSlot}</div>
      <div className="flex min-w-0 items-center justify-center overflow-hidden">
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            title={t("openKpiForEdit")}
            data-canvas-text
            className={cn(
              SINGLE_LINE_CLIP,
              "text-[13.5px] font-bold underline-offset-2 transition-colors hover:text-[#3b6ff0] hover:underline",
              HEADING
            )}
          >
            {title}
          </button>
        ) : (
          <h3 data-canvas-text className={cn(SINGLE_LINE_CLIP, "text-[13.5px] font-bold", HEADING)}>
            {title}
          </h3>
        )}
      </div>
      <div className="flex shrink-0 items-start justify-end">{leftSlot}</div>
    </div>
  )
}

function ValueWithComparison({
  result,
  decimalPlaces,
}: {
  result: KpiResult
  decimalPlaces: number
}) {
  const locale = useLocale() as Locale
  return (
    <>
      <p className={cn("text-[19px] font-extrabold leading-none", HEADING)}>
        {formatNumber(result.currentValue, locale, decimalPlaces)}
      </p>
      <ComparisonRow changePercent={result.changePercent} decimalPlaces={decimalPlaces} />
    </>
  )
}

const AXIS_TICK_STYLE = { fontSize: 10.5, fill: "#0b1738" }
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e1e7f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(11,23,56,0.08)",
}

function NumberCard({
  name,
  result,
  timeGrouping,
  decimalPlaces = 1,
  fieldLabel,
  showAllRows = false,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  const gradientId = useId()
  const sparkData = result.points.map((point) => ({
    label: formatPointLabel(point.label, locale, timeGrouping),
    value: point.value,
  }))
  const lastIndex = sparkData.length - 1

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={<ValueWithComparison result={result} decimalPlaces={decimalPlaces} />}
        leftSlot={
          showAllRows ? null : (
            <ChartDownloadButton
              onClick={() =>
                downloadCsv(
                  sparkData,
                  nameColumnLabel(timeGrouping, undefined, t),
                  fieldLabel ?? name,
                  [],
                  t,
                  { includePercentage: false, filename: `${name}.csv` }
                )
              }
            />
          )
        }
      />
      <div className="min-h-0 flex-1">
        <div className="h-full min-h-16">
          {sparkData.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2878ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2878ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  formatter={(value: number) => [
                    formatNumber(value, locale, decimalPlaces),
                    fieldLabel ?? name,
                  ]}
                  contentStyle={{ ...TOOLTIP_STYLE, fontSize: 11, padding: "4px 8px" }}
                  labelStyle={{ fontSize: 10.5, color: "#95a4bd" }}
                  itemStyle={{ padding: 0 }}
                  cursor={{ stroke: "#c4d5f0", strokeWidth: 1, strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2878ff"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
                {lastIndex >= 0 && (
                  <>
                    <ReferenceDot
                      x={sparkData[lastIndex].label}
                      y={sparkData[lastIndex].value}
                      r={8}
                      fill="#2878ff"
                      fillOpacity={0.18}
                      stroke="none"
                      isFront
                    />
                    <ReferenceDot
                      x={sparkData[lastIndex].label}
                      y={sparkData[lastIndex].value}
                      r={4}
                      fill="#2878ff"
                      stroke="#fff"
                      strokeWidth={2}
                      isFront
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

function LineCard({
  name,
  result,
  timeGrouping,
  decimalPlaces = 1,
  fieldLabel,
  extraFieldLabels = {},
  showAllRows = false,
  onTimeGroupingChange,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  const gradientId = useId()
  const extraKeys = Object.keys(extraFieldLabels)
  const seriesKeys = ["value", ...extraKeys]
  const seriesLabel = (key: string) =>
    key === "value" ? (fieldLabel ?? name) : extraFieldLabels[key]
  const chartData = result.points.map((point) => ({
    label: formatPointLabel(point.label, locale, timeGrouping),
    value: point.value,
    ...point.extraValues,
  }))
  const lastIndex = chartData.length - 1

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={<ValueWithComparison result={result} decimalPlaces={decimalPlaces} />}
        leftSlot={
          <div className="flex items-center gap-1.5">
            {showAllRows ? null : (
              <ChartDownloadButton
                onClick={() =>
                  downloadCsv(
                    chartData,
                    nameColumnLabel(timeGrouping, undefined, t),
                    fieldLabel ?? name,
                    extraKeys.map((key) => ({ key, label: extraFieldLabels[key] })),
                    t,
                    { includePercentage: false, filename: `${name}.csv` }
                  )
                }
              />
            )}
            <PeriodPill timeGrouping={timeGrouping} onChange={onTimeGroupingChange} />
          </div>
        }
      />
      {extraKeys.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {seriesKeys.map((key, index) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] font-semibold">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className={HEADING}>{seriesLabel(key)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              {seriesKeys.map((key, index) => (
                <linearGradient key={key} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={PIE_COLORS[index % PIE_COLORS.length]}
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor={PIE_COLORS[index % PIE_COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
            <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value, locale, decimalPlaces)}
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={(value: number) => formatNumber(value, locale, decimalPlaces)}
              contentStyle={TOOLTIP_STYLE}
            />
            {seriesKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={seriesLabel(key)}
                stroke={PIE_COLORS[index % PIE_COLORS.length]}
                strokeWidth={2.5}
                fill={`url(#${gradientId}-${index})`}
                dot={{
                  r: 3,
                  stroke: PIE_COLORS[index % PIE_COLORS.length],
                  strokeWidth: 1.5,
                  fill: "#fff",
                }}
                activeDot={{ r: 5 }}
              />
            ))}
            {lastIndex >= 0 && (
              <>
                <ReferenceDot
                  x={chartData[lastIndex].label}
                  y={chartData[lastIndex].value}
                  r={9}
                  fill="#2878ff"
                  fillOpacity={0.18}
                  stroke="none"
                  isFront
                />
                <ReferenceDot
                  x={chartData[lastIndex].label}
                  y={chartData[lastIndex].value}
                  r={5}
                  fill="#2878ff"
                  stroke="#fff"
                  strokeWidth={2}
                  isFront
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BarCard({
  name,
  result,
  timeGrouping,
  decimalPlaces = 1,
  showAllRows = false,
  onTimeGroupingChange,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  const chartData = result.points.map((point) => ({
    label: formatPointLabel(point.label, locale, timeGrouping),
    value: point.value,
  }))

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={<ValueWithComparison result={result} decimalPlaces={decimalPlaces} />}
        leftSlot={
          <div className="flex items-center gap-1.5">
            {showAllRows ? null : (
              <ChartDownloadButton
                onClick={() =>
                  downloadCsv(chartData, nameColumnLabel(timeGrouping, undefined, t), name, [], t, {
                    includePercentage: false,
                    filename: `${name}.csv`,
                  })
                }
              />
            )}
            <PeriodPill timeGrouping={timeGrouping} onChange={onTimeGroupingChange} />
          </div>
        }
      />
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2878ff" stopOpacity={1} />
                <stop offset="100%" stopColor="#2878ff" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
            <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value, locale, decimalPlaces)}
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={(value: number) => [
                formatNumber(value, locale, decimalPlaces),
                t("valueTooltipLabel"),
              ]}
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "#f4f7fc" }}
            />
            <Bar dataKey="value" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PieCard({
  name,
  result,
  timeGrouping,
  decimalPlaces = 1,
  dimensionLabel,
  fieldLabel,
  showAllRows = false,
  onTimeGroupingChange,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const valueLabel = fieldLabel ?? name
  const chartData = result.points.map((point) => ({
    label: formatPointLabel(point.label, locale, timeGrouping),
    value: point.value,
  }))
  const total = chartData.reduce((sum, row) => sum + row.value, 0) || result.currentValue
  const rowsWithPct = chartData.map((row) => ({
    ...row,
    pct: total > 0 ? roundToPlaces((row.value / total) * 100, decimalPlaces) : 0,
  }))

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={<ValueWithComparison result={result} decimalPlaces={decimalPlaces} />}
        leftSlot={
          <div className="flex items-center gap-1.5">
            {showAllRows ? null : (
              <ChartDownloadButton
                onClick={() =>
                  downloadCsv(
                    rowsWithPct,
                    nameColumnLabel(timeGrouping, dimensionLabel, t),
                    valueLabel,
                    [],
                    t,
                    { filename: `${name}.csv` }
                  )
                }
              />
            )}
            <PeriodPill timeGrouping={timeGrouping} onChange={onTimeGroupingChange} />
          </div>
        }
      />
      {/* flex-wrap (not a grid + viewport breakpoint) so the side-by-side layout responds to this
          widget's own rendered width -- it can be a narrow sidebar preview, a half-width grid
          cell, or a full report page, none of which track the browser's viewport size. */}
      <div className="flex min-h-0 flex-1 flex-wrap items-center gap-4">
        <div className="relative mx-auto aspect-square w-full max-w-[240px] flex-1 basis-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.label}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatNumber(value, locale, decimalPlaces)}
                contentStyle={TOOLTIP_STYLE}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className={cn("text-[10.5px]", MUTED)}>{tCommon("total")}</p>
            <p className={cn("text-[16px] font-extrabold", HEADING)}>
              {formatNumber(total, locale, decimalPlaces)}
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-[220px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px]">
                <th className={cn("pb-2 text-start font-semibold", HEADING)}>
                  {nameColumnLabel(timeGrouping, dimensionLabel, t)}
                </th>
                <th className={cn("pb-2 text-center font-semibold", HEADING)}>
                  {t("percentShort")}
                </th>
                <th className={cn("pb-2 text-end font-semibold", HEADING)}>{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, index) => {
                const pct = total > 0 ? roundToPlaces((row.value / total) * 100, decimalPlaces) : 0
                return (
                  <tr key={row.label} className="border-t border-[#f1f4f9]">
                    <td className="py-2">
                      <span
                        className={cn(
                          SINGLE_LINE_CLIP,
                          "flex items-center gap-2 font-semibold",
                          HEADING
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                        />
                        <span data-canvas-text className={SINGLE_LINE_CLIP}>
                          {row.label}
                        </span>
                      </span>
                    </td>
                    <td
                      className="py-2 text-center font-bold"
                      style={{ color: PIE_COLORS[index % PIE_COLORS.length] }}
                    >
                      {pct}%
                    </td>
                    <td className={cn("py-2 text-end font-semibold", HEADING)}>
                      {formatNumber(row.value, locale, decimalPlaces)}
                    </td>
                  </tr>
                )
              })}
              {chartData.length === 0 && (
                <tr>
                  <td colSpan={3} className={cn("py-6 text-center", MUTED)}>
                    {tCommon("noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const TABLE_PAGE_SIZE = 5

function downloadCsv(
  rows: Array<{ label: string; value: number; pct?: number; extraValues?: Record<string, number> }>,
  nameHeader: string,
  valueHeader: string,
  extraHeaders: Array<{ key: string; label: string }> = [],
  t: KpiWidgetTranslator,
  // Only a dimension breakdown (table/pie) has a meaningful "share of total" -- a time series
  // (line/bar/number/gauge) doesn't, so that column is opt-in rather than always tacked on.
  {
    includePercentage = true,
    filename,
  }: {
    includePercentage?: boolean
    filename?: string
  } = {}
) {
  const header = [
    "#",
    nameHeader,
    valueHeader,
    ...extraHeaders.map((extra) => extra.label),
    ...(includePercentage ? [t("percentOfTotal")] : []),
  ]
  const lines = rows.map((row, index) => [
    String(index + 1),
    row.label,
    String(row.value),
    ...extraHeaders.map((extra) => String(row.extraValues?.[extra.key] ?? "")),
    ...(includePercentage ? [`${row.pct ?? 0}%`] : []),
  ])
  const csv = [header, ...lines]
    .map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename ?? `${t("csvFilenameFallback")}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function ChartDownloadButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("reports.kpiWidget")
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e1e7f0] text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738]"
      aria-label={t("exportAriaLabel")}
    >
      <Download className="size-3.5" />
    </button>
  )
}

function TableCard({
  name,
  result,
  timeGrouping,
  decimalPlaces = 1,
  dimensionLabel,
  fieldLabel,
  extraFieldLabels = {},
  showAllRows = false,
  onTimeGroupingChange,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const valueLabel = fieldLabel ?? name
  const extraKeys = Object.keys(extraFieldLabels)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const total = result.points.reduce((sum, point) => sum + point.value, 0)
  const rows = useMemo(
    () =>
      result.points.map((point) => ({
        label: formatPointLabel(point.label, locale, timeGrouping),
        value: point.value,
        pct: total > 0 ? roundToPlaces((point.value / total) * 100, decimalPlaces) : 0,
        extraValues: point.extraValues,
      })),
    [result.points, total, timeGrouping, decimalPlaces, locale]
  )
  const filtered = useMemo(
    () => rows.filter((row) => row.label.toLowerCase().includes(search.trim().toLowerCase())),
    [rows, search]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = showAllRows
    ? filtered
    : filtered.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE)
  const rowNumberOffset = showAllRows ? 0 : (currentPage - 1) * TABLE_PAGE_SIZE
  // Name gets the flexible column; every numeric column (#, value, extras, percentage) shares a
  // fixed-ish width and is centered, so the row reads as clean number columns instead of a dense
  // table with text crowding the edges.
  const gridTemplate = `36px minmax(0,1.4fr) repeat(${1 + extraKeys.length}, minmax(70px,1fr)) minmax(130px,1fr)`

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={
          // Neither makes sense in a static export -- clicking a search box or a CSV download
          // icon does nothing in a downloaded PDF, so both are dropped from that render entirely
          // rather than shown disabled/inert.
          showAllRows ? null : (
            <div className="relative">
              <Search
                className={cn(
                  "pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2",
                  MUTED
                )}
              />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-64 rounded-full border border-[#e1e7f0] bg-[#fafbfd] pe-3 ps-8 text-[12px] text-[#0b1738] placeholder:text-[#95a4bd] focus:border-[#2878ff] focus:bg-white focus:outline-none"
              />
            </div>
          )
        }
        leftSlot={
          <div className="flex items-center gap-1.5">
            {showAllRows ? null : (
              <ChartDownloadButton
                onClick={() =>
                  downloadCsv(
                    filtered,
                    nameColumnLabel(timeGrouping, dimensionLabel, t),
                    valueLabel,
                    extraKeys.map((key) => ({ key, label: extraFieldLabels[key] })),
                    t,
                    { filename: `${name}.csv` }
                  )
                }
              />
            )}
            <PeriodPill timeGrouping={timeGrouping} onChange={onTimeGroupingChange} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid items-center gap-3 px-3 pb-2 text-[11px] font-semibold"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className={cn("text-center", HEADING)}>#</span>
          <span className={cn("text-start", HEADING)}>
            {nameColumnLabel(timeGrouping, dimensionLabel, t)}
          </span>
          <span className={cn("text-center", HEADING)}>{valueLabel}</span>
          {extraKeys.map((key) => (
            <span key={key} className={cn("text-center", HEADING)}>
              {extraFieldLabels[key]}
            </span>
          ))}
          <span className={cn("text-center", HEADING)}>{t("percentOfTotal")}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {pageRows.map((row, index) => (
            <div
              key={row.label}
              className="grid items-center gap-3 rounded-[10px] bg-[#fafbfd] px-3 py-2.5 text-[12px] transition-colors hover:bg-[#f1f4f9]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span className={cn("text-center text-[11px]", MUTED)}>
                {rowNumberOffset + index + 1}
              </span>
              <span
                data-canvas-text
                className={cn(SINGLE_LINE_CLIP, "text-start font-semibold", HEADING)}
              >
                {row.label}
              </span>
              <span className={cn("text-center font-semibold", HEADING)}>
                {formatNumber(row.value, locale, decimalPlaces)}
              </span>
              {extraKeys.map((key) => (
                <span key={key} className={cn("text-center font-semibold", HEADING)}>
                  {formatNumber(row.extraValues?.[key] ?? 0, locale, decimalPlaces)}
                </span>
              ))}
              <div className="flex items-center justify-center gap-2">
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[#eef2f8]">
                  <span
                    className="block h-full rounded-full bg-[#2878ff]"
                    style={{ width: `${row.pct}%` }}
                  />
                </span>
                <span className={cn("w-9 shrink-0 text-center text-[11px] font-semibold", HEADING)}>
                  {row.pct}%
                </span>
              </div>
            </div>
          ))}
          {pageRows.length === 0 && (
            <div className={cn("rounded-[10px] bg-[#fafbfd] py-6 text-center text-[12px]", MUTED)}>
              {tCommon("noData")}
            </div>
          )}
        </div>
      </div>
      {/* All rows are already visibly present in a static export -- no page to move between and
          nothing left to summarize a count of, so this footer (count line + pager) is dropped
          entirely for showAllRows rather than shown with just the count and no controls. */}
      {!showAllRows && filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f4f9] pt-3 text-[11.5px] text-[#5b6b85]">
          <span>{t("showingCount", { count: pageRows.length, total: filtered.length })}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="flex size-7 items-center justify-center rounded-[8px] border border-[#e1e7f0] disabled:opacity-40"
              aria-label={t("paginationPreviousAriaLabel")}
            >
              <ChevronLeft className="size-3.5 rtl:rotate-180" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-[8px] text-[11.5px] font-semibold",
                  p === currentPage
                    ? "bg-[#2878ff] text-white"
                    : "border border-[#e1e7f0] hover:border-[#c4d5f0]"
                )}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="flex size-7 items-center justify-center rounded-[8px] border border-[#e1e7f0] disabled:opacity-40"
              aria-label={t("paginationNextAriaLabel")}
            >
              <ChevronRight className="size-3.5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GaugeStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone: "blue" | "green"
}) {
  return (
    <div className="flex min-w-[128px] flex-1 items-center gap-2 rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] p-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[8px]",
          tone === "blue" ? "bg-[#eaf1ff] text-[#2878ff]" : "bg-[#eafaf0] text-[#16a34a]"
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span data-canvas-text className={cn("block", SINGLE_LINE_CLIP, "text-[10px]", MUTED)}>
          {label}
        </span>
        <span
          data-canvas-text
          className={cn("block", SINGLE_LINE_CLIP, "text-[12px] font-bold", HEADING)}
        >
          {value}
        </span>
      </span>
    </div>
  )
}

// A classic SVG semicircle progress arc (path + stroke-dasharray) -- recharts' Pie can approximate
// a half-donut, but its percentage-based radii resolve against Math.min(width, height), which
// collapses to a tiny, off-center blob in a wide-but-short container like this gauge card.
// Plain SVG with an explicit viewBox gives exact, predictable geometry at any container size.
function SemiGaugeArc({ progress }: { progress: number }) {
  const width = 220
  const height = 120
  const cx = width / 2
  const cy = height - 10
  const radius = 90
  const circumference = Math.PI * radius
  const dash = circumference * Math.min(Math.max(progress, 0), 1)
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMax meet">
      <path d={arcPath} fill="none" stroke="#eef2f8" strokeWidth={16} strokeLinecap="round" />
      <path
        d={arcPath}
        fill="none"
        stroke="#2878ff"
        strokeWidth={16}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
      />
    </svg>
  )
}

function GaugeCard({
  name,
  result,
  timeGrouping,
  target,
  decimalPlaces = 1,
  showAllRows = false,
  onTimeGroupingChange,
  onTitleClick,
}: KpiWidgetRendererProps) {
  const t = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  const current = result.currentValue
  const goal = target && target > 0 ? target : null
  const progress = goal ? Math.min(current / goal, 1) : 0
  const percent = goal ? roundToPlaces(progress * 100, decimalPlaces) : null
  const remaining = goal ? Math.max(goal - current, 0) : null
  const gaugeRows = result.points.map((point) => ({
    label: formatPointLabel(point.label, locale, timeGrouping),
    value: point.value,
  }))

  return (
    <div className="flex h-full flex-col p-4">
      <CardHeaderRow
        title={name}
        onTitleClick={onTitleClick}
        rightSlot={<ValueWithComparison result={result} decimalPlaces={decimalPlaces} />}
        leftSlot={
          <div className="flex items-center gap-1.5">
            {showAllRows ? null : (
              <ChartDownloadButton
                onClick={() =>
                  downloadCsv(gaugeRows, nameColumnLabel(timeGrouping, undefined, t), name, [], t, {
                    includePercentage: false,
                    filename: `${name}.csv`,
                  })
                }
              />
            )}
            <PeriodPill timeGrouping={timeGrouping} onChange={onTimeGroupingChange} />
          </div>
        }
      />
      {!goal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className={cn("text-[26px] font-extrabold", HEADING)}>
            {formatNumber(current, locale, decimalPlaces)}
          </p>
          <p className={cn("text-[11.5px]", MUTED)}>{t("noTargetSet")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto">
          <div className="relative mx-auto w-full max-w-[340px] shrink-0">
            <SemiGaugeArc progress={progress} />
            <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex flex-col items-center gap-0.5 text-center">
              <p className={cn("text-[19px] font-extrabold leading-none", HEADING)}>
                {formatNumber(current, locale, decimalPlaces)}
              </p>
              <p className={cn("text-[10px]", MUTED)}>{t("currentValueLabel")}</p>
              <p className="text-[13px] font-bold text-[#2878ff]">{percent}%</p>
              <p className={cn("text-[10px]", MUTED)}>{t("ofTarget")}</p>
            </div>
          </div>
          {/* flex-wrap (not a grid + viewport breakpoint) so cards wrap based on this widget's
              own available width instead of the browser's viewport -- see the pie legend above
              for the same reasoning. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <GaugeStat
              icon={BarChart3}
              label={t("currentValueLabel")}
              value={formatNumber(current, locale, decimalPlaces)}
              tone="blue"
            />
            <GaugeStat
              icon={Target}
              label={t("targetLabel")}
              value={formatNumber(goal, locale, decimalPlaces)}
              tone="green"
            />
            <GaugeStat
              icon={Percent}
              label={t("achievementRateLabel")}
              value={`${percent}%`}
              tone="blue"
            />
            <GaugeStat
              icon={TrendingUp}
              label={t("remainingDifferenceLabel")}
              value={formatNumber(remaining ?? 0, locale, decimalPlaces)}
              tone="green"
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface KpiWidgetRendererProps {
  name: string
  displayType: ReportDisplayType
  result: KpiResult
  timeGrouping?: ReportTimeGrouping
  target?: number | null
  decimalPlaces?: number
  // The catalog's real label for the KPI's groupByDimension (e.g. "حالة الفاتورة"), when the
  // caller has it loaded -- used as the table/pie "name" column header instead of a generic
  // fallback. See nameColumnLabel.
  dimensionLabel?: string
  // The catalog's real label for the KPI's field (e.g. "إجمالي المبيعات"), when the caller has it
  // loaded -- used as the table/pie value column header instead of `name`, which is the KPI's own
  // (possibly customized, e.g. "test إجمالي المبيعات") display name, not the metric's real name.
  fieldLabel?: string
  // Catalog labels for each of the KPI's extraFields, keyed by field key -- table adds one value
  // column per extra field, line adds one extra series. Only table/line render these.
  extraFieldLabels?: Record<string, string>
  // Renders TableCard for a static export (PDF) rather than the interactive live view: shows
  // every row instead of paginating (there's no "next page" to click in a downloaded file, so
  // pagination would just hide most of the data), and drops the search box and CSV-download
  // icon, since neither does anything once rendered into a static document. Only TableCard reads
  // this.
  showAllRows?: boolean
  // Makes this widget's period pill (day/week/month/...) an interactive, session-only control --
  // see PeriodPill. Omitted in the PDF export tree, where it'd be meaningless.
  onTimeGroupingChange?: (next: ReportTimeGrouping) => void
  // Makes the widget's title a link to that KPI's editor. Omitted in the PDF export tree, where
  // it'd be meaningless.
  onTitleClick?: () => void
}

// Renders a KPI's already-fetched result as whichever display type its definition chose --
// shared by the report builder's live canvas, the read-only report viewer, and the KPI wizard's
// preview panel, so the same display type never drifts in how it's drawn between the three.
export function KpiWidgetRenderer(props: KpiWidgetRendererProps) {
  switch (props.displayType) {
    case "number":
      return <NumberCard {...props} />
    case "bar":
      return <BarCard {...props} />
    case "pie":
      return <PieCard {...props} />
    case "table":
      return <TableCard {...props} />
    case "gauge":
      return <GaugeCard {...props} />
    default:
      return <LineCard {...props} />
  }
}
