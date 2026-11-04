"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CalendarClock,
  Clock3,
  Columns3,
  ListTodo,
  Phone,
  PhoneCall,
  Plus,
  Rows3,
  Settings2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { useAdminPagedList } from "../hooks"
import { crmService, formatRelative } from "../services"
import type {
  CrmCondition,
  CrmLead,
  CrmLeadFilters,
  CrmPerson,
  CrmStage,
  CrmStageDef,
} from "../types"
import type { CrmCustomField } from "../types"
import {
  ConditionChips,
  CrmDateRange,
  FilterBuilder,
  INTEREST_APPS,
  leadFilterFields,
  SavedViews,
  useCrmCustomFields,
} from "./crm-filters"
import { StageManagerDialog } from "./crm-stages-dialog"
import {
  formatDateTime,
  formatSarAmount,
  isOverdue,
  LeadFormDialog,
  leadPlatform,
  LostReasonDialog,
  MEETING_SOURCE_LABEL,
  OwnerAvatar,
  platformLabel,
  SOURCE_LABEL,
  SourceChip,
  StageBadge,
  stageMeta,
  UNASSIGNED,
  useCrmOwners,
  useCrmStages,
} from "./crm-ui"

const SELECT_TRIGGER = "h-10 w-[160px] rounded-[10px] text-sm"

// What the board's columns are: a stage (default), the owner, the source, an interest, or one of
// the custom list fields ("custom:<id>").
type GroupBy = string
const NONE = "__none"

// "campaign" grouping: one column per platform + campaign that first brought the lead.
const campaignKey = (lead: CrmLead) =>
  `${leadPlatform(lead)}\u0000${lead.attribution?.first?.campaign ?? ""}`
function campaignLabel(key: string) {
  const [platform, campaign] = key.split("\u0000")
  return campaign ? `${platformLabel(platform)} • ${campaign}` : platformLabel(platform)
}

// Date grouping ("date:<field>"): leads bucketed by day, week or month of that date.
type DateStep = "day" | "week" | "month"
const DATE_STEP_LABEL: Record<DateStep, string> = { day: "يوم", week: "أسبوع", month: "شهر" }
const isDateGroup = (groupBy: GroupBy) => groupBy.startsWith("date:")

function leadDate(lead: CrmLead, field: string): string | null {
  if (field === "createdAt") return lead.createdAt
  if (field === "meetingAt") return lead.meetingAt
  if (field === "stageChangedAt") return lead.stageChangedAt
  if (field.startsWith("custom:")) {
    const value = lead.customFields[field.slice("custom:".length)]
    return typeof value === "string" && value ? value : null
  }
  return null
}

const pad2 = (value: number) => String(value).padStart(2, "0")
const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

// The bucket a date falls in: its day, the Sunday its week starts on, or its month.
function dateBucket(iso: string, step: DateStep) {
  // A bare yyyy-mm-dd (a custom date field) is a calendar day, not UTC midnight.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (step === "month") return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
  if (step === "week") date.setDate(date.getDate() - date.getDay())
  return localDay(date)
}

const BUCKET_FORMAT = {
  day: new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
  month: new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" }),
}

function bucketLabel(key: string, step: DateStep) {
  if (step === "month") return BUCKET_FORMAT.month.format(new Date(`${key}-01T12:00:00`))
  const label = BUCKET_FORMAT.day.format(new Date(`${key}T12:00:00`))
  return step === "week" ? `أسبوع يبدأ ${label}` : label
}

interface BoardColumn {
  key: string
  label: string
  header?: React.ReactNode
}

