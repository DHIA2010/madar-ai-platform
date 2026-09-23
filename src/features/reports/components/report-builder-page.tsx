"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  type DragEndEvent,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppEmpty,
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
  type Kpi,
  type KpiResult,
  kpiService,
  reportService,
  type ReportSharing,
} from "../services"
import { KpiWidgetRenderer } from "./kpi-widget-renderer"

const SIDEBAR_PREFIX = "sidebar:"
const CANVAS_PREFIX = "canvas:"
const CANVAS_DROPZONE_ID = "canvas-dropzone"

interface PlacedWidget {
  localId: string
  kpiId: string
}

function SidebarKpiItem({ kpi, onAdd }: { kpi: Kpi; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${SIDEBAR_PREFIX}${kpi.id}`,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined }}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-lg border p-2.5 text-sm active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{kpi.name}</p>
        <p className="truncate text-xs text-muted-foreground">{kpi.category}</p>
      </div>
      {/* Drag-and-drop isn't keyboard accessible and can be finicky on some setups -- this button
          is a reliable, always-available alternative that does exactly the same thing a drop
          does. stopPropagation keeps a click from also being read as a drag start. */}
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onAdd()
        }}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`إضافة ${kpi.name} إلى التقرير`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

function CanvasWidget({
  widget,
  kpi,
  result,
  loading,
  onRemove,
}: {
  widget: PlacedWidget
  kpi: Kpi | undefined
  result: KpiResult | undefined
  loading: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${CANVAS_PREFIX}${widget.localId}`,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
      }}
      className={cn("relative rounded-lg border bg-background", isDragging && "opacity-50")}
    >
      <div className="flex items-center justify-between border-b px-2 py-1">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="flex cursor-grab items-center gap-1 text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <AppButton variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 className="size-4" />
        </AppButton>
      </div>
      {!kpi ? (
        <p className="p-4 text-sm text-muted-foreground">مؤشر غير معروف</p>
      ) : loading ? (
        <AppLoading variant="chart" />
      ) : result ? (
        <KpiWidgetRenderer name={kpi.name} displayType={kpi.displayType} result={result} />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">تعذر تحميل بيانات المؤشر</p>
      )}
    </div>
  )
}

