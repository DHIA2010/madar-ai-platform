"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileText,
  Mail,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppConfirmDialog,
  AppDateField,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTextarea,
} from "@/components/app"

import { crmService, formatDate, formatRelative } from "../services"
import type {
  CrmActivity,
  CrmInvoice,
  CrmLeadDetail,
  CrmLeadInput,
  CrmLoggableActivity,
  CrmPerson,
  CrmQuote,
} from "../types"
import { useCrmCustomFields } from "./crm-filters"
import { LeadAttributionCard, LeadCustomFieldsCard, LeadInterestsCard } from "./crm-lead-extras"
import {
  formatDateTime,
  formatSarAmount,
  isOverdue,
  LeadFormDialog,
  LostReasonDialog,
  MEETING_SOURCE_LABEL,
  OwnerAvatar,
  SourceChip,
  StageBadge,
  stageMeta,
  UNASSIGNED,
  useCrmOwners,
  useCrmStages,
  whatsappUrl,
} from "./crm-ui"

const COMPOSER_TABS: {
  kind: CrmLoggableActivity
  label: string
  icon: LucideIcon
  placeholder: string
}[] = [
  { kind: "note", label: "ملاحظة", icon: NotebookPen, placeholder: "اكتب ملاحظة عن العميل..." },
  { kind: "call", label: "مكالمة", icon: Phone, placeholder: "ماذا دار في المكالمة؟" },
  {
    kind: "whatsapp",
    label: "واتساب",
    icon: MessageCircle,
    placeholder: "ملخص المحادثة على واتساب...",
  },
  { kind: "email", label: "بريد", icon: Mail, placeholder: "ملخص البريد المرسل أو المستلم..." },
]

const ACTIVITY_ICON: Record<CrmActivity["kind"], { icon: LucideIcon; tone: string }> = {
  created: { icon: Sparkles, tone: "bg-blue-50 text-blue-600" },
  note: { icon: NotebookPen, tone: "bg-slate-100 text-slate-600" },
  call: { icon: Phone, tone: "bg-sky-50 text-sky-600" },
  whatsapp: { icon: MessageCircle, tone: "bg-emerald-50 text-emerald-600" },
  email: { icon: Mail, tone: "bg-indigo-50 text-indigo-600" },
  meeting: { icon: CalendarClock, tone: "bg-violet-50 text-violet-600" },
  stage: { icon: CircleDot, tone: "bg-amber-50 text-amber-600" },
  owner: { icon: UserRound, tone: "bg-slate-100 text-slate-600" },
  task: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
  signup: { icon: BadgeCheck, tone: "bg-blue-50 text-blue-600" },
  payment: { icon: Wallet, tone: "bg-emerald-50 text-emerald-600" },
  quote: { icon: FileText, tone: "bg-indigo-50 text-indigo-600" },
  invoice: { icon: ReceiptText, tone: "bg-emerald-50 text-emerald-600" },
  call_request: { icon: PhoneCall, tone: "bg-sky-50 text-sky-600" },
}

const QUOTE_ACTION: Record<string, string> = {
  created: "أنشأ عرض السعر",
  sent: "أرسل عرض السعر",
  accepted: "قبِل العميل عرض السعر",
  rejected: "رفض العميل عرض السعر",
  draft: "أعاد عرض السعر إلى مسودة",
}
const INVOICE_ACTION: Record<string, string> = {
  created: "أصدر الفاتورة",
  paid: "دُفعت الفاتورة",
  void: "ألغى الفاتورة",
  activated: "فُعّلت باقات الفاتورة على حساب العميل",
  account_created: "أنشأ حساب العميل في مدار وأرسل رسالة الترحيب",
  account_linked: "ربط حساب العميل الحالي في مدار",
}

const SOURCE_CREATED: Record<string, string> = {
  website: "طلب تواصل من نموذج موقع مدار",
  signup: "سجّل حسابًا جديدًا في مدار",
  manual: "أُضيف يدويًا",
  booking: "حجز اجتماعًا مباشرة من رابط الحجز",
}

