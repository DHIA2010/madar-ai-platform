"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLocale } from "next-intl"
import {
  ExternalLink,
  ImagePlus,
  Loader2,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Plus,
  Send,
  ShoppingBag,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDateField, AppDialog, AppSearchableSelect } from "@/components/app"

import {
  type AudienceKind,
  type CampaignAudience,
  type CampaignRecipient,
  type WhatsAppCampaign,
  whatsAppCampaignsService,
  type WhatsAppOffer,
} from "../services/campaigns.service"

import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD =
  "h-11 w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-[13px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
const LABEL = "mb-1.5 block text-[12.5px] font-semibold text-[#344054]"
const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#2563eb] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
const SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-4 text-[13px] font-semibold text-[#0b1738] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
const NAME_TOKEN = "{الاسم}"

function useTx() {
  const ar = (useLocale() as Locale) === "ar"
  return {
    ar,
    tx: (arabic: string, english: string) => (ar ? arabic : english),
    money: (value: number) => {
      const amount = new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value)
      return ar ? `${amount} ر.س` : `SAR ${amount}`
    },
    num: (value: number) => new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US").format(value),
    date: (value: string | null) =>
      value
        ? new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(value))
        : "—",
  }
}

function errorText(error: unknown, ar: boolean): string {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined
  const message =
    error && typeof error === "object" ? (error as { message?: string }).message : undefined
  const known: Record<string, [string, string]> = {
    WHATSAPP_NOT_CONNECTED: [
      "اربط رقمك التجاري أولًا من الإعدادات ← واتساب.",
      "Connect your business number first (Settings → WhatsApp).",
    ],
    WHATSAPP_OFFER_NAME_EDGE: [
      "لا يمكن أن يكون اسم العميل أول أو آخر كلمة في الرسالة.",
      "The customer's name can't be the first or last word.",
    ],
    WHATSAPP_OFFER_BUTTON: [
      "الزر يحتاج نصًا ورابطًا يبدأ بـ https://",
      "The button needs text and a link starting with https://",
    ],
    WHATSAPP_OFFER_IMAGE: ["تعذرت قراءة الصورة.", "The picture couldn't be read."],
    WHATSAPP_OFFER_NOT_APPROVED: [
      "العرض لم تعتمده Meta بعد.",
      "Meta hasn't approved this offer yet.",
    ],
    WHATSAPP_OFFER_IN_USE: [
      "حملة بانتظار الإرسال تستخدم هذا العرض.",
      "A campaign waiting to send uses this offer.",
    ],
    WHATSAPP_CAMPAIGN_EMPTY: ["لا يوجد عملاء في هذه الفئة.", "No customers match this group."],
    WHATSAPP_CAMPAIGN_CONSENT: [
      "أكّد أن العملاء وافقوا على استلام العروض.",
      "Confirm the customers agreed to receive offers.",
    ],
  }
  const entry = code ? known[code] : undefined
  if (entry) return ar ? entry[0] : entry[1]
  if (code === "WHATSAPP_OFFER_REFUSED" && message) return message
  return ar ? "تعذر تنفيذ الطلب. حاول مرة أخرى." : "Something went wrong. Try again."
}

const OFFER_STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  PENDING: {
    ar: "بانتظار موافقة Meta",
    en: "Waiting for Meta",
    tone: "bg-[#fffbeb] text-[#b45309]",
  },
  APPROVED: { ar: "معتمد", en: "Approved", tone: "bg-[#ecfdf5] text-[#047857]" },
  REJECTED: { ar: "مرفوض", en: "Rejected", tone: "bg-[#fef2f2] text-[#b42318]" },
  PAUSED: { ar: "موقوف مؤقتًا", en: "Paused", tone: "bg-[#fffbeb] text-[#b45309]" },
  DISABLED: { ar: "معطّل", en: "Disabled", tone: "bg-[#fef2f2] text-[#b42318]" },
  FAILED: { ar: "لم يُقبل", en: "Not accepted", tone: "bg-[#fef2f2] text-[#b42318]" },
}

const CAMPAIGN_STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  scheduled: { ar: "مجدولة", en: "Scheduled", tone: "bg-[#eff6ff] text-[#2563eb]" },
  sending: { ar: "جارٍ الإرسال", en: "Sending", tone: "bg-[#fffbeb] text-[#b45309]" },
  sent: { ar: "أُرسلت", en: "Sent", tone: "bg-[#ecfdf5] text-[#047857]" },
  cancelled: { ar: "ملغاة", en: "Cancelled", tone: "bg-[#f1f5f9] text-[#475569]" },
  failed: { ar: "فشلت", en: "Failed", tone: "bg-[#fef2f2] text-[#b42318]" },
}

const RECIPIENT_STATUS: Record<string, [string, string]> = {
  queued: ["بالانتظار", "Waiting"],
  claimed: ["يُرسل", "Sending"],
  sent: ["أُرسلت", "Sent"],
  delivered: ["وصلت", "Delivered"],
  read: ["قُرئت", "Read"],
  failed: ["لم تصل", "Not delivered"],
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap", tone)}
    >
      {children}
    </span>
  )
}

