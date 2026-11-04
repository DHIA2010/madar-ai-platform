"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  AppDateField,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { crmService, formatDate } from "../services"
import type { CrmCustomField, CrmFieldType, CrmFieldValue, CrmLead, CrmLeadInput } from "../types"
import { INTEREST_APPS } from "./crm-filters"
import { formatDateTime, leadPlatform, platformLabel } from "./crm-ui"

const FIELD_TYPE_LABEL: Record<CrmFieldType, string> = {
  text: "نص",
  number: "رقم",
  date: "تاريخ",
  select: "قائمة اختيارات",
  checkbox: "نعم / لا",
}

// Saves a change to the lead; false when it failed (the error is already shown).
type Save = (patch: Partial<CrmLeadInput>, success?: string) => Promise<boolean>

// الاهتمامات: the Madar apps the lead wants, and free-form tags ("VIP", "فروع متعددة"...).
export function LeadInterestsCard({ lead, onSave }: { lead: CrmLead; onSave: Save }) {
  const [tag, setTag] = useState("")

  function toggle(id: string) {
    const interests = lead.interests.includes(id)
      ? lead.interests.filter((entry) => entry !== id)
      : [...lead.interests, id]
    void onSave({ interests })
  }
  function addTag() {
    const value = tag.trim()
    if (!value || lead.tags.includes(value)) return setTag("")
    setTag("")
    void onSave({ tags: [...lead.tags, value] })
  }

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <h2 className="text-base font-bold">الاهتمامات</h2>
      <p className="mt-1 text-xs text-muted-foreground">تطبيقات مدار التي يهتم بها العميل.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {INTEREST_APPS.map((app) => {
          const on = lead.interests.includes(app.id)
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => toggle(app.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
              {app.label}
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-xs font-bold text-muted-foreground">وسوم</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.tags.map((entry) => (
          <span
            key={entry}
            className="flex items-center gap-1 rounded-md bg-muted py-1 ps-2 pe-1 text-xs font-semibold text-foreground"
          >
            #{entry}
            <button
              type="button"
              aria-label="إزالة"
              onClick={() => void onSave({ tags: lead.tags.filter((other) => other !== entry) })}
              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <AppInput
          value={tag}
          placeholder="أضف وسمًا واضغط Enter"
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addTag()
            }
          }}
          wrapperClassName="flex-1"
          className="h-9 rounded-lg text-sm"
        />
        <AppButton variant="outline" className="h-9 rounded-lg" onClick={addTag}>
          إضافة
        </AppButton>
      </div>
    </AppCard>
  )
}