function boardColumns(
  groupBy: GroupBy,
  owners: CrmPerson[],
  customFields: CrmCustomField[],
  leads: CrmLead[],
  step: DateStep,
  stages: CrmStageDef[]
): BoardColumn[] {
  if (groupBy === "campaign") {
    const seen = new Map<string, number>()
    for (const lead of leads) {
      const key = campaignKey(lead)
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return [...seen.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([key]) => ({ key, label: campaignLabel(key) }))
  }
  if (isDateGroup(groupBy)) {
    const field = groupBy.slice("date:".length)
    const keys = new Set<string>()
    let undated = false
    for (const lead of leads) {
      const value = leadDate(lead, field)
      if (value) keys.add(dateBucket(value, step))
      else undated = true
    }
    // Newest first.
    return [
      ...[...keys]
        .sort()
        .reverse()
        .map((key) => ({ key, label: bucketLabel(key, step) })),
      ...(undated ? [{ key: NONE, label: "بدون تاريخ" }] : []),
    ]
  }
  if (groupBy === "owner") {
    return [
      { key: UNASSIGNED, label: "غير مسند" },
      ...owners.map((person) => ({ key: person.id, label: person.name })),
    ]
  }
  if (groupBy === "source") {
    return (Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((source) => ({
      key: source,
      label: SOURCE_LABEL[source],
    }))
  }
  if (groupBy === "interest") {
    return [
      ...INTEREST_APPS.map((app) => ({ key: app.id, label: app.label })),
      { key: NONE, label: "بلا اهتمام محدد" },
    ]
  }
  if (groupBy.startsWith("custom:")) {
    const field = customFields.find((entry) => `custom:${entry.id}` === groupBy)
    return [
      ...(field?.options ?? []).map((option) => ({ key: option, label: option })),
      { key: NONE, label: "بدون قيمة" },
    ]
  }
  return stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    header: <StageBadge stage={stage.key} />,
  }))
}

// Which columns a lead sits in (several, when grouped by interest).
function columnKeys(lead: CrmLead, groupBy: GroupBy, step: DateStep): string[] {
  if (groupBy === "campaign") return [campaignKey(lead)]
  if (isDateGroup(groupBy)) {
    const value = leadDate(lead, groupBy.slice("date:".length))
    return [value ? dateBucket(value, step) : NONE]
  }
  if (groupBy === "owner") return [lead.owner?.id ?? UNASSIGNED]
  if (groupBy === "source") return [lead.source]
  if (groupBy === "interest") return lead.interests.length ? lead.interests : [NONE]
  if (groupBy.startsWith("custom:")) {
    const value = lead.customFields[groupBy.slice("custom:".length)]
    return [value === null || value === undefined || value === "" ? NONE : String(value)]
  }
  return [lead.stage]
}

interface LeadFilterState {
  search: string
  owner: string
  stage: CrmLeadFilters["stage"]
  source: CrmLeadFilters["source"]
  conditions: CrmCondition[]
  from?: string
  to?: string
}

const EMPTY_FILTERS: LeadFilterState = {
  search: "",
  owner: "all",
  stage: "all",
  source: "all",
  conditions: [],
}

function LeadCard({
  lead,
  showStage,
  draggable,
  onDragStart,
}: {
  lead: CrmLead
  showStage: boolean
  draggable: boolean
  onDragStart: (event: React.DragEvent) => void
}) {
  // The call the lead asked for; it's also its follow-up, so that isn't shown twice.
  const showCall = Boolean(lead.callAt) && !["won", "lost"].includes(lead.stage)
  return (
    <Link
      href={ROUTES.madarAdminCrmLead(lead.id)}
      draggable={draggable}
      onDragStart={onDragStart}
      className="block cursor-grab rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-bold text-foreground">{lead.companyName}</p>
        <OwnerAvatar person={lead.owner} />
      </div>
      {lead.contactName || lead.phone ? (
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Phone className="size-3 shrink-0" />
          <span className="truncate" dir="auto">
            {lead.contactName ?? lead.phone}
          </span>
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {showStage ? <StageBadge stage={lead.stage} /> : <SourceChip source={lead.source} />}
        {leadPlatform(lead) !== "direct" ? (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            {platformLabel(leadPlatform(lead))}
          </span>
        ) : null}
        {lead.expectedValue !== null || lead.wonValue !== null ? (
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {formatSarAmount(lead.wonValue ?? lead.expectedValue)}
          </span>
        ) : null}
      </div>
      {lead.meetingAt && lead.stage === "meeting" ? (
        <div className="mt-2 text-xs font-semibold text-violet-700">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" />
            {formatDateTime(lead.meetingAt)}
          </p>
          {lead.meetingSource ? (
            <p className="mt-0.5 ps-5 text-[11px] font-medium text-violet-700/70">
              {MEETING_SOURCE_LABEL[lead.meetingSource]}
            </p>
          ) : null}
        </div>
      ) : null}
      {showCall ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-sky-700">
          <PhoneCall className="mt-px size-3.5 shrink-0" />
          <span>مكالمة {formatDateTime(lead.callAt)}</span>
        </p>
      ) : null}
      {lead.nextTask && !(showCall && lead.nextTask.dueAt === lead.callAt) ? (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 truncate text-xs font-semibold",
            isOverdue(lead.nextTask.dueAt) ? "text-rose-600" : "text-muted-foreground"
          )}
        >
          <Clock3 className="size-3.5 shrink-0" />
          <span className="truncate">{lead.nextTask.title}</span>
        </p>
      ) : null}
      {lead.tags.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  )
}