function audienceLabel(audience: CampaignAudience, tx: (a: string, e: string) => string) {
  const days = audience.days ?? 30
  switch (audience.kind) {
    case "recent":
      return tx(`اشتروا خلال آخر ${days} يوم`, `Bought in the last ${days} days`)
    case "inactive":
      return tx(`لم يشتروا منذ ${days} يوم`, `No purchase for ${days} days`)
    case "never":
      return tx("لم يشتروا بعد", "Never bought")
    case "spent":
      return tx(
        `أنفقوا ${audience.minAmount ?? 0} ر.س أو أكثر`,
        `Spent SAR ${audience.minAmount ?? 0}+`
      )
    case "loyalty":
      return tx(
        `أعضاء الولاء (${audience.minPoints ?? 0} نقطة فأكثر)`,
        `Loyalty members (${audience.minPoints ?? 0}+ points)`
      )
    default:
      return tx("كل العملاء", "All customers")
  }
}

// What the customer sees: the offer as a WhatsApp message.
function OfferBubble({
  body,
  imageUrl,
  buttonText,
  compact = false,
}: {
  body: string
  imageUrl: string | null
  buttonText: string | null
  compact?: boolean
}) {
  const { tx } = useTx()
  return (
    <div className="rounded-[14px] bg-[#efeae2] p-3">
      <div className="max-w-[300px] overflow-hidden rounded-[10px] bg-white shadow-sm">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className={cn("w-full object-cover", compact ? "h-28" : "h-40")}
          />
        ) : null}
        <p
          className={cn(
            "px-3 pt-2 text-[13px] leading-6 whitespace-pre-wrap text-[#111b21]",
            compact && "line-clamp-4"
          )}
        >
          {(body || tx("نص العرض…", "Offer text…")).split(NAME_TOKEN).join(tx("محمد", "Mohammed"))}
        </p>
        <p className="px-3 pb-2 text-[11px] text-[#8696a0]">
          {tx("لإيقاف العروض اضغط الزر أدناه", "Tap below to stop offers")}
        </p>
        {buttonText ? (
          <div className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[13px] font-semibold text-[#027eb5]">
            <ExternalLink className="size-3.5" />
            {buttonText}
          </div>
        ) : null}
        <div className="border-t border-[#e9edef] py-2 text-center text-[13px] font-semibold text-[#027eb5]">
          إيقاف العروض
        </div>
      </div>
    </div>
  )
}

const FIELD_TRIGGER = "h-11 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
const pad = (value: number) => String(value).padStart(2, "0")

