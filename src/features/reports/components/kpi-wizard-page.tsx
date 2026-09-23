"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppInput,
  AppLoading,
  AppPage,
  AppPageHeader,
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

const STEPS = [
  { key: "basic", label: "البيانات الأساسية", hint: "اسم المؤشر ومصدر البيانات" },
  { key: "data", label: "تعريف البيانات", hint: "اختيار الحقول وطريقة الحساب" },
  { key: "filters", label: "الفلاتر", hint: "تصفية البيانات حسب الشروط" },
  { key: "grouping", label: "التجميع الزمني", hint: "تحديد طريقة التجميع" },
  { key: "comparison", label: "المقارنة", hint: "مقارنة مع فترة أخرى" },
  { key: "display", label: "طريقة العرض", hint: "اختيار نوع العرض" },
] as const

const AGGREGATION_LABELS: Record<ReportAggregation, string> = {
  sum: "المجموع (SUM)",
  avg: "المتوسط (AVG)",
  count: "العدد (COUNT)",
  min: "الأدنى (MIN)",
  max: "الأعلى (MAX)",
}

const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  eq: "يساوي (=)",
  neq: "لا يساوي (≠)",
  contains: "يحتوي على",
}

const TIME_GROUPING_LABELS: Record<Exclude<ReportTimeGrouping, "none">, string> = {
  day: "يومي",
  week: "أسبوعي",
  month: "شهري",
  quarter: "ربع سنوي",
  year: "سنوي",
}

const DISPLAY_TYPES: Array<{ key: ReportDisplayType; label: string }> = [
  { key: "number", label: "بطاقة رقمية" },
  { key: "line", label: "خطي" },
  { key: "bar", label: "أعمدة" },
  { key: "pie", label: "دائري" },
  { key: "table", label: "جدول" },
  { key: "gauge", label: "مقياس" },
]

