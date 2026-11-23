"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  CheckCheck,
  ImagePlus,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Pencil,
  Plus,
  Reply,
  Trash2,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDialog, AppInput } from "@/components/app"

import { formatRelative } from "../services"
import {
  crmOutreachService,
  type OutreachCampaign,
  type OutreachCampaignInput,
  type OutreachLead,
  type OutreachStatus,
} from "../services/crm-outreach.service"
import { SOURCE_LABEL, StageBadge } from "./crm-ui"

const VARIABLES = ["{الاسم}", "{النشاط}", "{مهتم}", "{إيقاف}", "{الرابط}"]
const BLANK: OutreachCampaignInput = {
  name: "",
  message:
    "مرحبًا {الاسم} 👋\nمعك فريق مدار. نظام سعودي واحد يدير لك البيع والمخزون والحجوزات وتقارير يومك، بدل برامج متفرقة.\n\nمهتم؟ اضغط هنا ونتواصل معك:\n{مهتم}\n\nغير مهتم؟ اضغط هنا لإيقاف الرسائل:\n{إيقاف}",
  linkUrl: "https://www.madar.my/contact-sales/",
  linkTitle: "مدار",
  linkDescription: "نظام واحد يدير نشاطك كله",
  imageUrl: null,
  dailyLimit: 20,
}
const STATUS_TABS: { key: OutreachStatus; label: string }[] = [
  { key: "pending", label: "بانتظار الإرسال" },
  { key: "sent", label: "أُرسلت" },
  { key: "all", label: "الكل" },
]
const SELECT =
  "h-10 rounded-[10px] border border-border bg-white px-3 text-sm outline-none focus:border-[#1d4fd8]"

type Failure = { code?: string; details?: { limit?: number } }