export function MadarAdminCrmPipeline() {
  const router = useRouter()
  const owners = useCrmOwners()
  const stages = useCrmStages()
  const [managingStages, setManagingStages] = useState(false)
  const [customFields] = useCrmCustomFields()
  const [view, setView] = useState<"board" | "table">("board")
  const [groupBy, setGroupBy] = useState<GroupBy>("stage")
  const [filters, setFilters] = useState<LeadFilterState>(EMPTY_FILTERS)
  const [boardLeads, setBoardLeads] = useState<CrmLead[] | null>(null)
  const [reload, setReload] = useState(0)
  const [creating, setCreating] = useState(false)
  const [losing, setLosing] = useState<CrmLead | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragged = useRef<{ lead: CrmLead; from: string } | null>(null)

  const filterFields = useMemo(
    () => leadFilterFields(owners, customFields, stages),
    [owners, customFields, stages]
  )
  const [dateStep, setDateStep] = useState<DateStep>("week")
  const selectFields = customFields.filter((field) => field.type === "select")
  const dateFields = customFields.filter((field) => field.type === "date")
  const columns = useMemo(
    () => boardColumns(groupBy, owners, customFields, boardLeads ?? [], dateStep, stages),
    [groupBy, owners, customFields, boardLeads, dateStep, stages]
  )

  // The board.
  useEffect(() => {
    if (view !== "board") return
    let active = true
    const timer = setTimeout(() => {
      crmService
        .pipeline({
          search: filters.search.trim() || undefined,
          owner: filters.owner === "all" ? undefined : filters.owner,
          source: filters.source,
          conditions: filters.conditions,
          from: filters.from,
          to: filters.to,
        })
        .then((result) => {
          if (active) setBoardLeads(result.leads)
        })
        .catch(() => toast.error("تعذر تحميل العملاء المحتملين."))
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [view, filters, reload])

  // The table.
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList<CrmLead, CrmLeadFilters, null>({
    initialFilters: { search: "", stage: "all", source: "all", owner: "all", conditions: [] },
    fetchPage: crmService.listLeads,
    fetchSummary: async () => null,
    onError,
  })
  const { setFilter } = list

  // One set of filters for both views; the table's list mirrors it.
  function update(patch: Partial<LeadFilterState>) {
    setFilters((current) => ({ ...current, ...patch }))
    for (const [key, value] of Object.entries(patch)) {
      setFilter(key as keyof CrmLeadFilters, value as never)
    }
  }

  const totals = useMemo(() => {
    const all = boardLeads ?? []
    return {
      open: all.filter((lead) => !["won", "lost"].includes(lead.stage)).length,
      pipelineValue: all
        .filter((lead) => !["won", "lost"].includes(lead.stage))
        .reduce((sum, lead) => sum + (lead.expectedValue ?? 0), 0),
    }
  }, [boardLeads])

  // Shows a change on the board right away; the reload after the save confirms it.
  function patchLead(id: string, patch: Partial<CrmLead>) {
    setBoardLeads(
      (current) => current?.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)) ?? null
    )
  }

  async function moveTo(lead: CrmLead, stage: CrmStage, lostReason?: string) {
    if (lead.stage === stage) return
    patchLead(lead.id, { stage })
    try {
      await crmService.changeStage(lead.id, stage, lostReason)
      toast.success(`نُقل إلى «${stageMeta(stage).label}»`)
    } catch {
      toast.error("تعذر نقل العميل المحتمل.")
    } finally {
      setReload((key) => key + 1)
    }
  }

  // Dropping a card in another column changes what the board is grouped by.
  async function onDrop(target: string) {
    setDropTarget(null)
    const drag = dragged.current
    dragged.current = null
    if (!drag || drag.from === target) return
    const { lead, from } = drag
    if (groupBy === "stage") {
      if (target === "lost") setLosing(lead)
      else void moveTo(lead, target as CrmStage)
      return
    }
    let patch: Parameters<typeof crmService.updateLead>[1]
    if (groupBy === "owner") {
      const owner = owners.find((person) => person.id === target) ?? null
      patchLead(lead.id, { owner })
      patch = { ownerUserId: owner?.id ?? null }
    } else if (groupBy === "interest") {
      const interests = [
        ...lead.interests.filter((id) => id !== from),
        ...(target === NONE || lead.interests.includes(target) ? [] : [target]),
      ]
      patchLead(lead.id, { interests: target === NONE ? [] : interests })
      patch = { interests: target === NONE ? [] : interests }
    } else {
      const fieldId = groupBy.slice("custom:".length)
      const value = target === NONE ? null : target
      patchLead(lead.id, { customFields: { ...lead.customFields, [fieldId]: value } })
      patch = { customFields: { [fieldId]: value } }
    }
    try {
      await crmService.updateLead(lead.id, patch)
      toast.success("تم التحديث.")
    } catch {
      toast.error("تعذر تحديث العميل المحتمل.")
    } finally {
      setReload((key) => key + 1)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">العملاء المحتملون</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل من تواصل مع مدار أو سجّل فيها، من أول اتصال حتى الاشتراك.
            {columns ? (
              <span className="ms-2 font-semibold text-foreground">
                {totals.open} مفتوح • قيمة متوقعة {formatSarAmount(totals.pipelineValue)}
              </span>
            ) : null}
          </p>
        </div>
        <AppButton
          icon={<Plus className="size-4" />}
          className="h-10 gap-2 rounded-[10px]"
          onClick={() => setCreating(true)}
        >
          إضافة عميل محتمل
        </AppButton>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <AppSearchInput
            placeholder="ابحث بالاسم أو الجوال أو البريد أو الوسم..."
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            wrapperClassName="w-full sm:w-72"
            className="h-10 rounded-[10px]"
          />
          <AppSelect value={filters.owner} onValueChange={(value) => update({ owner: value })}>
            <AppSelectTrigger className={SELECT_TRIGGER}>
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">كل المسؤولين</AppSelectItem>
              <AppSelectItem value={UNASSIGNED}>غير مسند</AppSelectItem>
              {owners.map((person) => (
                <AppSelectItem key={person.id} value={person.id}>
                  {person.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
          <AppSelect
            value={filters.source ?? "all"}
            onValueChange={(value) => update({ source: value as CrmLeadFilters["source"] })}
          >
            <AppSelectTrigger className={SELECT_TRIGGER}>
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">كل المصادر</AppSelectItem>
              {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((source) => (
                <AppSelectItem key={source} value={source}>
                  {SOURCE_LABEL[source]}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
          {view === "table" ? (
            <AppSelect
              value={filters.stage ?? "all"}
              onValueChange={(value) => update({ stage: value as CrmLeadFilters["stage"] })}
            >
              <AppSelectTrigger className={SELECT_TRIGGER}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="all">كل المراحل</AppSelectItem>
                {stages.map(({ key: stage }) => (
                  <AppSelectItem key={stage} value={stage}>
                    {stageMeta(stage).label}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          ) : null}
          <CrmDateRange
            from={filters.from}
            to={filters.to}
            placeholder="تاريخ الإضافة"
            onChange={(range) => update(range)}
          />
          <FilterBuilder
            fields={filterFields}
            conditions={filters.conditions}
            onChange={(conditions) => update({ conditions })}
          />
          <SavedViews
            page="leads"
            current={{ ...filters, groupBy, view, dateStep }}
            onApply={(definition) => {
              update({ ...EMPTY_FILTERS, ...(definition as Partial<LeadFilterState>) })
              if (typeof definition.groupBy === "string") setGroupBy(definition.groupBy)
              if (
                definition.dateStep === "day" ||
                definition.dateStep === "week" ||
                definition.dateStep === "month"
              ) {
                setDateStep(definition.dateStep)
              }
              if (definition.view === "board" || definition.view === "table")
                setView(definition.view)
            }}
          />
          <div className="ms-auto flex rounded-[10px] border border-border/60 p-1">
            {(
              [
                ["board", "لوحة", Columns3],
                ["table", "جدول", Rows3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  view === key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <ConditionChips
          fields={filterFields}
          conditions={filters.conditions}
          onChange={(conditions) => update({ conditions })}
        />
      </div>

      {view === "board" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">تجميع حسب:</span>
          {(
            [
              ["stage", "المرحلة"],
              ["owner", "المسؤول"],
              ["source", "المصدر"],
              ["interest", "الاهتمام"],
              ["campaign", "الحملة"],
              ...selectFields.map((field) => [`custom:${field.id}`, field.label]),
              ["date:createdAt", "تاريخ الإضافة"],
              ["date:meetingAt", "موعد الاجتماع"],
              ["date:stageChangedAt", "آخر تغيير للمرحلة"],
              ...dateFields.map((field) => [`date:custom:${field.id}`, field.label]),
            ] as [string, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setGroupBy(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                groupBy === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setManagingStages(true)}
            className="ms-auto flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="size-3.5" />
            إدارة المراحل
          </button>
          {isDateGroup(groupBy) ? (
            <div className="ms-2 flex rounded-full border border-border/70 bg-card p-0.5">
              {(Object.keys(DATE_STEP_LABEL) as DateStep[]).map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setDateStep(step)}
                  className={cn(
                    "rounded-full px-3 py-0.5 text-xs font-semibold transition-colors",
                    dateStep === step
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {DATE_STEP_LABEL[step]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "board" ? (
        <div className="w-0 min-w-full overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{
              // At least four tracks, so one or two columns stay card-width.
              gridTemplateColumns: `repeat(${Math.max(columns.length, 4)}, minmax(210px, 1fr))`,
              minWidth: `${Math.max(columns.length, 4) * 210}px`,
            }}
          >
            {columns.map((column) => {
              const leads = (boardLeads ?? []).filter((lead) =>
                columnKeys(lead, groupBy, dateStep).includes(column.key)
              )
              const value = leads.reduce(
                (sum, lead) => sum + (lead.wonValue ?? lead.expectedValue ?? 0),
                0
              )
              const canDrop =
                groupBy !== "source" && groupBy !== "campaign" && !isDateGroup(groupBy)
              return (
                <div
                  key={column.key}
                  onDragOver={(event) => {
                    if (!canDrop) return
                    event.preventDefault()
                    setDropTarget(column.key)
                  }}
                  onDragLeave={() =>
                    setDropTarget((current) => (current === column.key ? null : current))
                  }
                  onDrop={() => void onDrop(column.key)}
                  className={cn(
                    "flex min-h-[420px] flex-col rounded-2xl border bg-muted/30 p-2.5 transition-colors",
                    dropTarget === column.key ? "border-primary bg-primary/5" : "border-border/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-3">
                    {column.header ?? (
                      <span className="truncate text-sm font-bold text-foreground">
                        {column.label}
                      </span>
                    )}
                    <span className="text-xs font-bold text-muted-foreground">{leads.length}</span>
                  </div>
                  {value > 0 ? (
                    <p className="-mt-2 px-1.5 pb-2 text-[11px] font-semibold text-muted-foreground">
                      {formatSarAmount(value)}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {boardLeads === null ? (
                      <div className="h-20 animate-pulse rounded-xl bg-muted" />
                    ) : leads.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                        {canDrop ? "اسحب عميلًا إلى هنا" : "لا يوجد"}
                      </p>
                    ) : (
                      leads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          showStage={groupBy !== "stage"}
                          draggable={canDrop}
                          onDragStart={(event) => {
                            dragged.current = { lead, from: column.key }
                            event.dataTransfer.effectAllowed = "move"
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {groupBy === "source" || groupBy === "campaign" || isDateGroup(groupBy)
              ? "هذا التجميع للعرض فقط."
              : "اسحب البطاقة بين الأعمدة لتغيير قيمتها."}{" "}
            تظهر الصفقات الرابحة والخاسرة لآخر 30 يومًا.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>الشركة</AppTableHead>
                <AppTableHead>التواصل</AppTableHead>
                <AppTableHead>المرحلة</AppTableHead>
                <AppTableHead>المصدر</AppTableHead>
                <AppTableHead>القيمة</AppTableHead>
                <AppTableHead>المتابعة القادمة</AppTableHead>
                <AppTableHead>المسؤول</AppTableHead>
                <AppTableHead>أُضيف</AppTableHead>
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {list.rows.map((lead) => (
                <AppTableRow
                  key={lead.id}
                  className="cursor-pointer"
                  onClick={() => router.push(ROUTES.madarAdminCrmLead(lead.id))}
                >
                  <AppTableCell className="font-semibold text-foreground">
                    {lead.companyName}
                  </AppTableCell>
                  <AppTableCell className="text-sm text-muted-foreground" dir="auto">
                    {lead.phone ?? lead.email ?? "—"}
                  </AppTableCell>
                  <AppTableCell>
                    <StageBadge stage={lead.stage} />
                  </AppTableCell>
                  <AppTableCell>
                    <SourceChip source={lead.source} />
                  </AppTableCell>
                  <AppTableCell className="text-sm font-semibold">
                    {formatSarAmount(lead.wonValue ?? lead.expectedValue)}
                  </AppTableCell>
                  <AppTableCell
                    className={cn(
                      "text-sm",
                      lead.nextTask && isOverdue(lead.nextTask.dueAt)
                        ? "font-semibold text-rose-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {lead.nextTask ? (
                      <span className="flex items-center gap-1.5">
                        <ListTodo className="size-3.5" />
                        {formatRelative(lead.nextTask.dueAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </AppTableCell>
                  <AppTableCell>
                    <OwnerAvatar person={lead.owner} />
                  </AppTableCell>
                  <AppTableCell className="text-sm text-muted-foreground">
                    {formatRelative(lead.createdAt)}
                  </AppTableCell>
                </AppTableRow>
              ))}
            </AppTableBody>
          </AppTable>
          {!list.loading && list.rows.length === 0 ? (
            <AppTableEmpty
              title="لا يوجد عملاء محتملون"
              description="غيّر الفلاتر أو أضف عميلًا محتملًا."
            />
          ) : null}
          <div className="border-t border-border/60 px-4 py-3">
            <AppTablePagination
              page={list.page}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              previousLabel="السابق"
              nextLabel="التالي"
            />
          </div>
        </div>
      )}

      <LeadFormDialog
        open={creating}
        lead={null}
        owners={owners}
        onClose={() => setCreating(false)}
        onSave={async (input) => {
          const created = await crmService.createLead(input)
          toast.success("أُضيف العميل المحتمل.")
          router.push(ROUTES.madarAdminCrmLead(created.lead.id))
        }}
      />
      <StageManagerDialog open={managingStages} onClose={() => setManagingStages(false)} />
      <LostReasonDialog
        open={losing !== null}
        onClose={() => setLosing(null)}
        onConfirm={async (reason) => {
          if (losing) await moveTo(losing, "lost", reason || undefined)
        }}
      />
    </div>
  )
}
