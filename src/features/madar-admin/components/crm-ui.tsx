"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTextarea,
} from "@/components/app"

import { crmService } from "../services"
import type { CrmLead, CrmLeadInput, CrmPerson, CrmSource, CrmStage, CrmStageDef } from "../types"

// The colors a stage can take (custom stages pick one).
export const STAGE_COLORS: Record<string, { label: string; chip: string; dot: string }> = {
  blue: { label: "أزرق", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  sky: { label: "سماوي", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  violet: { label: "بنفسجي", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  amber: { label: "كهرماني", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  emerald: { label: "أخضر", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rose: { label: "أحمر", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  teal: { label: "فيروزي", chip: "bg-teal-50 text-teal-700", dot: "bg-teal-500" },
  orange: { label: "برتقالي", chip: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  pink: { label: "وردي", chip: "bg-pink-50 text-pink-700", dot: "bg-pink-500" },
  slate: { label: "رمادي", chip: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
}

// The built-in stages, until the live list (with the team's custom stages) arrives.
const DEFAULT_STAGES: CrmStageDef[] = [
  { key: "new", label: "جديد", color: "blue", position: 100, system: true },
  { key: "contacted", label: "تم التواصل", color: "sky", position: 200, system: true },
  { key: "meeting", label: "اجتماع محجوز", color: "violet", position: 300, system: true },
  { key: "trial", label: "تجربة", color: "amber", position: 400, system: true },
  { key: "won", label: "تم الفوز", color: "emerald", position: 1000, system: true },
  { key: "lost", label: "خسارة", color: "rose", position: 1001, system: true },
]

// One stage list for every CRM page, loaded once and replaced whenever it's edited.
let stageList = DEFAULT_STAGES
let stagesRequested = false
const stageListeners = new Set<() => void>()

export function setCrmStages(next: CrmStageDef[]) {
  stageList = next
  stageListeners.forEach((listener) => listener())
}

function subscribeStages(listener: () => void) {
  stageListeners.add(listener)
  return () => stageListeners.delete(listener)
}

export function useCrmStages(): CrmStageDef[] {
  const stages = useSyncExternalStore(
    subscribeStages,
    () => stageList,
    () => DEFAULT_STAGES
  )
  useEffect(() => {
    if (stagesRequested) return
    stagesRequested = true
    crmService
      .listStages()
      .then(setCrmStages)
      .catch(() => {
        stagesRequested = false
      })
  }, [])
  return stages
}

export function stageColor(color: string) {
  return STAGE_COLORS[color] ?? STAGE_COLORS.slate
}

// A stage's label and colors, built-in or custom.
export function stageMeta(key: CrmStage) {
  const stage = stageList.find((entry) => entry.key === key)
  const { chip, dot } = stageColor(stage?.color ?? "slate")
  return { label: stage?.label ?? key, chip, dot }
}

export const SOURCE_LABEL: Record<CrmSource, string> = {
  website: "نموذج الموقع",
  signup: "تسجيل جديد",
  manual: "يدوي",
  booking: "رابط الحجز",
}

// Ad platforms and sites, as people say them.
const PLATFORM_LABEL: Record<string, string> = {
  snapchat: "سناب شات",
  snap: "سناب شات",
  google: "جوجل",
  meta: "ميتا",
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  x: "إكس",
  twitter: "إكس",
  linkedin: "لينكدإن",
  microsoft: "مايكروسوفت",
  whatsapp: "واتساب",
  email: "البريد",
  direct: "مباشر",
}

// The platform that first brought a lead (UTM source, else referring site, else direct).
export function leadPlatform(lead: Pick<CrmLead, "attribution">) {
  const first = lead.attribution?.first
  return (first?.source || first?.referrer || "direct").toLowerCase()
}

export function platformLabel(platform: string) {
  const key = platform.toLowerCase().replace(/^www\./, "")
  return PLATFORM_LABEL[key] ?? PLATFORM_LABEL[key.split(".")[0]] ?? platform
}

// Where a lead's meeting was booked.
export const MEETING_SOURCE_LABEL: Record<string, string> = {
  website_form: "من نموذج الموقع",
  booking_link: "من رابط الحجز",
}

export function StageBadge({ stage, className }: { stage: CrmStage; className?: string }) {
  // Re-renders when the stage list loads or changes.
  useCrmStages()
  const meta = stageMeta(stage)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        meta.chip,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

export function SourceChip({ source }: { source: CrmSource }) {
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-muted-foreground">
      {SOURCE_LABEL[source]}
    </span>
  )
}

export function OwnerAvatar({
  person,
  size = "sm",
}: {
  person: CrmPerson | null
  size?: "sm" | "md"
}) {
  if (!person) {
    return (
      <span
        title="غير مسند"
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground",
          size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs"
        )}
      >
        —
      </span>
    )
  }
  const initials = person.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  return (
    <span
      title={person.name}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 font-bold text-white",
        size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs"
      )}
    >
      {initials}
    </span>
  )
}

export function formatSarAmount(amount: number | null) {
  if (amount === null) return "—"
  return `SAR ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)}`
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso))
}

export function isOverdue(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

// wa.me needs the full international number: Saudi 05XXXXXXXX → 9665XXXXXXXX.
export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "")
  const international = digits.startsWith("05")
    ? `966${digits.slice(1)}`
    : digits.startsWith("5") && digits.length === 9
      ? `966${digits}`
      : digits.replace(/^00/, "")
  return `https://wa.me/${international}`
}

// The staff who can own leads, loaded once per page.
export function useCrmOwners() {
  const [owners, setOwners] = useState<CrmPerson[]>([])
  useEffect(() => {
    crmService
      .owners()
      .then(setOwners)
      .catch(() => setOwners([]))
  }, [])
  return owners
}

export const UNASSIGNED = "unassigned"

// Add a lead by hand, or edit one's details.
export function LeadFormDialog({
  open,
  lead,
  owners,
  onClose,
  onSave,
}: {
  open: boolean
  lead: CrmLead | null
  owners: CrmPerson[]
  onClose: () => void
  onSave: (input: CrmLeadInput) => Promise<void>
}) {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    expectedValue: "",
    ownerUserId: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm({
      companyName: lead?.companyName ?? "",
      contactName: lead?.contactName ?? "",
      phone: lead?.phone ?? "",
      email: lead?.email ?? "",
      expectedValue: lead?.expectedValue != null ? String(lead.expectedValue) : "",
      ownerUserId: lead?.owner?.id ?? "",
    })
  }, [open, lead])

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save() {
    if (form.companyName.trim().length < 2) {
      setError("اكتب اسم الشركة.")
      return
    }
    const value = form.expectedValue.trim() ? Number(form.expectedValue) : null
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("القيمة المتوقعة يجب أن تكون رقمًا.")
      return
    }
    setSaving(true)
    try {
      await onSave({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        expectedValue: value,
        ...(form.ownerUserId
          ? { ownerUserId: form.ownerUserId === UNASSIGNED ? null : form.ownerUserId }
          : {}),
      })
      onClose()
    } catch {
      setError("تعذر الحفظ. تأكد من البيانات وحاول مرة أخرى.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={<span dir="rtl">{lead ? "تعديل بيانات العميل المحتمل" : "إضافة عميل محتمل"}</span>}
      contentClassName="[direction:rtl] max-w-[34rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            className="h-11 flex-1 rounded-[10px]"
            loading={saving}
            onClick={() => void save()}
          >
            {lead ? "حفظ التعديلات" : "إضافة"}
          </AppButton>
          <AppButton variant="outline" className="h-11 flex-1 rounded-[10px]" onClick={onClose}>
            إلغاء
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold">
            اسم الشركة <span className="text-rose-500">*</span>
          </span>
          <AppInput value={form.companyName} onChange={set("companyName")} className="h-11" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">اسم الشخص</span>
          <AppInput value={form.contactName} onChange={set("contactName")} className="h-11" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">رقم الجوال</span>
          <AppInput
            value={form.phone}
            onChange={set("phone")}
            dir="ltr"
            className="h-11 text-right"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">البريد الإلكتروني</span>
          <AppInput
            value={form.email}
            onChange={set("email")}
            dir="ltr"
            className="h-11 text-right"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">القيمة المتوقعة (ر.س)</span>
          <AppInput
            value={form.expectedValue}
            onChange={set("expectedValue")}
            inputMode="decimal"
            dir="ltr"
            className="h-11 text-right"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold">المسؤول</span>
          <AppSelect
            value={form.ownerUserId || (lead ? UNASSIGNED : "")}
            onValueChange={(value) => setForm((current) => ({ ...current, ownerUserId: value }))}
          >
            <AppSelectTrigger className="h-11 w-full">
              <AppSelectValue placeholder={lead ? "غير مسند" : "أنا (افتراضي)"} />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value={UNASSIGNED}>غير مسند</AppSelectItem>
              {owners.map((owner) => (
                <AppSelectItem key={owner.id} value={owner.id}>
                  {owner.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </label>
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 sm:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
    </AppDialog>
  )
}

// Moving a lead to "lost" asks why.
export function LostReasonDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) setReason("")
  }, [open])
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={<span dir="rtl">سبب الخسارة</span>}
      description={<span dir="rtl">ما سبب خسارة هذا العميل؟ يساعدنا ذلك في تحسين المبيعات.</span>}
      contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            className="h-11 flex-1 rounded-[10px] bg-rose-600 hover:bg-rose-700"
            loading={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onConfirm(reason.trim())
                onClose()
              } finally {
                setSaving(false)
              }
            }}
          >
            تسجيل كخسارة
          </AppButton>
          <AppButton variant="outline" className="h-11 flex-1 rounded-[10px]" onClick={onClose}>
            إلغاء
          </AppButton>
        </div>
      }
    >
      <AppTextarea
        dir="rtl"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="مثال: السعر مرتفع، اختار نظامًا آخر، لا يحتاج الآن..."
        rows={4}
      />
    </AppDialog>
  )
}
