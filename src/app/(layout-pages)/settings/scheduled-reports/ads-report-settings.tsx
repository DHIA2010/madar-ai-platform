"use client"

// تقرير الإعلانات اليومي على واتساب -- what the ads spent and brought the day before on every
// connected ad platform, with the check-up's findings, sent each morning from Madar's WhatsApp
// number to the numbers the merchant chooses (backend: whatsapp/ads-report.ts). The preview beside
// the form is the message exactly as it would go out now.

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Clock,
  Crown,
  Hourglass,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"
import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import { type AddonOverview, addonsService } from "@/features/billing"
import {
  adsReportService,
  type AdsReportRecipient,
  type AdsReportSettings as Settings,
} from "@/features/settings/services/ads-report.service"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

import { categoryHref } from "./catalog"
import { ReportsBreadcrumb } from "./scheduled-reports-category"
import { TimePicker, useFormatTime } from "./time-picker"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-12 rounded-[12px] border-[#E8EBF0] bg-white text-[14px] text-[#0b1738] placeholder:text-[#98A2B3]"

// The same paid add-on as the cashier's daily report: one plan for every scheduled report.
const ADDON = "whatsapp_daily_report"
const checkoutHref = (interval: "monthly" | "yearly") =>
  `${ROUTES.marketplaceBillingCheckout}?purpose=addon&addon=${ADDON}&interval=${interval}`

interface Draft {
  enabled: boolean
  sendTime: string
  recipients: AdsReportRecipient[]
}

function LockedHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#9a6700]">
      <Lock className="size-3" />
      {children}
    </span>
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
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#fff1e6] text-[#ea580c]">
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

export default function AdsReportSettings() {
  const t = useTranslations("settings.adsReport")
  const tReports = useTranslations("settings.scheduledReports")
  const formatTime = useFormatTime()
  const locale = useLocale() as Locale

  const [draft, setDraft] = useState<Draft | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [addon, setAddon] = useState<AddonOverview | null>(null)
  const [preview, setPreview] = useState<{ day: string; text: string; ready: boolean } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const apply = useCallback((saved: Settings) => {
    setSettings(saved)
    setDraft({ enabled: saved.enabled, sendTime: saved.sendTime, recipients: saved.recipients })
  }, [])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [overview, addonOverview] = await Promise.all([
        adsReportService.get(),
        addonsService.get(ADDON).catch(() => null),
      ])
      setAddon(addonOverview)
      apply(overview.settings)
      setPreview(overview.preview)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadError.forbidden") : t("loadError.generic"))
    }
  }, [t, apply])

  useEffect(() => {
    void load()
  }, [load])

  const errorMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof AppError)) return fallback
    switch (error.code) {
      case "ADS_REPORT_NO_RECIPIENTS":
        return t("errors.noRecipients")
      case "ADS_REPORT_TOO_MANY_RECIPIENTS":
        return t("errors.tooManyRecipients")
      case "ADS_REPORT_PLAN_LIMIT":
        return t("errors.planLimit")
      case "ADS_REPORT_NUMBER_LOCKED":
        return t("errors.numberLocked")
      case "REPORT_FREE_SLOT_USED":
        return t("errors.freeSlotUsed")
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
        return error.status === 403 ? t("errors.forbidden") : fallback
    }
  }

  const cleanRecipients = (recipients: AdsReportRecipient[]) =>
    recipients
      .map((recipient) => ({ phone: recipient.phone.trim(), name: recipient.name.trim() }))
      .filter((recipient) => recipient.phone.length > 0)

  const save = async (): Promise<boolean> => {
    if (!draft) return false
    const recipients = cleanRecipients(draft.recipients)
    if (draft.enabled && recipients.length === 0) {
      toast.error(t("errors.noRecipients"))
      return false
    }
    setSaving(true)
    try {
      apply(await adsReportService.update({ ...draft, recipients }))
      toast.success(t("saved"))
      return true
    } catch (error) {
      toast.error(errorMessage(error, t("errors.save")))
      return false
    } finally {
      setSaving(false)
    }
  }

  // The test goes to the saved numbers, so what is on screen is saved first.
  const sendTest = async () => {
    if (!(await save())) return
    setTesting(true)
    try {
      const result = await adsReportService.sendTest()
      if (result.sent > 0) toast.success(t("preview.testSent", { count: result.sent }))
      else toast.error(t("preview.testFailed"))
    } catch (error) {
      toast.error(errorMessage(error, t("preview.testFailed")))
    } finally {
      setTesting(false)
    }
  }

  if (loadError) {
    return (
      <div className={cn(PANEL, "p-8 text-center")}>
        <p className={cn("text-[14px] font-semibold", HEADING)}>{loadError}</p>
        <Button variant="outline" className="mt-4 h-11 rounded-[10px]" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (!draft || !settings) {
    return (
      <div className="flex items-center justify-center py-24 text-[#98A2B3]">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const paid = settings.plan.paid
  const canAddRecipient = draft.recipients.length < settings.maxRecipients
  // On the free plan the saved number can't be changed or removed (only renamed).
  const lockedPhone = paid ? null : (settings.recipients[0]?.phone ?? null)
  // The account's one free report is in use by the cashier's daily report.
  const freeTaken = settings.freeUsedBy === "pos"
  const priceText = (halalas: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(halalas / 100)
  const dateFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US",
    { day: "numeric", month: "long", year: "numeric" }
  )
  const updateRecipient = (index: number, patch: Partial<AdsReportRecipient>) =>
    setDraft({
      ...draft,
      recipients: draft.recipients.map((recipient, position) =>
        position === index ? { ...recipient, ...patch } : recipient
      ),
    })

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5">
      <ReportsBreadcrumb
        items={[
          { label: tReports("title"), href: ROUTES.settingsScheduledReports },
          { label: tReports("categories.advertising.name"), href: categoryHref("advertising") },
          { label: tReports("templates.ads-report.name") },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 max-w-[640px] text-[13px] leading-6", MUTED)}>{t("subtitle")}</p>
        </div>
        <Button
          className="h-12 gap-2 rounded-[12px] bg-[#2563eb] px-6 text-[14px] font-bold text-white hover:bg-[#1d4ed8]"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? t("saving") : t("save")}
        </Button>
      </div>

      {preview && !preview.ready ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[#fde3a7] bg-[#fffaeb] p-4">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-[#b54708]" />
          <div>
            <p className="text-[13.5px] font-bold text-[#93370d]">{t("pending.title")}</p>
            <p className="mt-0.5 text-[12.5px] leading-6 text-[#b54708]">{t("pending.body")}</p>
          </div>
        </div>
      ) : null}

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
                    ? t("enable.on", { time: formatTime(draft.sendTime) })
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
              // While the free report is in use elsewhere, this one can only be switched off.
              disabled={freeTaken && !draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
              aria-label={t("enable.title")}
            />
          </section>

          {freeTaken ? (
            <div className="flex items-start gap-3 rounded-2xl border border-[#fde3a7] bg-[#fffaeb] p-4">
              <Lock className="mt-0.5 size-5 shrink-0 text-[#b54708]" />
              <div>
                <p className="text-[13.5px] font-bold text-[#93370d]">{t("freeSlot.title")}</p>
                <p className="mt-0.5 text-[12.5px] leading-6 text-[#b54708]">
                  {t("freeSlot.body")}
                </p>
              </div>
            </div>
          ) : null}

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
            title={t("time.title")}
            hint={t("time.hint")}
          >
            <TimePicker
              value={draft.sendTime}
              label={t("time.label")}
              onChange={(sendTime) => setDraft({ ...draft, sendTime })}
              className="h-12 w-full sm:w-[220px]"
            />
          </Section>

          <Section
            icon={<Users className="size-[18px]" />}
            title={t("recipients.title")}
            hint={t("recipients.hint", { count: settings.maxRecipients })}
          >
            <div className="flex flex-col gap-3">
              {draft.recipients.map((recipient, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    dir="ltr"
                    inputMode="tel"
                    className={cn(
                      FIELD_CLASS,
                      "text-start",
                      lockedPhone && index === 0 && "cursor-not-allowed bg-[#f8fafc] text-[#475467]"
                    )}
                    placeholder={t("recipients.phonePlaceholder")}
                    value={recipient.phone}
                    // The free plan's one number is fixed once saved.
                    readOnly={Boolean(lockedPhone) && index === 0}
                    title={lockedPhone && index === 0 ? t("recipients.freeLocked") : undefined}
                    onChange={(event) => updateRecipient(index, { phone: event.target.value })}
                  />
                  <Input
                    className={FIELD_CLASS}
                    placeholder={t("recipients.namePlaceholder")}
                    value={recipient.name}
                    onChange={(event) => updateRecipient(index, { name: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-12 rounded-[12px] px-3 text-[#b42318] hover:bg-[#fef3f2]",
                      lockedPhone && index === 0 && "invisible"
                    )}
                    disabled={Boolean(lockedPhone) && index === 0}
                    aria-label={t("recipients.remove")}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        recipients: draft.recipients.filter((_, position) => position !== index),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {canAddRecipient ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-fit gap-2 rounded-[12px] px-4 text-[13px] font-semibold"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      recipients: [...draft.recipients, { phone: "", name: "" }],
                    })
                  }
                >
                  <Plus className="size-4" />
                  {t("recipients.add")}
                </Button>
              ) : !paid ? (
                <LockedHint>{t("recipients.lockedAdd")}</LockedHint>
              ) : null}
              {lockedPhone ? <LockedHint>{t("recipients.freeLocked")}</LockedHint> : null}
            </div>
          </Section>

          <p className={cn("text-[12px] leading-6", MUTED)}>
            {t("checkupHint")}{" "}
            <Link href={ROUTES.campaignsCheckup} className="font-bold text-[#2563eb]">
              {t("checkupLink")}
            </Link>
          </p>
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
              className="h-10 gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold"
              disabled={
                testing ||
                saving ||
                !preview?.ready ||
                cleanRecipients(draft.recipients).length === 0
              }
              title={
                !preview?.ready
                  ? t("pending.title")
                  : cleanRecipients(draft.recipients).length === 0
                    ? t("preview.testNeedsRecipients")
                    : undefined
              }
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
                {draft.sendTime}
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
