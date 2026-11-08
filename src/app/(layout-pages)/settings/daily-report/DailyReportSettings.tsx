"use client"

// التقرير اليومي على واتساب -- the store's daily summary, sent from Madar's WhatsApp number to the
// numbers the merchant chooses, at the time they choose (backend: whatsapp/daily-report.ts). The
// preview beside the form is the message exactly as it would go out now.

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Clock, Loader2, MessageCircle, Plus, Send, Trash2, Users } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import {
  dailyReportService,
  MAX_DAILY_REPORT_RECIPIENTS,
  type DailyReportRecipient,
} from "@/features/settings/services/daily-report.service"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

interface Draft {
  enabled: boolean
  sendTime: string
  recipients: DailyReportRecipient[]
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

export default function DailyReportSettings() {
  const t = useTranslations("settings.dailyReport")
  const locale = useLocale() as Locale

  const [draft, setDraft] = useState<Draft | null>(null)
  const [lastSentOn, setLastSentOn] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ day: string; text: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const overview = await dailyReportService.get()
      setDraft({
        enabled: overview.settings.enabled,
        sendTime: overview.settings.sendTime,
        recipients: overview.settings.recipients,
      })
      setLastSentOn(overview.settings.lastSentOn)
      setPreview(overview.preview)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadError.forbidden") : t("loadError.generic"))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const errorMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof AppError)) return fallback
    if (error.status === 403) return t("errors.forbidden")
    switch (error.code) {
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

  const save = async () => {
    if (!draft) return
    const recipients = draft.recipients
      .map((recipient) => ({ phone: recipient.phone.trim(), name: recipient.name.trim() }))
      .filter((recipient) => recipient.phone.length > 0)
    if (draft.enabled && recipients.length === 0) {
      toast.error(t("errors.noRecipients"))
      return
    }
    setSaving(true)
    try {
      const saved = await dailyReportService.update({ ...draft, recipients })
      setDraft({ enabled: saved.enabled, sendTime: saved.sendTime, recipients: saved.recipients })
      setLastSentOn(saved.lastSentOn)
      toast.success(
        saved.enabled ? t("toasts.savedOn", { time: saved.sendTime }) : t("toasts.savedOff")
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

  if (!draft) {
    return (
      <div className="flex justify-center p-16 text-[#98A2B3]">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const canAdd = draft.recipients.length < MAX_DAILY_REPORT_RECIPIENTS

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5">
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
                  {draft.enabled ? t("enable.on", { time: draft.sendTime }) : t("enable.off")}
                </p>
                {lastSentOn ? (
                  <p className="mt-1 text-[11.5px] text-[#16a34a]">
                    {t("enable.lastSent", { day: lastSentOn })}
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

          <Section
            icon={<Clock className="size-[18px]" />}
            title={t("time.title")}
            hint={t("time.hint")}
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="daily-report-time" className="text-[12px] font-semibold">
                  {t("time.label")}
                </Label>
                <Input
                  id="daily-report-time"
                  type="time"
                  dir="ltr"
                  value={draft.sendTime}
                  onChange={(event) => setDraft({ ...draft, sendTime: event.target.value })}
                  className={cn(FIELD_CLASS, "w-[160px] text-center")}
                />
              </div>
              <p className={cn("max-w-[420px] pb-2 text-[12px] leading-relaxed", MUTED)}>
                {t("time.dayRule")}
              </p>
            </div>
          </Section>

          <Section
            icon={<Users className="size-[18px]" />}
            title={t("recipients.title")}
            hint={t("recipients.hint", { max: MAX_DAILY_REPORT_RECIPIENTS })}
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
                  <div key={index} className="flex flex-wrap items-center gap-2">
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
              <Button
                variant="outline"
                className="mt-1 h-10 w-fit gap-2 rounded-[10px] text-[12.5px] font-semibold"
                disabled={!canAdd}
                onClick={() =>
                  setDraft({ ...draft, recipients: [...draft.recipients, { phone: "", name: "" }] })
                }
              >
                <Plus className="size-4" />
                {canAdd ? t("recipients.add") : t("recipients.full")}
              </Button>
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