function displayValue(field: CrmCustomField, value: CrmFieldValue | undefined) {
  if (value === null || value === undefined || value === "") return "—"
  if (field.type === "checkbox") return value ? "نعم" : "لا"
  if (field.type === "date") return formatDate(String(value))
  return String(value)
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: CrmCustomField
  value: CrmFieldValue
  onChange: (value: CrmFieldValue) => void
}) {
  if (field.type === "select" || field.type === "checkbox") {
    const options =
      field.type === "checkbox"
        ? [
            { value: "true", label: "نعم" },
            { value: "false", label: "لا" },
          ]
        : field.options.map((option) => ({ value: option, label: option }))
    return (
      <AppSelect
        value={value === null || value === undefined ? undefined : String(value)}
        onValueChange={(next) => onChange(field.type === "checkbox" ? next === "true" : next)}
      >
        <AppSelectTrigger className="h-9 w-full rounded-lg text-sm">
          <AppSelectValue placeholder="اختر..." />
        </AppSelectTrigger>
        <AppSelectContent>
          {options.map((option) => (
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
      <AppDateField
        value={value ? String(value) : ""}
        onChange={(next) => onChange(next || null)}
        triggerClassName="h-10 rounded-lg"
      />
    )
  }
  return (
    <AppInput
      type={field.type === "number" ? "number" : "text"}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(event) =>
        onChange(
          event.target.value === ""
            ? null
            : field.type === "number"
              ? Number(event.target.value)
              : event.target.value
        )
      }
      wrapperClassName="w-full"
      className="h-9 rounded-lg text-sm"
    />
  )
}

// حقول إضافية: the sales team's own fields on every lead.
export function LeadCustomFieldsCard({
  lead,
  fields,
  onFieldsChange,
  onSave,
}: {
  lead: CrmLead
  fields: CrmCustomField[]
  onFieldsChange: (fields: CrmCustomField[]) => void
  onSave: Save
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, CrmFieldValue>>({})
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState(false)

  async function save() {
    setSaving(true)
    try {
      if (await onSave({ customFields: draft }, "حُفظت الحقول.")) setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">حقول إضافية</h2>
        <div className="flex items-center gap-1">
          {fields.length && !editing ? (
            <button
              type="button"
              aria-label="تعديل"
              onClick={() => {
                setDraft({ ...lead.customFields })
                setEditing(true)
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="إدارة الحقول"
            onClick={() => setManaging(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>
      {fields.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border/70 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            أضف حقولًا خاصة بفريق المبيعات، مثل المدينة أو عدد الفروع.
          </p>
          <AppButton
            variant="outline"
            className="mt-3 h-9 rounded-lg"
            icon={<Plus className="size-4" />}
            onClick={() => setManaging(true)}
          >
            إضافة حقل
          </AppButton>
        </div>
      ) : editing ? (
        <div className="mt-3 space-y-3">
          {fields.map((field) => (
            <label key={field.id} className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                {field.label}
              </span>
              <FieldEditor
                field={field}
                value={draft[field.id] ?? null}
                onChange={(value) => setDraft((current) => ({ ...current, [field.id]: value }))}
              />
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <AppButton
              className="h-9 flex-1 rounded-lg"
              loading={saving}
              onClick={() => void save()}
            >
              حفظ
            </AppButton>
            <AppButton
              variant="outline"
              className="h-9 flex-1 rounded-lg"
              onClick={() => setEditing(false)}
            >
              إلغاء
            </AppButton>
          </div>
        </div>
      ) : (
        <dl className="mt-3 space-y-3 text-sm">
          {fields.map((field) => (
            <div key={field.id} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="truncate font-semibold text-foreground" dir="auto">
                {displayValue(field, lead.customFields[field.id])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <CustomFieldsDialog
        open={managing}
        fields={fields}
        onClose={() => setManaging(false)}
        onChange={onFieldsChange}
      />
    </AppCard>
  )
}

// Adds, renames and removes the custom lead fields (shared by the whole sales team).
function CustomFieldsDialog({
  open,
  fields,
  onClose,
  onChange,
}: {
  open: boolean
  fields: CrmCustomField[]
  onClose: () => void
  onChange: (fields: CrmCustomField[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [type, setType] = useState<CrmFieldType>("text")
  const [options, setOptions] = useState("")
  const [saving, setSaving] = useState(false)

  function reset() {
    setEditingId(null)
    setLabel("")
    setType("text")
    setOptions("")
  }

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    try {
      onChange(
        await crmService.saveField(editingId, {
          label: label.trim(),
          type,
          options:
            type === "select"
              ? options
                  .split(/[,،\n]/)
                  .map((option) => option.trim())
                  .filter(Boolean)
              : undefined,
        })
      )
      toast.success(editingId ? "حُفظ الحقل." : "أُضيف الحقل.")
      reset()
    } catch {
      toast.error(type === "select" ? "أضف خيارًا واحدًا على الأقل." : "تعذر حفظ الحقل.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          onClose()
        }
      }}
      title={<span dir="rtl">حقول العملاء المحتملين</span>}
      contentClassName="[direction:rtl] max-w-[34rem] gap-5 p-6"
    >
      <div dir="rtl" className="flex flex-col gap-4">
        {fields.length ? (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{field.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {FIELD_TYPE_LABEL[field.type]}
                    {field.options.length ? ` • ${field.options.join("، ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="تعديل"
                    onClick={() => {
                      setEditingId(field.id)
                      setLabel(field.label)
                      setType(field.type)
                      setOptions(field.options.join("، "))
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="حذف"
                    onClick={() =>
                      crmService
                        .deleteField(field.id)
                        .then(onChange)
                        .catch(() => toast.error("تعذر حذف الحقل."))
                    }
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="rounded-xl bg-muted/40 p-4">
          <p className="text-sm font-bold">{editingId ? "تعديل الحقل" : "حقل جديد"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <AppInput
              value={label}
              placeholder="اسم الحقل (مثل: المدينة)"
              onChange={(event) => setLabel(event.target.value)}
              wrapperClassName="w-full"
              className="h-10 rounded-[10px]"
            />
            <AppSelect value={type} onValueChange={(value) => setType(value as CrmFieldType)}>
              <AppSelectTrigger className="h-10 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {(Object.keys(FIELD_TYPE_LABEL) as CrmFieldType[]).map((key) => (
                  <AppSelectItem key={key} value={key}>
                    {FIELD_TYPE_LABEL[key]}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
            {type === "select" ? (
              <AppInput
                value={options}
                placeholder="الخيارات، مفصولة بفاصلة: الرياض، جدة، الدمام"
                onChange={(event) => setOptions(event.target.value)}
                wrapperClassName="w-full sm:col-span-2"
                className="h-10 rounded-[10px]"
              />
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <AppButton className="h-9 rounded-lg" loading={saving} onClick={() => void save()}>
              {editingId ? "حفظ" : "إضافة الحقل"}
            </AppButton>
            {editingId ? (
              <AppButton variant="outline" className="h-9 rounded-lg" onClick={reset}>
                إلغاء
              </AppButton>
            ) : null}
          </div>
        </div>
      </div>
    </AppDialog>
  )
}

// مصدر الحملة: the ad or site that first brought the lead, and its latest visit.
export function LeadAttributionCard({ lead }: { lead: CrmLead }) {
  const attribution = lead.attribution
  const first = attribution?.first
  const last = attribution?.last
  const platform = leadPlatform(lead)
  const rows: [string, string | null | undefined][] = [
    ["المنصة", platformLabel(platform)],
    ["الحملة", first?.campaign],
    ["الإعلان", first?.content],
    ["الوسيط", first?.medium],
    ["الكلمة", first?.term],
    ["الموقع المُحيل", first?.referrer],
    ["صفحة الهبوط", first?.landingPage],
    ["أول زيارة", first?.at ? formatDateTime(first.at) : null],
  ]
  const lastDiffers =
    last && first && (last.source !== first.source || last.campaign !== first.campaign)
  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <h2 className="text-base font-bold">مصدر الحملة</h2>
      {!attribution ? (
        <p className="mt-2 text-sm text-muted-foreground">
          لا يوجد مصدر مسجّل (أُضيف يدويًا أو قبل تتبع الحملات).
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-3 text-sm">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd
                    className="truncate font-semibold text-foreground"
                    dir="auto"
                    title={value ?? ""}
                  >
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
          {first?.clickId ? (
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              جاء من نقرة على إعلان {platformLabel(first.clickIdType ?? platform)}
            </p>
          ) : null}
          {lastDiffers && last ? (
            <p className="mt-3 text-xs text-muted-foreground">
              آخر زيارة: {platformLabel((last.source || last.referrer || "direct").toLowerCase())}
              {last.campaign ? ` • ${last.campaign}` : ""} • {formatDateTime(last.at)}
            </p>
          ) : null}
        </>
      )}
    </AppCard>
  )
}
