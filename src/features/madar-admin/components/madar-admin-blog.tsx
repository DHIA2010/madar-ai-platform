"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Inbox,
  MousePointerClick,
  Newspaper,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppConfirmDialog,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSwitch,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTextarea,
} from "@/components/app"

import {
  type AdminBlogCategory,
  type AdminBlogCtaApp,
  type AdminBlogPost,
  type AdminBlogSettings,
  type AdminBlogSettingsResponse,
  type AdminBlogStats,
  blogAdminService,
} from "../services/blog-admin.service"
import { blocksToText, faqToText, textToBlocks, textToFaq } from "../services/blog-text"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

// Madar Admin → المدونة. The agent writes the week's drafts on Sunday; here they are read,
// edited and approved (one by one or the whole week), and approved ones go out on the next
// publishing days. Also: what each article brought (views, clicks, leads, sign-ups) and settings.
// Built from the app's own pieces (KPI cards, segmented tabs, AppTable, AppSelect, AppSwitch,
// AppDialog) so it looks like the rest of Madar Admin.

const SITE = "https://www.madar.my/blog/"

const CATEGORY_LABEL: Record<AdminBlogCategory, string> = {
  campaigns: "الحملات الإعلانية",
  invoicing: "الفوترة والضريبة",
  ecommerce: "التجارة الإلكترونية",
  inventory: "المخزون والفروع",
  pos: "الكاشير والمبيعات",
  booking: "الحجوزات والعملاء",
}

const CTA_LABEL: Record<AdminBlogCtaApp, string> = {
  pos: "نقطة البيع",
  ecommerce: "المتاجر الإلكترونية",
  campaigns: "الحملات الإعلانية",
  invoicing: "الفواتير",
  inventory: "المخزون",
  booking: "الحجوزات",
  loyalty: "الولاء",
  accounting: "المحاسبة",
  complete: "مدار الكامل",
}

const DAY_LABEL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

const SPOT_LABEL: Record<string, string> = {
  top: "أعلى المقال",
  middle: "وسط المقال",
  end: "نهاية المقال",
  sidebar: "الشريط الجانبي",
}

const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-foreground"
const FIELD = "h-11 rounded-[10px]"

type Tab = "review" | "scheduled" | "published" | "stats" | "settings"
type Action = "approve" | "reject" | "publish" | "unschedule" | "delete"

