"use client"

// التقرير اليومي على واتساب -- the store's daily summary, sent from Madar's WhatsApp number to the
// numbers the merchant chooses (backend: whatsapp/daily-report.ts). Every package includes the
// free report -- one number, one send a day, the automatic period. The paid add-on (bought here,
// priced in Madar Admin) allows up to five numbers and three sends a day, each covering a period
// the merchant picks. The preview beside the form is the message exactly as it would go out now.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Crown,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
  Users,
  Wand2,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"
import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import { type AddonOverview, addonsService } from "@/features/billing"
import {
  dailyReportService,
  type DailyReportRecipient,
  type DailyReportSchedule,
  type DailyReportSettings as Settings,
} from "@/features/settings/services/daily-report.service"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

import { ReportsBreadcrumb } from "./scheduled-reports-category"
import { TimePicker, useFormatTime } from "./time-picker"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

const ADDON = "whatsapp_daily_report"

interface Draft {
  enabled: boolean
  schedules: DailyReportSchedule[]
  recipients: DailyReportRecipient[]
}

// Riyadh is always UTC+3 -- the same arithmetic as the backend's reportWindow, so the "covers"
// line under each send matches what will go out.
const RIYADH_MS = 3 * 60 * 60 * 1000
const riyadhDay = (date: Date) => new Date(date.getTime() + RIYADH_MS).toISOString().slice(0, 10)
const riyadhTime = (date: Date) => new Date(date.getTime() + RIYADH_MS).toISOString().slice(11, 16)
const moment = (day: string, time: string) =>
  new Date(new Date(`${day}T${time}:00.000Z`).getTime() - RIYADH_MS)
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// The period a send covers on its next run: where it starts and ends, each as a day relative to
// the send ("yesterday" / "today") and a time -- the same rule the backend sends by.
interface Coverage {
  from: { yesterday: boolean; time: string }
  to: { yesterday: boolean; time: string; isSendTime: boolean }
  hours: number
  // A chosen period that ends after the send, or starts after it ends.
  invalid: boolean
}

function coverageFor(schedule: DailyReportSchedule, now = new Date()): Coverage {
  const today = riyadhDay(now)
  const todayRun = moment(today, schedule.sendTime)
  const sendAt =
    todayRun.getTime() >= now.getTime() ? todayRun : moment(shiftDay(today, 1), schedule.sendTime)
  const sendDay = riyadhDay(sendAt)
  let start: Date
  let end: Date
  const explicit =
    schedule.from &&
    schedule.to &&
    (schedule.fromDay === -1 || schedule.fromDay === 0) &&
    (schedule.toDay === -1 || schedule.toDay === 0)
  if (explicit) {
    end = moment(shiftDay(sendDay, schedule.toDay ?? 0), schedule.to as string)
    start = moment(shiftDay(sendDay, schedule.fromDay ?? 0), schedule.from as string)
  } else if (schedule.from && schedule.to) {
    end = moment(sendDay, schedule.to)
    if (end.getTime() > sendAt.getTime()) end = moment(shiftDay(sendDay, -1), schedule.to)
    const endDay = riyadhDay(end)
    start = moment(endDay, schedule.from)
    if (start.getTime() >= end.getTime()) start = moment(shiftDay(endDay, -1), schedule.from)
  } else {
    const day = riyadhTime(sendAt) < "12:00" ? shiftDay(sendDay, -1) : sendDay
    start = moment(day, "00:00")
    end = day === sendDay ? sendAt : moment(shiftDay(day, 1), "00:00")
  }
  const hours = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 10) / 10
  const invalid = end.getTime() > sendAt.getTime() || start.getTime() >= end.getTime()
  if (explicit) {
    // A chosen period shows its ends exactly as chosen (today 00:00 stays today 00:00).
    return {
      from: { yesterday: schedule.fromDay === -1, time: schedule.from as string },
      to: {
        yesterday: schedule.toDay === -1,
        time: schedule.to as string,
        isSendTime: end.getTime() === sendAt.getTime(),
      },
      hours,
      invalid,
    }
  }
  const endsAtMidnight = riyadhTime(end) === "00:00" && end.getTime() !== start.getTime()
  const lastDay = riyadhDay(new Date(end.getTime() - 1))
  return {
    from: { yesterday: riyadhDay(start) !== sendDay, time: riyadhTime(start) },
    to: {
      yesterday: (endsAtMidnight ? lastDay : riyadhDay(end)) !== sendDay,
      time: endsAtMidnight ? "24:00" : riyadhTime(end),
      isSendTime: end.getTime() === sendAt.getTime(),
    },
    hours,
    invalid,
  }
}

