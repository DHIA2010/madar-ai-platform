"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { resolveBackendProviderId } from "@/infrastructure/data/repositories/integration.repository"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return DATE_TIME_FORMAT.format(date)
}

const FREQUENCY_OPTIONS: Array<{
  minutes: SaveConnectionSyncScheduleInput["frequencyMinutes"]
  label: string
}> = [
  { minutes: 1440, label: "يوميًا" },
  { minutes: 360, label: "كل 6 ساعات" },
  { minutes: 60, label: "كل ساعة" },
  { minutes: 30, label: "كل 30 دقيقة" },
  { minutes: 15, label: "كل 15 دقيقة" },
]

const DAY_OPTIONS = [
  { index: 0, label: "الأحد" },
  { index: 1, label: "الاثنين" },
  { index: 2, label: "الثلاثاء" },
  { index: 3, label: "الأربعاء" },
  { index: 4, label: "الخميس" },
  { index: 5, label: "الجمعة" },
  { index: 6, label: "السبت" },
]

const TIMEZONE_OPTIONS = [
  { value: "Asia/Riyadh", label: "الرياض (GMT+3)" },
  { value: "Asia/Dubai", label: "دبي (GMT+4)" },
  { value: "Asia/Kuwait", label: "الكويت (GMT+3)" },
  { value: "Africa/Cairo", label: "القاهرة (GMT+2)" },
  { value: "Europe/Istanbul", label: "إسطنبول (GMT+3)" },
  { value: "Europe/London", label: "لندن (GMT+0)" },
  { value: "America/New_York", label: "نيويورك (GMT-5)" },
  { value: "UTC", label: "التوقيت العالمي (UTC)" },
]

const RETRY_ATTEMPT_OPTIONS = [
  { value: "0", label: "بدون إعادة محاولة" },
  { value: "1", label: "مرة واحدة" },
  { value: "2", label: "مرتان" },
  { value: "3", label: "3 مرات" },
  { value: "5", label: "5 مرات" },
]