// One timeline entry in words.
function describe(activity: CrmActivity, owners: CrmPerson[]): string {
  const meta = activity.meta
  switch (activity.kind) {
    case "created":
      return SOURCE_CREATED[String(meta.source)] ?? "أُضيف العميل المحتمل"
    case "note":
      return "ملاحظة"
    case "call":
      return "مكالمة"
    case "whatsapp":
      return "محادثة واتساب"
    case "email":
      return "بريد إلكتروني"
    case "call_request":
      return `طلب مكالمة هاتفية من نموذج الموقع: ${formatDateTime(String(meta.callAt ?? ""))}`
    case "meeting": {
      const when = formatDateTime(String(meta.startTime ?? ""))
      const reason = meta.reason ? ` — ${String(meta.reason)}` : ""
      if (meta.action === "cancelled") return `ألغى الاجتماع: ${when}${reason}`
      if (meta.action === "rejected") return `رُفض طلب الاجتماع: ${when}${reason}`
      const via =
        meta.via === "booking_link"
          ? "من رابط الحجز"
          : meta.via === "website_form"
            ? "من نموذج الموقع"
            : "عبر Cal.com"
      return meta.pending
        ? `طلب اجتماعًا ${via} (بانتظار التأكيد): ${when}`
        : `حجز اجتماعًا ${via}: ${when}`
    }
    case "stage": {
      const to = stageMeta(String(meta.to)).label
      const from = meta.from ? stageMeta(String(meta.from)).label : null
      return from ? `نُقل من «${from}» إلى «${to}»` : `نُقل إلى «${to}»`
    }
    case "owner": {
      const person = owners.find((owner) => owner.id === meta.to)
      return meta.to ? `أُسند إلى ${person?.name ?? "عضو في الفريق"}` : "أُلغي إسناده"
    }
    case "task":
      return "أُنجزت متابعة"
    case "signup":
      return "سجّل حسابًا في مدار"
    case "payment":
      return `دفع ${formatSarAmount(Number(meta.amount ?? 0))} اشتراكًا`
    case "quote":
      return `${QUOTE_ACTION[String(meta.action)] ?? "عرض سعر"} ${String(meta.number ?? "")}`
    case "invoice": {
      const action = INVOICE_ACTION[String(meta.action)] ?? "فاتورة"
      const how =
        meta.action === "paid" ? (meta.method === "card" ? " (بطاقة)" : " (تحويل بنكي)") : ""
      return `${action} ${String(meta.number ?? "")}${how}`
    }
  }
}