// Which day an end of a chosen period falls on, relative to the send.
function DaySwitch({
  yesterday,
  onChange,
}: {
  yesterday: boolean
  onChange: (yesterday: boolean) => void
}) {
  const t = useTranslations("settings.dailyReport.schedules")
  return (
    <div className="grid grid-cols-2 rounded-[9px] bg-[#f2f4f7] p-0.5">
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-[7px] py-1 text-[11.5px] font-bold transition-colors",
            yesterday === option ? "bg-white text-[#2563eb] shadow-sm" : "text-[#667085]"
          )}
        >
          {option ? t("yesterday") : t("today")}
        </button>
      ))}
    </div>
  )
}

// WhatsApp's own *bold* markup, shown as bold in the preview.
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <span key={index} className="block min-h-[1.2em]">
          {line
            .split(/(\*[^*\n]+\*)/g)
            .map((part, partIndex) =>
              part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
                <strong key={partIndex}>{part.slice(1, -1)}</strong>
              ) : (
                <span key={partIndex}>{part}</span>
              )
            )}
        </span>
      ))}
    </>
  )
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <section className={cn(PANEL, "p-5")}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#2563eb]">
          {icon}
        </span>
        <div>
          <h2 className={cn("text-[15px] font-bold", HEADING)}>{title}</h2>
          <p className={cn("mt-0.5 text-[12px]", MUTED)}>{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function LockedHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#9a6700]">
      <Lock className="size-3" />
      {children}
    </span>
  )
}

const checkoutHref = (interval: "monthly" | "yearly") =>
  `${ROUTES.marketplaceBillingCheckout}?purpose=addon&addon=${ADDON}&interval=${interval}`

