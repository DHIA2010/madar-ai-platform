"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Calendar, ChevronLeft, Clock, Globe2, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppInput, AppSearchableSelect, AppSwitch } from "@/components/app"

import { useConnectionsCenter } from "../hooks"
import {
  type ConnectionSyncSchedule,
  type SaveConnectionSyncScheduleInput,
  syncScheduleService,
} from "../services/sync-schedule.service"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"
import { resolveBackendProviderId } from "@/infrastructure/data/repositories/integration.repository"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

type ScheduleSettingsTranslator = ReturnType<
  typeof useTranslations<"integrations.scheduleSettings">
>

// Mirrors format-arabic-time.ts's locale-aware date/time formatters in this same rollout:
// Arabic numerals are forced to Western digits via -u-nu-latn so they match the plain numbers
// coming from the backend.
function dateTimeLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US"
}

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return new Intl.DateTimeFormat(dateTimeLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function frequencyOptions(
  t: ScheduleSettingsTranslator
): Array<{ minutes: SaveConnectionSyncScheduleInput["frequencyMinutes"]; label: string }> {
  return [
    { minutes: 1440, label: t("syncSchedule.frequencyOptions.daily") },
    { minutes: 360, label: t("syncSchedule.frequencyOptions.every6Hours") },
    { minutes: 60, label: t("syncSchedule.frequencyOptions.everyHour") },
    { minutes: 30, label: t("syncSchedule.frequencyOptions.every30Minutes") },
    { minutes: 15, label: t("syncSchedule.frequencyOptions.every15Minutes") },
  ]
}

function dayOptions(t: ScheduleSettingsTranslator) {
  return [
    { index: 0, label: t("syncSchedule.days.sunday") },
    { index: 1, label: t("syncSchedule.days.monday") },
    { index: 2, label: t("syncSchedule.days.tuesday") },
    { index: 3, label: t("syncSchedule.days.wednesday") },
    { index: 4, label: t("syncSchedule.days.thursday") },
    { index: 5, label: t("syncSchedule.days.friday") },
    { index: 6, label: t("syncSchedule.days.saturday") },
  ]
}

// `value` is the real IANA timezone id sent to the backend -- only `label` is localized.
function timezoneOptions(t: ScheduleSettingsTranslator) {
  return [
    { value: "Asia/Riyadh", label: t("timezones.riyadh") },
    { value: "Asia/Dubai", label: t("timezones.dubai") },
    { value: "Asia/Kuwait", label: t("timezones.kuwait") },
    { value: "Africa/Cairo", label: t("timezones.cairo") },
    { value: "Europe/Istanbul", label: t("timezones.istanbul") },
    { value: "Europe/London", label: t("timezones.london") },
    { value: "America/New_York", label: t("timezones.newYork") },
    { value: "UTC", label: t("timezones.utc") },
  ]
}

function retryAttemptOptions(t: ScheduleSettingsTranslator) {
  return [
    { value: "0", label: t("advancedSync.retryOptions.none") },
    { value: "1", label: t("advancedSync.retryOptions.once") },
    { value: "2", label: t("advancedSync.retryOptions.twice") },
    { value: "3", label: t("advancedSync.retryOptions.threeTimes") },
    { value: "5", label: t("advancedSync.retryOptions.fiveTimes") },
  ]
}

function timezoneLabel(timezone: string, options: Array<{ value: string; label: string }>) {
  return options.find((option) => option.value === timezone)?.label ?? timezone
}

interface FormState {
  enabled: boolean
  frequencyMode: "preset" | "custom"
  frequencyMinutes: SaveConnectionSyncScheduleInput["frequencyMinutes"]
  customCron: string
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
}

function toFormState(schedule: ConnectionSyncSchedule): FormState {
  return {
    enabled: schedule.enabled,
    frequencyMode: schedule.customCron ? "custom" : "preset",
    frequencyMinutes: schedule.customCron ? null : (schedule.frequencyMinutes ?? 60),
    customCron: schedule.customCron ?? "",
    activeDays: schedule.activeDays,
    startTimeLocal: schedule.startTimeLocal,
    timezone: schedule.timezone,
    retryOnConnectionFailure: schedule.retryOnConnectionFailure,
    retryMaxAttempts: schedule.retryMaxAttempts,
    notifyOnFailure: schedule.notifyOnFailure,
  }
}

export function ScheduleSettings({ connectionId }: { connectionId: string }) {
  const t = useTranslations("integrations.scheduleSettings")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  const { getConnectionById, isLoading: isConnectionsLoading } = useConnectionsCenter()
  const record = getConnectionById(connectionId)
  const providerId = record ? resolveBackendProviderId(record.connectorDefinitionId) : null
  const timezoneOptionList = useMemo(() => timezoneOptions(t), [t])
  const frequencyOptionList = useMemo(() => frequencyOptions(t), [t])
  const dayOptionList = useMemo(() => dayOptions(t), [t])
  const retryAttemptOptionList = useMemo(() => retryAttemptOptions(t), [t])

  const [schedule, setSchedule] = useState<ConnectionSyncSchedule | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!providerId) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    syncScheduleService
      .getSchedule(providerId, connectionId)
      .then((result) => {
        if (cancelled) return
        setSchedule(result)
        setForm(toFormState(result))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : t("errors.loadFailed"))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [providerId, connectionId, t])

  const toggleDay = (dayIndex: number) => {
    setForm((current) => {
      if (!current) return current
      const isActive = current.activeDays.includes(dayIndex)
      return {
        ...current,
        activeDays: isActive
          ? current.activeDays.filter((day) => day !== dayIndex)
          : [...current.activeDays, dayIndex].sort((a, b) => a - b),
      }
    })
  }

  const onSave = async () => {
    if (!providerId || !form || isSaving) {
      return
    }

    if (form.frequencyMode === "custom" && form.customCron.trim().split(/\s+/).length !== 5) {
      toast.error(t("validation.invalidCron"))
      return
    }

    if (form.frequencyMode === "preset" && form.activeDays.length === 0) {
      toast.error(t("validation.selectAtLeastOneDay"))
      return
    }

    setIsSaving(true)
    try {
      const payload: SaveConnectionSyncScheduleInput = {
        enabled: form.enabled,
        frequencyMinutes: form.frequencyMode === "preset" ? form.frequencyMinutes : null,
        customCron: form.frequencyMode === "custom" ? form.customCron.trim() : null,
        activeDays: form.activeDays,
        startTimeLocal: form.startTimeLocal,
        timezone: form.timezone,
        retryOnConnectionFailure: form.retryOnConnectionFailure,
        retryMaxAttempts: form.retryMaxAttempts,
        notifyOnFailure: form.notifyOnFailure,
      }

      const result = await syncScheduleService.saveSchedule(providerId, connectionId, payload)
      setSchedule(result)
      setForm(toFormState(result))
      toast.success(t("toasts.saveSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const nextRunLabel = useMemo(() => {
    if (!schedule?.nextRunAt) return "-"
    return formatDateTime(schedule.nextRunAt, locale)
  }, [schedule, locale])

  if (isConnectionsLoading || (isLoading && !form)) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>{tCommon("loading")}</p>
        </div>
      </div>
    )
  }

  if (!record || !providerId) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>{t("connectionNotFound")}</p>
        </div>
      </div>
    )
  }

  if (loadError || !form) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>
            {loadError ?? t("errors.loadFailed")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5 pb-24")} dir={dir}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className={cn("text-[12px]", MUTED)}>
          <Link href={ROUTES.integrations} className="hover:text-[#2878ff]">
            {t("breadcrumb.integrations")}
          </Link>
          <span className="mx-1.5">›</span>
          <span>{record.platformName}</span>
          <span className="mx-1.5">›</span>
          <span className={HEADING}>{t("breadcrumb.scheduleSettings")}</span>
        </div>
        <Link
          href={ROUTES.integrationsDetails(connectionId)}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7b96] transition-colors hover:text-[#2878ff]"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
          {t("backToDetails")}
        </Link>
      </div>

      <div className={cn(PANEL, "mb-3.5 px-6 py-5")}>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2878ff]/10 text-[#2878ff]">
            <Calendar className="size-5" />
          </div>
          <div>
            <h1 className={cn("text-[20px] font-extrabold leading-tight", HEADING)}>
              {t("header.title")}
            </h1>
            <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>{t("header.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="mb-3.5 grid gap-3.5 sm:grid-cols-3">
        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#5b6b85]">
            <Clock className="size-4" />
          </div>
          <div className="min-w-0 text-right">
            <div className={cn("text-[11px]", MUTED)}>{t("stats.lastSync.label")}</div>
            <div className={cn("mt-0.5 text-[13px] font-bold", HEADING)}>
              {formatDateTime(schedule?.lastRunAt, locale)}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)}>
              {schedule?.lastRunStatus === "completed"
                ? t("stats.lastSync.success")
                : schedule?.lastRunStatus === "failed"
                  ? t("stats.lastSync.failed")
                  : t("stats.lastSync.notRunYet")}
            </div>
          </div>
        </div>

        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#5b6b85]">
            <Globe2 className="size-4" />
          </div>
          <div className="min-w-0 text-right">
            <div className={cn("text-[11px]", MUTED)}>{t("stats.timezone.label")}</div>
            <div className={cn("mt-0.5 text-[13px] font-bold", HEADING)}>
              {timezoneLabel(form.timezone, timezoneOptionList)}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)} dir="ltr">
              {form.timezone}
            </div>
          </div>
        </div>

        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="text-right">
            <div className={cn("text-[13px] font-bold", HEADING)}>
              {form.enabled ? t("stats.enabled") : t("stats.disabled")}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)}>
              {form.enabled ? t("stats.enabledHint") : t("stats.disabledHint")}
            </div>
          </div>
          <AppSwitch
            checked={form.enabled}
            onCheckedChange={(checked) =>
              setForm((current) => (current ? { ...current, enabled: checked } : current))
            }
          />
        </div>
      </div>

      <div className={cn(PANEL, "mb-3.5 px-5 py-4")}>
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="size-4 text-[#5b6b85]" />
          <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("syncSchedule.title")}</h2>
        </div>

        <div className="mb-3.5">
          <div className={cn("mb-2 text-[12px] font-semibold", MUTED)}>
            {t("syncSchedule.frequencyLabel")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setForm((current) => (current ? { ...current, frequencyMode: "custom" } : current))
              }
              className={cn(
                "flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                form.frequencyMode === "custom"
                  ? "border-[#2878ff] bg-[#2878ff]/10 text-[#2878ff]"
                  : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fd]"
              )}
            >
              <Settings2 className="size-3.5" />
              {t("syncSchedule.custom")}
            </button>
            {frequencyOptionList.map((option) => (
              <button
                key={option.minutes}
                type="button"
                onClick={() =>
                  setForm((current) =>
                    current
                      ? { ...current, frequencyMode: "preset", frequencyMinutes: option.minutes }
                      : current
                  )
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                  form.frequencyMode === "preset" && form.frequencyMinutes === option.minutes
                    ? "border-[#2878ff] bg-[#2878ff]/10 text-[#2878ff]"
                    : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fd]"
                )}
              >
                <Clock className="size-3.5" />
                {option.label}
              </button>
            ))}
          </div>
          {form.frequencyMode === "custom" ? (
            <div className="mt-2.5">
              <AppInput
                dir="ltr"
                value={form.customCron}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, customCron: event.target.value } : current
                  )
                }
                placeholder={t("syncSchedule.customCronPlaceholder")}
                className="h-10 rounded-[10px] border-[#e1e7f0] text-[12.5px]"
              />
              <p className={cn("mt-1 text-[10.5px]", MUTED)}>{t("syncSchedule.customCronHint")}</p>
            </div>
          ) : null}
        </div>

        {form.frequencyMode === "preset" ? (
          <div className="mb-3.5">
            <div className={cn("mb-2 text-[12px] font-semibold", MUTED)}>
              {t("syncSchedule.activeDaysLabel")}
            </div>
            <div className="flex flex-wrap gap-2">
              {dayOptionList.map((day) => (
                <button
                  key={day.index}
                  type="button"
                  onClick={() => toggleDay(day.index)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                    form.activeDays.includes(day.index)
                      ? "border-[#2878ff] bg-[#2878ff]/10 text-[#2878ff]"
                      : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fd]"
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-2">
          {form.frequencyMode === "preset" ? (
            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                {t("syncSchedule.startTimeLabel")}
              </div>
              <AppInput
                type="time"
                dir="ltr"
                value={form.startTimeLocal}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, startTimeLocal: event.target.value } : current
                  )
                }
                className="h-10 rounded-[10px] border-[#e1e7f0] text-[12.5px]"
              />
            </div>
          ) : null}
          <div>
            <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
              {t("syncSchedule.timezoneLabel")}
            </div>
            <AppSearchableSelect
              value={form.timezone}
              options={timezoneOptionList}
              onChange={(value) =>
                setForm((current) => (current ? { ...current, timezone: value } : current))
              }
              triggerClassName="h-10 w-full rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
            />
          </div>
        </div>
      </div>

      <div className={cn(PANEL, "mb-3.5 px-5 py-4")}>
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="size-4 text-[#5b6b85]" />
          <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("advancedSync.title")}</h2>
        </div>

        <div className="divide-y divide-[#eef1f6]">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className={cn("text-[13px] font-semibold", HEADING)}>
                {t("advancedSync.autoRetryOnConnectionFailure.title")}
              </div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>
                {t("advancedSync.autoRetryOnConnectionFailure.hint")}
              </div>
            </div>
            <AppSwitch
              checked={form.retryOnConnectionFailure}
              onCheckedChange={(checked) =>
                setForm((current) =>
                  current ? { ...current, retryOnConnectionFailure: checked } : current
                )
              }
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className={cn("text-[13px] font-semibold", HEADING)}>
                {t("advancedSync.retryOnFailure.title")}
              </div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>
                {t("advancedSync.retryOnFailure.hint")}
              </div>
            </div>
            <AppSearchableSelect
              value={String(form.retryMaxAttempts)}
              options={retryAttemptOptionList}
              onChange={(value) =>
                setForm((current) =>
                  current ? { ...current, retryMaxAttempts: Number(value) } : current
                )
              }
              triggerClassName="h-9 w-[184px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]"
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className={cn("text-[13px] font-semibold", HEADING)}>
                {t("advancedSync.notifyOnFailure.title")}
              </div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>
                {t("advancedSync.notifyOnFailure.hint")}
              </div>
            </div>
            <AppSwitch
              checked={form.notifyOnFailure}
              onCheckedChange={(checked) =>
                setForm((current) => (current ? { ...current, notifyOnFailure: checked } : current))
              }
            />
          </div>
        </div>
      </div>

      <div className={cn(PANEL, "mb-3.5 px-5 py-4")}>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="size-4 text-[#5b6b85]" />
          <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("nextSync.title")}</h2>
        </div>
        <p className={cn("mb-3 text-[11px]", MUTED)}>{t("nextSync.subtitle")}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-4 py-3">
          <div>
            <div className={cn("text-[11px]", MUTED)}>{t("nextSync.statusLabel")}</div>
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                form.enabled ? "bg-[#eff6ff] text-[#2563eb]" : "bg-[#f1f5f9] text-[#64748b]"
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {form.enabled ? t("nextSync.scheduled") : t("nextSync.paused")}
            </span>
          </div>
          <div className="text-right">
            <div className={cn("text-[11px]", MUTED)}>{t("nextSync.dateTimeLabel")}</div>
            <div className={cn("mt-1 text-[13px] font-bold", HEADING)}>{nextRunLabel}</div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#e1e7f0] bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-[1400px] items-center justify-start gap-2.5">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving}
            className="flex h-10 items-center justify-center rounded-[10px] bg-[#2878ff] px-6 text-[13px] font-bold text-white transition-colors hover:bg-[#1f66e0] disabled:opacity-60"
          >
            {isSaving ? t("actions.saving") : t("actions.save")}
          </button>
          <button
            type="button"
            onClick={() => router.push(ROUTES.integrationsDetails(connectionId))}
            className="flex h-10 items-center justify-center rounded-[10px] border border-[#e1e7f0] bg-white px-6 text-[13px] font-semibold text-[#5b6b85] transition-colors hover:bg-[#f7f9fd]"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </div>
    </div>
  )
}
