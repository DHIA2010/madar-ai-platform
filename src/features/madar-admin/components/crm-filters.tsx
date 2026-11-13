"use client"

import { useEffect, useState } from "react"
import { Bookmark, Check, Filter, Plus, Trash2, X } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateField,
  AppDateRangeFilter,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppInput,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { crmService } from "../services"
import type {
  CrmCondition,
  CrmConditionOperator,
  CrmCustomField,
  CrmPerson,
  CrmSavedView,
  CrmStageDef,
  CrmViewPage,
} from "../types"
import { SOURCE_LABEL, UNASSIGNED } from "./crm-ui"

// The Madar apps a lead can be interested in (application ids, as pricing and invoices use them).
export const INTEREST_APPS: { id: string; label: string }[] = [
  { id: "pos", label: "نقطة البيع" },
  { id: "ecommerce", label: "المتاجر الإلكترونية" },
  { id: "advertising", label: "الحملات الإعلانية" },
  { id: "procurement", label: "الموردون والمشتريات" },
  { id: "expenses", label: "المصروفات" },
  { id: "promotions", label: "العروض الترويجية" },
  { id: "invoicing", label: "الفواتير وعروض الأسعار" },
  { id: "ai", label: "الذكاء الاصطناعي" },
]
export const interestLabel = (id: string) => INTEREST_APPS.find((app) => app.id === id)?.label ?? id

// ---- Date range ----