// The message as it looks in the chat: the text, with the link's card (picture, title, line)
// under it. The names in braces are shown as they are; each lead gets its own.
function Bubble({ campaign }: { campaign: OutreachCampaignInput }) {
  return (
    <div className="rounded-2xl bg-[#e7f6e1] p-3 text-[13.5px] leading-7 text-[#0b1738]">
      {campaign.imageUrl || campaign.linkTitle ? (
        <div className="mb-2 overflow-hidden rounded-xl bg-white/80">
          {campaign.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the uploaded message picture
            <img src={campaign.imageUrl} alt="" className="max-h-44 w-full object-cover" />
          ) : null}
          <div className="px-3 py-2">
            <p className="text-[13px] font-bold">{campaign.linkTitle ?? "مدار"}</p>
            {campaign.linkDescription ? (
              <p className="text-[12px] text-slate-500">{campaign.linkDescription}</p>
            ) : null}
            <p className="text-[11px] text-slate-400" dir="ltr">
              madar.my
            </p>
          </div>
        </div>
      ) : null}
      <p className="whitespace-pre-line">{campaign.message || "…"}</p>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <p className="text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// WhatsApp messages sent by hand: write the message once, then press "send" on each lead. The
// press opens your own WhatsApp with the message written for that lead; Madar records the send,
// moves a new lead to "message sent", keeps to the day's limit and counts taps on the link.
export function MadarAdminCrmOutreach() {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{
    id: string | null
    draft: OutreachCampaignInput
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const message = useRef<HTMLTextAreaElement>(null)

  const [tag, setTag] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [status, setStatus] = useState<OutreachStatus>("pending")
  const [leads, setLeads] = useState<{
    items: OutreachLead[]
    tags: string[]
    pending: number
  } | null>(null)
  const [busyLead, setBusyLead] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const loadCampaigns = useCallback(async () => {
    try {
      const list = await crmOutreachService.list()
      setCampaigns(list)
      setSelectedId((current) =>
        current && list.some((entry) => entry.id === current) ? current : (list[0]?.id ?? null)
      )
    } catch {
      toast.error("تعذر تحميل الرسائل.")
    }
  }, [])
  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns, reload, status])

  const selected = campaigns?.find((entry) => entry.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    let active = true
    crmOutreachService
      .leads(selectedId, { tag, source, status })
      .then((result) => {
        if (active) setLeads(result)
      })
      .catch(() => toast.error("تعذر تحميل العملاء المحتملين."))
    return () => {
      active = false
    }
  }, [selectedId, tag, source, status, reload])

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const saved = editing.id
        ? await crmOutreachService.update(editing.id, editing.draft)
        : await crmOutreachService.create(editing.draft)
      setSelectedId(saved.id)
      setEditing(null)
      setReload((key) => key + 1)
      toast.success("حُفظت الرسالة.")
    } catch {
      toast.error("تعذر الحفظ. تأكد من الاسم والرسالة وأن الرابط يبدأ بـ https://")
    } finally {
      setSaving(false)
    }
  }

  async function choosePicture(chosen: File | undefined) {
    if (!chosen || !editing) return
    if (chosen.size > 5 * 1024 * 1024) {
      toast.error("الصورة أكبر من 5 ميجابايت.")
      return
    }
    setUploading(true)
    try {
      const url = await crmOutreachService.uploadImage(chosen)
      setEditing((current) =>
        current ? { ...current, draft: { ...current.draft, imageUrl: url } } : current
      )
    } catch {
      toast.error("تعذر رفع الصورة.")
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ""
    }
  }

  const insert = (variable: string) => {
    if (!editing) return
    const box = message.current
    const text = editing.draft.message
    const start = box?.selectionStart ?? text.length
    const end = box?.selectionEnd ?? text.length
    setEditing({
      ...editing,
      draft: { ...editing.draft, message: text.slice(0, start) + variable + text.slice(end) },
    })
  }

  // The press on "send". The WhatsApp window is opened inside the press itself (a browser
  // blocks one opened later) and pointed at the chat once the message is ready.
  function sendTo(lead: OutreachLead) {
    if (!selected) return
    const chat = window.open("", "_blank")
    setBusyLead(lead.leadId)
    crmOutreachService
      .send(selected.id, lead.leadId)
      .then((ready) => {
        if (chat && !chat.closed) chat.location.href = ready.whatsappUrl
        else window.location.assign(ready.whatsappUrl)
        setReload((key) => key + 1)
      })
      .catch((error: unknown) => {
        chat?.close()
        const failure = error as Failure
        if (failure.code === "CRM_OUTREACH_DAILY_LIMIT") {
          toast.error(
            `وصلت حد اليوم (${failure.details?.limit ?? selected.dailyLimit}). أكمل غدًا.`
          )
        } else if (failure.code === "CRM_OUTREACH_STOPPED") {
          toast.error("هذا العميل طلب إيقاف الرسائل.")
        } else if (failure.code === "CRM_OUTREACH_NO_PHONE") {
          toast.error("لا يوجد لهذا العميل رقم يفتحه واتساب.")
        } else toast.error("تعذر تجهيز الرسالة.")
      })
      .finally(() => setBusyLead(null))
  }

  async function act(lead: OutreachLead, work: () => Promise<unknown>, done: string) {
    setBusyLead(lead.leadId)
    try {
      await work()
      toast.success(done)
      setReload((key) => key + 1)
    } catch {
      toast.error("تعذر تنفيذ الطلب.")
    } finally {
      setBusyLead(null)
    }
  }

  const draft = editing?.draft
  const limitReached = selected ? selected.stats.sentToday >= selected.dailyLimit : false
  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
    )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">رسائل واتساب</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            اكتب الرسالة مرة واحدة، ثم اضغط «إرسال» أمام كل عميل: يفتح واتساب عندك والرسالة مكتوبة
            باسمه، وتضغط إرسال فقط. مدار يسجّل الإرسال، وينقل العميل الجديد إلى «أُرسلت رسالة
            واتساب»، ويعدّ من ضغط الرابط.
          </p>
        </div>
        <AppButton
          icon={<Plus className="size-4" />}
          className="h-10 gap-2 rounded-[10px]"
          onClick={() => setEditing({ id: null, draft: BLANK })}
        >
          رسالة جديدة
        </AppButton>
      </div>

      {campaigns === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center shadow-sm">
          <MessageCircle className="mx-auto size-8 text-emerald-600" />
          <p className="mt-3 text-base font-bold text-foreground">لا توجد رسائل بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ رسالتك الأولى: النص، والرابط، والصورة التي تظهر مع الرابط.
          </p>
        </div>
      ) : (
        <>
          {campaigns.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {campaigns.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                    entry.id === selectedId
                      ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                      : "border-border bg-white text-muted-foreground hover:text-foreground"
                  )}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          ) : null}

          {selected ? (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{selected.name}</p>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        aria-label="تعديل الرسالة"
                        title="تعديل الرسالة"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setEditing({
                            id: selected.id,
                            draft: {
                              name: selected.name,
                              message: selected.message,
                              linkUrl: selected.linkUrl,
                              linkTitle: selected.linkTitle,
                              linkDescription: selected.linkDescription,
                              imageUrl: selected.imageUrl,
                              dailyLimit: selected.dailyLimit,
                            },
                          })
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="حذف الرسالة"
                        title="حذف الرسالة"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => {
                          if (!window.confirm("حذف هذه الرسالة وأرقامها؟ لا يمكن التراجع.")) return
                          void crmOutreachService
                            .remove(selected.id)
                            .then(() => setReload((key) => key + 1))
                            .catch(() => toast.error("تعذر الحذف."))
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </div>
                  <Bubble campaign={selected} />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Tile
                      label="أُرسلت اليوم"
                      value={`${selected.stats.sentToday} / ${selected.dailyLimit}`}
                      hint="حد اليوم"
                    />
                    <Tile label="إجمالي المُرسل" value={String(selected.stats.sent)} />
                    <Tile
                      label="ضغطوا الرابط"
                      value={String(selected.stats.clicked)}
                      hint={`${selected.stats.clicks} ضغطة`}
                    />
                    <Tile label="ردّوا" value={String(selected.stats.replied)} hint="تحدده أنت" />
                    <Tile
                      label="مهتمون"
                      value={String(selected.stats.interested)}
                      hint="ضغطوا «مهتم»"
                    />
                    <Tile
                      label="أوقفوا الرسائل"
                      value={String(selected.stats.stopped)}
                      hint="ضغطوا رابط الإيقاف"
                    />
                    <Tile
                      label="تقدّموا في المسار"
                      value={String(selected.stats.advanced)}
                      hint="تواصل أو اجتماع أو تجربة"
                    />
                  </div>
                  <p className="rounded-xl bg-muted/50 px-4 py-3 text-[12.5px] leading-6 text-muted-foreground">
                    واتساب لا يخبر أحدًا بقراءة رسالة أُرسلت يدويًا، فلا يوجد عدّاد «قرأها». الذي
                    نعدّه بدقة هو ضغط الرابط، لأن لكل عميل رابطه. الرد يصلك في واتساب، فتضغط «ردّ»
                    هنا ليُحسب وينتقل العميل إلى «تم التواصل».
                  </p>
                  {limitReached ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                      وصلت حد اليوم ({selected.dailyLimit} رسالة). الإرسال يُفتح من جديد غدًا، ليبقى
                      رقمك بعيدًا عن التقييد.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                <div className="flex rounded-[10px] border border-border/60 p-1">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatus(tab.key)}
                      className={tabClass(status === tab.key)}
                    >
                      {tab.label}
                      {tab.key === "pending" && leads ? ` (${leads.pending})` : ""}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="الوسم"
                    className={SELECT}
                    value={tag ?? ""}
                    onChange={(event) => setTag(event.target.value || null)}
                  >
                    <option value="">كل الوسوم</option>
                    {(leads?.tags ?? []).map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="المصدر"
                    className={SELECT}
                    value={source ?? ""}
                    onChange={(event) => setSource(event.target.value || null)}
                  >
                    <option value="">كل المصادر</option>
                    {Object.entries(SOURCE_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {(leads?.items ?? []).map((lead) => {
                  const busy = busyLead === lead.leadId
                  return (
                    <div
                      key={lead.leadId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <Link
                            href={ROUTES.madarAdminCrmLead(lead.leadId)}
                            className="text-[14.5px] font-bold text-foreground hover:underline"
                          >
                            {lead.companyName}
                          </Link>
                          <StageBadge stage={lead.stage} />
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted-foreground">
                          {lead.contactName ? <span>{lead.contactName}</span> : null}
                          <span dir="ltr">{lead.phone ?? "—"}</span>
                          {lead.tags.slice(0, 2).map((entry) => (
                            <span key={entry} className="rounded-md bg-muted px-1.5 py-0.5">
                              {entry}
                            </span>
                          ))}
                        </p>
                        {lead.send ? (
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px]">
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCheck className="size-3.5" />
                              أُرسلت {formatRelative(lead.send.sentAt)}
                              {lead.send.sentBy ? ` · ${lead.send.sentBy}` : ""}
                            </span>
                            {lead.send.clicks > 0 ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#1d4fd8]">
                                <MousePointerClick className="size-3.5" />
                                ضغط الرابط ×{lead.send.clicks}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">لم يضغط الرابط بعد</span>
                            )}
                            {lead.send.interestedAt ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
                                مهتم
                              </span>
                            ) : null}
                            {lead.send.repliedAt ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                                <Reply className="size-3.5" />
                                ردّ
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {lead.stopped ? (
                          <span className="rounded-full bg-rose-50 px-3 py-1 text-[12.5px] font-bold text-rose-700">
                            طلب إيقاف الرسائل
                          </span>
                        ) : !lead.reachable ? (
                          <span className="text-[12.5px] text-muted-foreground">
                            لا يوجد رقم واتساب
                          </span>
                        ) : lead.send ? (
                          <>
                            <AppButton
                              icon={<Reply className="size-4" />}
                              variant="outline"
                              className="h-9 gap-1.5 rounded-[10px]"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  lead,
                                  () =>
                                    crmOutreachService.setReplied(
                                      selected.id,
                                      lead.leadId,
                                      !lead.send?.repliedAt
                                    ),
                                  lead.send?.repliedAt ? "أُلغي تحديد الرد." : "سُجّل الرد."
                                )
                              }
                            >
                              {lead.send.repliedAt ? "إلغاء الرد" : "ردّ"}
                            </AppButton>
                            <AppButton
                              icon={<MessageCircle className="size-4" />}
                              variant="outline"
                              className="h-9 gap-1.5 rounded-[10px]"
                              disabled={busy}
                              onClick={() => sendTo(lead)}
                            >
                              فتح واتساب
                            </AppButton>
                            <AppButton
                              icon={<Undo2 className="size-4" />}
                              variant="ghost"
                              className="h-9 gap-1.5 rounded-[10px] text-muted-foreground"
                              disabled={busy}
                              title="لم تُرسل الرسالة فعلًا: يُلغى التسجيل ويعود العميل «جديدًا»"
                              onClick={() =>
                                void act(
                                  lead,
                                  () => crmOutreachService.undo(selected.id, lead.leadId),
                                  "أُلغي تسجيل الإرسال."
                                )
                              }
                            >
                              تراجع
                            </AppButton>
                          </>
                        ) : (
                          <AppButton
                            icon={
                              busy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MessageCircle className="size-4" />
                              )
                            }
                            className="h-9 gap-1.5 rounded-[10px] bg-[#16a34a] hover:bg-[#15803d]"
                            disabled={busy || limitReached}
                            onClick={() => sendTo(lead)}
                          >
                            إرسال واتساب
                          </AppButton>
                        )}
                      </div>
                    </div>
                  )
                })}
                {leads && leads.items.length === 0 ? (
                  <p className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
                    {status === "pending"
                      ? "لا يوجد أحد بانتظار الإرسال بهذه الفلاتر."
                      : "لا توجد نتائج بهذه الفلاتر."}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}

      <AppDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setEditing(null)
        }}
        title={editing?.id ? "تعديل الرسالة" : "رسالة واتساب جديدة"}
        description="النص يُكتب لكل عميل باسمه، والرابط يصير رابطًا خاصًا به لنعدّ ضغطه. الصورة تظهر في بطاقة الرابط داخل المحادثة."
        contentClassName="max-w-[52rem]"
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="outline" disabled={saving} onClick={() => setEditing(null)}>
              إلغاء
            </AppButton>
            <AppButton
              disabled={
                saving || !draft || draft.name.trim().length < 2 || draft.message.trim().length < 5
              }
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ
            </AppButton>
          </div>
        }
      >
        {draft && editing ? (
          <div
            dir="rtl"
            className="grid min-h-0 grid-cols-1 gap-5 overflow-y-auto md:grid-cols-[minmax(0,1fr)_17rem]"
          >
            <div className="flex flex-col gap-4">
              <label className="block text-sm">
                <span className="mb-1 block font-bold text-foreground">اسم الرسالة (لك فقط)</span>
                <AppInput
                  maxLength={80}
                  placeholder="مثال: عرض نوفمبر للمطاعم"
                  value={draft.name}
                  onChange={(event) =>
                    setEditing({ ...editing, draft: { ...draft, name: event.target.value } })
                  }
                />
              </label>
              <div>
                <span className="mb-1 block text-sm font-bold text-foreground">نص الرسالة</span>
                <textarea
                  ref={message}
                  rows={7}
                  maxLength={1500}
                  className="w-full rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-[#1d4fd8]"
                  value={draft.message}
                  onChange={(event) =>
                    setEditing({ ...editing, draft: { ...draft, message: event.target.value } })
                  }
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                  أضف:
                  {VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insert(variable)}
                      className="rounded-full border border-border bg-white px-2.5 py-0.5 font-semibold text-foreground hover:bg-muted"
                    >
                      {variable}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {"{الاسم}"} اسم المسؤول (أو النشاط إن لم يوجد)، {"{النشاط}"} اسم النشاط،{" "}
                  {"{الرابط}"} رابط العميل الخاص إلى صفحتك. إن لم تكتب {"{الرابط}"} ولا {"{مهتم}"}{" "}
                  يُضاف الرابط في آخر الرسالة. {"{مهتم}"} رابط يضغطه العميل المهتم: ينتقل إلى «تم
                  التواصل» وتُنشأ لك متابعة للاتصال به. {"{إيقاف}"} رابط يضغطه ليوقف الرسائل:
                  يُعلَّم في النظام ولا يُرسل له بعدها.
                </p>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-bold text-foreground">إلى أين يذهب الرابط؟</span>
                <AppInput
                  dir="ltr"
                  maxLength={500}
                  placeholder="https://www.madar.my/contact-sales/"
                  value={draft.linkUrl}
                  onChange={(event) =>
                    setEditing({ ...editing, draft: { ...draft, linkUrl: event.target.value } })
                  }
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-bold text-foreground">عنوان بطاقة الرابط</span>
                  <AppInput
                    maxLength={120}
                    value={draft.linkTitle ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        draft: { ...draft, linkTitle: event.target.value || null },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-bold text-foreground">سطر تحت العنوان</span>
                  <AppInput
                    maxLength={200}
                    value={draft.linkDescription ?? ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        draft: { ...draft, linkDescription: event.target.value || null },
                      })
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <span className="mb-1 block text-sm font-bold text-foreground">الصورة</span>
                  <input
                    ref={file}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => void choosePicture(event.target.files?.[0])}
                  />
                  <div className="flex gap-2">
                    <AppButton
                      variant="outline"
                      className="h-10 gap-2 rounded-[10px]"
                      disabled={uploading}
                      icon={
                        uploading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ImagePlus className="size-4" />
                        )
                      }
                      onClick={() => file.current?.click()}
                    >
                      {draft.imageUrl ? "تغيير الصورة" : "رفع صورة"}
                    </AppButton>
                    {draft.imageUrl ? (
                      <AppButton
                        variant="ghost"
                        className="h-10 rounded-[10px] text-muted-foreground"
                        onClick={() =>
                          setEditing({ ...editing, draft: { ...draft, imageUrl: null } })
                        }
                      >
                        إزالة
                      </AppButton>
                    ) : null}
                  </div>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block font-bold text-foreground">حد الإرسال اليومي</span>
                  <AppInput
                    type="number"
                    min={1}
                    max={200}
                    className="w-28"
                    value={draft.dailyLimit}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        draft: {
                          ...draft,
                          dailyLimit: Math.min(200, Math.max(1, Number(event.target.value) || 1)),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <p className="text-[12px] leading-5 text-muted-foreground">
                واتساب لا يسمح بإرفاق صورة تلقائيًا من رابط. لذلك تظهر صورتك في بطاقة الرابط داخل
                المحادثة. ابدأ بـ 10 إلى 20 رسالة يوميًا لأرقام لا تعرفك.
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-foreground">كما ستظهر</p>
              <Bubble campaign={draft} />
            </div>
          </div>
        ) : null}
      </AppDialog>
    </div>
  )
}
