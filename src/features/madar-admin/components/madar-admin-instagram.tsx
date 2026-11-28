"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  AtSign,
  CalendarCheck2,
  CalendarClock,
  CheckCheck,
  ExternalLink,
  Eye,
  Heart,
  Inbox,
  Link2,
  MessageCircle,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  UserPlus,
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
  type AdminInstagramDesign,
  type AdminInstagramIcon,
  type AdminInstagramPost,
  type AdminInstagramScene,
  type AdminInstagramScreen,
  type AdminInstagramSettings,
  type AdminInstagramStatus,
  type AdminInstagramTemplate,
  instagramAdminService,
} from "../services/instagram-admin.service"
import { Segmented } from "./admin-segmented"
import { renderPostJpeg } from "./instagram-render"
import { ICONS, InstagramPostFluid, InstagramPostPreview, SCENES } from "./instagram-templates"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

// Madar Admin → إنستقرام. The agent writes the week's posts on Sunday; here they are seen as
// they'll look, edited and approved (one by one or the whole week). Approving makes each post's
// image in this browser, uploads it, and puts the post on the next publishing day; Madar posts it
// on Instagram at that time and adds the first comment.

const DAY_LABEL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const TEMPLATE_LABEL: Record<AdminInstagramTemplate, string> = {
  a: "صورة وقائمة (A)",
  b: "شاشات التطبيق (B)",
  c: "بطاقات (C)",
  d: "رقم كبير (D)",
  e: "سؤال اليوم (E)",
  f: "القديم ومع مدار (F)",
  g: "نصائح مرقمة (G)",
  h: "شاشة الجوال (H)",
  i: "جملة واحدة (I)",
  j: "صورة سينمائية (J)",
}
const KIND_LABEL: Record<AdminInstagramPost["kind"], string> = {
  news: "جديد في مدار",
  feature: "ميزة",
  tip: "نصيحة",
  question: "سؤال",
}
const SCREEN_LABEL: Record<AdminInstagramScreen, string> = {
  cashier: "شاشة الكاشير",
  products: "شاشة المنتجات",
  close: "إغلاق الوردية",
}
const CONNECT_MESSAGE: Record<string, [boolean, string]> = {
  connected: [true, "تم ربط حساب إنستقرام."],
  no_instagram: [false, "لم نجد حساب إنستقرام احترافي مربوط بصفحة فيسبوك في هذا الدخول."],
  cancelled: [false, "أُلغي الربط."],
  state_invalid: [false, "انتهت صلاحية محاولة الربط. حاول مرة أخرى."],
  token_failed: [false, "رفضت ميتا الدخول. حاول مرة أخرى."],
  accounts_failed: [false, "تعذر قراءة صفحاتك من ميتا. تأكد من منح كل الصلاحيات."],
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

// Fills the fields a template needs, so switching template in the editor never shows blanks.
function withDefaults(template: AdminInstagramTemplate, design: AdminInstagramDesign) {
  const next = { ...design }
  if (template === "a") {
    next.search ??= "برنامج كاشير"
    next.points = next.points?.length ? next.points : ["", "", ""]
  }
  if (template === "b") {
    next.sub ??= ""
    next.chips = next.chips?.length ? next.chips : ["", ""]
    next.screen ??= "cashier"
  }
  if (template === "c") {
    next.cards = next.cards?.length
      ? next.cards
      : (["pos", "store", "ads", "booking"] as AdminInstagramIcon[]).map((icon) => ({
          icon,
          title: ICONS[icon].label,
          text: "",
        }))
  }
  if (template === "d") {
    next.kicker ??= ""
    next.number ??= ""
    next.chips = next.chips?.length ? next.chips : ["", ""]
  }
  if (template === "e") {
    next.kicker ??= "سؤال اليوم"
    next.options = next.options?.length ? next.options : ["", "", "", ""]
  }
  if (template === "f") {
    next.wrong = next.wrong?.length ? next.wrong : ["", "", ""]
    next.right = next.right?.length ? next.right : ["", "", ""]
  }
  if (template === "g") {
    next.kicker ??= "نصيحة الأسبوع"
    next.steps = next.steps?.length
      ? next.steps
      : [
          { title: "", text: "" },
          { title: "", text: "" },
          { title: "", text: "" },
        ]
  }
  if (template === "h" || template === "i" || template === "j") next.sub ??= ""
  if (template === "j") next.scene ??= "shop-night"
  return next
}

// ---------- editing one post ----------

function Editor({
  post,
  onClose,
  onSaved,
}: {
  post: AdminInstagramPost
  onClose: () => void
  onSaved: (post: AdminInstagramPost) => void
}) {
  const [template, setTemplate] = useState<AdminInstagramTemplate>(post.template)
  const [design, setDesign] = useState<AdminInstagramDesign>(
    withDefaults(post.template, post.design)
  )
  const [caption, setCaption] = useState(post.caption)
  const [hashtags, setHashtags] = useState(post.hashtags.join(" "))
  const [firstComment, setFirstComment] = useState(post.firstComment ?? "")
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<AdminInstagramDesign>) =>
    setDesign((current) => ({ ...current, ...patch }))

  function chooseTemplate(next: AdminInstagramTemplate) {
    setTemplate(next)
    setDesign((current) => withDefaults(next, current))
  }

  async function save() {
    setSaving(true)
    try {
      const clean: AdminInstagramDesign = {
        titleTop: design.titleTop.trim(),
        titleBottom: design.titleBottom.trim(),
        cta: design.cta.trim(),
        ...(template === "a"
          ? {
              search: design.search?.trim(),
              points: (design.points ?? []).map((p) => p.trim()).filter(Boolean),
            }
          : {}),
        ...(template === "b"
          ? {
              sub: design.sub?.trim(),
              chips: (design.chips ?? []).map((c) => c.trim()).filter(Boolean),
              screen: design.screen,
            }
          : {}),
        ...(template === "c"
          ? { cards: (design.cards ?? []).filter((card) => card.title.trim()) }
          : {}),
        ...(template === "d"
          ? {
              kicker: design.kicker?.trim(),
              number: design.number?.trim(),
              chips: (design.chips ?? []).map((c) => c.trim()).filter(Boolean),
            }
          : {}),
        ...(template === "e"
          ? {
              kicker: design.kicker?.trim(),
              options: (design.options ?? []).map((o) => o.trim()).filter(Boolean),
            }
          : {}),
        ...(template === "f"
          ? {
              wrong: (design.wrong ?? []).map((w) => w.trim()).filter(Boolean),
              right: (design.right ?? []).map((r) => r.trim()).filter(Boolean),
            }
          : {}),
        ...(template === "g"
          ? {
              kicker: design.kicker?.trim(),
              steps: (design.steps ?? [])
                .map((step) => ({ title: step.title.trim(), text: step.text.trim() }))
                .filter((step) => step.title),
            }
          : {}),
        ...(template === "h" || template === "i" || template === "j"
          ? { sub: design.sub?.trim() }
          : {}),
        ...(template === "j" ? { scene: design.scene } : {}),
      }
      const saved = await instagramAdminService.updatePost(post.id, {
        template,
        design: clean,
        caption: caption.trim(),
        hashtags: hashtags
          .split(/\s+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
        firstComment: firstComment.trim() || null,
      })
      toast.success("تم حفظ المنشور.")
      onSaved(saved)
    } catch {
      toast.error("تعذر حفظ المنشور.")
    } finally {
      setSaving(false)
    }
  }

  const listField = (
    label: string,
    values: string[],
    onChange: (values: string[]) => void,
    max: number
  ) => (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <AppInput
            key={index}
            value={value}
            maxLength={max + 10}
            onChange={(event) =>
              onChange(values.map((entry, at) => (at === index ? event.target.value : entry)))
            }
            className={FIELD}
          />
        ))}
      </div>
    </div>
  )

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={<span dir="rtl">قراءة وتعديل المنشور</span>}
      contentClassName="max-w-5xl"
      footer={
        <div className="flex justify-end gap-2" dir="rtl">
          <AppButton variant="outline" className="rounded-[10px]" onClick={onClose}>
            إلغاء
          </AppButton>
          <AppButton className="rounded-[10px]" loading={saving} onClick={() => void save()}>
            حفظ
          </AppButton>
        </div>
      }
    >
      <div
        dir="rtl"
        className="grid max-h-[68vh] min-h-0 gap-6 overflow-y-auto pe-1 md:grid-cols-[1fr_400px]"
      >
        <div className="flex flex-col gap-4">
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
          <div>
            <label className={FIELD_LABEL}>التصميم</label>
            <AppSelect
              value={template}
              onValueChange={(value) => chooseTemplate(value as AdminInstagramTemplate)}
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {(Object.keys(TEMPLATE_LABEL) as AdminInstagramTemplate[]).map((key) => (
                  <AppSelectItem key={key} value={key}>
                    {TEMPLATE_LABEL[key]}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL}>العنوان (السطر الأول)</label>
              <AppInput
                value={design.titleTop}
                onChange={(e) => set({ titleTop: e.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>العنوان (السطر الملوّن)</label>
              <AppInput
                value={design.titleBottom}
                onChange={(e) => set({ titleBottom: e.target.value })}
                className={FIELD}
              />
            </div>
          </div>

          {template === "a" ? (
            <>
              <div>
                <label className={FIELD_LABEL}>سطر البحث أعلى الصورة</label>
                <AppInput
                  value={design.search ?? ""}
                  onChange={(e) => set({ search: e.target.value })}
                  className={FIELD}
                />
              </div>
              {listField(
                "النقاط (3 أو 4)",
                [
                  ...(design.points ?? []),
                  ...(design.points && design.points.length < 4 ? [""] : []),
                ].slice(0, 4),
                (points) => set({ points }),
                40
              )}
            </>
          ) : null}

          {template === "b" ? (
            <>
              <div>
                <label className={FIELD_LABEL}>السطر تحت العنوان</label>
                <AppInput
                  value={design.sub ?? ""}
                  onChange={(e) => set({ sub: e.target.value })}
                  className={FIELD}
                />
              </div>
              {listField(
                "الملصقان",
                (design.chips ?? ["", ""]).slice(0, 2),
                (chips) => set({ chips }),
                30
              )}
              <div>
                <label className={FIELD_LABEL}>الشاشة على اللابتوب</label>
                <AppSelect
                  value={design.screen ?? "cashier"}
                  onValueChange={(value) => set({ screen: value as AdminInstagramScreen })}
                >
                  <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {(Object.keys(SCREEN_LABEL) as AdminInstagramScreen[]).map((key) => (
                      <AppSelectItem key={key} value={key}>
                        {SCREEN_LABEL[key]}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
            </>
          ) : null}

          {template === "c" ? (
            <div>
              <label className={FIELD_LABEL}>البطاقات الأربع</label>
              <div className="flex flex-col gap-2">
                {(design.cards ?? []).map((card, index) => (
                  <div key={index} className="grid grid-cols-[140px_1fr_1.6fr] gap-2">
                    <AppSelect
                      value={card.icon}
                      onValueChange={(value) =>
                        set({
                          cards: (design.cards ?? []).map((entry, at) =>
                            at === index ? { ...entry, icon: value as AdminInstagramIcon } : entry
                          ),
                        })
                      }
                    >
                      <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {(Object.keys(ICONS) as AdminInstagramIcon[]).map((key) => (
                          <AppSelectItem key={key} value={key}>
                            {ICONS[key].label}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                    <AppInput
                      value={card.title}
                      placeholder="العنوان"
                      onChange={(e) =>
                        set({
                          cards: (design.cards ?? []).map((entry, at) =>
                            at === index ? { ...entry, title: e.target.value } : entry
                          ),
                        })
                      }
                      className={FIELD}
                    />
                    <AppInput
                      value={card.text}
                      placeholder="سطر قصير"
                      onChange={(e) =>
                        set({
                          cards: (design.cards ?? []).map((entry, at) =>
                            at === index ? { ...entry, text: e.target.value } : entry
                          ),
                        })
                      }
                      className={FIELD}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {template === "d" || template === "e" || template === "g" ? (
            <div>
              <label className={FIELD_LABEL}>السطر الصغير فوق العنوان</label>
              <AppInput
                value={design.kicker ?? ""}
                onChange={(e) => set({ kicker: e.target.value })}
                className={FIELD}
              />
            </div>
          ) : null}

          {template === "d" ? (
            <>
              <div>
                <label className={FIELD_LABEL}>الرقم الكبير</label>
                <AppInput
                  value={design.number ?? ""}
                  onChange={(e) => set({ number: e.target.value })}
                  className={FIELD}
                />
              </div>
              {listField(
                "الملصقات تحت العنوان (حتى 4)",
                [
                  ...(design.chips ?? []),
                  ...(design.chips && design.chips.length < 4 ? [""] : []),
                ].slice(0, 4),
                (chips) => set({ chips }),
                30
              )}
            </>
          ) : null}

          {template === "e"
            ? listField(
                "الخيارات الأربعة",
                (design.options ?? ["", "", "", ""]).slice(0, 4),
                (options) => set({ options }),
                26
              )
            : null}

          {template === "f" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {listField(
                "الطريقة القديمة",
                (design.wrong ?? ["", "", ""]).slice(0, 3),
                (wrong) => set({ wrong }),
                26
              )}
              {listField(
                "مع مدار",
                (design.right ?? ["", "", ""]).slice(0, 3),
                (right) => set({ right }),
                26
              )}
            </div>
          ) : null}

          {template === "g" ? (
            <div>
              <label className={FIELD_LABEL}>النصائح الثلاث</label>
              <div className="flex flex-col gap-2">
                {(design.steps ?? []).map((step, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1.6fr] gap-2">
                    <AppInput
                      value={step.title}
                      placeholder="العنوان"
                      onChange={(e) =>
                        set({
                          steps: (design.steps ?? []).map((entry, at) =>
                            at === index ? { ...entry, title: e.target.value } : entry
                          ),
                        })
                      }
                      className={FIELD}
                    />
                    <AppInput
                      value={step.text}
                      placeholder="سطر قصير"
                      onChange={(e) =>
                        set({
                          steps: (design.steps ?? []).map((entry, at) =>
                            at === index ? { ...entry, text: e.target.value } : entry
                          ),
                        })
                      }
                      className={FIELD}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {template === "h" || template === "i" || template === "j" ? (
            <div>
              <label className={FIELD_LABEL}>السطر تحت العنوان</label>
              <AppInput
                value={design.sub ?? ""}
                onChange={(e) => set({ sub: e.target.value })}
                className={FIELD}
              />
            </div>
          ) : null}

          {template === "j" ? (
            <div>
              <label className={FIELD_LABEL}>الصورة</label>
              <AppSelect
                value={design.scene ?? "shop-night"}
                onValueChange={(value) => set({ scene: value as AdminInstagramScene })}
              >
                <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {(Object.keys(SCENES) as AdminInstagramScene[]).map((key) => (
                    <AppSelectItem key={key} value={key}>
                      {SCENES[key].label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          ) : null}

          <div>
            <label className={FIELD_LABEL}>نص الزر</label>
            <AppInput
              value={design.cta}
              onChange={(e) => set({ cta: e.target.value })}
              className={FIELD}
            />
          </div>
          <div>
            <label className={cn(FIELD_LABEL, "flex justify-between")}>
              الكابشن
              <span className="text-xs font-normal text-muted-foreground">
                {caption.length}/2200
              </span>
            </label>
            <AppTextarea
              rows={7}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="rounded-[10px]"
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>الهاشتاقات</label>
            <AppInput
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className={FIELD}
              dir="auto"
            />
          </div>
          <div>
            <label className={FIELD_LABEL}>أول تعليق (يُكتب تلقائياً بعد النشر)</label>
            <AppInput
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        <div className="md:sticky md:top-0 md:self-start">
          <p className={FIELD_LABEL}>كما سيظهر على إنستقرام</p>
          <div className="overflow-hidden rounded-2xl border border-border/60 shadow-sm">
            <InstagramPostPreview template={template} design={design} size={398} />
          </div>
          <p className="mt-3 line-clamp-6 whitespace-pre-line text-xs leading-6 text-muted-foreground">
            {caption}
          </p>
        </div>
      </div>
    </AppDialog>
  )
}

// ---------- one post in a grid ----------

function PostCard({
  post,
  busy,
  onEdit,
  onAction,
}: {
  post: AdminInstagramPost
  busy: boolean
  onEdit: () => void
  onAction: (action: Action) => void
}) {
  const scheduled = post.status === "approved"
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm",
        post.warnings.length > 0 || post.status === "failed"
          ? "border-[#fde68a]"
          : "border-border/60"
      )}
    >
      <button type="button" onClick={onEdit} className="block w-full" aria-label="قراءة وتعديل">
        <InstagramPostFluid template={post.template} design={post.design} />
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <AppBadge
            variant="secondary"
            className="rounded-full bg-[#eff6ff] font-semibold text-[#1d4ed8]"
          >
            {KIND_LABEL[post.kind]}
          </AppBadge>
          <span className="text-xs text-muted-foreground">{TEMPLATE_LABEL[post.template]}</span>
        </div>
        <p className="text-sm font-bold text-foreground">{post.topic ?? post.design.titleTop}</p>
        <p className="line-clamp-3 whitespace-pre-line text-xs leading-6 text-muted-foreground">
          {post.caption}
        </p>
        {post.scheduledAt && post.status !== "draft" ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {post.status === "published"
              ? `نُشر ${formatWhen(post.publishedAt)}`
              : `يُنشر ${formatWhen(post.scheduledAt)}`}
          </p>
        ) : null}
        {post.status === "failed" || (post.lastError && post.status !== "published") ? (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            تعذر النشر: {post.lastError}
          </p>
        ) : null}
        {post.warnings.map((warning) => (
          <p
            key={warning}
            className="flex items-start gap-1.5 text-xs font-semibold text-[#b45309]"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {warning}
          </p>
        ))}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {post.status === "draft" || post.status === "failed" ? (
            <>
              <AppButton
                size="sm"
                className="rounded-[10px]"
                disabled={busy}
                loading={busy}
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
          {scheduled ? (
            <>
              <AppButton
                variant="outline"
                size="sm"
                className="rounded-[10px]"
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
          {post.permalink ? (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              aria-label="عرض على إنستقرام"
              title="عرض على إنستقرام"
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
          {post.status !== "published" && post.status !== "publishing" ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ---------- results ----------

function StatsView() {
  const [data, setData] = useState<{
    posts: AdminInstagramPost[]
    fromInstagram: { signups: number; leads: number }
  } | null>(null)

  useEffect(() => {
    instagramAdminService
      .stats()
      .then(setData)
      .catch(() => setData({ posts: [], fromInstagram: { signups: 0, leads: 0 } }))
  }, [])

  const totals = (data?.posts ?? []).reduce(
    (sum, post) => ({
      reach: sum.reach + (post.insights?.reach ?? 0),
      likes: sum.likes + (post.insights?.likes ?? 0),
      comments: sum.comments + (post.insights?.comments ?? 0),
    }),
    { reach: 0, likes: 0, comments: 0 }
  )
  const kpis: MadarAdminKpi[] = [
    {
      label: "الوصول",
      value: totals.reach.toLocaleString("en-US"),
      deltaPct: null,
      icon: Eye,
      tone: "blue",
    },
    {
      label: "الإعجابات",
      value: totals.likes.toLocaleString("en-US"),
      deltaPct: null,
      icon: Heart,
      tone: "rose",
    },
    {
      label: "التعليقات",
      value: totals.comments.toLocaleString("en-US"),
      deltaPct: null,
      icon: MessageCircle,
      tone: "violet",
    },
    {
      label: "تسجيلات من إنستقرام (30 يوماً)",
      value: String(data?.fromInstagram.signups ?? "—"),
      deltaPct: null,
      icon: UserPlus,
      tone: "green",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المنشور</AppTableHead>
              <AppTableHead>نُشر</AppTableHead>
              <AppTableHead className="text-center">الوصول</AppTableHead>
              <AppTableHead className="text-center">المشاهدات</AppTableHead>
              <AppTableHead className="text-center">إعجاب</AppTableHead>
              <AppTableHead className="text-center">تعليق</AppTableHead>
              <AppTableHead className="text-center">حفظ</AppTableHead>
              <AppTableHead className="text-center">مشاركة</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(data?.posts ?? []).map((post) => (
              <AppTableRow key={post.id}>
                <AppTableCell>
                  <div className="flex items-center gap-3">
                    {post.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a remote post image
                      <img src={post.imageUrl} alt="" className="size-12 rounded-lg object-cover" />
                    ) : null}
                    <span className="max-w-[260px] truncate text-sm font-semibold">
                      {post.topic ?? post.design.titleTop}
                    </span>
                  </div>
                </AppTableCell>
                <AppTableCell className="text-sm text-muted-foreground">
                  {formatWhen(post.publishedAt)}
                </AppTableCell>
                <AppTableCell className="text-center">{post.insights?.reach ?? "—"}</AppTableCell>
                <AppTableCell className="text-center">{post.insights?.views ?? "—"}</AppTableCell>
                <AppTableCell className="text-center">{post.insights?.likes ?? "—"}</AppTableCell>
                <AppTableCell className="text-center">
                  {post.insights?.comments ?? "—"}
                </AppTableCell>
                <AppTableCell className="text-center">{post.insights?.saved ?? "—"}</AppTableCell>
                <AppTableCell className="text-center">{post.insights?.shares ?? "—"}</AppTableCell>
                <AppTableCell>
                  {post.permalink ? (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="عرض على إنستقرام"
                    >
                      <ExternalLink className="size-4 text-muted-foreground" />
                    </a>
                  ) : null}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {data === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : data.posts.length === 0 ? (
          <AppTableEmpty
            title="لا توجد منشورات منشورة بعد"
            description="تظهر هنا أرقام كل منشور بعد نشره."
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        التسجيلات تُحسب لمن جاء من رابط البايو (utm_source=instagram). أرقام المنشورات تتحدث من
        إنستقرام عند فتح هذه الصفحة.
      </p>
    </div>
  )
}

// ---------- settings ----------

function SettingsView({
  data,
  onSaved,
}: {
  data: AdminInstagramSettings
  onSaved: (settings: AdminInstagramSettings) => void
}) {
  const [settings, setSettings] = useState(data)
  const [saving, setSaving] = useState(false)
  const row =
    "flex flex-wrap items-center justify-between gap-4 border-b border-border/60 py-4 last:border-b-0"

  async function save() {
    setSaving(true)
    try {
      onSaved(await instagramAdminService.updateSettings(settings))
      toast.success("تم حفظ إعدادات إنستقرام.")
    } catch {
      toast.error("تعذر الحفظ.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppCard
      title="إعدادات إنستقرام"
      subtitle="متى يكتب الوكيل، وكم منشوراً، ومتى تُنشر المنشورات بعد اعتمادها."
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
            <p className="text-sm font-semibold text-foreground">الوكيل يكتب منشورات كل أسبوع</p>
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
            <p className="text-sm font-semibold text-foreground">عدد المنشورات في الأسبوع</p>
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
                  {count} {count === 1 ? "منشور" : count === 2 ? "منشوران" : "منشورات"}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>
        <div className={row}>
          <div>
            <p className="text-sm font-semibold text-foreground">أيام النشر</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              كل منشور معتمد يأخذ أقرب يوم متاح منها.
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

// ---------- the account ----------

function ConnectionCard({
  status,
  onConnect,
  onDisconnect,
  connecting,
}: {
  status: AdminInstagramStatus
  onConnect: () => void
  onDisconnect: () => void
  connecting: boolean
}) {
  const { connection } = status
  if (!connection.connected) {
    return (
      <AppCard className="rounded-2xl border-[#bfdbfe] bg-[#f5f9ff] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4" dir="rtl">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white">
              <AtSign className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">اربط حساب مدار على إنستقرام</p>
              <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
                سجّل الدخول بفيسبوك واختر صفحة مدار المربوطة بإنستقرام، ووافق على صلاحيات النشر.
                يُطلب مرة واحدة فقط.
              </p>
            </div>
          </div>
          <AppButton
            className="rounded-[10px]"
            loading={connecting}
            onClick={onConnect}
            icon={<Link2 className="size-4" />}
          >
            ربط حساب إنستقرام
          </AppButton>
        </div>
      </AppCard>
    )
  }
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        {connection.igPictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Instagram profile picture
          <img src={connection.igPictureUrl} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <AtSign className="size-5" />
          </span>
        )}
        <div>
          <p className="text-sm font-bold text-foreground" dir="ltr">
            @{connection.igUsername}
          </p>
          <p className="text-xs text-muted-foreground">
            مربوط عبر صفحة «{connection.pageName}» · يُنشر تلقائياً بعد اعتمادك
          </p>
        </div>
      </div>
      <AppButton variant="outline" size="sm" className="rounded-[10px]" onClick={onDisconnect}>
        فصل الحساب
      </AppButton>
    </div>
  )
}

// ---------- the page ----------

export function MadarAdminInstagram() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>("review")
  const [posts, setPosts] = useState<AdminInstagramPost[] | null>(null)
  const [status, setStatus] = useState<AdminInstagramStatus | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [confirm, setConfirm] = useState<
    | { kind: "delete" | "publish"; post: AdminInstagramPost }
    | { kind: "write" }
    | { kind: "disconnect" }
    | null
  >(null)

  const load = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([
        instagramAdminService.listPosts(),
        instagramAdminService.status(),
      ])
      setPosts(list.posts)
      setStatus(current)
    } catch {
      setPosts([])
      toast.error("تعذر تحميل صفحة إنستقرام.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Back from Meta's sign-in.
  useEffect(() => {
    const outcome = searchParams.get("connect")
    if (!outcome) return
    const [ok, message] = CONNECT_MESSAGE[outcome] ?? [false, "تعذر الربط. حاول مرة أخرى."]
    if (ok) toast.success(message)
    else toast.error(message)
    window.history.replaceState(null, "", window.location.pathname)
  }, [searchParams])

  const drafts = useMemo(
    () => (posts ?? []).filter((post) => post.status === "draft" || post.status === "failed"),
    [posts]
  )
  const scheduled = (posts ?? [])
    .filter((post) => post.status === "approved" || post.status === "publishing")
    .sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? ""))
  const published = (posts ?? []).filter((post) => post.status === "published")
  const weeks = useMemo(() => {
    const groups = new Map<string, AdminInstagramPost[]>()
    for (const post of drafts) {
      const key = post.weekStart ?? "manual"
      groups.set(key, [...(groups.get(key) ?? []), post])
    }
    return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]))
  }, [drafts])

  const replace = (updated: AdminInstagramPost[]) =>
    setPosts((current) =>
      (current ?? []).map((post) => updated.find((entry) => entry.id === post.id) ?? post)
    )

  // Makes and uploads the image of every post that doesn't have one yet.
  async function ensureImages(list: AdminInstagramPost[]) {
    for (const post of list) {
      if (post.imageUrl) continue
      const jpeg = await renderPostJpeg(post)
      replace([await instagramAdminService.uploadImage(post.id, jpeg)])
    }
  }

  async function run(post: AdminInstagramPost, action: Action) {
    setBusy(post.id)
    try {
      if (action === "delete") {
        await instagramAdminService.deletePost(post.id)
        setPosts((current) => (current ?? []).filter((entry) => entry.id !== post.id))
        toast.success("حُذف المنشور.")
        return
      }
      if (action === "approve" || action === "publish") await ensureImages([post])
      const updated =
        action === "approve"
          ? await instagramAdminService.approve(post.id)
          : action === "reject"
            ? await instagramAdminService.reject(post.id)
            : action === "publish"
              ? await instagramAdminService.publishNow(post.id)
              : await instagramAdminService.unschedule(post.id)
      replace([updated])
      if (action === "approve") toast.success(`سيُنشر ${formatWhen(updated.scheduledAt)}.`)
      if (action === "publish") toast.success("يُنشر على إنستقرام خلال دقائق.")
      if (action === "unschedule") toast.success("أُعيد المنشور إلى المراجعة.")
      if (action === "reject") toast.success("رُفض المنشور ولن يُنشر.")
    } catch {
      toast.error("تعذر تنفيذ الطلب.")
    } finally {
      setBusy(null)
    }
  }

  function act(post: AdminInstagramPost, action: Action) {
    if (action === "delete" || action === "publish") setConfirm({ kind: action, post })
    else void run(post, action)
  }

  async function approveWeek(weekStart: string, group: AdminInstagramPost[]) {
    setBusy(weekStart)
    const progress = toast.loading("جاري تجهيز صور المنشورات…")
    try {
      await ensureImages(group)
      if (weekStart === "manual") {
        for (const post of group) replace([await instagramAdminService.approve(post.id)])
      } else {
        replace((await instagramAdminService.approveWeek(weekStart)).posts)
      }
      toast.success("اعتُمد الأسبوع وجُدولت المنشورات في أيام النشر.", { id: progress })
      setTab("scheduled")
    } catch {
      toast.error("تعذر الاعتماد.", { id: progress })
    } finally {
      setBusy(null)
    }
  }

  async function connect() {
    setConnecting(true)
    try {
      const { url } = await instagramAdminService.connect()
      window.location.href = url
    } catch {
      toast.error("تعذر بدء الربط.")
      setConnecting(false)
    }
  }

  const editingPost = (posts ?? []).find((post) => post.id === editing) ?? null
  const lastRun = status?.lastRun
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
      label: "منشورة",
      value: String(published.length),
      deltaPct: null,
      icon: AtSign,
      tone: "rose",
    },
    {
      label: "وصول المنشورات",
      value: published
        .reduce((sum, post) => sum + (post.insights?.reach ?? 0), 0)
        .toLocaleString("en-US"),
      deltaPct: null,
      icon: Eye,
      tone: "blue",
    },
  ]

  const grid = (items: AdminInstagramPost[], title: string, description: string) =>
    items.length === 0 ? (
      <AppCard className="rounded-2xl border-border/60 shadow-sm">
        <AppTableEmpty title={title} description={description} />
      </AppCard>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            busy={busy === post.id}
            onEdit={() => setEditing(post.id)}
            onAction={(action) => act(post, action)}
          />
        ))}
      </div>
    )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إنستقرام</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الوكيل يجهّز منشورات الأسبوع كل أحد. راجعها واعتمدها، وتُنشر تلقائياً على حساب مدار في
            أيام النشر.
          </p>
          {lastRun ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" />
              آخر تجهيز: أسبوع {formatDay(lastRun.weekStart)} ·{" "}
              {lastRun.status === "done"
                ? `${lastRun.postsWritten} منشورات`
                : lastRun.status === "running"
                  ? "يكتب الآن…"
                  : "تعذر، سيحاول مرة أخرى"}
            </p>
          ) : null}
        </div>
        <AppButton
          className="rounded-[10px]"
          disabled={!status?.agentAvailable}
          title={status?.agentAvailable ? undefined : "الوكيل غير مفعّل في هذه البيئة"}
          onClick={() => setConfirm({ kind: "write" })}
          icon={<Sparkles className="size-4" />}
        >
          جهّز منشورات الآن
        </AppButton>
      </div>

      {status ? (
        <ConnectionCard
          status={status}
          connecting={connecting}
          onConnect={() => void connect()}
          onDisconnect={() => setConfirm({ kind: "disconnect" })}
        />
      ) : null}

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
        {status ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarCheck2 className="size-4" />
            النشر: {status.settings.publishDays.map((day) => DAY_LABEL[day]).join("، ")} الساعة{" "}
            {String(status.settings.publishHour).padStart(2, "0")}:00
          </p>
        ) : null}
      </div>

      {posts === null ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
      ) : tab === "review" ? (
        weeks.length === 0 ? (
          grid(
            [],
            "لا توجد منشورات بانتظار المراجعة",
            "يجهّز الوكيل منشورات الأسبوع كل يوم أحد صباحاً."
          )
        ) : (
          weeks.map(([weekStart, group]) => (
            <AppCard
              key={weekStart}
              title={
                weekStart === "manual" ? "منشورات أخرى" : `منشورات أسبوع ${formatDay(weekStart)}`
              }
              subtitle={`${group.length} ${group.length === 1 ? "منشور" : "منشورات"} · اعتمدها كلها مرة واحدة أو واحداً واحداً.`}
              className="rounded-2xl border-border/60 shadow-sm"
              actions={
                <AppButton
                  className="rounded-[10px]"
                  loading={busy === weekStart}
                  disabled={!status?.connection.connected}
                  title={status?.connection.connected ? undefined : "اربط حساب إنستقرام أولاً"}
                  onClick={() => void approveWeek(weekStart, group)}
                  icon={<CheckCheck className="size-4" />}
                >
                  اعتماد الأسبوع
                </AppButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((post) => (
                  <PostCard
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
        grid(scheduled, "لا توجد منشورات مجدولة", "المنشورات المعتمدة تظهر هنا حتى يحين يوم نشرها.")
      ) : tab === "published" ? (
        grid(published, "لم يُنشر أي منشور بعد", "بعد النشر تجد هنا رابط كل منشور على إنستقرام.")
      ) : tab === "stats" ? (
        <StatsView />
      ) : status ? (
        <SettingsView
          data={status.settings}
          onSaved={(saved) => setStatus({ ...status, settings: saved })}
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
              ? "حذف المنشور"
              : confirm?.kind === "publish"
                ? "نشر المنشور الآن"
                : confirm?.kind === "disconnect"
                  ? "فصل حساب إنستقرام"
                  : "تجهيز منشورات الآن"}
          </span>
        }
        description={
          <span dir="rtl">
            {confirm?.kind === "delete"
              ? "سيُحذف المنشور نهائياً من مدار."
              : confirm?.kind === "publish"
                ? "سيُنشر على حساب مدار في إنستقرام خلال دقائق بدل موعده."
                : confirm?.kind === "disconnect"
                  ? "لن تُنشر المنشورات المجدولة حتى تربط الحساب مرة أخرى."
                  : "يجهّز الوكيل منشورات هذا الأسبوع الآن. تأخذ دقيقة أو دقيقتين، ولا يُنشر شيء قبل اعتمادك."}
          </span>
        }
        confirmLabel={
          confirm?.kind === "delete"
            ? "حذف"
            : confirm?.kind === "publish"
              ? "انشر الآن"
              : confirm?.kind === "disconnect"
                ? "فصل"
                : "ابدأ"
        }
        confirmTone={
          confirm?.kind === "delete" || confirm?.kind === "disconnect" ? "destructive" : "default"
        }
        cancelLabel="إلغاء"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const current = confirm
          setConfirm(null)
          if (!current) return
          if (current.kind === "write") {
            try {
              await instagramAdminService.runAgent()
              toast.success("بدأ الوكيل التجهيز. تظهر المنشورات هنا خلال دقيقة أو دقيقتين.")
              for (const delay of [45_000, 90_000, 180_000]) setTimeout(() => void load(), delay)
            } catch {
              toast.error("الوكيل غير متاح الآن.")
            }
          } else if (current.kind === "disconnect") {
            await instagramAdminService.disconnect().catch(() => undefined)
            await load()
          } else {
            await run(current.post, current.kind)
          }
        }}
      />
    </div>
  )
}