// Madar's dropdown.
function Choice({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const { tx } = useTx()
  return (
    <AppSearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={tx("اختر", "Choose")}
      searchPlaceholder={tx("بحث...", "Search...")}
      emptyLabel={tx("لا توجد نتائج", "No results")}
      triggerClassName={FIELD_TRIGGER}
    />
  )
}

// A day (Madar's calendar) and a quarter-hour time. The value is an ISO instant, or "".
function DateTimeField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { ar, tx } = useTx()
  const date = value ? new Date(value) : null
  const day = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : ""
  const clock = date
    ? `${pad(date.getHours())}:${pad(Math.floor(date.getMinutes() / 15) * 15)}`
    : ""
  const label = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number)
    return new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn" : "en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(2026, 0, 1, hours, minutes))
  }
  const times = Array.from(
    { length: 96 },
    (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`
  )
  const build = (nextDay: string, nextClock: string) => {
    if (!nextDay) return ""
    const [year, month, dayOfMonth] = nextDay.split("-").map(Number)
    const [hours, minutes] = (nextClock || "20:00").split(":").map(Number)
    return new Date(year, month - 1, dayOfMonth, hours, minutes).toISOString()
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-2">
      <AppDateField
        value={day}
        onChange={(next) => onChange(build(next, clock))}
        triggerClassName={FIELD_TRIGGER}
      />
      <AppSearchableSelect
        value={clock}
        onChange={(next) => {
          const today = new Date()
          onChange(
            build(
              day || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
              next
            )
          )
        }}
        options={times.map((time) => ({ value: time, label: label(time), keywords: time }))}
        placeholder={tx("الوقت", "Time")}
        searchPlaceholder={tx("ابحث عن وقت", "Find a time")}
        emptyLabel={tx("لا توجد نتائج", "No results")}
        triggerClassName={FIELD_TRIGGER}
      />
    </div>
  )
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Settings -> العملاء -> حملات واتساب: offers the business writes (Meta reviews each), and
// campaigns that send one to a group of its customers from its own number.
export function WhatsAppCampaignsPage() {
  const locale = useLocale() as Locale
  const { tx, ar } = useTx()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [tab, setTab] = useState<"campaigns" | "offers">("campaigns")
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[] | null>(null)
  const [offers, setOffers] = useState<WhatsAppOffer[] | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [openCampaign, setOpenCampaign] = useState<string | null>(null)

  const load = useCallback(() => {
    void whatsAppCampaignsService
      .list()
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
    void whatsAppCampaignsService
      .offers()
      .then(setOffers)
      .catch(() => setOffers([]))
  }, [])

  useEffect(() => {
    whatsAppCampaignsService
      .connected()
      .then(setConnected)
      .catch(() => setConnected(false))
    load()
  }, [load])

  // While something is sending (or waiting on Meta), the numbers refresh on their own.
  const busy =
    campaigns?.some((campaign) => ["scheduled", "sending"].includes(campaign.status)) ||
    offers?.some((offer) => offer.status === "PENDING")
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(load, 20_000)
    return () => window.clearInterval(timer)
  }, [busy, load])

  const approved = (offers ?? []).filter((offer) => offer.status === "APPROVED")

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#16a34a]">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h1 className={cn("text-[22px] leading-8 font-extrabold", HEADING)}>
              {tx("حملات واتساب", "WhatsApp campaigns")}
            </h1>
            <p className={cn("text-[13px]", MUTED)}>
              {tx(
                "أرسل عروضك لعملائك من رقمك التجاري، وتابع من قرأ ومن نقر ومن اشترى.",
                "Send offers to your customers from your business number, and see who read, clicked and bought."
              )}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SECONDARY} onClick={() => setOfferOpen(true)}>
              <Plus className="size-4" />
              {tx("عرض جديد", "New offer")}
            </button>
            <button type="button" className={PRIMARY} onClick={() => setCampaignOpen(true)}>
              <Send className="size-4" />
              {tx("حملة جديدة", "New campaign")}
            </button>
          </div>
        ) : null}
      </header>

      {connected === null ? (
        <div className="flex justify-center py-16 text-[#6b7b96]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !connected ? (
        <div
          className={cn(PANEL, "mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center")}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#16a34a]">
            <MessageCircle className="size-7" />
          </span>
          <h2 className={cn("text-[18px] font-extrabold", HEADING)}>
            {tx("اربط رقمك التجاري أولًا", "Connect your business number first")}
          </h2>
          <p className={cn("text-[13px] leading-6", MUTED)}>
            {tx(
              "الحملات تُرسل من رقم واتساب الخاص بمتجرك عبر Meta. تحاسبك Meta على كل رسالة تسويقية من حسابك مباشرة، ومدار لا يأخذ أي رسوم إضافية.",
              "Campaigns go out from your store's own WhatsApp number through Meta. Meta bills your account for each marketing message; Madar adds nothing."
            )}
          </p>
          <Link href={ROUTES.settingsWhatsApp} className={PRIMARY}>
            {tx("ربط الرقم", "Connect the number")}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-1 rounded-[12px] bg-[#f1f5f9] p-1 sm:w-fit">
            {(
              [
                ["campaigns", tx("الحملات", "Campaigns")],
                ["offers", tx("العروض", "Offers")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "h-9 flex-1 rounded-[9px] px-5 text-[13px] font-bold transition sm:flex-none",
                  tab === key ? "bg-white text-[#2563eb] shadow-sm" : "text-[#5b6b85]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "campaigns" ? (
            campaigns === null ? (
              <div className="flex justify-center py-16 text-[#6b7b96]">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : campaigns.length === 0 ? (
              <EmptyState
                title={tx("لا توجد حملات بعد", "No campaigns yet")}
                text={
                  approved.length === 0
                    ? tx(
                        "ابدأ بكتابة عرض. ترسله Meta للمراجعة، وبعد اعتماده تستطيع إرساله لعملائك.",
                        "Start by writing an offer. Meta reviews it, then you can send it to your customers."
                      )
                    : tx(
                        "أرسل عرضك المعتمد لفئة من عملائك.",
                        "Send your approved offer to a group of customers."
                      )
                }
                action={
                  approved.length === 0 ? (
                    <button type="button" className={PRIMARY} onClick={() => setOfferOpen(true)}>
                      <Plus className="size-4" />
                      {tx("عرض جديد", "New offer")}
                    </button>
                  ) : (
                    <button type="button" className={PRIMARY} onClick={() => setCampaignOpen(true)}>
                      <Send className="size-4" />
                      {tx("حملة جديدة", "New campaign")}
                    </button>
                  )
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {campaigns.map((campaign) => (
                  <CampaignRow
                    key={campaign.id}
                    campaign={campaign}
                    onOpen={() => setOpenCampaign(campaign.id)}
                  />
                ))}
              </div>
            )
          ) : offers === null ? (
            <div className="flex justify-center py-16 text-[#6b7b96]">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              title={tx("لا توجد عروض بعد", "No offers yet")}
              text={tx(
                "العرض هو الرسالة التي تصل للعميل: نص، صورة اختيارية، وزر برابط. تراجعه Meta خلال دقائق إلى يوم.",
                "An offer is the message the customer gets: text, an optional picture and a link button. Meta reviews it within minutes to a day."
              )}
              action={
                <button type="button" className={PRIMARY} onClick={() => setOfferOpen(true)}>
                  <Plus className="size-4" />
                  {tx("عرض جديد", "New offer")}
                </button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {offers.map((offer) => (
                <div key={offer.id} className={cn(PANEL, "flex flex-col gap-3 p-4")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-[14px] font-extrabold", HEADING)}>{offer.title}</p>
                    <Badge tone={OFFER_STATUS[offer.status]?.tone ?? "bg-[#f1f5f9] text-[#475569]"}>
                      {ar
                        ? (OFFER_STATUS[offer.status]?.ar ?? offer.status)
                        : (OFFER_STATUS[offer.status]?.en ?? offer.status)}
                    </Badge>
                  </div>
                  <OfferBubble
                    body={offer.body}
                    imageUrl={offer.imageUrl}
                    buttonText={offer.buttonText}
                    compact
                  />
                  {offer.rejectedReason ? (
                    <p className="text-[12px] text-[#b42318]">
                      {tx("سبب الرفض", "Reason")}: {offer.rejectedReason}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2">
                    {offer.status === "APPROVED" ? (
                      <button
                        type="button"
                        className="text-[12.5px] font-bold text-[#2563eb] hover:underline"
                        onClick={() => setCampaignOpen(true)}
                      >
                        {tx("إرسال كحملة", "Send as a campaign")}
                      </button>
                    ) : (
                      <span className={cn("text-[12px]", MUTED)}>
                        {offer.status === "PENDING"
                          ? tx("تتحدث الحالة تلقائيًا", "Updates on its own")
                          : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      title={tx("حذف", "Delete")}
                      className="rounded-lg p-1.5 text-[#b42318] hover:bg-[#fef2f2]"
                      onClick={() => {
                        if (!window.confirm(tx("حذف هذا العرض؟", "Delete this offer?"))) return
                        whatsAppCampaignsService
                          .deleteOffer(offer.id)
                          .then(load)
                          .catch((error: unknown) => toast.error(errorText(error, ar)))
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {offerOpen ? (
        <OfferDialog
          onClose={() => setOfferOpen(false)}
          onCreated={() => {
            setOfferOpen(false)
            setTab("offers")
            load()
          }}
        />
      ) : null}
      {campaignOpen ? (
        <CampaignDialog
          offers={approved}
          onClose={() => setCampaignOpen(false)}
          onNewOffer={() => {
            setCampaignOpen(false)
            setOfferOpen(true)
          }}
          onCreated={(id) => {
            setCampaignOpen(false)
            setTab("campaigns")
            load()
            setOpenCampaign(id)
          }}
        />
      ) : null}
      {openCampaign ? (
        <CampaignDetail id={openCampaign} onClose={() => setOpenCampaign(null)} onChanged={load} />
      ) : null}
    </div>
  )
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action: React.ReactNode
}) {
  return (
    <div className={cn(PANEL, "flex flex-col items-center gap-3 p-10 text-center")}>
      <Megaphone className="size-9 text-[#c3cfe0]" />
      <p className={cn("text-[16px] font-extrabold", HEADING)}>{title}</p>
      <p className={cn("max-w-md text-[13px] leading-6", MUTED)}>{text}</p>
      {action}
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "text-[#0b1738]",
}: {
  icon: typeof Send
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-[#f7f9fc] px-3 py-2">
      <span className={cn("flex items-center gap-1 text-[11px] font-semibold", MUTED)}>
        <Icon className="size-3" />
        {label}
      </span>
      <span className={cn("truncate text-[15px] font-extrabold", tone)}>{value}</span>
    </div>
  )
}

function CampaignRow({ campaign, onOpen }: { campaign: WhatsAppCampaign; onOpen: () => void }) {
  const { tx, ar, num, money, date } = useTx()
  const status = CAMPAIGN_STATUS[campaign.status]
  const { stats } = campaign
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        PANEL,
        "flex flex-col gap-3 p-4 text-start transition hover:border-[#2563eb]/40"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate text-[15px] font-extrabold", HEADING)}>{campaign.name}</p>
          <p className={cn("text-[12px]", MUTED)}>
            {campaign.offerTitle} · {audienceLabel(campaign.audience, tx)} ·{" "}
            {campaign.status === "scheduled"
              ? `${tx("موعدها", "At")} ${date(campaign.scheduledAt)}`
              : date(campaign.startedAt ?? campaign.scheduledAt)}
          </p>
        </div>
        <Badge tone={status?.tone ?? "bg-[#f1f5f9] text-[#475569]"}>
          {ar ? (status?.ar ?? campaign.status) : (status?.en ?? campaign.status)}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Metric icon={Users} label={tx("المستلمون", "Recipients")} value={num(stats.recipients)} />
        <Metric icon={Send} label={tx("وصلت", "Delivered")} value={`${num(stats.delivered)}`} />
        <Metric
          icon={MessageCircle}
          label={tx("قُرئت", "Read")}
          value={`${pct(stats.read, stats.delivered)}%`}
        />
        <Metric icon={MousePointerClick} label={tx("نقرات", "Clicks")} value={num(stats.clicked)} />
        <Metric
          icon={ShoppingBag}
          label={tx("طلبات بعدها", "Orders after")}
          value={num(stats.orders)}
        />
        <Metric
          icon={ShoppingBag}
          label={tx("مبيعات بعدها", "Sales after")}
          value={money(stats.sales)}
          tone="text-[#047857]"
        />
      </div>
    </button>
  )
}

function OfferDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { tx, ar } = useTx()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [buttonText, setButtonText] = useState("")
  const [buttonUrl, setButtonUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const insertName = () => {
    const area = bodyRef.current
    const at = area?.selectionStart ?? body.length
    setBody((current) => `${current.slice(0, at)}${NAME_TOKEN}${current.slice(at)}`)
  }

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(tx("الصورة أكبر من 5 ميجا.", "The picture is over 5 MB."))
      return
    }
    setUploading(true)
    try {
      const dataBase64 = await readAsBase64(file)
      const result = await whatsAppCampaignsService.uploadImage({
        contentType: file.type === "image/png" ? "image/png" : "image/jpeg",
        dataBase64,
      })
      setImageUrl(result.url)
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await whatsAppCampaignsService.createOffer({
        title: title.trim(),
        body: body.trim(),
        imageUrl,
        buttonText: buttonText.trim() || null,
        buttonUrl: buttonUrl.trim() || null,
      })
      toast.success(tx("أُرسل العرض إلى Meta للمراجعة.", "The offer was sent to Meta for review."))
      onCreated()
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  const ready = title.trim() && body.trim() && !buttonText.trim() === !buttonUrl.trim()

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={tx("عرض جديد", "New offer")}
      description={tx(
        "ترسله Meta للمراجعة، وغالبًا يُعتمد خلال دقائق.",
        "Meta reviews it, usually within minutes."
      )}
      contentClassName="max-w-[min(920px,96vw)]"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={SECONDARY} onClick={onClose}>
            {tx("إلغاء", "Cancel")}
          </button>
          <button
            type="button"
            className={PRIMARY}
            disabled={!ready || saving || uploading}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {tx("إرسال للمراجعة", "Send for review")}
          </button>
        </div>
      }
    >
      <div className="grid min-h-0 gap-5 overflow-y-auto pe-1 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className={LABEL}>
              {tx("اسم العرض (لك فقط)", "Offer name (only you see it)")}
            </span>
            <input
              className={FIELD}
              value={title}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={tx("مثال: عرض نهاية الأسبوع", "e.g. Weekend sale")}
            />
          </label>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={LABEL.replace("mb-1.5 ", "")}>{tx("نص الرسالة", "Message")}</span>
              <button
                type="button"
                onClick={insertName}
                className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11.5px] font-bold text-[#2563eb]"
              >
                + {tx("اسم العميل", "Customer name")}
              </button>
            </div>
            <textarea
              ref={bodyRef}
              rows={6}
              maxLength={1000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={tx(
                "أهلاً {الاسم}، عندنا خصم 20% على كل المنتجات حتى الخميس. نتشرف بزيارتك!",
                "Hi {الاسم}, 20% off everything until Thursday. See you soon!"
              )}
              className="w-full rounded-[12px] border border-[#e1e7f0] px-3 py-2.5 text-[13px] leading-6 outline-none focus:border-[#2563eb]"
            />
            <p className={cn("mt-1 text-[11.5px]", MUTED)}>
              {tx(
                "اسم العميل يُكتب تلقائيًا لكل شخص. لا تبدأ أو تنهي الرسالة به.",
                "The name is filled in per customer. Don't start or end with it."
              )}
            </p>
          </div>
          <div>
            <span className={LABEL}>{tx("صورة (اختياري)", "Picture (optional)")}</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                if (fileInput.current) fileInput.current.value = ""
              }}
            />
            {imageUrl ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="h-16 w-24 rounded-[10px] object-cover" />
                <button
                  type="button"
                  className="flex items-center gap-1 text-[12.5px] font-semibold text-[#b42318]"
                  onClick={() => setImageUrl(null)}
                >
                  <X className="size-3.5" />
                  {tx("إزالة", "Remove")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={SECONDARY}
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {tx("رفع صورة", "Upload a picture")}
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="block">
              <span className={LABEL}>{tx("نص الزر (اختياري)", "Button text (optional)")}</span>
              <input
                className={FIELD}
                value={buttonText}
                maxLength={25}
                onChange={(event) => setButtonText(event.target.value)}
                placeholder={tx("تسوق الآن", "Shop now")}
              />
            </label>
            <label className="block">
              <span className={LABEL}>{tx("رابط الزر", "Button link")}</span>
              <input
                className={FIELD}
                dir="ltr"
                value={buttonUrl}
                onChange={(event) => setButtonUrl(event.target.value)}
                placeholder="https://"
              />
            </label>
          </div>
          <p className={cn("rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-[11.5px] leading-5", MUTED)}>
            {tx(
              "يُضاف زر «إيقاف العروض» لكل رسالة، ومن يضغطه لا تصله عروض بعدها. نقرات زر الرابط تُحسب لك.",
              "Every message gets a “stop offers” button; whoever taps it gets no more offers. Taps on your link button are counted."
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{tx("معاينة", "Preview")}</span>
          <OfferBubble body={body} imageUrl={imageUrl} buttonText={buttonText.trim() || null} />
        </div>
      </div>
    </AppDialog>
  )
}

const AUDIENCES: Array<{ kind: AudienceKind; ar: string; en: string }> = [
  { kind: "all", ar: "كل العملاء", en: "All customers" },
  { kind: "recent", ar: "اشتروا مؤخرًا", en: "Bought recently" },
  { kind: "inactive", ar: "لم يعودوا", en: "Haven't come back" },
  { kind: "never", ar: "لم يشتروا بعد", en: "Never bought" },
  { kind: "spent", ar: "الأعلى إنفاقًا", en: "Top spenders" },
  { kind: "loyalty", ar: "أعضاء الولاء", en: "Loyalty members" },
]

function CampaignDialog({
  offers,
  onClose,
  onNewOffer,
  onCreated,
}: {
  offers: WhatsAppOffer[]
  onClose: () => void
  onNewOffer: () => void
  onCreated: (id: string) => void
}) {
  const { tx, ar, num } = useTx()
  const [name, setName] = useState("")
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "")
  const [kind, setKind] = useState<AudienceKind>("all")
  const [days, setDays] = useState("30")
  const [minAmount, setMinAmount] = useState("500")
  const [minPoints, setMinPoints] = useState("100")
  const [when, setWhen] = useState<"now" | "later">("now")
  const [at, setAt] = useState("")
  const [consent, setConsent] = useState(false)
  const [preview, setPreview] = useState<{
    count: number
    sample: string[]
    optedOut: number
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const audience = useMemo<CampaignAudience>(() => {
    if (kind === "recent" || kind === "inactive") return { kind, days: Number(days) || 30 }
    if (kind === "spent") return { kind, minAmount: Number(minAmount) || 0 }
    if (kind === "loyalty") return { kind, minPoints: Number(minPoints) || 0 }
    return { kind }
  }, [kind, days, minAmount, minPoints])
  const audienceKey = JSON.stringify(audience)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      whatsAppCampaignsService
        .preview(audience)
        .then((result) => {
          if (active) setPreview(result)
        })
        .catch(() => {
          if (active) setPreview(null)
        })
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey])

  const offer = offers.find((entry) => entry.id === offerId)

  async function save() {
    setSaving(true)
    try {
      const created = await whatsAppCampaignsService.create({
        name: name.trim(),
        offerId,
        audience,
        scheduledAt: when === "later" && at ? at : null,
        consentConfirmed: consent,
      })
      toast.success(
        when === "later"
          ? tx("جُدولت الحملة.", "Campaign scheduled.")
          : tx("بدأ إرسال الحملة.", "The campaign is sending.")
      )
      onCreated(created.id)
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  if (offers.length === 0) {
    return (
      <AppDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={tx("حملة جديدة", "New campaign")}
        contentClassName="max-w-md"
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className={cn("text-[13px] leading-6", MUTED)}>
            {tx(
              "لا يوجد عرض معتمد بعد. اكتب عرضًا، وبعد موافقة Meta عليه تستطيع إرساله.",
              "No approved offer yet. Write one; once Meta approves it you can send it."
            )}
          </p>
          <button type="button" className={PRIMARY} onClick={onNewOffer}>
            <Plus className="size-4" />
            {tx("عرض جديد", "New offer")}
          </button>
        </div>
      </AppDialog>
    )
  }

  const ready =
    name.trim() &&
    offerId &&
    consent &&
    (preview?.count ?? 0) > 0 &&
    (when === "now" || (at && new Date(at).getTime() > Date.now()))

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={tx("حملة جديدة", "New campaign")}
      contentClassName="max-w-[min(920px,96vw)]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("text-[12.5px]", MUTED)}>
            {preview
              ? tx(`ستصل إلى ${num(preview.count)} عميل`, `Goes to ${num(preview.count)} customers`)
              : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY} onClick={onClose}>
              {tx("إلغاء", "Cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY}
              disabled={!ready || saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {when === "now" ? tx("إرسال الآن", "Send now") : tx("جدولة", "Schedule")}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid min-h-0 gap-5 overflow-y-auto pe-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>{tx("اسم الحملة", "Campaign name")}</span>
              <input
                className={FIELD}
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={tx("مثال: عرض الجمعة البيضاء", "e.g. White Friday")}
              />
            </label>
            <div>
              <span className={LABEL}>{tx("العرض", "Offer")}</span>
              <Choice
                value={offerId}
                onChange={setOfferId}
                options={offers.map((entry) => ({ value: entry.id, label: entry.title }))}
              />
            </div>
          </div>

          <div>
            <span className={LABEL}>{tx("لمن؟", "Who gets it?")}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AUDIENCES.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  onClick={() => setKind(entry.kind)}
                  className={cn(
                    "h-11 rounded-[12px] border px-3 text-[13px] font-bold transition",
                    kind === entry.kind
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                      : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#c7d9ff]"
                  )}
                >
                  {ar ? entry.ar : entry.en}
                </button>
              ))}
            </div>
            {kind === "recent" || kind === "inactive" ? (
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <span className={HEADING}>
                  {kind === "recent"
                    ? tx("اشتروا خلال آخر", "Bought in the last")
                    : tx("لم يشتروا منذ", "No purchase for")}
                </span>
                <input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  className={cn(FIELD, "h-10 w-24")}
                />
                <span className={HEADING}>{tx("يوم", "days")}</span>
              </label>
            ) : null}
            {kind === "spent" ? (
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <span className={HEADING}>{tx("أنفقوا", "Spent")}</span>
                <input
                  type="number"
                  min={0}
                  value={minAmount}
                  onChange={(event) => setMinAmount(event.target.value)}
                  className={cn(FIELD, "h-10 w-28")}
                />
                <span className={HEADING}>{tx("ر.س أو أكثر", "SAR or more")}</span>
              </label>
            ) : null}
            {kind === "loyalty" ? (
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <span className={HEADING}>{tx("لديهم", "With")}</span>
                <input
                  type="number"
                  min={0}
                  value={minPoints}
                  onChange={(event) => setMinPoints(event.target.value)}
                  className={cn(FIELD, "h-10 w-28")}
                />
                <span className={HEADING}>{tx("نقطة أو أكثر", "points or more")}</span>
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-[#f7f9fc] px-3 py-2.5 text-[12.5px]">
              <span className="flex items-center gap-1.5 font-bold text-[#2563eb]">
                <Users className="size-4" />
                {preview ? num(preview.count) : "…"} {tx("عميل", "customers")}
              </span>
              {preview?.sample.length ? (
                <span className={cn("truncate", MUTED)}>
                  {preview.sample.join("، ")}
                  {preview.count > preview.sample.length ? "…" : ""}
                </span>
              ) : null}
              {preview?.optedOut ? (
                <span className={cn("flex items-center gap-1", MUTED)}>
                  <UserMinus className="size-3.5" />
                  {tx(
                    `${num(preview.optedOut)} أوقفوا العروض (مستبعدون)`,
                    `${num(preview.optedOut)} opted out (left out)`
                  )}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <span className={LABEL}>{tx("متى؟", "When?")}</span>
            <div className="flex gap-2">
              {(
                [
                  ["now", tx("الآن", "Now")],
                  ["later", tx("في وقت محدد", "At a set time")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWhen(key)}
                  className={cn(
                    "h-10 rounded-[10px] border px-4 text-[13px] font-bold",
                    when === key
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                      : "border-[#e1e7f0] text-[#0b1738]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {when === "later" ? (
              <div className="mt-2 sm:max-w-md">
                <DateTimeField value={at} onChange={setAt} />
              </div>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#e1e7f0] p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-4 accent-[#2563eb]"
            />
            <span className="text-[12.5px] leading-5 text-[#344054]">
              {tx(
                "أؤكد أن هؤلاء العملاء وافقوا على استلام العروض مني على واتساب. تحاسبني Meta على كل رسالة تسويقية من حساب واتساب الخاص بي.",
                "I confirm these customers agreed to receive offers from me on WhatsApp. Meta bills my WhatsApp account for each marketing message."
              )}
            </span>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{tx("معاينة", "Preview")}</span>
          {offer ? (
            <OfferBubble
              body={offer.body}
              imageUrl={offer.imageUrl}
              buttonText={offer.buttonText}
            />
          ) : null}
        </div>
      </div>
    </AppDialog>
  )
}

function CampaignDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string
  onClose: () => void
  onChanged: () => void
}) {
  const { tx, ar, num, money, date } = useTx()
  const [campaign, setCampaign] = useState<
    (WhatsAppCampaign & { recipientsList: CampaignRecipient[] }) | null
  >(null)
  const [filter, setFilter] = useState<"all" | "clicked" | "replied" | "failed" | "optedOut">("all")

  const load = useCallback(() => {
    void whatsAppCampaignsService
      .get(id)
      .then(setCampaign)
      .catch(() => setCampaign(null))
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!campaign || !["scheduled", "sending"].includes(campaign.status)) return
    const timer = window.setInterval(load, 5_000)
    return () => window.clearInterval(timer)
  }, [campaign, load])

  const rows = (campaign?.recipientsList ?? []).filter((recipient) => {
    if (filter === "clicked") return !!recipient.clickedAt
    if (filter === "replied") return !!recipient.repliedAt
    if (filter === "failed") return recipient.status === "failed"
    if (filter === "optedOut") return !!recipient.optedOutAt
    return true
  })
  const stats = campaign?.stats
  const status = campaign ? CAMPAIGN_STATUS[campaign.status] : null

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="flex items-center gap-2">
          {campaign?.name ?? tx("الحملة", "Campaign")}
          {status ? <Badge tone={status.tone}>{ar ? status.ar : status.en}</Badge> : null}
        </span>
      }
      contentClassName="max-w-[min(980px,96vw)]"
    >
      {!campaign || !stats ? (
        <div className="flex justify-center py-16 text-[#6b7b96]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pe-1">
          <p className={cn("text-[12.5px]", MUTED)}>
            {campaign.offerTitle} · {audienceLabel(campaign.audience, tx)} ·{" "}
            {campaign.status === "scheduled"
              ? `${tx("موعدها", "At")} ${date(campaign.scheduledAt)}`
              : `${tx("بدأت", "Started")} ${date(campaign.startedAt)}`}
          </p>
          {campaign.lastError ? (
            <p className="rounded-[10px] bg-[#fef2f2] px-3 py-2 text-[12.5px] text-[#b42318]">
              {campaign.lastError}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Metric
              icon={Users}
              label={tx("المستلمون", "Recipients")}
              value={num(stats.recipients)}
            />
            <Metric icon={Send} label={tx("أُرسلت", "Sent")} value={num(stats.sent)} />
            <Metric icon={Send} label={tx("وصلت", "Delivered")} value={num(stats.delivered)} />
            <Metric icon={MessageCircle} label={tx("قُرئت", "Read")} value={num(stats.read)} />
            <Metric
              icon={MousePointerClick}
              label={tx("نقرات", "Clicks")}
              value={num(stats.clicked)}
            />
            <Metric icon={MessageCircle} label={tx("ردود", "Replies")} value={num(stats.replied)} />
            <Metric
              icon={ShoppingBag}
              label={tx(`مبيعات ${campaign.trackDays} أيام`, `Sales, ${campaign.trackDays} days`)}
              value={money(stats.sales)}
              tone="text-[#047857]"
            />
            <Metric
              icon={UserMinus}
              label={tx("أوقفوا العروض", "Opted out")}
              value={num(stats.optedOut)}
              tone={stats.optedOut > 0 ? "text-[#b42318]" : undefined}
            />
          </div>
          {stats.failed > 0 || stats.queued > 0 ? (
            <p className={cn("text-[12px]", MUTED)}>
              {stats.queued > 0
                ? tx(
                    `${num(stats.queued)} بالانتظار (تُرسل على دفعات حسب حدود Meta اليومية). `,
                    `${num(stats.queued)} waiting (sent in batches within Meta's daily limits). `
                  )
                : ""}
              {stats.failed > 0
                ? tx(`${num(stats.failed)} لم تصل.`, `${num(stats.failed)} not delivered.`)
                : ""}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", tx("الكل", "All")],
                ["clicked", tx("نقروا", "Clicked")],
                ["replied", tx("ردّوا", "Replied")],
                ["failed", tx("لم تصل", "Not delivered")],
                ["optedOut", tx("أوقفوا العروض", "Opted out")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
                  filter === key
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                    : "border-[#e1e7f0] text-[#5b6b85]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-[#eef2f8]">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="bg-[#f7f9fc] text-[#6b7b96]">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">{tx("العميل", "Customer")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{tx("الجوال", "Mobile")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{tx("الحالة", "Status")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{tx("نقر", "Clicked")}</th>
                  <th className="px-3 py-2 text-start font-semibold">{tx("ردّ", "Replied")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((recipient) => (
                  <tr key={recipient.id} className="border-t border-[#eef2f8]">
                    <td className={cn("px-3 py-2 font-semibold", HEADING)}>
                      {recipient.name ?? "—"}
                      {recipient.optedOutAt ? (
                        <span className="ms-2 text-[11px] font-bold text-[#b42318]">
                          {tx("أوقف العروض", "Opted out")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2" dir="ltr">
                      +{recipient.phone}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          recipient.status === "failed"
                            ? "text-[#b42318]"
                            : recipient.status === "read"
                              ? "text-[#047857]"
                              : HEADING
                        }
                        title={recipient.error ?? undefined}
                      >
                        {
                          (RECIPIENT_STATUS[recipient.status] ?? [
                            recipient.status,
                            recipient.status,
                          ])[ar ? 0 : 1]
                        }
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {recipient.clickedAt ? date(recipient.clickedAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {recipient.repliedAt ? date(recipient.repliedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className={cn("py-8 text-center text-[12.5px]", MUTED)}>
                {tx("لا يوجد.", "None.")}
              </p>
            ) : null}
          </div>
          {["scheduled", "sending"].includes(campaign.status) ? (
            <button
              type="button"
              className="self-start text-[12.5px] font-bold text-[#b42318] hover:underline"
              onClick={() => {
                if (!window.confirm(tx("إيقاف الحملة؟ ما أُرسل يبقى.", "Stop the campaign?")))
                  return
                whatsAppCampaignsService
                  .cancel(campaign.id)
                  .then(() => {
                    load()
                    onChanged()
                  })
                  .catch((error: unknown) => toast.error(errorText(error, ar)))
              }}
            >
              {tx("إيقاف الحملة", "Stop the campaign")}
            </button>
          ) : null}
        </div>
      )}
    </AppDialog>
  )
}
