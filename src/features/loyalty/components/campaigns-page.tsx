"use client"

// Internal campaigns: a message to a chosen group of loyalty members, now or at a set time, and
// what came of it -- who had it delivered, who saw it, who came back and what they spent. The
// loyalty card is the first channel; WhatsApp and SMS are shown as coming, since a campaign is
// meant to go out through them too.

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  UserX,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppConfirmDialog, AppDialog, AppInput } from "@/components/app"

import { useLoad, useLoyaltyAccess, useLoyaltyError, useLoyaltyFormat } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import type {
  CampaignAudience,
  CampaignAudienceKind,
  CampaignDetails,
  CampaignInput,
  LoyaltyCampaign,
  LoyaltyMember,
} from "../types/loyalty.types"
import { Empty, LoadFailed, Loading, LoyaltyPage } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  HEADING,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXTAREA,
} from "./styles"

const MESSAGE_MAX = 120
const TRACK_DAYS = [3, 7, 14, 30]

const AUDIENCES: Array<{ kind: CampaignAudienceKind; icon: ReactNode; days?: number }> = [
  { kind: "all", icon: <Users className="size-5" /> },
  { kind: "inactive", icon: <UserMinus className="size-5" />, days: 30 },
  { kind: "recent", icon: <UserCheck className="size-5" />, days: 30 },
  { kind: "new", icon: <UserPlus className="size-5" />, days: 14 },
  { kind: "never", icon: <UserX className="size-5" /> },
  { kind: "points", icon: <Star className="size-5" /> },
  { kind: "members", icon: <UserRound className="size-5" /> },
]

type When = CampaignInput["when"]

interface Draft {
  name: string
  message: string
  kind: CampaignAudienceKind
  days: number
  minPoints: number
  memberIds: string[]
  when: When
  scheduledAt: string
  trackDays: number
}