export function KpiWizardPage({ kpiId }: { kpiId?: string }) {
  const router = useRouter()
  const isEditing = Boolean(kpiId)

  const [catalog, setCatalog] = useState<CatalogDataSourceOption[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingKpi, setLoadingKpi] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [activeStep, setActiveStep] = useState<(typeof STEPS)[number]["key"]>("basic")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [dataSource, setDataSource] = useState("")
  const [field, setField] = useState("")
  const [aggregation, setAggregation] = useState<ReportAggregation>("sum")
  const [filters, setFilters] = useState<ReportFilter[]>([])
  const [groupingMode, setGroupingMode] = useState<"time" | "dimension">("time")
  const [timeGrouping, setTimeGrouping] = useState<Exclude<ReportTimeGrouping, "none">>("month")
  const [groupByDimension, setGroupByDimension] = useState<string>("")
  const [compareEnabled, setCompareEnabled] = useState(true)
  const [displayType, setDisplayType] = useState<ReportDisplayType>("number")

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
        setFilters(kpi.filters)
        setGroupingMode(kpi.groupByDimension ? "dimension" : "time")
        if (kpi.timeGrouping !== "none") setTimeGrouping(kpi.timeGrouping)
        setGroupByDimension(kpi.groupByDimension ?? "")
        setCompareEnabled(kpi.compareEnabled)
        setDisplayType(kpi.displayType)
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

  const selectedField = selectedSource?.fields.find((option) => option.key === field) ?? null

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

  const handleSave = async () => {
    if (!name.trim() || !definitionReady) {
      toast.error("يرجى إدخال اسم المؤشر واختيار مصدر البيانات والحقل.")
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
        filters,
        timeGrouping: (groupingMode === "time" ? timeGrouping : "none") as ReportTimeGrouping,
        groupByDimension: groupingMode === "dimension" ? groupByDimension || null : null,
        compareEnabled,
        displayType,
        status: "active" as const,
        workspaceId: null,
      }
      if (isEditing && kpiId) {
        await kpiService.update(kpiId, input)
        toast.success("تم تحديث المؤشر بنجاح.")
      } else {
        await kpiService.create(input)
        toast.success("تم إنشاء المؤشر بنجاح.")
      }
      router.push(ROUTES.reportsKpis)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ المؤشر.")
    } finally {
      setSaving(false)
    }
  }

  if (loadingCatalog || loadingKpi) {
    return (
      <AppPage>
        <AppContainer>
          <AppLoading variant="page" />
        </AppContainer>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "التقارير", href: ROUTES.reports },
            { label: "المؤشرات المحفوظة", href: ROUTES.reportsKpis },
            { label: isEditing ? "تعديل مؤشر" : "إنشاء مؤشر جديد", current: true },
          ]}
          title={isEditing ? "تعديل المؤشر" : "إنشاء مؤشر جديد"}
          subtitle="قم بتعريف المؤشر وحدد مصادر البيانات والفلاتر وطريقة الحساب"
        />

        <div className="grid gap-4 lg:grid-cols-[220px_1fr_360px]">
          {/* Left rail stepper */}
          <div className="space-y-1">
            {STEPS.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(step.key)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border p-3 text-right transition-colors",
                  activeStep === step.key
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    activeStep === step.key ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{step.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{step.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Step content */}
          <AppCard title={STEPS.find((step) => step.key === activeStep)?.label}>
            {activeStep === "basic" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">اسم المؤشر *</label>
                  <AppInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="مثال: إجمالي المبيعات"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">الوصف</label>
                  <AppTextarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="وصف مختصر لما يقيسه هذا المؤشر"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {activeStep === "data" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">مصدر البيانات *</label>
                  <AppSelect value={dataSource} onValueChange={setDataSource}>
                    <AppSelectTrigger>
                      <AppSelectValue placeholder="اختر مصدر البيانات" />
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
                    <label className="text-sm font-medium">الحقل *</label>
                    <AppSelect value={field} onValueChange={setField} disabled={!selectedSource}>
                      <AppSelectTrigger>
                        <AppSelectValue placeholder="اختر الحقل" />
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
                    <label className="text-sm font-medium">طريقة الحساب *</label>
                    <AppSelect
                      value={aggregation}
                      onValueChange={(value) => setAggregation(value as ReportAggregation)}
                      disabled={!selectedField}
                    >
                      <AppSelectTrigger>
                        <AppSelectValue placeholder="اختر طريقة الحساب" />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {selectedField?.allowedAggregations.map((agg) => (
                          <AppSelectItem key={agg} value={agg}>
                            {AGGREGATION_LABELS[agg]}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </div>
                </div>
              </div>
            )}

            {activeStep === "filters" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">أضف شروط لتصفية البيانات (اختياري)</p>
                {filters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <AppSelect
                      value={filter.field}
                      onValueChange={(value) => updateFilter(index, { field: value })}
                    >
                      <AppSelectTrigger className="flex-1">
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
                      onValueChange={(value) =>
                        updateFilter(index, { operator: value as ReportFilterOperator })
                      }
                    >
                      <AppSelectTrigger className="w-40">
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {selectedSource?.filterFields
                          .find((option) => option.key === filter.field)
                          ?.allowedOperators.map((op) => (
                            <AppSelectItem key={op} value={op}>
                              {OPERATOR_LABELS[op]}
                            </AppSelectItem>
                          ))}
                      </AppSelectContent>
                    </AppSelect>
                    <AppInput
                      value={filter.value}
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
                      placeholder="القيمة"
                      className="flex-1"
                    />
                    <AppButton variant="ghost" size="icon-sm" onClick={() => removeFilter(index)}>
                      <Trash2 className="size-4" />
                    </AppButton>
                  </div>
                ))}
                <AppButton
                  variant="outline"
                  size="sm"
                  icon={<Plus className="size-4" />}
                  onClick={addFilter}
                  disabled={!selectedSource?.filterFields.length}
                >
                  إضافة فلتر
                </AppButton>
              </div>
            )}

            {activeStep === "grouping" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <AppButton
                    variant={groupingMode === "time" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupingMode("time")}
                  >
                    تجميع حسب الوقت
                  </AppButton>
                  <AppButton
                    variant={groupingMode === "dimension" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupingMode("dimension")}
                    disabled={!selectedSource?.dimensions.length}
                  >
                    تجميع حسب فئة
                  </AppButton>
                </div>
                {groupingMode === "time" ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">الفترة الزمنية</label>
                    <AppSelect
                      value={timeGrouping}
                      onValueChange={(value) => setTimeGrouping(value as typeof timeGrouping)}
                    >
                      <AppSelectTrigger>
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {Object.entries(TIME_GROUPING_LABELS).map(([key, label]) => (
                          <AppSelectItem key={key} value={key}>
                            {label}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">التجميع حسب</label>
                    <AppSelect value={groupByDimension} onValueChange={setGroupByDimension}>
                      <AppSelectTrigger>
                        <AppSelectValue placeholder="اختر الفئة" />
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
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">إظهار المقارنة</p>
                  <p className="text-sm text-muted-foreground">مقارنة مع الفترة السابقة</p>
                </div>
                <AppSwitch checked={compareEnabled} onCheckedChange={setCompareEnabled} />
              </div>
            )}

            {activeStep === "display" && (
              <div className="grid grid-cols-3 gap-2">
                {DISPLAY_TYPES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDisplayType(option.key)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      displayType === option.key
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {displayType === option.key && <Check className="size-4 text-primary" />}
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-2 border-t pt-4">
              <AppButton loading={saving} onClick={() => void handleSave()}>
                حفظ المؤشر
              </AppButton>
              <AppButton variant="outline" onClick={() => router.push(ROUTES.reportsKpis)}>
                إلغاء
              </AppButton>
            </div>
          </AppCard>

          {/* Live preview */}
          <AppCard title="معاينة المؤشر">
            {!definitionReady ? (
              <p className="p-4 text-sm text-muted-foreground">
                اختر مصدر البيانات والحقل لعرض المعاينة
              </p>
            ) : loadingPreview && !preview ? (
              <AppLoading variant="chart" />
            ) : preview ? (
              <KpiWidgetRenderer
                name={name || "بدون اسم"}
                displayType={displayType}
                result={preview}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">تعذر تحميل المعاينة</p>
            )}
          </AppCard>
        </div>
      </AppContainer>
    </AppPage>
  )
}
