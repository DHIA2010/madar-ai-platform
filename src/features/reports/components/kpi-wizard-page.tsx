"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  BarChart3,
  Check,
  Gauge,
  Hash,
  LineChart,
  PieChart,
  Plus,
  Save,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
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
  type CatalogDataSourceOption,
  type Kpi,
  type KpiExtraField,
  type KpiResult,
  kpiService,
  type ReportAggregation,
  type ReportDisplayType,
  type ReportFilter,
  type ReportFilterOperator,
  reportsCatalogService,
  type ReportTimeGrouping,
} from "../services"
import { KpiWidgetRenderer } from "./kpi-widget-renderer"

import { type Locale, localeDirection } from "@/i18n/locales"

const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white p-4"
const PILL_PRIMARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2878ff] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_12px_rgba(40,120,255,0.24)] transition-colors hover:bg-[#1f63d6] disabled:cursor-not-allowed disabled:opacity-60"
const PILL_SECONDARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e1e7f0] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738]"
// Applied to AppInput/AppSelectTrigger via className -- cn() merges these over each component's
// own generic shadcn default (a smaller h-8, tight padding, plain gray border), which is what
// previously made a field on this page look flat and disconnected from the rest of the reports
// feature. A soft off-white fill (matching the filter-row/segmented-button surfaces elsewhere on
// this page) turns solid white on focus, alongside a blue border + glow, for clear feedback.
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e1e7f0] bg-[#fafbfd] px-3.5 text-[13px] text-[#0b1738] shadow-none transition-colors placeholder:text-[#95a4bd] hover:border-[#c4d5f0] focus-visible:border-[#2878ff] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12 data-[size=default]:h-10"
// AppTextarea has no fixed height to override, just a taller min-height + roomier padding.
const FIELD_TEXTAREA_CLASS =
  "min-h-[92px] resize-none rounded-[10px] border-[#e1e7f0] bg-[#fafbfd] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#0b1738] shadow-none transition-colors placeholder:text-[#95a4bd] hover:border-[#c4d5f0] focus-visible:border-[#2878ff] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#2878ff]/12"

const STEP_KEYS = ["basic", "data", "filters", "grouping", "comparison", "display"] as const

type KpiWizardTranslator = ReturnType<typeof useTranslations<"reports.kpiWizard">>

function getSteps(t: KpiWizardTranslator) {
  return STEP_KEYS.map((key) => ({
    key,
    label: t(`steps.${key}.label` as "steps.basic.label"),
    hint: t(`steps.${key}.hint` as "steps.basic.hint"),
  }))
}

function aggregationLabel(agg: ReportAggregation, t: KpiWizardTranslator): string {
  return t(`aggregations.${agg}` as "aggregations.sum")
}

function operatorLabel(op: ReportFilterOperator, t: KpiWizardTranslator): string {
  return t(`operators.${op}` as "operators.eq")
}

const TIME_GROUPING_KEYS: Exclude<ReportTimeGrouping, "none">[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
]

function displayTypeIcon(key: ReportDisplayType): typeof Hash {
  const icons: Record<ReportDisplayType, typeof Hash> = {
    number: Hash,
    line: LineChart,
    bar: BarChart3,
    pie: PieChart,
    table: Table2,
    gauge: Gauge,
  }
  return icons[key]
}
const DISPLAY_TYPE_KEYS: ReportDisplayType[] = ["number", "line", "bar", "pie", "table", "gauge"]

function getDecimalPlacesOptions(t: KpiWizardTranslator) {
  return [
    { value: 0, label: t("decimalPlaces.none"), example: "32,267" },
    { value: 1, label: t("decimalPlaces.one"), example: "32,266.8" },
    { value: 2, label: t("decimalPlaces.two"), example: "32,266.79" },
  ]
}

// Adds thousands separators for display -- `target` state itself stays plain digits (no commas)
// so `Number(target)` in handleSave keeps working unchanged.
function formatThousands(digits: string): string {
  if (!digits) return ""
  const [intPart, decimalPart] = digits.split(".")
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return decimalPart !== undefined ? `${withCommas}.${decimalPart}` : withCommas
}

export function KpiWizardPage({ kpiId }: { kpiId?: string }) {
  const t = useTranslations("reports.kpiWizard")
  const tKpi = useTranslations("reports.kpi")
  const tKpiWidget = useTranslations("reports.kpiWidget")
  const locale = useLocale() as Locale
  const router = useRouter()
  const isEditing = Boolean(kpiId)
  const STEPS = useMemo(() => getSteps(t), [t])
  const DECIMAL_PLACES_OPTIONS = useMemo(() => getDecimalPlacesOptions(t), [t])

  const [catalog, setCatalog] = useState<CatalogDataSourceOption[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingKpi, setLoadingKpi] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [activeStep, setActiveStep] = useState<(typeof STEP_KEYS)[number]>("basic")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [dataSource, setDataSource] = useState("")
  const [field, setField] = useState("")
  const [aggregation, setAggregation] = useState<ReportAggregation>("sum")
  const [extraFields, setExtraFields] = useState<KpiExtraField[]>([])
  const [filters, setFilters] = useState<ReportFilter[]>([])
  const [groupingMode, setGroupingMode] = useState<"time" | "dimension">("time")
  const [timeGrouping, setTimeGrouping] = useState<Exclude<ReportTimeGrouping, "none">>("month")
  const [groupByDimension, setGroupByDimension] = useState<string>("")
  const [compareEnabled, setCompareEnabled] = useState(true)
  const [displayType, setDisplayType] = useState<ReportDisplayType>("table")
  const [target, setTarget] = useState<string>("")
  const [decimalPlaces, setDecimalPlaces] = useState(1)

  const [preview, setPreview] = useState<KpiResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    reportsCatalogService
      .get()
      .then(setCatalog)
      .finally(() => setLoadingCatalog(false))
  }, [])

  useEffect(() => {
    if (!kpiId) return
    kpiService
      .get(kpiId)
      .then((kpi: Kpi) => {
        setName(kpi.name)
        setDescription(kpi.description)
        setDataSource(kpi.dataSource)
        setField(kpi.field)
        setAggregation(kpi.aggregation)
        setExtraFields(kpi.extraFields)
        setFilters(kpi.filters)
        setGroupingMode(kpi.groupByDimension ? "dimension" : "time")
        if (kpi.timeGrouping !== "none") setTimeGrouping(kpi.timeGrouping)
        setGroupByDimension(kpi.groupByDimension ?? "")
        setCompareEnabled(kpi.compareEnabled)
        setDisplayType(kpi.displayType)
        setTarget(kpi.target === null ? "" : String(kpi.target))
        setDecimalPlaces(kpi.decimalPlaces)
      })
      .finally(() => setLoadingKpi(false))
  }, [kpiId])

  const selectedSource = useMemo(
    () => catalog.find((source) => source.key === dataSource) ?? null,
    [catalog, dataSource]
  )

  useEffect(() => {
    if (!selectedSource) return
    if (!selectedSource.fields.some((option) => option.key === field)) {
      setField(selectedSource.fields[0]?.key ?? "")
    }
  }, [selectedSource, field])

  // Drops any extra field that no longer exists on the (possibly just-changed) data source, or
  // that now duplicates the primary field.
  useEffect(() => {
    if (!selectedSource) return
    setExtraFields((current) =>
      current.filter(
        (extra) => extra.field !== field && selectedSource.fields.some((f) => f.key === extra.field)
      )
    )
  }, [selectedSource, field])

  const selectedField = selectedSource?.fields.find((option) => option.key === field) ?? null
  // One field is always the primary metric, so at most fields.length - 1 can be added as extras.
  const canAddExtraField =
    Boolean(selectedSource) && extraFields.length < (selectedSource?.fields.length ?? 0) - 1
  const selectedDimensionLabel =
    groupingMode === "dimension"
      ? selectedSource?.dimensions.find((dimension) => dimension.key === groupByDimension)?.label
      : undefined

  const definitionReady = Boolean(dataSource && field && aggregation)

  useEffect(() => {
    if (!definitionReady) {
      setPreview(null)
      return
    }
    let cancelled = false
    setLoadingPreview(true)
    const timeout = window.setTimeout(() => {
      kpiService
        .preview({
          dataSource,
          field,
          aggregation,
          extraFields,
          filters,
          timeGrouping: groupingMode === "time" ? timeGrouping : "none",
          groupByDimension: groupingMode === "dimension" ? groupByDimension || null : null,
          compareEnabled,
          workspaceId: null,
        })
        .then((result) => {
          if (!cancelled) setPreview(result)
        })
        .catch(() => {
          if (!cancelled) setPreview(null)
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataSource,
    field,
    aggregation,
    extraFields,
    filters,
    groupingMode,
    timeGrouping,
    groupByDimension,
    compareEnabled,
  ])

  const addFilter = () => {
    if (!selectedSource?.filterFields.length) return
    const firstFilterField = selectedSource.filterFields[0]
    setFilters((current) => [
      ...current,
      { field: firstFilterField.key, operator: firstFilterField.allowedOperators[0], value: "" },
    ])
  }

  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    setFilters((current) =>
      current.map((filter, i) => (i === index ? { ...filter, ...patch } : filter))
    )
  }

  const removeFilter = (index: number) => {
    setFilters((current) => current.filter((_, i) => i !== index))
  }

  // Distinct real values for each filter field currently in use, fetched lazily and cached by
  // "dataSource:field" so switching a row's field re-fetches instead of reusing another field's
  // list -- these aren't part of the static catalog (only fields/operators are), so populating the
  // value dropdown means asking the backend what values actually occur in the data.
  const [filterValueOptions, setFilterValueOptions] = useState<Record<string, string[]>>({})
  const fetchedFilterValueKeysRef = useRef(new Set<string>())

  useEffect(() => {
    if (!dataSource) return
    const neededKeys = Array.from(new Set(filters.map((filter) => filter.field).filter(Boolean)))
    const missing = neededKeys.filter(
      (key) => !fetchedFilterValueKeysRef.current.has(`${dataSource}:${key}`)
    )
    for (const key of missing) {
      fetchedFilterValueKeysRef.current.add(`${dataSource}:${key}`)
      reportsCatalogService
        .getFilterFieldValues(dataSource, key, null)
        .then((values) => {
          setFilterValueOptions((current) => ({ ...current, [`${dataSource}:${key}`]: values }))
        })
        .catch(() => {
          fetchedFilterValueKeysRef.current.delete(`${dataSource}:${key}`)
        })
    }
  }, [dataSource, filters])

  const addExtraField = () => {
    if (!selectedSource) return
    const usedKeys = new Set([field, ...extraFields.map((extra) => extra.field)])
    const nextField = selectedSource.fields.find((option) => !usedKeys.has(option.key))
    if (!nextField) return
    setExtraFields((current) => [
      ...current,
      { field: nextField.key, aggregation: nextField.allowedAggregations[0] },
    ])
  }

  const updateExtraField = (index: number, patch: Partial<KpiExtraField>) => {
    setExtraFields((current) =>
      current.map((extra, i) => (i === index ? { ...extra, ...patch } : extra))
    )
  }

  const removeExtraField = (index: number) => {
    setExtraFields((current) => current.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!name.trim() || !definitionReady) {
      toast.error(t("toasts.validationFailed"))
      return
    }
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        category: selectedSource?.category ?? dataSource,
        dataSource,
        field,
        aggregation,
        extraFields: displayType === "table" || displayType === "line" ? extraFields : [],
        filters,
        timeGrouping: (groupingMode === "time" ? timeGrouping : "none") as ReportTimeGrouping,
        groupByDimension: groupingMode === "dimension" ? groupByDimension || null : null,
        compareEnabled,
        displayType,
        target: displayType === "gauge" && target.trim() !== "" ? Number(target) : null,
        decimalPlaces,
        status: "active" as const,
        workspaceId: null,
      }
      if (isEditing && kpiId) {
        await kpiService.update(kpiId, input)
        toast.success(t("toasts.updated"))
      } else {
        await kpiService.create(input)
        toast.success(t("toasts.created"))
      }
      router.push(ROUTES.reportsKpis)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  if (loadingCatalog || loadingKpi) {
    return (
      <div dir={localeDirection(locale)} className="space-y-3.5">
        <AppLoading variant="page" />
      </div>
    )
  }

  const activeStepMeta = STEPS.find((step) => step.key === activeStep)!

  return (
    <div dir={localeDirection(locale)} className="space-y-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf1ff] text-[#2878ff]">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className={cn("text-[19px] font-extrabold", HEADING)}>
              {isEditing ? t("editTitle") : t("createTitle")}
            </h1>
            <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => router.push(ROUTES.reportsKpis)}
            className={cn(PILL_SECONDARY_CLASS, saving && "pointer-events-none opacity-60")}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={PILL_PRIMARY_CLASS}
          >
            <Save className="size-4" />
            {saving ? t("saving") : t("saveKpi")}
          </button>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[240px_1fr_420px]">
        {/* Left rail stepper */}
        <div className={PANEL}>
          <div className="space-y-1">
            {STEPS.map((step, index) => {
              const isActive = activeStep === step.key
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-[10px] p-2.5 text-right transition-colors",
                    isActive ? "bg-[#eaf1ff]" : "hover:bg-[#f8fafd]"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                      isActive ? "bg-[#2878ff] text-white" : "bg-[#eef2f8] text-[#5b6b85]"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[12.5px] font-bold",
                        isActive ? "text-[#2878ff]" : HEADING
                      )}
                    >
                      {step.label}
                    </span>
                    <span className={cn("block truncate text-[10.5px]", MUTED)}>{step.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step content */}
        <div className={PANEL}>
          <div className="mb-3 border-b border-[#f1f4f9] pb-3">
            <h2 className={cn("text-[13.5px] font-bold", HEADING)}>{activeStepMeta.label}</h2>
            <p className={cn("mt-0.5 text-[11px]", MUTED)}>{activeStepMeta.hint}</p>
          </div>

          {activeStep === "basic" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={cn("text-[12px] font-semibold", HEADING)}>
                  {t("basicStep.nameLabel")}
                </label>
                <AppInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("basicStep.namePlaceholder")}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="space-y-1.5">
                <label className={cn("text-[12px] font-semibold", HEADING)}>
                  {t("basicStep.descriptionLabel")}
                </label>
                <AppTextarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("basicStep.descriptionPlaceholder")}
                  rows={3}
                  className={FIELD_TEXTAREA_CLASS}
                />
              </div>
            </div>
          )}

          {activeStep === "data" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={cn("text-[12px] font-semibold", HEADING)}>
                  {t("dataStep.dataSourceLabel")}
                </label>
                <AppSelect value={dataSource} onValueChange={setDataSource}>
                  <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                    <AppSelectValue placeholder={t("dataStep.dataSourcePlaceholder")} />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {catalog.map((source) => (
                      <AppSelectItem key={source.key} value={source.key}>
                        {source.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("dataStep.fieldLabel")}
                  </label>
                  <AppSelect value={field} onValueChange={setField} disabled={!selectedSource}>
                    <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                      <AppSelectValue placeholder={t("dataStep.fieldPlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {selectedSource?.fields.map((option) => (
                        <AppSelectItem key={option.key} value={option.key}>
                          {option.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
                <div className="space-y-1.5">
                  <label className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("dataStep.aggregationLabel")}
                  </label>
                  <AppSelect
                    value={aggregation}
                    onValueChange={(value) => setAggregation(value as ReportAggregation)}
                    disabled={!selectedField}
                  >
                    <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                      <AppSelectValue placeholder={t("dataStep.aggregationPlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {selectedField?.allowedAggregations.map((agg) => (
                        <AppSelectItem key={agg} value={agg}>
                          {aggregationLabel(agg, t)}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
              </div>

              <div className="space-y-2 border-t border-[#f1f4f9] pt-3.5">
                <div>
                  <p className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("dataStep.extraFieldsTitle")}
                  </p>
                  <p className={cn("text-[11px]", MUTED)}>{t("dataStep.extraFieldsDescription")}</p>
                </div>
                {extraFields.map((extra, index) => {
                  const extraField = selectedSource?.fields.find(
                    (option) => option.key === extra.field
                  )
                  return (
                    <div
                      key={index}
                      className="flex flex-col gap-2 rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] p-2.5 sm:flex-row sm:items-center"
                    >
                      <AppSelect
                        value={extra.field}
                        onValueChange={(value) => {
                          const newField = selectedSource?.fields.find(
                            (option) => option.key === value
                          )
                          updateExtraField(index, {
                            field: value,
                            aggregation: newField?.allowedAggregations[0] ?? extra.aggregation,
                          })
                        }}
                      >
                        <AppSelectTrigger className={cn(FIELD_CLASS, "flex-1")}>
                          <AppSelectValue />
                        </AppSelectTrigger>
                        <AppSelectContent>
                          {selectedSource?.fields
                            .filter((option) => option.key !== field)
                            .map((option) => (
                              <AppSelectItem key={option.key} value={option.key}>
                                {option.label}
                              </AppSelectItem>
                            ))}
                        </AppSelectContent>
                      </AppSelect>
                      <AppSelect
                        value={extra.aggregation}
                        onValueChange={(value) =>
                          updateExtraField(index, { aggregation: value as ReportAggregation })
                        }
                      >
                        <AppSelectTrigger className={cn(FIELD_CLASS, "sm:w-40")}>
                          <AppSelectValue />
                        </AppSelectTrigger>
                        <AppSelectContent>
                          {extraField?.allowedAggregations.map((agg) => (
                            <AppSelectItem key={agg} value={agg}>
                              {aggregationLabel(agg, t)}
                            </AppSelectItem>
                          ))}
                        </AppSelectContent>
                      </AppSelect>
                      <button
                        type="button"
                        onClick={() => removeExtraField(index)}
                        className="flex size-9 shrink-0 cursor-pointer items-center justify-center self-end rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee] sm:self-auto"
                        aria-label={t("dataStep.removeFieldAriaLabel")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={addExtraField}
                  disabled={!canAddExtraField}
                  className={cn(
                    PILL_SECONDARY_CLASS,
                    !canAddExtraField && "pointer-events-none opacity-50"
                  )}
                >
                  <Plus className="size-4" />
                  {t("dataStep.addField")}
                </button>
              </div>
            </div>
          )}

          {activeStep === "filters" && (
            <div className="space-y-3">
              <p className={cn("text-[12px]", MUTED)}>{t("filtersStep.description")}</p>
              {filters.map((filter, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] p-2.5 sm:flex-row sm:items-center"
                >
                  <AppSelect
                    value={filter.field}
                    onValueChange={(value) => updateFilter(index, { field: value })}
                  >
                    <AppSelectTrigger className={cn(FIELD_CLASS, "flex-1")}>
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {selectedSource?.filterFields.map((option) => (
                        <AppSelectItem key={option.key} value={option.key}>
                          {option.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                  <AppSelect
                    value={filter.operator}
                    onValueChange={(value) => {
                      const nextOperator = value as ReportFilterOperator
                      const wasSubstring =
                        filter.operator === "contains" || filter.operator === "not_contains"
                      const isSubstring =
                        nextOperator === "contains" || nextOperator === "not_contains"
                      // A value picked for eq/neq (an exact known value) or typed for
                      // contains/not_contains (a free substring) rarely makes sense under the
                      // other kind of operator -- clear it when crossing that boundary.
                      updateFilter(index, {
                        operator: nextOperator,
                        value: wasSubstring === isSubstring ? filter.value : "",
                      })
                    }}
                  >
                    <AppSelectTrigger className={cn(FIELD_CLASS, "sm:w-40")}>
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {selectedSource?.filterFields
                        .find((option) => option.key === filter.field)
                        ?.allowedOperators.map((op) => (
                          <AppSelectItem key={op} value={op}>
                            {operatorLabel(op, t)}
                          </AppSelectItem>
                        ))}
                    </AppSelectContent>
                  </AppSelect>
                  {filter.operator === "contains" || filter.operator === "not_contains" ? (
                    // A substring search has no fixed set of matches to pick from -- free text,
                    // not a dropdown of exact known values (those only make sense for eq/neq).
                    <AppInput
                      value={filter.value}
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
                      placeholder={t("filtersStep.valuePlaceholder")}
                      className={cn(FIELD_CLASS, "flex-1")}
                    />
                  ) : (
                    <AppSearchableSelect
                      value={filter.value}
                      onChange={(next) => updateFilter(index, { value: next })}
                      onCreate={(draft) => updateFilter(index, { value: draft })}
                      options={(() => {
                        const values = filterValueOptions[`${dataSource}:${filter.field}`] ?? []
                        const withCurrent =
                          filter.value && !values.includes(filter.value)
                            ? [filter.value, ...values]
                            : values
                        return withCurrent.map((value) => ({ value, label: value }))
                      })()}
                      placeholder={t("filtersStep.valuePlaceholder")}
                      searchPlaceholder={t("filtersStep.searchPlaceholder")}
                      emptyLabel={t("filtersStep.emptyLabel")}
                      compact
                      hideTriggerMark
                      triggerClassName={cn(FIELD_CLASS, "flex-1 justify-between")}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFilter(index)}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center self-end rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee] sm:self-auto"
                    aria-label={t("filtersStep.removeFilterAriaLabel")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addFilter}
                disabled={!selectedSource?.filterFields.length}
                className={cn(
                  PILL_SECONDARY_CLASS,
                  !selectedSource?.filterFields.length && "pointer-events-none opacity-50"
                )}
              >
                <Plus className="size-4" />
                {t("filtersStep.addFilter")}
              </button>
            </div>
          )}

          {activeStep === "grouping" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGroupingMode("time")}
                  className={cn(
                    "inline-flex flex-1 cursor-pointer items-center justify-center rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold transition-colors",
                    groupingMode === "time"
                      ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.24)]"
                      : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                  )}
                >
                  {t("groupingStep.groupByTime")}
                </button>
                <button
                  type="button"
                  onClick={() => setGroupingMode("dimension")}
                  disabled={!selectedSource?.dimensions.length}
                  className={cn(
                    "inline-flex flex-1 cursor-pointer items-center justify-center rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
                    groupingMode === "dimension"
                      ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.24)]"
                      : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                  )}
                >
                  {t("groupingStep.groupByDimension")}
                </button>
              </div>
              {groupingMode === "time" ? (
                <div className="space-y-1.5">
                  <label className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("groupingStep.periodLabel")}
                  </label>
                  <AppSelect
                    value={timeGrouping}
                    onValueChange={(value) => setTimeGrouping(value as typeof timeGrouping)}
                  >
                    <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {TIME_GROUPING_KEYS.map((key) => (
                        <AppSelectItem key={key} value={key}>
                          {tKpiWidget(`timeGroupingLabels.${key}` as "timeGroupingLabels.day")}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("groupingStep.groupByLabel")}
                  </label>
                  <AppSelect value={groupByDimension} onValueChange={setGroupByDimension}>
                    <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                      <AppSelectValue placeholder={t("groupingStep.groupByPlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {selectedSource?.dimensions.map((dimension) => (
                        <AppSelectItem key={dimension.key} value={dimension.key}>
                          {dimension.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
              )}
            </div>
          )}

          {activeStep === "comparison" && (
            <div className="flex items-center justify-between rounded-[10px] border border-[#f1f4f9] bg-[#fafbfd] px-3 py-3">
              <div>
                <p className={cn("text-[12.5px] font-bold", HEADING)}>
                  {t("comparisonStep.title")}
                </p>
                <p className={cn("mt-0.5 text-[11px]", MUTED)}>{t("comparisonStep.description")}</p>
              </div>
              <AppSwitch checked={compareEnabled} onCheckedChange={setCompareEnabled} />
            </div>
          )}

          {activeStep === "display" && (
            <div className="grid grid-cols-3 gap-2">
              {DISPLAY_TYPE_KEYS.map((key) => {
                const Icon = displayTypeIcon(key)
                const isActive = displayType === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDisplayType(key)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-[10px] border p-4 text-[12px] font-semibold transition-colors",
                      isActive
                        ? "border-[#2878ff] bg-[#eaf1ff] text-[#2878ff]"
                        : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                    )}
                  >
                    {isActive && (
                      <span className="absolute end-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-[#2878ff] text-white">
                        <Check className="size-2.5" />
                      </span>
                    )}
                    <Icon className="size-5" />
                    {tKpi(`displayTypes.${key}` as "displayTypes.number")}
                  </button>
                )
              })}
              <div className="col-span-3 space-y-1.5 border-t border-[#f1f4f9] pt-3.5">
                <label className={cn("text-[12px] font-semibold", HEADING)}>
                  {t("displayStep.decimalPlacesLabel")}
                </label>
                <p className={cn("text-[11px]", MUTED)}>
                  {t("displayStep.decimalPlacesDescription")}
                </p>
                <div className="flex gap-2">
                  {DECIMAL_PLACES_OPTIONS.map((option) => {
                    const isActive = decimalPlaces === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDecimalPlaces(option.value)}
                        className={cn(
                          "flex flex-1 flex-col items-center gap-0.5 rounded-[10px] border px-3 py-2.5 text-[12.5px] font-semibold transition-colors",
                          isActive
                            ? "border-[#2878ff] bg-[#eaf1ff] text-[#2878ff]"
                            : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                        )}
                      >
                        {option.label}
                        <span
                          className={cn(
                            "text-[10.5px] font-normal",
                            isActive ? "text-[#2878ff]/70" : MUTED
                          )}
                        >
                          {option.example}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {displayType === "gauge" && (
                <div className="col-span-3 space-y-1.5 border-t border-[#f1f4f9] pt-3.5">
                  <label className={cn("text-[12px] font-semibold", HEADING)}>
                    {t("displayStep.targetLabel")}
                  </label>
                  <AppInput
                    type="text"
                    inputMode="decimal"
                    value={formatThousands(target)}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/[^\d.]/g, "")
                      setTarget(digits)
                    }}
                    placeholder={t("displayStep.targetPlaceholder")}
                    className={FIELD_CLASS}
                  />
                  <p className={cn("text-[11px]", MUTED)}>{t("displayStep.targetDescription")}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className={PANEL}>
          <div className="mb-3 border-b border-[#f1f4f9] pb-3">
            <h2 className={cn("text-[13.5px] font-bold", HEADING)}>{t("preview.title")}</h2>
            <p className={cn("mt-0.5 text-[11px]", MUTED)}>{t("preview.instructions")}</p>
          </div>
          {!definitionReady ? (
            <p className={cn("py-10 text-center text-[12px]", MUTED)}>
              {t("preview.noDefinition")}
            </p>
          ) : loadingPreview && !preview ? (
            <AppLoading variant="chart" />
          ) : preview ? (
            <div className="h-[600px] overflow-y-auto rounded-[10px] border border-[#f1f4f9]">
              <KpiWidgetRenderer
                name={name || t("preview.unnamedFallback")}
                displayType={displayType}
                result={preview}
                timeGrouping={groupingMode === "time" ? timeGrouping : undefined}
                target={displayType === "gauge" && target.trim() !== "" ? Number(target) : null}
                decimalPlaces={decimalPlaces}
                dimensionLabel={selectedDimensionLabel}
                fieldLabel={selectedField?.label}
                extraFieldLabels={Object.fromEntries(
                  extraFields.map((extra) => [
                    extra.field,
                    selectedSource?.fields.find((option) => option.key === extra.field)?.label ??
                      extra.field,
                  ])
                )}
              />
            </div>
          ) : (
            <p className={cn("py-10 text-center text-[12px]", MUTED)}>{t("preview.loadFailed")}</p>
          )}
        </div>
      </div>
    </div>
  )
}