// A due date for a new follow-up: tomorrow at 10:00 local time, as a datetime-local value.
// The follow-up times on offer: every half hour, 7:00 to 23:30.
const TASK_TIMES = Array.from({ length: 34 }, (_, index) => {
  const minutes = 7 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`
})

function tomorrowAtTen() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(10, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`
}

export function MadarAdminCrmLead() {
  const leadId = useSearchParams().get("id") ?? ""
  const router = useRouter()
  const owners = useCrmOwners()
  const stages = useCrmStages()
  const stageKeys = stages.map((stage) => stage.key)
  const [customFields, setCustomFields] = useCrmCustomFields()
  const [detail, setDetail] = useState<CrmLeadDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [composerKind, setComposerKind] = useState<CrmLoggableActivity>("note")
  const [composerText, setComposerText] = useState("")
  const [savingActivity, setSavingActivity] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState(tomorrowAtTen)
  const [taskAssignee, setTaskAssignee] = useState("")
  const [savingTask, setSavingTask] = useState(false)
  const [editing, setEditing] = useState(false)
  const [losing, setLosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [documents, setDocuments] = useState<{ quotes: CrmQuote[]; invoices: CrmInvoice[] } | null>(
    null
  )

  // The lead's quotes and invoices.
  useEffect(() => {
    if (!leadId) return
    let active = true
    Promise.all([crmService.listQuotes({ leadId }), crmService.listInvoices({ leadId })])
      .then(([quotes, invoices]) => {
        if (active) setDocuments({ quotes, invoices })
      })
      .catch(() => {
        if (active) setDocuments({ quotes: [], invoices: [] })
      })
    return () => {
      active = false
    }
  }, [leadId])

  useEffect(() => {
    if (!leadId) return
    let active = true
    crmService
      .getLead(leadId)
      .then((result) => {
        if (active) setDetail(result)
      })
      .catch(() => {
        if (active) setMissing(true)
      })
    return () => {
      active = false
    }
  }, [leadId])

  async function saveLead(patch: Partial<CrmLeadInput>, success?: string) {
    try {
      setDetail(await crmService.updateLead(leadId, patch))
      if (success) toast.success(success)
      return true
    } catch {
      toast.error("تعذر الحفظ، حاول مرة أخرى.")
      return false
    }
  }

  async function run(action: () => Promise<CrmLeadDetail>, success?: string) {
    try {
      setDetail(await action())
      if (success) toast.success(success)
    } catch {
      toast.error("تعذر الحفظ، حاول مرة أخرى.")
    }
  }

  if (missing || !leadId) {
    return (
      <div dir="rtl" className="rounded-2xl border border-border/60 bg-card p-10 text-center">
        <p className="text-lg font-bold">لم يُعثر على العميل المحتمل</p>
        <Link
          href={ROUTES.madarAdminCrm}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          العودة إلى العملاء المحتملين
        </Link>
      </div>
    )
  }
  if (!detail) {
    return <div dir="rtl" className="h-96 animate-pulse rounded-2xl bg-muted" />
  }

  const { lead, activities, tasks, organization } = detail
  const openTasks = tasks.filter((task) => !task.doneAt)
  const doneTasks = tasks.filter((task) => task.doneAt)
  const composer = COMPOSER_TABS.find((tab) => tab.kind === composerKind) ?? COMPOSER_TABS[0]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <Link
        href={ROUTES.madarAdminCrm}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        العملاء المحتملون
      </Link>

      <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{lead.companyName}</h1>
              <StageBadge stage={lead.stage} />
              <SourceChip source={lead.source} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              أُضيف {formatRelative(lead.createdAt)} • آخر تغيير للمرحلة{" "}
              {formatRelative(lead.stageChangedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.phone ? (
              <>
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border px-4 text-sm font-semibold hover:bg-muted"
                >
                  <Phone className="size-4" />
                  اتصال
                </a>
                <a
                  href={whatsappUrl(lead.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="size-4" />
                  واتساب
                </a>
              </>
            ) : null}
            {lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                <Mail className="size-4" />
                بريد
              </a>
            ) : null}
            <AppButton
              icon={<Pencil className="size-4" />}
              variant="outline"
              className="h-10 gap-2 rounded-[10px]"
              onClick={() => setEditing(true)}
            >
              تعديل
            </AppButton>
            <AppButton
              variant="ghost"
              className="h-10 rounded-[10px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              aria-label="حذف"
              onClick={() => setDeleting(true)}
            >
              <Trash2 className="size-4" />
            </AppButton>
          </div>
        </div>

        {/* The stages, clickable: moving to "lost" asks why. */}
        <div
          className="mt-5 grid grid-cols-3 gap-1.5 sm:[grid-template-columns:repeat(var(--stages),minmax(0,1fr))]"
          style={{ "--stages": stages.length } as React.CSSProperties}
        >
          {stageKeys.map((stage, index) => {
            const current = stageKeys.indexOf(lead.stage)
            const reached = lead.stage !== "lost" && stage !== "lost" && index <= current
            const active = lead.stage === stage
            return (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  if (active) return
                  if (stage === "lost") setLosing(true)
                  else
                    void run(
                      () => crmService.changeStage(lead.id, stage),
                      `نُقل إلى «${stageMeta(stage).label}»`
                    )
                }}
                className={cn(
                  "rounded-lg px-2 py-2.5 text-xs font-bold transition-colors",
                  active
                    ? stage === "lost"
                      ? "bg-rose-600 text-white"
                      : stage === "won"
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-primary-foreground"
                    : reached
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {stageMeta(stage).label}
              </button>
            )
          })}
        </div>
        {lead.stage === "lost" && lead.lostReason ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            سبب الخسارة: {lead.lostReason}
          </p>
        ) : null}
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <AppCard className="rounded-2xl border-border/60 p-4 shadow-sm">
            <div className="flex flex-wrap gap-1.5">
              {COMPOSER_TABS.map((tab) => (
                <button
                  key={tab.kind}
                  type="button"
                  onClick={() => setComposerKind(tab.kind)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                    composerKind === tab.kind
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <AppTextarea
              dir="rtl"
              rows={3}
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              placeholder={composer.placeholder}
              className="mt-3"
            />
            <div className="mt-3 flex justify-end">
              <AppButton
                className="h-10 rounded-[10px]"
                loading={savingActivity}
                disabled={!composerText.trim()}
                onClick={async () => {
                  setSavingActivity(true)
                  await run(
                    () => crmService.logActivity(lead.id, composerKind, composerText.trim()),
                    "حُفظ في السجل."
                  )
                  setComposerText("")
                  setSavingActivity(false)
                }}
              >
                حفظ في السجل
              </AppButton>
            </div>
          </AppCard>

          <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
            <h2 className="text-base font-bold">السجل</h2>
            <ol className="mt-4 space-y-4">
              {activities.map((activity) => {
                const { icon: Icon, tone } = ACTIVITY_ICON[activity.kind]
                return (
                  <li key={activity.id} className="flex gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        tone
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {describe(activity, owners)}
                        </p>
                        <span
                          className="text-xs text-muted-foreground"
                          title={formatDateTime(activity.createdAt)}
                        >
                          {formatRelative(activity.createdAt)}
                        </span>
                      </div>
                      {activity.body ? (
                        <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                          {activity.body}
                        </p>
                      ) : null}
                      {activity.actor ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          بواسطة {activity.actor.name}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          </AppCard>
        </div>

        <div className="flex flex-col gap-4">
          <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
            <h2 className="text-base font-bold">عروض الأسعار والفواتير</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={ROUTES.madarAdminCrmNewQuote(lead.id)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-4 shrink-0" />
                عرض سعر
              </Link>
              <Link
                href={ROUTES.madarAdminCrmNewInvoice(lead.id)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-border px-3 text-sm font-semibold whitespace-nowrap hover:bg-muted"
              >
                <Plus className="size-4 shrink-0" />
                فاتورة
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {(documents?.invoices ?? []).map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={ROUTES.madarAdminCrmInvoice(invoice.id)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 p-3 hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2">
                      <ReceiptText className="size-4 text-emerald-600" />
                      <span className="font-mono text-sm font-bold">{invoice.number}</span>
                    </span>
                    <span className="text-xs font-semibold">
                      {formatSarAmount(invoice.totals.total)} •{" "}
                      <span
                        className={
                          invoice.status === "paid"
                            ? "text-emerald-700"
                            : invoice.status === "void"
                              ? "text-muted-foreground"
                              : "text-amber-700"
                        }
                      >
                        {invoice.status === "paid"
                          ? "مدفوعة"
                          : invoice.status === "void"
                            ? "ملغاة"
                            : "غير مدفوعة"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {(documents?.quotes ?? [])
                .filter((quote) => quote.status !== "converted")
                .map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={ROUTES.madarAdminCrmQuote(quote.id)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/60 p-3 hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 text-indigo-600" />
                        <span className="font-mono text-sm font-bold">{quote.number}</span>
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formatSarAmount(quote.totals.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              {documents && documents.quotes.length === 0 && documents.invoices.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                  لا توجد عروض أسعار بعد.
                </li>
              ) : null}
            </ul>
          </AppCard>

          <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
            <h2 className="text-base font-bold">المتابعات</h2>
            <div className="mt-3 space-y-2">
              <AppInput
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="مثال: إرسال عرض السعر"
                className="h-10"
              />
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <AppDateField
                    value={taskDue.slice(0, 10)}
                    onChange={(day) => day && setTaskDue(`${day}T${taskDue.slice(11, 16)}`)}
                    triggerClassName="h-10"
                  />
                </div>
                <AppSelect
                  value={taskDue.slice(11, 16)}
                  onValueChange={(time) => setTaskDue(`${taskDue.slice(0, 10)}T${time}`)}
                >
                  <AppSelectTrigger className="h-10 w-[96px]" dir="ltr">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent className="max-h-64">
                    {TASK_TIMES.map((time) => (
                      <AppSelectItem key={time} value={time}>
                        {time}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <div className="flex gap-2">
                <AppSelect value={taskAssignee || "me"} onValueChange={setTaskAssignee}>
                  <AppSelectTrigger className="h-10 w-full">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="me">أنا</AppSelectItem>
                    {owners.map((owner) => (
                      <AppSelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <AppButton
                className="h-10 w-full gap-2 rounded-[10px]"
                loading={savingTask}
                disabled={taskTitle.trim().length < 2 || !taskDue}
                onClick={async () => {
                  setSavingTask(true)
                  await run(
                    () =>
                      crmService.createTask(lead.id, {
                        title: taskTitle.trim(),
                        dueAt: new Date(taskDue).toISOString(),
                        ...(taskAssignee && taskAssignee !== "me"
                          ? { assigneeUserId: taskAssignee }
                          : {}),
                      }),
                    "أُضيفت المتابعة."
                  )
                  setTaskTitle("")
                  setTaskDue(tomorrowAtTen())
                  setSavingTask(false)
                }}
                icon={<Plus className="size-4" />}
              >
                إضافة متابعة
              </AppButton>
            </div>
            <ul className="mt-4 space-y-2">
              {[...openTasks, ...doneTasks].map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 p-3"
                >
                  <AppCheckbox
                    checked={Boolean(task.doneAt)}
                    onCheckedChange={(checked) =>
                      void run(() => crmService.setTaskDone(task.id, checked === true))
                    }
                    className="mt-0.5"
                    aria-label="منجزة"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        task.doneAt ? "text-muted-foreground line-through" : "text-foreground"
                      )}
                    >
                      {task.title}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        !task.doneAt && isOverdue(task.dueAt)
                          ? "font-semibold text-rose-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDateTime(task.dueAt)}
                      {task.assignee ? ` • ${task.assignee.name}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="حذف المتابعة"
                    onClick={() => void run(() => crmService.deleteTask(task.id))}
                    className="text-muted-foreground hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
              {tasks.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                  لا توجد متابعات بعد.
                </li>
              ) : null}
            </ul>
          </AppCard>

          <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
            <h2 className="text-base font-bold">البيانات</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {(
                [
                  ["اسم الشخص", lead.contactName ?? "—"],
                  ["الجوال", lead.phone ?? "—"],
                  ["البريد", lead.email ?? "—"],
                  ["القيمة المتوقعة", formatSarAmount(lead.expectedValue)],
                  ["المدفوع", formatSarAmount(lead.wonValue)],
                  ["الاجتماع", lead.meetingAt ? formatDateTime(lead.meetingAt) : "—"],
                  ["المكالمة المطلوبة", lead.callAt ? formatDateTime(lead.callAt) : "—"],
                  [
                    "مصدر الحجز",
                    lead.meetingSource ? MEETING_SOURCE_LABEL[lead.meetingSource] : "—",
                  ],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-semibold text-foreground" dir="auto">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">المسؤول</dt>
                <dd>
                  <AppSelect
                    value={lead.owner?.id ?? UNASSIGNED}
                    onValueChange={(value) =>
                      void run(
                        () =>
                          crmService.updateLead(lead.id, {
                            ownerUserId: value === UNASSIGNED ? null : value,
                          }),
                        "تم تغيير المسؤول."
                      )
                    }
                  >
                    <AppSelectTrigger className="h-9 w-[170px]">
                      <span className="flex items-center gap-2">
                        <OwnerAvatar person={lead.owner} />
                        <AppSelectValue />
                      </span>
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
                </dd>
              </div>
            </dl>
          </AppCard>

          <LeadAttributionCard lead={lead} />
          <LeadInterestsCard lead={lead} onSave={saveLead} />
          <LeadCustomFieldsCard
            lead={lead}
            fields={customFields}
            onFieldsChange={setCustomFields}
            onSave={saveLead}
          />

          {organization ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <h2 className="text-base font-bold">حسابه في مدار</h2>
              <p className="mt-2 text-sm font-semibold text-foreground">{organization.name}</p>
              <p className="text-xs text-muted-foreground">
                سجّل في {formatDate(organization.createdAt)}
              </p>
              <Link
                href={ROUTES.madarAdminCustomer(organization.id)}
                className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
              >
                عرضه في العملاء
              </Link>
            </AppCard>
          ) : null}
        </div>
      </div>

      <LeadFormDialog
        open={editing}
        lead={lead}
        owners={owners}
        onClose={() => setEditing(false)}
        onSave={async (input) => {
          setDetail(await crmService.updateLead(lead.id, input))
          toast.success("حُفظت التعديلات.")
        }}
      />
      <LostReasonDialog
        open={losing}
        onClose={() => setLosing(false)}
        onConfirm={async (reason) => {
          await run(() => crmService.changeStage(lead.id, "lost", reason || null), "سُجّل كخسارة.")
        }}
      />
      <AppConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={<span dir="rtl">حذف العميل المحتمل</span>}
        description={<span dir="rtl">سيُحذف {lead.companyName} وسجله ومتابعاته نهائيًا.</span>}
        confirmLabel="حذف"
        confirmTone="destructive"
        cancelLabel="إلغاء"
        onConfirm={async () => {
          await crmService.deleteLead(lead.id)
          toast.success("حُذف العميل المحتمل.")
          router.push(ROUTES.madarAdminCrm)
        }}
      />
    </div>
  )
}