export default function DailyReportSettings() {
  const t = useTranslations("settings.dailyReport")
  const tReports = useTranslations("settings.scheduledReports")
  const formatTime = useFormatTime()
  const locale = useLocale() as Locale

  const [draft, setDraft] = useState<Draft | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [addon, setAddon] = useState<AddonOverview | null>(null)
  const [preview, setPreview] = useState<{ day: string; text: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const apply = useCallback((saved: Settings) => {
    setSettings(saved)
    setDraft({ enabled: saved.enabled, schedules: saved.schedules, recipients: saved.recipients })
  }, [])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [overview, addonOverview] = await Promise.all([
        dailyReportService.get(),
        addonsService.get(ADDON).catch(() => null),
      ])
      apply(overview.settings)
      setPreview(overview.preview)
      setAddon(addonOverview)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadError.forbidden") : t("loadError.generic"))
    }
  }, [t, apply])

  useEffect(() => {
    void load()
  }, [load])

  const limits = settings?.plan.limits ?? { recipients: 1, schedules: 1, customPeriod: false }
  const paid = settings?.plan.paid ?? false

  const errorMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof AppError)) return fallback
    if (error.status === 403 && error.code !== "DAILY_REPORT_PLAN_LIMIT")
      return t("errors.forbidden")
    switch (error.code) {
      case "DAILY_REPORT_PLAN_LIMIT":
        return t("errors.planLimit")
      case "DAILY_REPORT_INVALID_TIME":
        return t("errors.invalidTime")
      case "DAILY_REPORT_NO_RECIPIENTS":
        return t("errors.noRecipients")
      case "WHATSAPP_INVALID_PHONE":
        return t("errors.invalidPhone")
      case "WHATSAPP_TEMPLATE_NOT_READY":
      case "WHATSAPP_TEMPLATE_UNKNOWN":
        return t("errors.templateNotReady")
      case "WHATSAPP_UNAVAILABLE":
      case "WHATSAPP_NOT_CONFIGURED":
      case "WHATSAPP_CONFIGURATION_ERROR":
        return t("errors.unavailable")
      default:
        return fallback
    }
  }

  const updateSchedule = (index: number, patch: Partial<DailyReportSchedule>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            schedules: current.schedules.map((schedule, position) =>
              position === index ? { ...schedule, ...patch } : schedule
            ),
          }
        : current
    )
  const updateRecipient = (index: number, patch: Partial<DailyReportRecipient>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            recipients: current.recipients.map((recipient, position) =>
              position === index ? { ...recipient, ...patch } : recipient
            ),
          }
        : current
    )

  const sortedTimes = useMemo(
    () =>
      (draft?.schedules ?? [])
        .slice(0, limits.schedules)
        .map((schedule) => schedule.sendTime)
        .sort()
        .join("، "),
    [draft, limits.schedules]
  )

  const save = async () => {
    if (!draft) return
    const recipients = draft.recipients
      .map((recipient) => ({ phone: recipient.phone.trim(), name: recipient.name.trim() }))
      .filter((recipient) => recipient.phone.length > 0)
    if (draft.enabled && recipients.length === 0) {
      toast.error(t("errors.noRecipients"))
      return
    }
    if (
      draft.schedules.some(
        (schedule) => schedule.from && schedule.to && coverageFor(schedule).invalid
      )
    ) {
      toast.error(t("schedules.invalidPeriod"))
      return
    }
    setSaving(true)
    try {
      const saved = await dailyReportService.update({
        enabled: draft.enabled,
        schedules: draft.schedules.map((schedule) => {
          const custom = Boolean(schedule.from && schedule.to)
          return {
            sendTime: schedule.sendTime,
            from: custom ? schedule.from : null,
            to: custom ? schedule.to : null,
            fromDay: custom ? (schedule.fromDay ?? 0) : null,
            toDay: custom ? (schedule.toDay ?? 0) : null,
          }
        }),
        recipients,
      })
      apply(saved)
      toast.success(
        saved.enabled
          ? t("toasts.savedOn", {
              times: saved.coverage.map((entry) => entry.sendTime).join("، "),
            })
          : t("toasts.savedOff")
      )
    } catch (error) {
      toast.error(errorMessage(error, t("toasts.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const result = await dailyReportService.sendTest()
      if (result.failed > 0 && result.sent === 0) {
        toast.error(t("toasts.testFailed"))
      } else {
        toast.success(t("toasts.testSent", { count: result.sent }))
      }
    } catch (error) {
      toast.error(errorMessage(error, t("toasts.testFailed")))
    } finally {
      setTesting(false)
    }
  }

  if (loadError) {
    return (
      <div className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
        <p>{loadError}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (!draft || !settings) {
    return (
      <div className="flex justify-center p-16 text-[#98A2B3]">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const usedSchedules = draft.schedules.length
  const canAddSchedule = usedSchedules < limits.schedules
  const canAddRecipient = draft.recipients.length < limits.recipients
  const dateFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US",
    { day: "numeric", month: "long", year: "numeric" }
  )
  const priceText = (halalas: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(halalas / 100)

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5">
      <ReportsBreadcrumb
        items={[
          { label: tReports("title"), href: ROUTES.settingsScheduledReports },
          {
            label: tReports("categories.pos.name"),
            href: `${ROUTES.settingsScheduledReports}/pos`,
          },
          { label: tReports("templates.daily-report.name") },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>
        <Button
          className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-[18px] py-2.5 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? t("saving") : t("save")}
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <section
            className={cn(
              PANEL,
              "flex items-center justify-between gap-4 p-5",
              draft.enabled && "border-[#bfd4ff] bg-[#f8fbff]"
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                  draft.enabled ? "bg-[#25D366] text-white" : "bg-[#f1f5f9] text-[#98A2B3]"
                )}
              >
                <MessageCircle className="size-5" />
              </span>
              <div>
                <p className={cn("text-[15px] font-bold", HEADING)}>{t("enable.title")}</p>
                <p className={cn("mt-0.5 text-[12px]", MUTED)}>
                  {draft.enabled
                    ? t("enable.on", {
                        count: Math.min(usedSchedules, limits.schedules),
                        times: sortedTimes,
                      })
                    : t("enable.off")}
                </p>
                {settings.lastSentOn ? (
                  <p className="mt-1 text-[11.5px] text-[#16a34a]">
                    {t("enable.lastSent", { day: settings.lastSentOn })}
                  </p>
                ) : null}
              </div>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
              aria-label={t("enable.title")}
            />
          </section>

          {/* The plan: what the free report includes, and the paid add-on. */}
          <section
            className={cn(
              PANEL,
              "flex flex-col gap-4 p-5",
              paid ? "border-[#f5d48a] bg-gradient-to-l from-[#fffbeb] to-white" : ""
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                    paid ? "bg-[#f59e0b] text-white" : "bg-[#f1f5f9] text-[#64748b]"
                  )}
                >
                  <Crown className="size-5" />
                </span>
                <div>
                  <p className={cn("text-[15px] font-bold", HEADING)}>
                    {paid ? t("plan.paid") : t("plan.free")}
                    {paid && settings.plan.until ? (
                      <span className="ms-2 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">
                        {t("plan.paidUntil", {
                          date: dateFormat.format(new Date(settings.plan.until)),
                        })}
                      </span>
                    ) : null}
                  </p>
                  <p className={cn("mt-0.5 text-[12px]", MUTED)}>
                    {paid ? t("plan.paidLimits") : t("plan.freeLimits")}
                  </p>
                </div>
              </div>
              {paid && addon?.isActive ? (
                <Link
                  href={checkoutHref(addon.active?.interval ?? "monthly")}
                  className="rounded-[10px] border border-[#f5d48a] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#92400e] hover:bg-[#fffbeb]"
                >
                  {t("plan.renew")}
                </Link>
              ) : null}
            </div>

            {!paid && addon?.isActive ? (
              <div className="flex flex-col gap-3 rounded-[14px] border border-[#dbe5f5] bg-[#f6f9ff] p-4">
                <div>
                  <p className="text-[13.5px] font-bold text-[#1e3a8a]">{t("plan.upgradeTitle")}</p>
                  <p className="mt-1 text-[12px] leading-6 text-[#475467]">
                    {t("plan.upgradeBody")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={checkoutHref("monthly")}
                    className="inline-flex items-center gap-2 rounded-[10px] bg-[#2563eb] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#1d4ed8]"
                  >
                    {t("plan.subscribe")} ·{" "}
                    {t("plan.monthly", { price: priceText(addon.monthlyPriceHalalas) })}
                  </Link>
                  <Link
                    href={checkoutHref("yearly")}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-[#2563eb] bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#2563eb] hover:bg-[#eef4ff]"
                  >
                    {t("plan.yearly", { price: priceText(addon.yearlyPriceHalalas) })}
                  </Link>
                </div>
              </div>
            ) : null}
          </section>

          <Section
            icon={<Clock className="size-[18px]" />}
            title={t("schedules.title")}
            hint={t("schedules.hint")}
          >
            <div className="flex flex-col gap-3">
              {draft.schedules.map((schedule, index) => {
                const overPlan = index >= limits.schedules
                const custom = Boolean(schedule.from && schedule.to)
                const coverage = coverageFor(schedule)
                const dayWord = (yesterday: boolean) =>
                  yesterday ? t("schedules.yesterday") : t("schedules.today")
                return (
                  <div
                    key={index}
                    className={cn(
                      "overflow-hidden rounded-[16px] border border-[#E8EBF0] bg-white",
                      overPlan && "opacity-50"
                    )}
                  >
                    {/* When it goes out. */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f6] bg-[#fafbfc] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-[#0b1738] px-2.5 py-1 text-[11px] font-bold text-white">
                          {t("schedules.report", { number: index + 1 })}
                        </span>
                        <span className="text-[12.5px] font-semibold text-[#344054]">
                          {t("schedules.sendAt")}
                        </span>
                        <TimePicker
                          value={schedule.sendTime}
                          label={t("schedules.sendAt")}
                          onChange={(sendTime) => updateSchedule(index, { sendTime })}
                        />
                      </div>
                      {draft.schedules.length > 1 ? (
                        <button
                          type="button"
                          aria-label={t("schedules.remove")}
                          className="flex size-10 items-center justify-center rounded-[11px] text-[#98A2B3] transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              schedules: draft.schedules.filter(
                                (_, position) => position !== index
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-4 p-4">
                      {/* Which period it covers: automatic, or chosen (paid plan). */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            {
                              key: "automatic",
                              icon: Wand2,
                              active: !custom,
                              locked: false,
                              onSelect: () =>
                                updateSchedule(index, {
                                  from: null,
                                  to: null,
                                  fromDay: null,
                                  toDay: null,
                                }),
                            },
                            {
                              key: "custom",
                              icon: SlidersHorizontal,
                              active: custom,
                              locked: !limits.customPeriod,
                              onSelect: () =>
                                updateSchedule(index, {
                                  from: schedule.from ?? coverage.from.time,
                                  fromDay: coverage.from.yesterday ? -1 : 0,
                                  // "End of day" yesterday is 00:00 today.
                                  to:
                                    schedule.to ??
                                    (coverage.to.time === "24:00" ? "00:00" : coverage.to.time),
                                  toDay:
                                    coverage.to.time === "24:00"
                                      ? 0
                                      : coverage.to.yesterday
                                        ? -1
                                        : 0,
                                }),
                            },
                          ] as const
                        ).map((option) => {
                          const OptionIcon = option.icon
                          return (
                            <button
                              key={option.key}
                              type="button"
                              disabled={option.locked}
                              onClick={option.onSelect}
                              aria-pressed={option.active}
                              className={cn(
                                "flex items-start gap-3 rounded-[12px] border p-3 text-start transition-all disabled:cursor-not-allowed",
                                option.active
                                  ? "border-[#2563eb] bg-[#f3f7ff] ring-2 ring-[#2563eb]/10"
                                  : "border-[#E8EBF0] hover:border-[#c9d3e3]",
                                option.locked && "bg-[#fafbfc] hover:border-[#E8EBF0]"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                                  option.active
                                    ? "bg-[#2563eb] text-white"
                                    : "bg-[#f2f4f7] text-[#667085]"
                                )}
                              >
                                <OptionIcon className="size-4" />
                              </span>
                              <span className="flex-1">
                                <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[#0b1738]">
                                  <span className="whitespace-nowrap">
                                    {t(`schedules.periodOptions.${option.key}.title`)}
                                  </span>
                                  {option.locked ? (
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10.5px] font-bold text-[#92400e]">
                                      <Crown className="size-3" />
                                      {tReports("plan.paid")}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] leading-5 text-[#667085]">
                                  {t(`schedules.periodOptions.${option.key}.hint`)}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {/* The covered period, from -> to. */}
                      <div className="rounded-[14px] border border-[#d6f0e1] bg-[#f3fbf6] p-3.5">
                        <p className="mb-2.5 text-[12px] font-bold text-[#1a7f4b]">
                          {t("schedules.coversTitle")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div className="flex min-w-[150px] flex-1 flex-col gap-1 rounded-[12px] bg-white p-2.5 shadow-[0_1px_2px_rgba(16,42,92,0.06)]">
                            <span className="text-[11px] font-semibold text-[#667085]">
                              {custom
                                ? t("schedules.from")
                                : `${t("schedules.from")} · ${dayWord(coverage.from.yesterday)}`}
                            </span>
                            {custom ? (
                              <div className="flex flex-col gap-1.5">
                                <DaySwitch
                                  yesterday={coverage.from.yesterday}
                                  onChange={(yesterday) =>
                                    updateSchedule(index, { fromDay: yesterday ? -1 : 0 })
                                  }
                                />
                                <TimePicker
                                  value={schedule.from ?? "00:00"}
                                  label={t("schedules.from")}
                                  onChange={(from) => updateSchedule(index, { from })}
                                  className="h-10 w-full"
                                />
                              </div>
                            ) : (
                              <span
                                dir="ltr"
                                className="text-start text-[15px] font-extrabold tabular-nums text-[#0b1738]"
                              >
                                {formatTime(coverage.from.time)}
                              </span>
                            )}
                          </div>
                          <ArrowLeft className="size-4 shrink-0 text-[#1a7f4b] ltr:rotate-180" />
                          <div className="flex min-w-[150px] flex-1 flex-col gap-1 rounded-[12px] bg-white p-2.5 shadow-[0_1px_2px_rgba(16,42,92,0.06)]">
                            <span className="text-[11px] font-semibold text-[#667085]">
                              {custom
                                ? t("schedules.to")
                                : `${t("schedules.to")} · ${dayWord(coverage.to.yesterday)}`}
                            </span>
                            {custom ? (
                              <div className="flex flex-col gap-1.5">
                                <DaySwitch
                                  yesterday={coverage.to.yesterday}
                                  onChange={(yesterday) =>
                                    updateSchedule(index, { toDay: yesterday ? -1 : 0 })
                                  }
                                />
                                <TimePicker
                                  value={schedule.to ?? schedule.sendTime}
                                  label={t("schedules.to")}
                                  onChange={(to) => updateSchedule(index, { to })}
                                  className="h-10 w-full"
                                />
                              </div>
                            ) : (
                              <span
                                dir="ltr"
                                className="text-start text-[15px] font-extrabold tabular-nums text-[#0b1738]"
                              >
                                {formatTime(coverage.to.time)}
                                {coverage.to.isSendTime ? (
                                  <span className="ms-1.5 text-[11px] font-semibold text-[#667085]">
                                    ({t("schedules.sendTimeTag")})
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </div>
                        </div>
                        {custom && coverage.invalid ? (
                          <p className="mt-2.5 flex items-start gap-1.5 rounded-[10px] bg-[#fef2f2] px-3 py-2 text-[11.5px] font-semibold leading-5 text-[#b42318]">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {t("schedules.invalidPeriod")}
                          </p>
                        ) : custom ? (
                          <p className="mt-2.5 text-[11.5px] font-semibold leading-5 text-[#1a7f4b]">
                            {t("schedules.spans", {
                              hours: coverage.hours,
                              from: `${dayWord(coverage.from.yesterday)} ${formatTime(coverage.from.time)}`,
                              to: `${dayWord(coverage.to.yesterday)} ${formatTime(coverage.to.time)}`,
                            })}
                          </p>
                        ) : (
                          <p className="mt-2.5 text-[11.5px] leading-5 text-[#4b6b58]">
                            {t("schedules.automaticRule")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="h-10 w-fit gap-2 rounded-[10px] text-[12.5px] font-semibold"
                  disabled={!canAddSchedule}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      schedules: [
                        ...draft.schedules,
                        { sendTime: "12:00", from: null, to: null, fromDay: null, toDay: null },
                      ],
                    })
                  }
                >
                  <Plus className="size-4" />
                  {paid && !canAddSchedule ? t("schedules.full") : t("schedules.add")}
                </Button>
                {!paid ? <LockedHint>{t("schedules.lockedAdd")}</LockedHint> : null}
              </div>
            </div>
          </Section>

          <Section
            icon={<Users className="size-[18px]" />}
            title={t("recipients.title")}
            hint={t("recipients.hint", { max: limits.recipients })}
          >
            <div className="flex flex-col gap-2.5">
              {draft.recipients.length === 0 ? (
                <p
                  className={cn(
                    "rounded-[12px] border border-dashed border-[#d7deea] p-5 text-center text-[12.5px]",
                    MUTED
                  )}
                >
                  {t("recipients.empty")}
                </p>
              ) : (
                draft.recipients.map((recipient, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex flex-wrap items-center gap-2",
                      index >= limits.recipients && "opacity-50"
                    )}
                  >
                    <Input
                      value={recipient.name}
                      placeholder={t("recipients.namePlaceholder")}
                      aria-label={t("recipients.nameLabel")}
                      onChange={(event) => updateRecipient(index, { name: event.target.value })}
                      className={cn(FIELD_CLASS, "min-w-[140px] flex-1")}
                    />
                    <Input
                      value={recipient.phone}
                      dir="ltr"
                      inputMode="tel"
                      placeholder="05XXXXXXXX"
                      aria-label={t("recipients.phoneLabel")}
                      onChange={(event) => updateRecipient(index, { phone: event.target.value })}
                      className={cn(FIELD_CLASS, "min-w-[160px] flex-1 text-left")}
                    />
                    <button
                      type="button"
                      aria-label={t("recipients.remove")}
                      className="flex size-11 items-center justify-center rounded-[12px] text-[#98A2B3] transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          recipients: draft.recipients.filter((_, position) => position !== index),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="h-10 w-fit gap-2 rounded-[10px] text-[12.5px] font-semibold"
                  disabled={!canAddRecipient}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      recipients: [...draft.recipients, { phone: "", name: "" }],
                    })
                  }
                >
                  <Plus className="size-4" />
                  {canAddRecipient || !paid ? t("recipients.add") : t("recipients.full")}
                </Button>
                {!paid && !canAddRecipient ? (
                  <LockedHint>{t("recipients.lockedAdd")}</LockedHint>
                ) : null}
              </div>
            </div>
          </Section>
        </div>

        <aside className={cn(PANEL, "flex h-fit flex-col overflow-hidden")}>
          <div className="flex items-center justify-between gap-2 border-b border-[#eef1f6] px-5 py-3.5">
            <div>
              <p className={cn("text-[14px] font-bold", HEADING)}>{t("preview.title")}</p>
              {preview ? (
                <p className={cn("text-[11.5px]", MUTED)}>
                  {t("preview.day", { day: preview.day })}
                </p>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-[9px] px-3 text-[12px] font-semibold"
              disabled={testing || draft.recipients.length === 0}
              title={draft.recipients.length === 0 ? t("preview.testNeedsRecipients") : undefined}
              onClick={() => void sendTest()}
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              {t("preview.test")}
            </Button>
          </div>
          {/* WhatsApp's chat wallpaper tone and bubble, so the merchant sees the message as it lands. */}
          <div className="max-h-[640px] overflow-y-auto bg-[#efeae2] p-4">
            <div
              dir="rtl"
              className="relative max-w-[95%] rounded-[10px] rounded-tr-none bg-white px-3 py-2 text-right text-[12.5px] leading-[1.55] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
            >
              {preview ? <WhatsAppText text={preview.text} /> : null}
              <span className="mt-1 block text-left text-[10px] text-[#667781]">
                {draft.schedules[0]?.sendTime}
              </span>
            </div>
          </div>
          <p
            className={cn(
              "border-t border-[#eef1f6] px-5 py-3 text-[11.5px] leading-relaxed",
              MUTED
            )}
          >
            {t("preview.note")}
          </p>
        </aside>
      </div>
    </div>
  )
}