// Tomorrow at ten in the morning, in the form a date-and-time field takes.
function tomorrowMorning(): string {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  at.setHours(10, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

const blank = (): Draft => ({
  name: "",
  message: "",
  kind: "all",
  days: 30,
  minPoints: 100,
  memberIds: [],
  when: "now",
  scheduledAt: tomorrowMorning(),
  trackDays: 7,
})

const audienceOf = (draft: Draft): CampaignAudience => ({
  kind: draft.kind,
  days: ["inactive", "recent", "new"].includes(draft.kind) ? draft.days : null,
  minPoints: draft.kind === "points" ? draft.minPoints : null,
  memberIds: draft.kind === "members" ? draft.memberIds : [],
})

const share = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0

// One step of what came of a campaign: a number, what it is, and its share of everyone reached.
function Step({
  icon,
  label,
  value,
  percent,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  percent: number | null
  tone: string
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b7b96]">
        <span style={{ color: tone }}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[19px] leading-6 font-black text-[#0b1738] tabular-nums">
          {value}
        </span>
        {percent !== null ? (
          <span className="text-[11.5px] font-bold tabular-nums" style={{ color: tone }}>
            {percent}%
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef1f6]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percent ?? 100}%`, backgroundColor: tone }}
        />
      </div>
    </div>
  )
}

// What the message looks like on the customer's phone: the notification, then the line kept in
// their card.
function PhonePreview({ business, message }: { business: string; message: string }) {
  const t = useTranslations("loyalty.campaigns")
  const text = message.trim() || t("preview.placeholder")
  return (
    <div className="mx-auto w-full max-w-[290px]">
      <div className="rounded-[38px] border-[7px] border-[#0b1738] bg-[linear-gradient(160deg,#1e293b,#0b1738_55%,#3b1d4f)] p-3 pb-6 shadow-[0_22px_44px_rgba(11,23,56,0.28)]">
        <div className="mx-auto h-5 w-24 rounded-full bg-black/60" />
        <p className="mt-5 text-center text-[34px] leading-none font-light text-white/95 tabular-nums">
          9:41
        </p>
        <p className="mt-1 text-center text-[11px] text-white/70">{t("preview.lockScreen")}</p>
        <div className="mt-5 rounded-[18px] bg-white/90 p-3 shadow-[0_8px_22px_rgba(0,0,0,0.25)] backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#0b1738] text-white">
              <Star className="size-4 fill-white" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold text-[#0b1738]">
              {business}
            </span>
            <span className="shrink-0 text-[10.5px] text-[#6b7b96]">{t("preview.now")}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-5 break-words text-[#1f2937]">{text}</p>
        </div>
        <div className="mt-3 rounded-[18px] bg-white p-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-[#0b1738]">
            <Bell className="size-3.5" />
            {t("preview.cardList")}
          </p>
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
              <Megaphone className="size-3" />
            </span>
            <span className="min-w-0 flex-1 text-[11.5px] leading-5 font-bold break-words text-[#0b1738]">
              {text}
            </span>
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#e11d48]" />
          </div>
        </div>
      </div>
      <p className={cn("mt-3 text-center text-[12px] leading-5", MUTED)}>{t("preview.hint")}</p>
    </div>
  )
}

export function LoyaltyCampaignsPage() {
  const t = useTranslations("loyalty.campaigns")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const campaigns = useLoad(() => loyaltyService.campaigns(), [])
  const program = useLoad(() => loyaltyService.program(), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [reach, setReach] = useState<{ members: number; withNotifications: number } | null>(null)
  const [members, setMembers] = useState<LoyaltyMember[] | null>(null)
  const [memberSearch, setMemberSearch] = useState("")
  const [opened, setOpened] = useState<CampaignDetails | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [asking, setAsking] = useState<{
    campaign: LoyaltyCampaign
    action: "send" | "cancel" | "remove"
  } | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  // How many members the chosen rule reaches, asked a moment after the last change.
  const audienceKey = draft ? JSON.stringify(audienceOf(draft)) : null
  useEffect(() => {
    if (!audienceKey) return
    const audience = JSON.parse(audienceKey) as CampaignAudience
    if (audience.kind === "members" && !audience.memberIds?.length) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      loyaltyService
        .campaignReach(audience)
        .then((found) => {
          if (!cancelled) setReach(found)
        })
        .catch(() => {
          if (!cancelled) setReach(null)
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [audienceKey])

  // The members to pick from, read the first time "chosen customers" is opened.
  const pickingMembers = draft?.kind === "members"
  useEffect(() => {
    if (!pickingMembers || members !== null) return
    let cancelled = false
    loyaltyService
      .members()
      .then((found) => {
        if (!cancelled) setMembers(found)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
    return () => {
      cancelled = true
    }
  }, [pickingMembers, members])

  const shownMembers = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase()
    const list = members ?? []
    return (
      needle
        ? list.filter(
            (member) =>
              member.name.toLowerCase().includes(needle) || (member.phone ?? "").includes(needle)
          )
        : list
    ).slice(0, 60)
  }, [members, memberSearch])

  const totals = useMemo(() => {
    const sent = (campaigns.data ?? []).filter((campaign) => campaign.status === "sent")
    return {
      sent: sent.length,
      reached: sent.reduce((total, campaign) => total + campaign.results.recipients, 0),
      buyers: sent.reduce((total, campaign) => total + campaign.results.buyers, 0),
      revenue: sent.reduce((total, campaign) => total + campaign.results.revenue, 0),
    }
  }, [campaigns.data])

  const noOne =
    draft !== null &&
    (draft.kind === "members"
      ? draft.memberIds.length === 0
      : reach !== null && reach.members === 0)
  const ready =
    draft !== null &&
    draft.name.trim().length > 0 &&
    draft.message.trim().length > 0 &&
    (draft.kind !== "members" || draft.memberIds.length > 0) &&
    (draft.when !== "later" || Boolean(draft.scheduledAt))

  const save = async () => {
    if (!draft || !ready) return
    setBusy(true)
    try {
      await loyaltyService.createCampaign({
        name: draft.name.trim(),
        message: draft.message.trim(),
        audience: audienceOf(draft),
        when: draft.when,
        scheduledAt: draft.when === "later" ? new Date(draft.scheduledAt).toISOString() : null,
        trackDays: draft.trackDays,
      })
      toast.success(t(`saved.${draft.when}`))
      setDraft(null)
      campaigns.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const act = async () => {
    if (!asking) return
    setBusy(true)
    try {
      if (asking.action === "send") await loyaltyService.sendCampaign(asking.campaign.id)
      else if (asking.action === "cancel") await loyaltyService.cancelCampaign(asking.campaign.id)
      else await loyaltyService.removeCampaign(asking.campaign.id)
      toast.success(t(`done.${asking.action}`))
      setAsking(null)
      campaigns.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const open = async (campaign: LoyaltyCampaign) => {
    setOpeningId(campaign.id)
    try {
      setOpened(await loyaltyService.campaign(campaign.id))
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setOpeningId(null)
    }
  }

  const audienceLabel = (audience: CampaignAudience) =>
    audience.kind === "members"
      ? t("audience.label.members", { count: audience.memberIds?.length ?? 0 })
      : audience.kind === "points"
        ? t("audience.label.points", { count: audience.minPoints ?? 0 })
        : t(`audience.label.${audience.kind}`, { days: audience.days ?? 0 })

  const STATUS: Record<LoyaltyCampaign["status"], string> = {
    draft: "bg-[#f1f4f9] text-[#52607a]",
    scheduled: "bg-[#fffaeb] text-[#b54708]",
    sending: "bg-[#eef4ff] text-[#1d4fd8]",
    sent: "bg-[#ecfdf3] text-[#067647]",
    cancelled: "bg-[#fef3f2] text-[#b42318]",
  }

  const results = (campaign: LoyaltyCampaign) => {
    const { recipients, delivered, seen, buyers } = campaign.results
    return (
      <div className="flex gap-4">
        <Step
          icon={<Users className="size-3.5" />}
          label={t("results.recipients")}
          value={format.number(recipients)}
          percent={null}
          tone="#0b1738"
        />
        <Step
          icon={<Bell className="size-3.5" />}
          label={t("results.delivered")}
          value={format.number(delivered)}
          percent={share(delivered, recipients)}
          tone="#1d4fd8"
        />
        <Step
          icon={<Eye className="size-3.5" />}
          label={t("results.seen")}
          value={format.number(seen)}
          percent={share(seen, recipients)}
          tone="#7c3aed"
        />
        <Step
          icon={<ShoppingBag className="size-3.5" />}
          label={t("results.buyers")}
          value={format.number(buyers)}
          percent={share(buyers, recipients)}
          tone="#067647"
        />
      </div>
    )
  }

  return (
    <LoyaltyPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button type="button" className={PRIMARY_BUTTON} onClick={() => setDraft(blank())}>
            <Plus className="size-4" />
            {t("add")}
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["sent", format.number(totals.sent), <Send key="i" className="size-5" />, "#be185d"],
            [
              "reached",
              format.number(totals.reached),
              <Users key="i" className="size-5" />,
              "#1d4fd8",
            ],
            [
              "buyers",
              format.number(totals.buyers),
              <ShoppingBag key="i" className="size-5" />,
              "#067647",
            ],
            [
              "revenue",
              format.money(totals.revenue),
              <Sparkles key="i" className="size-5" />,
              "#b54708",
            ],
          ] as const
        ).map(([key, value, icon, tone]) => (
          <div key={key} className={cn(PANEL, "flex items-center gap-3 p-4")}>
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-[14px]"
              style={{ color: tone, backgroundColor: `${tone}14` }}
            >
              {icon}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[12px] font-semibold", MUTED)}>
                {t(`totals.${key}`)}
              </span>
              <span className={cn("block truncate text-[20px] leading-7 font-black", HEADING)}>
                {value}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center gap-2 px-4 py-3")}>
        <span className={cn("text-[12.5px] font-bold", HEADING)}>{t("channels.title")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf2f8] px-3 py-1.5 text-[12.5px] font-bold text-[#be185d]">
          <CreditCard className="size-4" />
          {t("channels.card")}
          <CheckCircle2 className="size-4" />
        </span>
        {(
          [
            ["whatsapp", <MessageCircle key="i" className="size-4" />],
            ["sms", <MessageSquareText key="i" className="size-4" />],
          ] as const
        ).map(([key, icon]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#d5dce8] px-3 py-1.5 text-[12.5px] font-semibold text-[#8a97ad]"
          >
            {icon}
            {t(`channels.${key}`)}
            <span className="rounded-full bg-[#f1f4f9] px-1.5 py-0.5 text-[10.5px] font-bold">
              {t("channels.soon")}
            </span>
          </span>
        ))}
      </div>

      {campaigns.failed ? (
        <div className={PANEL}>
          <LoadFailed onRetry={campaigns.reload} />
        </div>
      ) : campaigns.data === null ? (
        <div className={PANEL}>
          <Loading />
        </div>
      ) : campaigns.data.length === 0 ? (
        <div className={PANEL}>
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {campaigns.data.map((campaign) => (
            <article key={campaign.id} className={cn(PANEL, "flex flex-col gap-4 p-5")}>
              <header className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[#fdf2f8] text-[#be185d]">
                  <Megaphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className={cn("truncate text-[16px] font-extrabold", HEADING)}>
                    {campaign.name}
                  </h2>
                  <p
                    className={cn("mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]", MUTED)}
                  >
                    <span>{audienceLabel(campaign.audience)}</span>
                    <span>·</span>
                    <span>
                      {campaign.status === "sent" && campaign.sentAt
                        ? t("when.sentAt", { date: format.date(campaign.sentAt) })
                        : campaign.status === "scheduled" && campaign.scheduledAt
                          ? t("when.scheduledFor", { date: format.date(campaign.scheduledAt) })
                          : t("when.createdAt", { date: format.date(campaign.createdAt) })}
                    </span>
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                    STATUS[campaign.status]
                  )}
                >
                  {t(`status.${campaign.status}`)}
                </span>
              </header>

              <p className="rounded-[14px] rounded-ss-[4px] bg-[#f7f9fc] px-4 py-3 text-[13.5px] leading-6 text-[#0b1738]">
                {campaign.message}
              </p>

              {campaign.status === "sent" ? (
                <>
                  {results(campaign)}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[#ecfdf3] px-4 py-3">
                    <span>
                      <span className="block text-[12px] font-semibold text-[#067647]">
                        {t("results.revenue")}
                      </span>
                      <span className="block text-[20px] leading-7 font-black text-[#067647]">
                        {format.money(campaign.results.revenue)}
                      </span>
                    </span>
                    <span className="text-[12px] font-semibold text-[#067647]">
                      {campaign.results.tracking
                        ? t("results.tracking", { days: campaign.trackDays })
                        : t("results.closed", { days: campaign.trackDays })}
                    </span>
                  </div>
                </>
              ) : (
                <p className={cn("flex items-center gap-2 text-[12.5px]", MUTED)}>
                  {campaign.status === "scheduled" ? (
                    <CalendarClock className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  {t(`note.${campaign.status}`)}
                </p>
              )}

              <footer className="mt-auto flex flex-wrap gap-2">
                {campaign.status === "sent" ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={openingId === campaign.id}
                    onClick={() => void open(campaign)}
                  >
                    {openingId === campaign.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {t("details")}
                  </button>
                ) : null}
                {canManage && (campaign.status === "draft" || campaign.status === "scheduled") ? (
                  <>
                    <button
                      type="button"
                      className={PRIMARY_BUTTON}
                      onClick={() => setAsking({ campaign, action: "send" })}
                    >
                      <Send className="size-4" />
                      {t("sendNow")}
                    </button>
                    {campaign.status === "scheduled" ? (
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        onClick={() => setAsking({ campaign, action: "cancel" })}
                      >
                        <X className="size-4" />
                        {t("cancelSchedule")}
                      </button>
                    ) : null}
                  </>
                ) : null}
                {canManage && (campaign.status === "draft" || campaign.status === "cancelled") ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => setAsking({ campaign, action: "remove" })}
                  >
                    <Trash2 className="size-4" />
                    {t("remove")}
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}

      <AppDialog
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setDraft(null)
        }}
        title={t("form.title")}
        description={t("form.hint")}
        contentClassName="max-w-[980px]"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={cn("text-[12.5px] font-semibold", noOne ? "text-[#b42318]" : MUTED)}>
              {draft?.kind === "members" && draft.memberIds.length === 0
                ? t("reach.chooseMembers")
                : reach
                  ? reach.members === 0
                    ? t("reach.none")
                    : t("reach.line", { members: reach.members, phones: reach.withNotifications })
                  : t("reach.counting")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                {t("form.cancel")}
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busy || !ready || (noOne && draft?.when === "now")}
                onClick={() => void save()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {draft ? t(`form.submit.${draft.when}`) : ""}
              </button>
            </div>
          </div>
        }
      >
        {draft ? (
          <div className="grid min-h-0 grid-cols-1 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <p className={FIELD_LABEL}>{t("form.ideas")}</p>
                <div className="flex flex-wrap gap-2">
                  {(["winBack", "welcome", "weekend", "points"] as const).map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#fbcfe8] bg-[#fdf2f8] px-3 py-1.5 text-[12.5px] font-bold text-[#be185d] hover:bg-[#fce7f3]"
                      onClick={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                name: t(`ideas.${idea}.name`),
                                message: t(`ideas.${idea}.message`),
                                kind:
                                  idea === "winBack"
                                    ? "inactive"
                                    : idea === "welcome"
                                      ? "new"
                                      : idea === "points"
                                        ? "points"
                                        : "all",
                                days: idea === "welcome" ? 14 : 30,
                              }
                            : current
                        )
                      }
                    >
                      <Sparkles className="size-3.5" />
                      {t(`ideas.${idea}.name`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={FIELD_LABEL} htmlFor="campaign-name">
                  {t("form.name")}
                </label>
                <AppInput
                  id="campaign-name"
                  className={FIELD}
                  maxLength={80}
                  placeholder={t("form.namePlaceholder")}
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL} htmlFor="campaign-message">
                  {t("form.message")}
                </label>
                <textarea
                  id="campaign-message"
                  className={cn(TEXTAREA, "min-h-[84px] resize-none")}
                  maxLength={MESSAGE_MAX}
                  placeholder={t("form.messagePlaceholder")}
                  value={draft.message}
                  onChange={(event) => set("message", event.target.value)}
                />
                <p className={cn("mt-1 text-end text-[11.5px] tabular-nums", MUTED)}>
                  {draft.message.length} / {MESSAGE_MAX}
                </p>
              </div>

              <div>
                <p className={FIELD_LABEL}>{t("form.audience")}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AUDIENCES.map((entry) => (
                    <button
                      key={entry.kind}
                      type="button"
                      aria-pressed={draft.kind === entry.kind}
                      className={cn(
                        "flex items-start gap-2.5 rounded-[14px] border px-3 py-2.5 text-start transition",
                        draft.kind === entry.kind
                          ? "border-[#be185d] bg-[#fdf2f8] ring-2 ring-[#be185d]/15"
                          : "border-[#e1e7f0] bg-white hover:bg-[#f7f9fc]"
                      )}
                      onClick={() =>
                        setDraft((current) =>
                          current
                            ? { ...current, kind: entry.kind, days: entry.days ?? current.days }
                            : current
                        )
                      }
                    >
                      <span
                        className={cn(
                          "mt-0.5 shrink-0",
                          draft.kind === entry.kind ? "text-[#be185d]" : "text-[#6b7b96]"
                        )}
                      >
                        {entry.icon}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-[13px] font-bold", HEADING)}>
                          {t(`audience.${entry.kind}.title`)}
                        </span>
                        <span className={cn("block text-[11.5px] leading-4", MUTED)}>
                          {t(`audience.${entry.kind}.hint`)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {["inactive", "recent", "new"].includes(draft.kind) ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className={cn("text-[13px] font-semibold", HEADING)}>
                      {t(`audience.${draft.kind}.daysBefore`)}
                    </span>
                    <AppInput
                      type="number"
                      min={1}
                      max={730}
                      className={cn(FIELD, "w-24 text-center")}
                      aria-label={t("form.days")}
                      value={String(draft.days)}
                      onChange={(event) =>
                        set("days", Math.min(730, Math.max(1, Number(event.target.value) || 1)))
                      }
                    />
                    <span className={cn("text-[13px] font-semibold", HEADING)}>
                      {t("form.days")}
                    </span>
                  </div>
                ) : null}

                {draft.kind === "points" ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className={cn("text-[13px] font-semibold", HEADING)}>
                      {t("audience.points.before")}
                    </span>
                    <AppInput
                      type="number"
                      min={1}
                      className={cn(FIELD, "w-28 text-center")}
                      aria-label={t("form.pointsUnit")}
                      value={String(draft.minPoints)}
                      onChange={(event) =>
                        set("minPoints", Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                    <span className={cn("text-[13px] font-semibold", HEADING)}>
                      {t("form.pointsUnit")}
                    </span>
                  </div>
                ) : null}

                {draft.kind === "members" ? (
                  <div className="mt-3 rounded-[14px] border border-[#e1e7f0] p-3">
                    <AppInput
                      className={FIELD}
                      placeholder={t("form.memberSearch")}
                      aria-label={t("form.memberSearch")}
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                    />
                    {members === null ? (
                      <p className={cn("py-4 text-center text-[12.5px]", MUTED)}>
                        <Loader2 className="mx-auto size-4 animate-spin" />
                      </p>
                    ) : shownMembers.length === 0 ? (
                      <p className={cn("py-4 text-center text-[12.5px]", MUTED)}>
                        {t("form.noMembers")}
                      </p>
                    ) : (
                      <ul className="mt-2 flex max-h-[180px] flex-col gap-1 overflow-y-auto">
                        {shownMembers.map((member) => {
                          const picked = draft.memberIds.includes(member.id)
                          return (
                            <li key={member.id}>
                              <label
                                className={cn(
                                  "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2",
                                  picked ? "bg-[#fdf2f8]" : "hover:bg-[#f7f9fc]"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[#be185d]"
                                  checked={picked}
                                  onChange={() =>
                                    set(
                                      "memberIds",
                                      picked
                                        ? draft.memberIds.filter((id) => id !== member.id)
                                        : [...draft.memberIds, member.id]
                                    )
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-bold">
                                    {member.name}
                                  </span>
                                  <span className={cn("block text-[11.5px]", MUTED)} dir="ltr">
                                    {member.phone ?? ""}
                                  </span>
                                </span>
                                <span className="shrink-0 text-[12px] font-bold text-[#be185d]">
                                  {format.points(member.points)}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <p className={cn("mt-2 text-[12px] font-semibold", MUTED)}>
                      {t("form.picked", { count: draft.memberIds.length })}
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <p className={FIELD_LABEL}>{t("form.when")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["now", <Send key="i" className="size-4" />],
                      ["later", <Clock key="i" className="size-4" />],
                      ["draft", <FileText key="i" className="size-4" />],
                    ] as const
                  ).map(([when, icon]) => (
                    <button
                      key={when}
                      type="button"
                      aria-pressed={draft.when === when}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2 rounded-[12px] border text-[13px] font-bold transition",
                        draft.when === when
                          ? "border-[#be185d] bg-[#fdf2f8] text-[#be185d]"
                          : "border-[#e1e7f0] bg-white text-[#344054] hover:bg-[#f7f9fc]"
                      )}
                      onClick={() => set("when", when)}
                    >
                      {icon}
                      {t(`form.whenOptions.${when}`)}
                    </button>
                  ))}
                </div>
                {draft.when === "later" ? (
                  <input
                    type="datetime-local"
                    className={cn(FIELD, "mt-2")}
                    aria-label={t("form.whenOptions.later")}
                    value={draft.scheduledAt}
                    onChange={(event) => set("scheduledAt", event.target.value)}
                  />
                ) : null}
              </div>

              <div>
                <p className={FIELD_LABEL}>{t("form.track")}</p>
                <div className="flex flex-wrap gap-2">
                  {TRACK_DAYS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={draft.trackDays === days}
                      className={cn(
                        "h-10 rounded-full border px-4 text-[13px] font-bold transition",
                        draft.trackDays === days
                          ? "border-[#be185d] bg-[#fdf2f8] text-[#be185d]"
                          : "border-[#e1e7f0] bg-white text-[#344054] hover:bg-[#f7f9fc]"
                      )}
                      onClick={() => set("trackDays", days)}
                    >
                      {t("form.trackDays", { days })}
                    </button>
                  ))}
                </div>
                <p className={cn("mt-1.5 text-[12px] leading-5", MUTED)}>{t("form.trackHint")}</p>
              </div>
            </div>

            <aside className="lg:sticky lg:top-0 lg:self-start">
              <PhonePreview
                business={program.data?.businessName ?? t("preview.business")}
                message={draft.message}
              />
            </aside>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={opened !== null}
        onOpenChange={(next) => {
          if (!next) setOpened(null)
        }}
        title={opened?.name ?? ""}
        description={
          opened?.sentAt ? t("when.sentAt", { date: format.date(opened.sentAt) }) : undefined
        }
        contentClassName="max-w-[820px]"
      >
        {opened ? (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            <p className="rounded-[14px] rounded-ss-[4px] bg-[#f7f9fc] px-4 py-3 text-[13.5px] leading-6 text-[#0b1738]">
              {opened.message}
            </p>
            {results(opened)}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] bg-[#ecfdf3] px-4 py-3">
                <span className="block text-[12px] font-semibold text-[#067647]">
                  {t("results.revenue")}
                </span>
                <span className="block text-[20px] leading-7 font-black text-[#067647]">
                  {format.money(opened.results.revenue)}
                </span>
              </div>
              <div className="rounded-[14px] bg-[#f7f9fc] px-4 py-3">
                <span className={cn("block text-[12px] font-semibold", MUTED)}>
                  {t("results.purchases")}
                </span>
                <span className={cn("block text-[20px] leading-7 font-black", HEADING)}>
                  {format.number(opened.results.purchases)}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[14px] border border-[#e4e9f2]">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f7f9fc] text-[12px] font-bold text-[#52607a]">
                    <th className="px-3 py-2.5 text-start">{t("recipients.member")}</th>
                    <th className="px-3 py-2.5 text-start">{t("recipients.delivered")}</th>
                    <th className="px-3 py-2.5 text-start">{t("recipients.seen")}</th>
                    <th className="px-3 py-2.5 text-start">{t("recipients.bought")}</th>
                  </tr>
                </thead>
                <tbody>
                  {opened.recipientList.map((entry) => (
                    <tr key={entry.memberId} className="border-t border-[#eef1f6]">
                      <td className="px-3 py-2.5">
                        <span className="block font-bold">{entry.name}</span>
                        <span className={cn("block text-[11.5px]", MUTED)} dir="ltr">
                          {entry.phone ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {entry.delivered ? (
                          <CheckCircle2 className="size-4 text-[#1d4fd8]" />
                        ) : (
                          <span className={MUTED}>{t("recipients.cardOnly")}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {entry.seen ? (
                          <CheckCircle2 className="size-4 text-[#7c3aed]" />
                        ) : (
                          <span className={MUTED}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {entry.purchases > 0 ? (
                          <span className="font-bold text-[#067647]">
                            {format.money(entry.spent)}
                            {entry.purchases > 1 ? ` · ${format.number(entry.purchases)}×` : ""}
                          </span>
                        ) : (
                          <span className={MUTED}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppConfirmDialog
        open={asking !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setAsking(null)
        }}
        title={asking ? t(`confirm.${asking.action}.title`, { name: asking.campaign.name }) : ""}
        description={asking ? t(`confirm.${asking.action}.hint`) : ""}
        confirmLabel={asking ? t(`confirm.${asking.action}.yes`) : ""}
        cancelLabel={t("form.cancel")}
        confirmTone={asking?.action === "send" ? undefined : "destructive"}
        loading={busy}
        onConfirm={act}
        onCancel={() => setAsking(null)}
      />
    </LoyaltyPage>
  )
}