const pad = (value: number) => String(value).padStart(2, "0")
// A local date as yyyy-mm-dd -- what the API's from/to take.
export function toDay(date: Date | undefined) {
  return date
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : undefined
}
function fromDay(day: string | undefined) {
  if (!day) return undefined
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function CrmDateRange({
  from,
  to,
  onChange,
  placeholder = "كل التواريخ",
}: {
  from?: string
  to?: string
  onChange: (range: { from?: string; to?: string }) => void
  placeholder?: string
}) {
  const value: DateRange | undefined = from ? { from: fromDay(from), to: fromDay(to) } : undefined
  return (
    <AppDateRangeFilter
      value={value}
      placeholder={placeholder}
      triggerClassName="h-10 rounded-[10px]"
      onChange={(next) => onChange({ from: toDay(next?.from), to: toDay(next?.to ?? next?.from) })}
    />
  )
}

// ---- Filter builder ----

export type FilterFieldType = "text" | "number" | "date" | "select" | "list" | "checkbox"

export interface FilterField {
  key: string
  label: string
  type: FilterFieldType
  options?: { value: string; label: string }[]
}

const OPERATOR_LABEL: Record<CrmConditionOperator, string> = {
  is: "يساوي",
  is_not: "لا يساوي",
  contains: "يحتوي",
  includes: "يشمل",
  excludes: "لا يشمل",
  gt: "أكبر من",
  lt: "أقل من",
  on_or_after: "من تاريخ",
  on_or_before: "حتى تاريخ",
  is_set: "له قيمة",
  is_empty: "فارغ",
}

const OPERATORS: Record<FilterFieldType, CrmConditionOperator[]> = {
  text: ["contains", "is", "is_not", "is_set", "is_empty"],
  number: ["gt", "lt", "is", "is_set", "is_empty"],
  date: ["on_or_after", "on_or_before", "is_set", "is_empty"],
  select: ["is", "is_not", "is_set", "is_empty"],
  list: ["includes", "excludes", "is_empty", "is_set"],
  checkbox: ["is"],
}

const needsValue = (op: CrmConditionOperator) => op !== "is_set" && op !== "is_empty"

// Every field a lead can be filtered on: its own, then the sales team's custom fields.
export function leadFilterFields(
  owners: CrmPerson[],
  customFields: CrmCustomField[],
  stages: CrmStageDef[]
): FilterField[] {
  return [
    {
      key: "stage",
      label: "المرحلة",
      type: "select",
      options: stages.map((stage) => ({ value: stage.key, label: stage.label })),
    },
    {
      key: "source",
      label: "المصدر",
      type: "select",
      options: (Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((source) => ({
        value: source,
        label: SOURCE_LABEL[source],
      })),
    },
    {
      key: "owner",
      label: "المسؤول",
      type: "select",
      options: [
        { value: UNASSIGNED, label: "غير مسند" },
        ...owners.map((person) => ({ value: person.id, label: person.name })),
      ],
    },
    {
      key: "interests",
      label: "الاهتمامات",
      type: "list",
      options: INTEREST_APPS.map((app) => ({ value: app.id, label: app.label })),
    },
    { key: "tags", label: "الوسوم", type: "list" },
    { key: "utmPlatform", label: "منصة الحملة", type: "text" },
    { key: "utmCampaign", label: "الحملة", type: "text" },
    { key: "utmContent", label: "الإعلان", type: "text" },
    { key: "utmMedium", label: "وسيط الحملة", type: "text" },
    { key: "expectedValue", label: "القيمة المتوقعة", type: "number" },
    { key: "wonValue", label: "قيمة الصفقة", type: "number" },
    { key: "createdAt", label: "تاريخ الإضافة", type: "date" },
    { key: "meetingAt", label: "موعد الاجتماع", type: "date" },
    { key: "stageChangedAt", label: "آخر تغيير للمرحلة", type: "date" },
    { key: "companyName", label: "اسم الشركة", type: "text" },
    { key: "contactName", label: "اسم المسؤول لدى العميل", type: "text" },
    { key: "phone", label: "الجوال", type: "text" },
    { key: "email", label: "البريد", type: "text" },
    ...customFields.map((field) => ({
      key: `custom:${field.id}`,
      label: field.label,
      type: field.type as FilterFieldType,
      options: field.options.map((option) => ({ value: option, label: option })),
    })),
  ]
}

function ValueInput({
  field,
  condition,
  onChange,
}: {
  field: FilterField
  condition: CrmCondition
  onChange: (value: CrmCondition["value"]) => void
}) {
  if (!needsValue(condition.op)) return <div className="flex-1" />
  if (field.type === "checkbox") {
    return (
      <AppSelect
        value={condition.value === false ? "no" : "yes"}
        onValueChange={(value) => onChange(value === "yes")}
      >
        <AppSelectTrigger className="h-9 flex-1 rounded-lg text-sm">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="yes">نعم</AppSelectItem>
          <AppSelectItem value="no">لا</AppSelectItem>
        </AppSelectContent>
      </AppSelect>
    )
  }
  if (field.options?.length) {
    return (
      <AppSelect
        value={condition.value ? String(condition.value) : undefined}
        onValueChange={(value) => onChange(value)}
      >
        <AppSelectTrigger className="h-9 flex-1 rounded-lg text-sm">
          <AppSelectValue placeholder="اختر..." />
        </AppSelectTrigger>
        <AppSelectContent>
          {field.options.map((option) => (
            <AppSelectItem key={option.value} value={option.value}>
              {option.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    )
  }
  if (field.type === "date") {
    return (
      <div className="min-w-0 flex-1">
        <AppDateField
          value={condition.value ? String(condition.value) : ""}
          onChange={(value) => onChange(value || null)}
          triggerClassName="h-9 rounded-lg"
        />
      </div>
    )
  }
  return (
    <AppInput
      type={field.type === "number" ? "number" : "text"}
      value={
        condition.value === null || condition.value === undefined ? "" : String(condition.value)
      }
      onChange={(event) =>
        onChange(
          field.type === "number" && event.target.value !== ""
            ? Number(event.target.value)
            : event.target.value
        )
      }
      wrapperClassName="flex-1"
      className="h-9 rounded-lg text-sm"
      placeholder="القيمة"
    />
  )
}

// "فلترة": conditions that must all hold, edited in a popover and applied together.
export function FilterBuilder({
  fields,
  conditions,
  onChange,
}: {
  fields: FilterField[]
  conditions: CrmCondition[]
  onChange: (conditions: CrmCondition[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<CrmCondition[]>(conditions)

  function openChange(next: boolean) {
    if (next) setDraft(conditions.length ? conditions : [blank()])
    setOpen(next)
  }
  function blank(): CrmCondition {
    const field = fields[0]
    return { field: field.key, op: OPERATORS[field.type][0], value: null }
  }
  function patch(index: number, next: Partial<CrmCondition>) {
    setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)))
  }
  function apply() {
    const complete = draft.filter(
      (row) =>
        !needsValue(row.op) || (row.value !== null && row.value !== undefined && row.value !== "")
    )
    onChange(complete)
    setOpen(false)
  }

  return (
    <AppPopover open={open} onOpenChange={openChange}>
      <AppPopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-sm font-semibold transition-colors",
            conditions.length
              ? "border-primary bg-primary/5 text-primary"
              : "border-border/70 bg-card text-foreground hover:bg-muted/50"
          )}
        >
          <Filter className="size-4" />
          فلترة
          {conditions.length ? (
            <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              {conditions.length}
            </span>
          ) : null}
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent align="start" className="w-[min(92vw,640px)] p-4" dir="rtl">
        <p className="text-sm font-bold text-foreground">عرض العملاء الذين تنطبق عليهم كل الشروط</p>
        <div className="mt-3 flex flex-col gap-2">
          {draft.map((condition, index) => {
            const field = fields.find((entry) => entry.key === condition.field) ?? fields[0]
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <AppSelect
                  value={field.key}
                  onValueChange={(key) => {
                    const next = fields.find((entry) => entry.key === key) ?? fields[0]
                    patch(index, { field: next.key, op: OPERATORS[next.type][0], value: null })
                  }}
                >
                  <AppSelectTrigger className="h-9 w-full rounded-lg text-sm sm:w-44">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {fields.map((entry) => (
                      <AppSelectItem key={entry.key} value={entry.key}>
                        {entry.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
                <AppSelect
                  value={condition.op}
                  onValueChange={(op) => patch(index, { op: op as CrmConditionOperator })}
                >
                  <AppSelectTrigger className="h-9 w-full rounded-lg text-sm sm:w-32">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {OPERATORS[field.type].map((op) => (
                      <AppSelectItem key={op} value={op}>
                        {OPERATOR_LABEL[op]}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
                <ValueInput
                  field={field}
                  condition={condition}
                  onChange={(value) => patch(index, { value })}
                />
                <button
                  type="button"
                  aria-label="حذف الشرط"
                  onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setDraft((current) => [...current, blank()])}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <Plus className="size-4" />
            إضافة شرط
          </button>
          <div className="flex gap-2">
            {conditions.length ? (
              <AppButton
                variant="outline"
                className="h-9 rounded-lg"
                onClick={() => {
                  onChange([])
                  setOpen(false)
                }}
              >
                مسح الفلاتر
              </AppButton>
            ) : null}
            <AppButton className="h-9 rounded-lg" onClick={apply}>
              تطبيق
            </AppButton>
          </div>
        </div>
      </AppPopoverContent>
    </AppPopover>
  )
}

// Removable chips for the applied conditions, under the toolbar.
export function ConditionChips({
  fields,
  conditions,
  onChange,
}: {
  fields: FilterField[]
  conditions: CrmCondition[]
  onChange: (conditions: CrmCondition[]) => void
}) {
  if (!conditions.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {conditions.map((condition, index) => {
        const field = fields.find((entry) => entry.key === condition.field)
        const value =
          field?.options?.find((option) => option.value === String(condition.value))?.label ??
          (typeof condition.value === "boolean"
            ? condition.value
              ? "نعم"
              : "لا"
            : condition.value)
        return (
          <span
            key={index}
            className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-1 ps-3 pe-1.5 text-xs font-semibold text-primary"
          >
            {field?.label ?? condition.field} {OPERATOR_LABEL[condition.op]}
            {needsValue(condition.op) ? ` «${value}»` : ""}
            <button
              type="button"
              aria-label="إزالة"
              onClick={() => onChange(conditions.filter((_, i) => i !== index))}
              className="rounded-full p-0.5 hover:bg-primary/10"
            >
              <X className="size-3" />
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ---- Saved views ----

// "طرق العرض": the team's saved filters for a page -- apply one, save the current one, delete.
export function SavedViews<T extends Record<string, unknown>>({
  page,
  current,
  onApply,
}: {
  page: CrmViewPage
  current: T
  onApply: (definition: T) => void
}) {
  const [views, setViews] = useState<CrmSavedView[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")

  useEffect(() => {
    crmService
      .listViews(page)
      .then(setViews)
      .catch(() => undefined)
  }, [page])

  async function save() {
    if (!name.trim()) return
    try {
      const next = await crmService.saveView({ name: name.trim(), page, definition: current })
      setViews(next)
      setActiveId(next[next.length - 1]?.id ?? null)
      setNaming(false)
      setName("")
      toast.success("حُفظت طريقة العرض.")
    } catch {
      toast.error("تعذر حفظ طريقة العرض.")
    }
  }

  const active = views.find((view) => view.id === activeId)
  return (
    <>
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 max-w-[220px] items-center gap-2 rounded-[10px] border border-border/70 bg-card px-3.5 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            <Bookmark className="size-4 shrink-0" />
            <span className="truncate">{active?.name ?? "طرق العرض"}</span>
          </button>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="start" className="w-64 [direction:rtl]">
          <AppDropdownMenuLabel>طرق العرض المحفوظة</AppDropdownMenuLabel>
          {views.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              لا توجد بعد. اضبط الفلاتر ثم احفظها.
            </p>
          ) : (
            views.map((view) => (
              <AppDropdownMenuItem
                key={view.id}
                onSelect={() => {
                  setActiveId(view.id)
                  onApply(view.definition as T)
                }}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {view.id === activeId ? (
                    <Check className="size-4 shrink-0" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="truncate">{view.name}</span>
                </span>
                <button
                  type="button"
                  aria-label="حذف"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    crmService
                      .deleteView(view.id)
                      .then((next) => {
                        setViews(next)
                        if (activeId === view.id) setActiveId(null)
                      })
                      .catch(() => toast.error("تعذر الحذف."))
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </AppDropdownMenuItem>
            ))
          )}
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem onSelect={() => setNaming(true)}>
            <Plus className="size-4" />
            حفظ العرض الحالي
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
      {naming ? (
        <div className="flex items-center gap-2">
          <AppInput
            autoFocus
            value={name}
            placeholder="اسم طريقة العرض"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save()
              if (event.key === "Escape") setNaming(false)
            }}
            wrapperClassName="w-48"
            className="h-10 rounded-[10px]"
          />
          <AppButton className="h-10 rounded-[10px]" onClick={() => void save()}>
            حفظ
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px]"
            onClick={() => setNaming(false)}
          >
            إلغاء
          </AppButton>
        </div>
      ) : null}
    </>
  )
}

// The sales team's custom lead fields, loaded once per page.
export function useCrmCustomFields() {
  const [fields, setFields] = useState<CrmCustomField[]>([])
  useEffect(() => {
    crmService
      .listFields()
      .then(setFields)
      .catch(() => undefined)
  }, [])
  return [fields, setFields] as const
}