function formatWhen(iso: string | null) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00Z`)
  )
}

const isLive = (post: AdminBlogPost) =>
  post.status === "approved" &&
  post.scheduledAt !== null &&
  Date.parse(post.scheduledAt) <= Date.now()

// The segmented control the other Madar Admin pages use (see the follow-ups page).
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ key: T; label: string; count?: number | null }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap rounded-[10px] border border-border/60 p-1">
      {options.map((option) => (
        <button
          key={String(option.key)}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
            value === option.key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
          {option.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-bold",
                value === option.key ? "bg-background/20" : "bg-muted text-foreground"
              )}
            >
              {option.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

// ---------- a light preview of the article ----------

function Preview({ post }: { post: AdminBlogPost }) {
  return (
    <article className="space-y-4 rounded-xl border border-border/60 bg-background p-5 text-[15px] leading-8">
      <h2 className="text-xl font-bold text-foreground">{post.title}</h2>
      <p className="text-muted-foreground">{post.excerpt}</p>
      {post.body.map((block, index) => {
        switch (block.type) {
          case "p":
            return <p key={index}>{block.text}</p>
          case "h2":
            return (
              <h3 key={index} className="pt-2 text-lg font-bold">
                {block.text}
              </h3>
            )
          case "h3":
            return (
              <h4 key={index} className="font-semibold">
                {block.text}
              </h4>
            )
          case "ul":
          case "ol":
            return (
              <ul
                key={index}
                className={cn("space-y-1 ps-6", block.type === "ol" ? "list-decimal" : "list-disc")}
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )
          case "callout":
            return (
              <div key={index} className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
                <p className="font-semibold">{block.title}</p>
                <p className="text-muted-foreground">{block.text}</p>
              </div>
            )
          case "formula":
            return (
              <div key={index} className="rounded-xl bg-[#0b1738] p-4 text-white">
                <p className="text-xs text-[#5eead4]">{block.label}</p>
                <p className="font-semibold">{block.formula}</p>
                <p className="text-slate-300">{block.example}</p>
              </div>
            )
        }
      })}
      {post.faq.length > 0 ? (
        <div className="space-y-2 border-t border-border/60 pt-4">
          <p className="font-bold">أسئلة شائعة</p>
          {post.faq.map((item) => (
            <div key={item.question}>
              <p className="font-semibold">{item.question}</p>
              <p className="text-muted-foreground">{item.answer}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

// ---------- editing one article (a dialog, like the offers editor) ----------

function Editor({
  post,
  onClose,
  onSaved,
}: {
  post: AdminBlogPost
  onClose: () => void
  onSaved: (post: AdminBlogPost) => void
}) {
  const live = isLive(post)
  const [form, setForm] = useState({
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
    keywords: post.keywords.join("، "),
    category: post.category as string,
    ctaApp: (post.ctaApp ?? "auto") as string,
    body: blocksToText(post.body),
    faq: faqToText(post.faq),
  })
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const draft: AdminBlogPost = {
    ...post,
    title: form.title,
    excerpt: form.excerpt,
    body: textToBlocks(form.body),
    faq: textToFaq(form.faq),
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await blogAdminService.updatePost(post.id, {
        title: form.title.trim(),
        excerpt: form.excerpt.trim(),
        ...(live ? {} : { slug: form.slug.trim() }),
        seoTitle: form.seoTitle.trim() || null,
        seoDescription: form.seoDescription.trim() || null,
        keywords: form.keywords
          .split(/[،,]/)
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        category: form.category as AdminBlogCategory,
        ctaApp: form.ctaApp === "auto" ? null : (form.ctaApp as AdminBlogCtaApp),
        body: draft.body,
        faq: draft.faq,
      })
      toast.success("تم حفظ المقال.")
      onSaved(saved)
    } catch {
      toast.error("تعذر الحفظ. الرابط بحروف إنجليزية صغيرة وشرطات فقط.")
    } finally {
      setSaving(false)
    }
  }

  const counter = (value: string, max: number) => (
    <span
      className={cn(
        "text-xs font-normal",
        value.length > max ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {value.length}/{max}
    </span>
  )

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={<span dir="rtl">قراءة وتعديل المقال</span>}
      contentClassName="max-w-3xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2" dir="rtl">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { key: "edit", label: "تعديل" },
              { key: "preview", label: "معاينة" },
            ]}
          />
          <div className="flex gap-2">
            <AppButton variant="outline" className="rounded-[10px]" onClick={onClose}>
              إلغاء
            </AppButton>
            <AppButton className="rounded-[10px]" loading={saving} onClick={() => void save()}>
              حفظ
            </AppButton>
          </div>
        </div>
      }
    >
      <div dir="rtl" className="flex max-h-[65vh] min-h-0 flex-col gap-4 overflow-y-auto pe-1">
        {post.warnings.length > 0 ? (
          <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3">
            {post.warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#b45309]"
              >
                <AlertTriangle className="size-3.5 shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        {mode === "preview" ? (
          <Preview post={draft} />
        ) : (
          <>
            <div>
              <label className={FIELD_LABEL}>العنوان</label>
              <AppInput
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>الوصف المختصر</label>
              <AppTextarea
                rows={2}
                value={form.excerpt}
                onChange={(event) => set("excerpt", event.target.value)}
                className="rounded-[10px]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={FIELD_LABEL}>القسم</label>
                <AppSelect value={form.category} onValueChange={(value) => set("category", value)}>
                  <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <AppSelectItem key={value} value={value}>
                        {label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <div>
                <label className={FIELD_LABEL}>أزرار التسجيل توجّه إلى</label>
                <AppSelect value={form.ctaApp} onValueChange={(value) => set("ctaApp", value)}>
                  <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="auto">حسب القسم</AppSelectItem>
                    {Object.entries(CTA_LABEL).map(([value, label]) => (
                      <AppSelectItem key={value} value={value}>
                        {label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <div>
                <label className={FIELD_LABEL}>الرابط</label>
                <AppInput
                  dir="ltr"
                  disabled={live}
                  value={form.slug}
                  onChange={(event) => set("slug", event.target.value)}
                  className={FIELD}
                />
                {live ? (
                  <p className="mt-1 text-xs text-muted-foreground">لا يتغير بعد النشر.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <Globe className="size-4 text-[#2563eb]" />
                ما يظهر في بحث جوجل
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={cn(FIELD_LABEL, "flex justify-between")}>
                    عنوان البحث {counter(form.seoTitle, 60)}
                  </label>
                  <AppInput
                    value={form.seoTitle}
                    onChange={(event) => set("seoTitle", event.target.value)}
                    className={cn(FIELD, "bg-background")}
                  />
                </div>
                <div>
                  <label className={cn(FIELD_LABEL, "flex justify-between")}>
                    وصف البحث {counter(form.seoDescription, 155)}
                  </label>
                  <AppTextarea
                    rows={2}
                    value={form.seoDescription}
                    onChange={(event) => set("seoDescription", event.target.value)}
                    className="rounded-[10px] bg-background"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>كلمات البحث</label>
                  <AppInput
                    value={form.keywords}
                    onChange={(event) => set("keywords", event.target.value)}
                    placeholder="برنامج كاشير، نظام نقاط بيع"
                    className={cn(FIELD, "bg-background")}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>نص المقال</label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                سطر فارغ بين الفقرات · «## » عنوان · «### » عنوان صغير · «- » نقطة · «1. » ترقيم ·
                «&gt; tip: العنوان | النص» نصيحة
              </p>
              <AppTextarea
                rows={18}
                value={form.body}
                onChange={(event) => set("body", event.target.value)}
                className="rounded-[10px] text-[14px] leading-7"
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>الأسئلة الشائعة</label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                «س: السؤال» ثم «ج: الإجابة»، وسطر فارغ بين كل سؤال.
              </p>
              <AppTextarea
                rows={7}
                value={form.faq}
                onChange={(event) => set("faq", event.target.value)}
                className="rounded-[10px]"
              />
            </div>
          </>
        )}
      </div>
    </AppDialog>
  )
}

// ---------- one article in a list (laid out like the offers list) ----------

function PostRow({
  post,
  busy,
  onEdit,
  onAction,
}: {
  post: AdminBlogPost
  busy: boolean
  onEdit: () => void
  onAction: (action: Action) => void
}) {
  const live = isLive(post)
  const news = post.kind === "news"
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4",
        post.warnings.length > 0 ? "border-[#fde68a] bg-[#fffdf5]" : "border-border/60"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            news ? "bg-violet-50 text-violet-600" : "bg-[#eff6ff] text-[#2563eb]"
          )}
        >
          {news ? <Sparkles className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-foreground">{post.title}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <AppBadge
              variant="secondary"
              className={cn(
                "rounded-full font-semibold",
                news ? "bg-violet-50 text-violet-700" : "bg-[#eff6ff] text-[#1d4ed8]"
              )}
            >
              {news ? "جديد في مدار" : "دليل"}
            </AppBadge>
            <span>{CATEGORY_LABEL[post.category]}</span>
            <span>·</span>
            <span>{post.source === "agent" ? "كتبه الوكيل" : "أُضيف يدوياً"}</span>
            {post.scheduledAt ? (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {live ? "نُشر" : "يُنشر"} {formatWhen(post.scheduledAt)}
                </span>
              </>
            ) : null}
          </div>
          {post.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#b45309]"
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {post.status === "draft" ? (
          <>
            <AppButton
              size="sm"
              className="gap-1.5 rounded-[10px]"
              disabled={busy}
              onClick={() => onAction("approve")}
              icon={<CheckCheck className="size-4" />}
            >
              اعتماد
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              className="rounded-[10px]"
              disabled={busy}
              onClick={() => onAction("reject")}
            >
              رفض
            </AppButton>
          </>
        ) : null}
        {post.status === "approved" && !live ? (
          <>
            <AppButton
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-[10px]"
              disabled={busy}
              onClick={() => onAction("publish")}
              icon={<Send className="size-4" />}
            >
              انشر الآن
            </AppButton>
            <AppButton
              variant="outline"
              size="icon-sm"
              aria-label="إلغاء الجدولة"
              title="إلغاء الجدولة"
              disabled={busy}
              onClick={() => onAction("unschedule")}
            >
              <Undo2 className="size-4" />
            </AppButton>
          </>
        ) : null}
        {live ? (
          <a
            href={`${SITE}${post.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="عرض على الموقع"
            title="عرض على الموقع"
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-4" />
          </a>
        ) : null}
        <AppButton
          variant="outline"
          size="icon-sm"
          aria-label="قراءة وتعديل"
          title="قراءة وتعديل"
          disabled={busy}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </AppButton>
        {!live ? (
          <AppButton
            variant="outline"
            size="icon-sm"
            aria-label="حذف"
            title="حذف"
            disabled={busy}
            onClick={() => onAction("delete")}
          >
            <Trash2 className="size-4 text-destructive" />
          </AppButton>
        ) : null}
      </div>
    </div>
  )
}