function timezoneLabel(timezone: string) {
  return TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label ?? timezone
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
  const router = useRouter()
  const { getConnectionById, isLoading: isConnectionsLoading } = useConnectionsCenter()
  const record = getConnectionById(connectionId)
  const providerId = record ? resolveBackendProviderId(record.connectorDefinitionId) : null

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
        setLoadError(error instanceof Error ? error.message : "تعذر تحميل إعدادات الجدولة.")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [providerId, connectionId])

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
      toast.error("صيغة الجدولة المخصصة غير صحيحة -- يجب أن تتكون من 5 حقول.")
      return
    }

    if (form.frequencyMode === "preset" && form.activeDays.length === 0) {
      toast.error("اختر يومًا واحدًا على الأقل لأيام التشغيل.")
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
      toast.success("تم حفظ إعدادات الجدولة بنجاح.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ إعدادات الجدولة.")
    } finally {
      setIsSaving(false)
    }
  }

  const nextRunLabel = useMemo(() => {
    if (!schedule?.nextRunAt) return "-"
    return formatDateTime(schedule.nextRunAt)
  }, [schedule])

  if (isConnectionsLoading || (isLoading && !form)) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  if (!record || !providerId) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>لم يتم العثور على الاتصال</p>
        </div>
      </div>
    )
  }

  if (loadError || !form) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>
            {loadError ?? "تعذر تحميل إعدادات الجدولة."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5 pb-24")} dir="rtl">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className={cn("text-[12px]", MUTED)}>
          <Link href={ROUTES.integrations} className="hover:text-[#2878ff]">
            التكاملات
          </Link>
          <span className="mx-1.5">›</span>
          <span>{record.platformName}</span>
          <span className="mx-1.5">›</span>
          <span className={HEADING}>إعدادات الجدولة</span>
        </div>
        <Link
          href={ROUTES.integrationsDetails(connectionId)}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7b96] transition-colors hover:text-[#2878ff]"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
          العودة إلى تفاصيل التكامل
        </Link>
      </div>

      <div className={cn(PANEL, "mb-3.5 px-6 py-5")}>
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2878ff]/10 text-[#2878ff]">
            <Calendar className="size-5" />
          </div>
          <div>
            <h1 className={cn("text-[20px] font-extrabold leading-tight", HEADING)}>
              إعدادات الجدولة
            </h1>
            <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>
              تحكم في أوقات وتكرار مزامنة بيانات التكاملات
            </p>
          </div>
        </div>
      </div>

      <div className="mb-3.5 grid gap-3.5 sm:grid-cols-3">
        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#5b6b85]">
            <Clock className="size-4" />
          </div>
          <div className="min-w-0 text-right">
            <div className={cn("text-[11px]", MUTED)}>آخر مزامنة</div>
            <div className={cn("mt-0.5 text-[13px] font-bold", HEADING)}>
              {formatDateTime(schedule?.lastRunAt)}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)}>
              {schedule?.lastRunStatus === "completed"
                ? "تمت بنجاح"
                : schedule?.lastRunStatus === "failed"
                  ? "فشلت آخر محاولة"
                  : "لم تُنفَّذ بعد"}
            </div>
          </div>
        </div>

        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#5b6b85]">
            <Globe2 className="size-4" />
          </div>
          <div className="min-w-0 text-right">
            <div className={cn("text-[11px]", MUTED)}>المنطقة الزمنية</div>
            <div className={cn("mt-0.5 text-[13px] font-bold", HEADING)}>
              {timezoneLabel(form.timezone)}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)} dir="ltr">
              {form.timezone}
            </div>
          </div>
        </div>

        <div className={cn(PANEL, "flex items-center justify-between px-5 py-4")}>
          <div className="text-right">
            <div className={cn("text-[13px] font-bold", HEADING)}>
              {form.enabled ? "الجدولة مفعلة" : "الجدولة متوقفة"}
            </div>
            <div className={cn("mt-0.5 text-[10.5px]", MUTED)}>
              {form.enabled
                ? "يتم تنفيذ المزامنة تلقائيًا حسب الإعدادات"
                : "لن تعمل المزامنة تلقائيًا"}
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
          <h2 className={cn("text-[15px] font-bold", HEADING)}>جدول المزامنة</h2>
        </div>

        <div className="mb-3.5">
          <div className={cn("mb-2 text-[12px] font-semibold", MUTED)}>تكرار المزامنة</div>
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
              مخصص
            </button>
            {FREQUENCY_OPTIONS.map((option) => (
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
                placeholder="*/30 * * * *"
                className="h-10 rounded-[10px] border-[#e1e7f0] text-[12.5px]"
              />
              <p className={cn("mt-1 text-[10.5px]", MUTED)}>
                صيغة cron قياسية من 5 حقول (دقيقة، ساعة، يوم الشهر، الشهر، يوم الأسبوع)، بتوقيت
                المنطقة الزمنية المحددة أدناه.
              </p>
            </div>
          ) : null}
        </div>

        {form.frequencyMode === "preset" ? (
          <div className="mb-3.5">
            <div className={cn("mb-2 text-[12px] font-semibold", MUTED)}>أيام التشغيل</div>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => (
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
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>وقت البدء</div>
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
            <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>المنطقة الزمنية</div>
            <AppSearchableSelect
              value={form.timezone}
              options={TIMEZONE_OPTIONS}
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
          <h2 className={cn("text-[15px] font-bold", HEADING)}>المزامنة المتقدمة</h2>
        </div>

        <div className="divide-y divide-[#eef1f6]">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className={cn("text-[13px] font-semibold", HEADING)}>
                تشغيل المزامنة تلقائيًا عند فشل الاتصال
              </div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>
                في حال فشل الاتصال، سيتم إعادة محاولة المزامنة تلقائيًا
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
                إعادة المحاولة عند الفشل
              </div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>
                عدد مرات إعادة المحاولة في حال فشل المزامنة
              </div>
            </div>
            <AppSearchableSelect
              value={String(form.retryMaxAttempts)}
              options={RETRY_ATTEMPT_OPTIONS}
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
              <div className={cn("text-[13px] font-semibold", HEADING)}>إشعارات فشل المزامنة</div>
              <div className={cn("mt-0.5 text-[11px]", MUTED)}>إرسال إشعار عند فشل المزامنة</div>
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
          <h2 className={cn("text-[15px] font-bold", HEADING)}>المزامنة القادمة</h2>
        </div>
        <p className={cn("mb-3 text-[11px]", MUTED)}>
          موعد المزامنة القادمة وفقًا للإعدادات الحالية
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-4 py-3">
          <div>
            <div className={cn("text-[11px]", MUTED)}>الحالة</div>
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                form.enabled ? "bg-[#eff6ff] text-[#2563eb]" : "bg-[#f1f5f9] text-[#64748b]"
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {form.enabled ? "مجدولة" : "متوقفة"}
            </span>
          </div>
          <div className="text-right">
            <div className={cn("text-[11px]", MUTED)}>الوقت والتاريخ</div>
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
            {isSaving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </button>
          <button
            type="button"
            onClick={() => router.push(ROUTES.integrationsDetails(connectionId))}
            className="flex h-10 items-center justify-center rounded-[10px] border border-[#e1e7f0] bg-white px-6 text-[13px] font-semibold text-[#5b6b85] transition-colors hover:bg-[#f7f9fd]"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