export function ReportBuilderPage({ reportId }: { reportId?: string }) {
  const router = useRouter()
  const isEditing = Boolean(reportId)

  const [kpis, setKpis] = useState<Kpi[]>([])
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingReport, setLoadingReport] = useState(isEditing)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("sales")
  const [sharing, setSharing] = useState<ReportSharing>("private")
  const [showFilterBar, setShowFilterBar] = useState(true)
  const [showComparison, setShowComparison] = useState(true)
  const [widgets, setWidgets] = useState<PlacedWidget[]>([])
  const [results, setResults] = useState<Record<string, KpiResult>>({})
  const [loadingResults, setLoadingResults] = useState<Record<string, boolean>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    kpiService
      .list()
      .then(setKpis)
      .finally(() => setLoadingKpis(false))
  }, [])

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
        setWidgets(
          [...report.widgets]
            .sort((a, b) => a.order - b.order)
            .map((widget) => ({ localId: widget.id, kpiId: widget.kpiId }))
        )
      })
      .finally(() => setLoadingReport(false))
  }, [reportId])

  const kpiById = useMemo(() => new Map(kpis.map((kpi) => [kpi.id, kpi])), [kpis])

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
    setWidgets((current) => [...current, { localId: `${kpiId}-${Date.now()}`, kpiId }])
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith(SIDEBAR_PREFIX)) {
      if (overId === CANVAS_DROPZONE_ID || overId.startsWith(CANVAS_PREFIX)) {
        addKpiToCanvas(activeId.slice(SIDEBAR_PREFIX.length))
      }
      return
    }

    if (activeId.startsWith(CANVAS_PREFIX) && overId.startsWith(CANVAS_PREFIX)) {
      const activeLocalId = activeId.slice(CANVAS_PREFIX.length)
      const overLocalId = overId.slice(CANVAS_PREFIX.length)
      setWidgets((current) => {
        const oldIndex = current.findIndex((widget) => widget.localId === activeLocalId)
        const newIndex = current.findIndex((widget) => widget.localId === overLocalId)
        if (oldIndex === -1 || newIndex === -1) return current
        return arrayMove(current, oldIndex, newIndex)
      })
    }
  }

  const removeWidget = (localId: string) => {
    setWidgets((current) => current.filter((widget) => widget.localId !== localId))
  }

  const { setNodeRef: setCanvasRef, isOver } = useDroppable({ id: CANVAS_DROPZONE_ID })

  const handleSave = async () => {
    if (!name.trim() || widgets.length === 0) {
      toast.error("يرجى إدخال اسم التقرير وإضافة مؤشر واحد على الأقل.")
      return
    }
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        category,
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar, allowExport: true, showComparison },
        sharing,
        status: "active" as const,
        workspaceId: null,
        widgets: widgets.map((widget, index) => ({ kpiId: widget.kpiId, order: index })),
      }
      if (isEditing && reportId) {
        await reportService.update(reportId, input)
        toast.success("تم تحديث التقرير بنجاح.")
      } else {
        await reportService.create(input)
        toast.success("تم إنشاء التقرير بنجاح.")
      }
      router.push(ROUTES.reports)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التقرير.")
    } finally {
      setSaving(false)
    }
  }

  if (loadingKpis || loadingReport) {
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
            { label: isEditing ? "تعديل تقرير مخصص" : "إنشاء تقرير مخصص", current: true },
          ]}
          title={isEditing ? "تعديل التقرير المخصص" : "إنشاء تقرير مخصص"}
          subtitle="اسحب المؤشرات وأفلتها لبناء تقريرك المخصص"
          actions={
            <AppButton loading={saving} onClick={() => void handleSave()}>
              حفظ
            </AppButton>
          }
        />

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4 lg:grid-cols-[240px_1fr_300px]">
            {/* Sidebar: saved KPIs */}
            <AppCard title="المؤشرات المتاحة" subtitle="اسحب مؤشراً إلى التقرير">
              <div className="space-y-2">
                {kpis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد مؤشرات محفوظة بعد.</p>
                ) : (
                  kpis.map((kpi) => (
                    <SidebarKpiItem key={kpi.id} kpi={kpi} onAdd={() => addKpiToCanvas(kpi.id)} />
                  ))
                )}
                <AppButton
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => window.open(ROUTES.reportsKpisNew, "_blank")}
                >
                  + إنشاء مؤشر جديد
                </AppButton>
              </div>
            </AppCard>

            {/* Canvas */}
            <div
              ref={setCanvasRef}
              className={cn(
                "min-h-[400px] space-y-3 rounded-xl border-2 border-dashed p-3 transition-colors",
                isOver ? "border-primary bg-primary/5" : "border-muted"
              )}
            >
              {widgets.length === 0 ? (
                <AppEmpty
                  title="اسحب المؤشرات من القائمة لبناء تقريرك المخصص"
                  description="أو اضغط + بجانب أي مؤشر لإضافته مباشرة"
                />
              ) : (
                <SortableContext
                  items={widgets.map((widget) => `${CANVAS_PREFIX}${widget.localId}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {widgets.map((widget) => (
                    <CanvasWidget
                      key={widget.localId}
                      widget={widget}
                      kpi={kpiById.get(widget.kpiId)}
                      result={results[widget.kpiId]}
                      loading={Boolean(loadingResults[widget.kpiId])}
                      onRemove={() => removeWidget(widget.localId)}
                    />
                  ))}
                </SortableContext>
              )}
            </div>

            {/* Settings panel */}
            <AppCard title="إعدادات التقرير">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">اسم التقرير *</label>
                  <AppInput value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">الوصف</label>
                  <AppTextarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">إظهار شريط الفلاتر في التقرير</span>
                  <AppSwitch checked={showFilterBar} onCheckedChange={setShowFilterBar} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">عرض أرقام المقارنة</span>
                  <AppSwitch checked={showComparison} onCheckedChange={setShowComparison} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">المشاركة</label>
                  <AppSelect
                    value={sharing}
                    onValueChange={(value) => setSharing(value as ReportSharing)}
                  >
                    <AppSelectTrigger>
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      <AppSelectItem value="private">خاص (لي فقط)</AppSelectItem>
                      <AppSelectItem value="organization">المؤسسة بالكامل</AppSelectItem>
                    </AppSelectContent>
                  </AppSelect>
                </div>
              </div>
            </AppCard>
          </div>
        </DndContext>
      </AppContainer>
    </AppPage>
  )
}