// ---------- results ----------

function StatsView() {
  const [days, setDays] = useState(30)
  const [loaded, setLoaded] = useState<{ days: number; stats: AdminBlogStats[] } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const stats = loaded?.days === days ? loaded.stats : null

  useEffect(() => {
    blogAdminService
      .stats(days)
      .then((result) => setLoaded({ days, stats: result.stats }))
      .catch(() => setLoaded({ days, stats: [] }))
  }, [days])

  const totals = useMemo(
    () =>
      (stats ?? []).reduce(
        (sum, row) => ({
          views: sum.views + row.views,
          fromGoogle: sum.fromGoogle + row.fromGoogle,
          ctaClicks: sum.ctaClicks + row.ctaClicks,
          leads: sum.leads + row.leads,
          signups: sum.signups + row.signups,
          customers: sum.customers + row.customers,
        }),
        { views: 0, fromGoogle: 0, ctaClicks: 0, leads: 0, signups: 0, customers: 0 }
      ),
    [stats]
  )

  const note = (row: AdminBlogStats) => {
    if (row.views >= 50 && row.ctaClicks === 0) return "يُقرأ كثيراً لكن لا أحد يضغط التسجيل"
    if (row.views >= 30 && row.read50 / row.views < 0.25) return "أغلب القرّاء يتركونه قبل منتصفه"
    if (row.ctaClicks >= 10 && row.signups + row.leads === 0)
      return "يضغطون الزر لكن لا يكملون التسجيل"
    return null
  }

  const kpis: MadarAdminKpi[] = [
    {
      label: "المشاهدات",
      value: totals.views.toLocaleString("en-US"),
      deltaPct: null,
      icon: Eye,
      tone: "blue",
    },
    {
      label: "من بحث جوجل",
      value: totals.fromGoogle.toLocaleString("en-US"),
      deltaPct: null,
      icon: Globe,
      tone: "indigo",
    },
    {
      label: "ضغطات أزرار التسجيل",
      value: totals.ctaClicks.toLocaleString("en-US"),
      deltaPct: null,
      icon: MousePointerClick,
      tone: "violet",
    },
    {
      label: "طلبات تواصل",
      value: totals.leads.toLocaleString("en-US"),
      deltaPct: null,
      icon: Inbox,
      tone: "orange",
    },
    {
      label: "تسجيلات",
      value: totals.signups.toLocaleString("en-US"),
      deltaPct: null,
      icon: UserPlus,
      tone: "green",
    },
    {
      label: "عملاء دفعوا",
      value: totals.customers.toLocaleString("en-US"),
      deltaPct: null,
      icon: Users,
      tone: "rose",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <p className="text-sm font-semibold text-foreground">نتائج كل مقال</p>
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { key: 7, label: "آخر 7 أيام" },
            { key: 30, label: "آخر 30 يوماً" },
            { key: 90, label: "آخر 90 يوماً" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المقال</AppTableHead>
              <AppTableHead className="text-center">مشاهدات</AppTableHead>
              <AppTableHead className="text-center">زوار</AppTableHead>
              <AppTableHead className="text-center">من جوجل</AppTableHead>
              <AppTableHead className="text-center">قرأ النصف</AppTableHead>
              <AppTableHead className="text-center">ضغطات</AppTableHead>
              <AppTableHead className="text-center">تواصل</AppTableHead>
              <AppTableHead className="text-center">تسجيل</AppTableHead>
              <AppTableHead className="text-center">دفعوا</AppTableHead>
              <AppTableHead className="text-center">التحويل</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(stats ?? []).map((row) => {
              const warning = note(row)
              const conversion = row.visitors ? ((row.signups + row.leads) / row.visitors) * 100 : 0
              const expanded = open === row.slug
              const max = Math.max(...row.daily.map((point) => point.views), 1)
              return (
                <Fragment key={row.slug}>
                  <AppTableRow
                    className="cursor-pointer"
                    onClick={() => setOpen(expanded ? null : row.slug)}
                  >
                    <AppTableCell className="max-w-[340px]">
                      <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                      {warning ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[#b45309]">
                          <AlertTriangle className="size-3.5" />
                          {warning}
                        </p>
                      ) : null}
                    </AppTableCell>
                    <AppTableCell className="text-center">{row.views}</AppTableCell>
                    <AppTableCell className="text-center">{row.visitors}</AppTableCell>
                    <AppTableCell className="text-center">{row.fromGoogle}</AppTableCell>
                    <AppTableCell className="text-center">
                      {row.views ? Math.round((row.read50 / row.views) * 100) : 0}%
                    </AppTableCell>
                    <AppTableCell className="text-center">{row.ctaClicks}</AppTableCell>
                    <AppTableCell className="text-center">{row.leads}</AppTableCell>
                    <AppTableCell className="text-center font-semibold">{row.signups}</AppTableCell>
                    <AppTableCell className="text-center font-semibold text-emerald-600">
                      {row.customers}
                    </AppTableCell>
                    <AppTableCell className="text-center">{conversion.toFixed(1)}%</AppTableCell>
                    <AppTableCell>
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          expanded && "rotate-180"
                        )}
                      />
                    </AppTableCell>
                  </AppTableRow>
                  {expanded ? (
                    <AppTableRow className="bg-muted/30 hover:bg-muted/30">
                      <AppTableCell colSpan={11} className="p-4">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-bold text-foreground">أي زر ضغطوا</p>
                            {Object.keys(row.ctaBreakdown).length === 0 ? (
                              <p className="text-xs text-muted-foreground">لا ضغطات بعد.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(row.ctaBreakdown).map(([spot, count]) => (
                                  <AppBadge key={spot} variant="outline" className="rounded-full">
                                    {SPOT_LABEL[spot] ?? spot}: {count}
                                  </AppBadge>
                                ))}
                              </div>
                            )}
                            <p className="mt-3 text-xs text-muted-foreground">
                              قرأ المقال كاملاً: {row.read100}
                            </p>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-bold text-foreground">
                              المشاهدات يوماً بيوم
                            </p>
                            <div className="flex h-16 items-end gap-1">
                              {row.daily.map((point) => (
                                <div
                                  key={point.day}
                                  title={`${formatDay(point.day)}: ${point.views}`}
                                  className="w-2.5 rounded-t bg-[#2563eb]/70"
                                  style={{ height: `${Math.max(6, (point.views / max) * 100)}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </AppTableCell>
                    </AppTableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </AppTableBody>
        </AppTable>
        {stats === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : stats.length === 0 ? (
          <AppTableEmpty
            title="لا توجد زيارات في هذه الفترة"
            description="تظهر هنا مشاهدات كل مقال وضغطات أزرار التسجيل فور وصول الزوار."
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        التسجيلات وطلبات التواصل تُحسب لمن جاء من زر أو نموذج داخل المقال. أرقام الظهور في بحث جوجل
        (Search Console) تُضاف لاحقاً.
      </p>
    </div>
  )
}

// ---------- settings (rows like the general settings page) ----------

function SettingsView({
  data,
  onSaved,
}: {
  data: AdminBlogSettingsResponse
  onSaved: (settings: AdminBlogSettings) => void
}) {
  const [settings, setSettings] = useState(data.settings)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      onSaved(await blogAdminService.updateSettings(settings))
      toast.success("تم حفظ إعدادات المدونة.")
    } catch {
      toast.error("تعذر الحفظ.")
    } finally {
      setSaving(false)
    }
  }

  const row =
    "flex flex-wrap items-center justify-between gap-4 border-b border-border/60 py-4 last:border-b-0"

  return (
    <AppCard
      title="إعدادات المدونة"
      subtitle="متى يكتب الوكيل، وكم مقالاً، ومتى تُنشر المقالات بعد اعتمادها."
      className="max-w-3xl rounded-2xl border-border/60 shadow-sm"
      actions={
        <AppButton
          className="rounded-[10px]"
          loading={saving}
          disabled={settings.publishDays.length === 0}
          onClick={() => void save()}
        >
          حفظ
        </AppButton>
      }
    >
      <div className="flex flex-col">
        <div className={row}>
          <div>
            <p className="text-sm font-semibold text-foreground">الوكيل يكتب مسودات كل أسبوع</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              كل أحد صباحاً، وتصلك رسالة واتساب للمراجعة.
            </p>
          </div>
          <AppSwitch
            checked={settings.agentEnabled}
            onCheckedChange={(checked) => setSettings({ ...settings, agentEnabled: checked })}
          />
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-semibold text-foreground">عدد المقالات في الأسبوع</p>
            <p className="mt-0.5 text-xs text-muted-foreground">من 1 إلى 7.</p>
          </div>
          <AppSelect
            value={String(settings.postsPerWeek)}
            onValueChange={(value) => setSettings({ ...settings, postsPerWeek: Number(value) })}
          >
            <AppSelectTrigger className="h-11 w-36 rounded-[10px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <AppSelectItem key={count} value={String(count)}>
                  {count} {count === 1 ? "مقال" : count === 2 ? "مقالان" : "مقالات"}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-semibold text-foreground">أيام النشر</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              كل مقال معتمد يأخذ أقرب يوم متاح منها.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABEL.map((label, day) => {
              const on = settings.publishDays.includes(day)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      publishDays: on
                        ? settings.publishDays.filter((value) => value !== day)
                        : [...settings.publishDays, day].sort(),
                    })
                  }
                  className={cn(
                    "h-9 rounded-[10px] border px-3 text-sm font-semibold transition-colors",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-semibold text-foreground">ساعة النشر</p>
            <p className="mt-0.5 text-xs text-muted-foreground">بتوقيت الرياض.</p>
          </div>
          <AppSelect
            value={String(settings.publishHour)}
            onValueChange={(value) => setSettings({ ...settings, publishHour: Number(value) })}
          >
            <AppSelectTrigger className="h-11 w-36 rounded-[10px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {Array.from({ length: 24 }, (_, hour) => (
                <AppSelectItem key={hour} value={String(hour)}>
                  {String(hour).padStart(2, "0")}:00
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>
      </div>
    </AppCard>
  )
}

// ---------- the page ----------

export function MadarAdminBlog() {
  const [tab, setTab] = useState<Tab>("review")
  const [posts, setPosts] = useState<AdminBlogPost[] | null>(null)
  const [settings, setSettings] = useState<AdminBlogSettingsResponse | null>(null)
  const [views, setViews] = useState<number | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<
    { kind: "delete" | "publish"; post: AdminBlogPost } | { kind: "write" } | null
  >(null)

  const load = useCallback(async () => {
    try {
      const [list, config, stats] = await Promise.all([
        blogAdminService.listPosts(),
        blogAdminService.getSettings(),
        blogAdminService.stats(30),
      ])
      setPosts(list.posts)
      setSettings(config)
      setViews(stats.stats.reduce((sum, row) => sum + row.views, 0))
    } catch {
      setPosts([])
      toast.error("تعذر تحميل المدونة.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const drafts = useMemo(() => (posts ?? []).filter((post) => post.status === "draft"), [posts])
  const scheduled = (posts ?? [])
    .filter((post) => post.status === "approved" && !isLive(post))
    .sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? ""))
  const published = (posts ?? []).filter(isLive)

  // Drafts grouped by the week they were written for, newest week first.
  const weeks = useMemo(() => {
    const groups = new Map<string, AdminBlogPost[]>()
    for (const post of drafts) {
      const key = post.weekStart ?? "manual"
      groups.set(key, [...(groups.get(key) ?? []), post])
    }
    return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]))
  }, [drafts])

  const replace = (updated: AdminBlogPost[]) =>
    setPosts((current) =>
      (current ?? []).map((post) => updated.find((entry) => entry.id === post.id) ?? post)
    )

  async function run(post: AdminBlogPost, action: Action) {
    setBusy(post.id)
    try {
      if (action === "delete") {
        await blogAdminService.deletePost(post.id)
        setPosts((current) => (current ?? []).filter((entry) => entry.id !== post.id))
        toast.success("حُذف المقال.")
      } else {
        const updated =
          action === "approve"
            ? await blogAdminService.approve(post.id)
            : action === "reject"
              ? await blogAdminService.reject(post.id)
              : action === "publish"
                ? await blogAdminService.publishNow(post.id)
                : await blogAdminService.unschedule(post.id)
        replace([updated])
        if (action === "approve") toast.success(`سيُنشر ${formatWhen(updated.scheduledAt)}.`)
        if (action === "publish") toast.success("نُشر المقال على الموقع.")
        if (action === "unschedule") toast.success("أُعيد المقال إلى المراجعة.")
        if (action === "reject") toast.success("رُفض المقال ولن يُنشر.")
      }
    } catch {
      toast.error("تعذر تنفيذ الطلب.")
    } finally {
      setBusy(null)
    }
  }

  function act(post: AdminBlogPost, action: Action) {
    if (action === "delete" || action === "publish") setConfirm({ kind: action, post })
    else void run(post, action)
  }

  async function approveWeek(weekStart: string, group: AdminBlogPost[]) {
    setBusy(weekStart)
    try {
      if (weekStart === "manual") {
        for (const post of group) replace([await blogAdminService.approve(post.id)])
      } else {
        replace((await blogAdminService.approveWeek(weekStart)).posts)
      }
      toast.success("اعتُمد الأسبوع وجُدولت المقالات في أيام النشر.")
      setTab("scheduled")
    } catch {
      toast.error("تعذر الاعتماد.")
    } finally {
      setBusy(null)
    }
  }

  async function writeNow() {
    try {
      await blogAdminService.runAgent()
      toast.success("بدأ الوكيل الكتابة. تظهر المسودات هنا خلال دقائق.")
      for (const delay of [60_000, 120_000, 240_000]) setTimeout(() => void load(), delay)
    } catch {
      toast.error("الوكيل غير متاح الآن.")
    }
  }

  const editingPost = (posts ?? []).find((post) => post.id === editing) ?? null
  const lastRun = settings?.lastRun

  const kpis: MadarAdminKpi[] = [
    {
      label: "بانتظار المراجعة",
      value: String(drafts.length),
      deltaPct: null,
      icon: Inbox,
      tone: "orange",
    },
    {
      label: "مجدولة للنشر",
      value: String(scheduled.length),
      deltaPct: null,
      icon: CalendarClock,
      tone: "violet",
    },
    {
      label: "منشورة من هنا",
      value: String(published.length),
      deltaPct: null,
      icon: Newspaper,
      tone: "green",
    },
    {
      label: "مشاهدات آخر 30 يوماً",
      value: views === null ? "—" : views.toLocaleString("en-US"),
      deltaPct: null,
      icon: Eye,
      tone: "blue",
    },
  ]

  const list = (items: AdminBlogPost[], title: string, description: string) =>
    items.length === 0 ? (
      <AppCard className="rounded-2xl border-border/60 shadow-sm">
        <AppTableEmpty title={title} description={description} />
      </AppCard>
    ) : (
      <AppCard className="rounded-2xl border-border/60 shadow-sm">
        <div className="flex flex-col gap-3">
          {items.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              busy={busy === post.id}
              onEdit={() => setEditing(post.id)}
              onAction={(action) => act(post, action)}
            />
          ))}
        </div>
      </AppCard>
    )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المدونة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الوكيل يكتب مقالات الأسبوع كل أحد. راجعها واعتمدها، وتُنشر تلقائياً في أيام النشر.
          </p>
          {lastRun ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" />
              آخر كتابة للوكيل: أسبوع {formatDay(lastRun.weekStart)} ·{" "}
              {lastRun.status === "done"
                ? `${lastRun.postsWritten} مسودات`
                : lastRun.status === "running"
                  ? "يكتب الآن…"
                  : "تعذرت، سيحاول مرة أخرى"}
            </p>
          ) : null}
        </div>
        <AppButton
          className="gap-1.5 rounded-[10px]"
          disabled={!settings?.agentAvailable}
          title={settings?.agentAvailable ? undefined : "الوكيل غير مفعّل في هذه البيئة"}
          onClick={() => setConfirm({ kind: "write" })}
          icon={<Sparkles className="size-4" />}
        >
          اكتب مسودات الآن
        </AppButton>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: "review", label: "للمراجعة", count: drafts.length },
            { key: "scheduled", label: "المجدولة", count: scheduled.length },
            { key: "published", label: "المنشورة", count: published.length },
            { key: "stats", label: "الأداء" },
            { key: "settings", label: "الإعدادات" },
          ]}
        />
        {settings ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarCheck2 className="size-4" />
            النشر: {settings.settings.publishDays
              .map((day) => DAY_LABEL[day])
              .join("، ")} الساعة {String(settings.settings.publishHour).padStart(2, "0")}:00
          </p>
        ) : null}
      </div>

      {posts === null ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
      ) : tab === "review" ? (
        weeks.length === 0 ? (
          list(
            [],
            "لا توجد مسودات بانتظار المراجعة",
            "يكتب الوكيل مسودات الأسبوع كل يوم أحد صباحاً."
          )
        ) : (
          weeks.map(([weekStart, group]) => (
            <AppCard
              key={weekStart}
              title={
                weekStart === "manual" ? "مسودات أخرى" : `مسودات أسبوع ${formatDay(weekStart)}`
              }
              subtitle={`${group.length} ${group.length === 1 ? "مقال" : "مقالات"} · اعتمدها كلها مرة واحدة أو واحداً واحداً.`}
              className="rounded-2xl border-border/60 shadow-sm"
              actions={
                <AppButton
                  className="gap-1.5 rounded-[10px]"
                  loading={busy === weekStart}
                  onClick={() => void approveWeek(weekStart, group)}
                  icon={<CheckCheck className="size-4" />}
                >
                  اعتماد الأسبوع
                </AppButton>
              }
            >
              <div className="flex flex-col gap-3">
                {group.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    busy={busy === post.id}
                    onEdit={() => setEditing(post.id)}
                    onAction={(action) => act(post, action)}
                  />
                ))}
              </div>
            </AppCard>
          ))
        )
      ) : tab === "scheduled" ? (
        list(scheduled, "لا توجد مقالات مجدولة", "المقالات المعتمدة تظهر هنا حتى يحين يوم نشرها.")
      ) : tab === "published" ? (
        list(
          published,
          "لم يُنشر أي مقال من هنا بعد",
          "المقالات الأولى مكتوبة في كود الموقع ولا تظهر في هذه القائمة، لكن نتائجها في «الأداء»."
        )
      ) : tab === "stats" ? (
        <StatsView />
      ) : settings ? (
        <SettingsView
          data={settings}
          onSaved={(saved) => setSettings({ ...settings, settings: saved })}
        />
      ) : null}

      {editingPost ? (
        <Editor
          key={editingPost.id}
          post={editingPost}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replace([saved])
            setEditing(null)
          }}
        />
      ) : null}

      <AppConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          <span dir="rtl">
            {confirm?.kind === "delete"
              ? "حذف المقال"
              : confirm?.kind === "publish"
                ? "نشر المقال الآن"
                : "كتابة مسودات الآن"}
          </span>
        }
        description={
          <span dir="rtl">
            {confirm?.kind === "delete"
              ? `سيُحذف «${confirm.post.title}» نهائياً.`
              : confirm?.kind === "publish"
                ? `سيظهر «${confirm.post.title}» على الموقع فوراً بدل موعده.`
                : "يكتب الوكيل مسودات هذا الأسبوع الآن. تأخذ بضع دقائق، ولا يُنشر شيء قبل اعتمادك."}
          </span>
        }
        confirmLabel={
          confirm?.kind === "delete"
            ? "حذف"
            : confirm?.kind === "publish"
              ? "انشر الآن"
              : "ابدأ الكتابة"
        }
        confirmTone={confirm?.kind === "delete" ? "destructive" : "default"}
        cancelLabel="إلغاء"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const current = confirm
          setConfirm(null)
          if (!current) return
          if (current.kind === "write") await writeNow()
          else await run(current.post, current.kind)
        }}
      />
    </div>
  )
}
