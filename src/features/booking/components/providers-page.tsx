"use client"

// The people who provide the services: what each one does, the hours they work on each day of
// the week (any number of periods a day), and the time they are off.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CalendarOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppConfirmDialog, AppDialog, AppInput, AppSwitch } from "@/components/app"

import {
  addDays,
  clockOf,
  dayOf,
  instantAt,
  minuteOfDay,
  minutesOfClock,
  today,
  useBookingAccess,
  useBookingError,
  useBookingFormat,
  useLoad,
} from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import {
  type BookingProvider,
  type BookingProviderInput,
  TIME_OFF_KINDS,
  type TimeOffKind,
  type WorkingPeriod,
} from "../types/booking.types"
import { BookingPage, Choice, DateField, Empty, LoadFailed, Loading, TimeField } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  ICON_BUTTON,
  MUTED,
  PALETTE,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "./styles"

const WEEK = [0, 1, 2, 3, 4, 5, 6]
// Sunday to Thursday, nine to five: the usual week, there to be changed.
const USUAL: WorkingPeriod[] = [0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}))
const BLANK: BookingProviderInput = {
  name: "",
  title: null,
  phone: null,
  color: PALETTE[1],
  isActive: true,
  commissionRate: 0,
  serviceIds: [],
  hours: USUAL,
}
const ALL = "all"

export function BookingProvidersPage() {
  const t = useTranslations("booking.providers")
  const kinds = useTranslations("booking.timeOffKinds")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const data = useLoad(
    () =>
      Promise.all([
        bookingService.providers(),
        bookingService.services(),
        bookingService.timeOff(),
      ]).then(([providers, services, timeOff]) => ({ providers, services, timeOff })),
    []
  )
  const [editing, setEditing] = useState<{ id: string | null; draft: BookingProviderInput } | null>(
    null
  )
  const [removing, setRemoving] = useState<BookingProvider | null>(null)
  const [busy, setBusy] = useState(false)
  const [off, setOff] = useState<{
    providerId: string
    kind: TimeOffKind
    from: string
    to: string
    fullDay: boolean
    start: string
    end: string
    note: string
  } | null>(null)

  const draft = editing?.draft
  const setDraft = (change: (draft: BookingProviderInput) => BookingProviderInput) =>
    setEditing((current) => (current ? { ...current, draft: change(current.draft) } : current))
  const periodsOf = (weekday: number) =>
    (draft?.hours ?? [])
      .map((period, index) => ({ period, index }))
      .filter((entry) => entry.period.weekday === weekday)
  const changePeriod = (index: number, patch: Partial<WorkingPeriod>) =>
    setDraft((current) => ({
      ...current,
      hours: current.hours.map((period, position) =>
        position === index ? { ...period, ...patch } : period
      ),
    }))

  const save = async () => {
    if (!editing || !editing.draft.name.trim()) return
    if (editing.draft.hours.some((period) => period.endMinute <= period.startMinute)) {
      toast.error(t("form.badPeriod"))
      return
    }
    setBusy(true)
    try {
      const input = { ...editing.draft, name: editing.draft.name.trim() }
      if (editing.id) await bookingService.updateProvider(editing.id, input)
      else await bookingService.createProvider(input)
      toast.success(t("saved"))
      setEditing(null)
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await bookingService.removeProvider(removing.id)
      toast.success(t("removed"))
      setRemoving(null)
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const saveOff = async () => {
    if (!off) return
    const startsAt = instantAt(off.from, off.fullDay ? "00:00" : off.start)
    // A whole day runs to the first minute of the next one.
    const endsAt = off.fullDay ? instantAt(addDays(off.to, 1), "00:00") : instantAt(off.to, off.end)
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error(t("off.badRange"))
      return
    }
    setBusy(true)
    try {
      await bookingService.createTimeOff({
        providerId: off.providerId === ALL ? null : off.providerId,
        startsAt,
        endsAt,
        kind: off.kind,
        note: off.note.trim() || null,
      })
      toast.success(t("off.saved"))
      setOff(null)
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  // "Sun-Thu 9:00 AM - 5:00 PM" for a provider's card: days that share the same periods together.
  const summary = (provider: BookingProvider) => {
    const groups = new Map<string, number[]>()
    for (const weekday of WEEK) {
      const key = provider.hours
        .filter((period) => period.weekday === weekday)
        .map((period) => `${format.clock(period.startMinute)} – ${format.clock(period.endMinute)}`)
        .join("، ")
      if (key) groups.set(key, [...(groups.get(key) ?? []), weekday])
    }
    return [...groups.entries()].map(
      ([hours, days]) =>
        `${days.map((entry) => format.weekday(entry, "short")).join("، ")}: ${hours}`
    )
  }

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={!data.data || data.data.providers.length === 0}
              onClick={() =>
                setOff({
                  providerId: ALL,
                  kind: "vacation",
                  from: today(),
                  to: today(),
                  fullDay: true,
                  start: "12:00",
                  end: "13:00",
                  note: "",
                })
              }
            >
              <CalendarOff className="size-4" />
              {t("off.add")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => setEditing({ id: null, draft: BLANK })}
            >
              <Plus className="size-4" />
              {t("add")}
            </button>
          </>
        ) : null
      }
    >
      {data.failed ? (
        <LoadFailed onRetry={data.reload} />
      ) : data.data === null ? (
        <Loading />
      ) : data.data.providers.length === 0 ? (
        <div className={PANEL}>
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.data.providers.map((provider) => {
              const names = data.data?.services
                .filter((service) => provider.serviceIds.includes(service.id))
                .map((service) => service.name)
              const lines = summary(provider)
              return (
                <article key={provider.id} className={cn(PANEL, "flex flex-col gap-3 p-4")}>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white"
                      style={{ backgroundColor: provider.color ?? "#6d28d9" }}
                    >
                      {provider.name.trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-extrabold text-[#0b1738]">
                        {provider.name}
                      </p>
                      <p className={cn("truncate text-[12.5px]", MUTED)}>
                        {provider.isActive ? (provider.title ?? t("noTitle")) : t("stopped")}
                      </p>
                    </div>
                    {canManage ? (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label={t("edit", { name: provider.name })}
                          onClick={() => {
                            setEditing({
                              id: provider.id,
                              draft: {
                                name: provider.name,
                                title: provider.title,
                                phone: provider.phone,
                                color: provider.color,
                                isActive: provider.isActive,
                                commissionRate: provider.commissionRate,
                                serviceIds: provider.serviceIds,
                                hours: provider.hours,
                              },
                            })
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={cn(ICON_BUTTON, "text-[#b42318]")}
                          aria-label={t("remove", { name: provider.name })}
                          onClick={() => setRemoving(provider)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#52607a]">{t("card.services")}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[13px] leading-6",
                        names?.length ? "text-[#0b1738]" : "text-[#b54708]"
                      )}
                    >
                      {names?.length ? names.join("، ") : t("card.noServices")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#52607a]">{t("card.hours")}</p>
                    {lines.length === 0 ? (
                      <p className="mt-0.5 text-[13px] text-[#b54708]">{t("card.noHours")}</p>
                    ) : (
                      lines.map((line) => (
                        <p key={line} className="mt-0.5 text-[13px] leading-6 text-[#0b1738]">
                          {line}
                        </p>
                      ))
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className={cn(PANEL, "p-5")}>
            <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("off.title")}</h2>
            <p className={cn("mt-0.5 text-[13px]", MUTED)}>{t("off.hint")}</p>
            {data.data.timeOff.length === 0 ? (
              <p className={cn("mt-4 text-[13px]", MUTED)}>{t("off.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#eef1f6]">
                {data.data.timeOff.map((entry) => {
                  const who =
                    data.data?.providers.find((provider) => provider.id === entry.providerId)
                      ?.name ?? t("off.everyone")
                  const lastDay = dayOf(new Date(new Date(entry.endsAt).getTime() - 1))
                  const firstDay = dayOf(entry.startsAt)
                  // Whole days run from one midnight to another.
                  const wholeDays =
                    minuteOfDay(entry.startsAt) === 0 && minuteOfDay(entry.endsAt) === 0
                  return (
                    <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold text-[#0b1738]">
                          {who} · {kinds(entry.kind)}
                        </p>
                        <p className={cn("text-[12.5px]", MUTED)}>
                          {firstDay !== lastDay
                            ? `${format.day(firstDay)} – ${format.day(lastDay)}`
                            : wholeDays
                              ? format.day(firstDay)
                              : `${format.day(firstDay)} · ${format.time(entry.startsAt)} – ${format.time(entry.endsAt)}`}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className={cn(ICON_BUTTON, "text-[#b42318]")}
                          aria-label={t("off.remove")}
                          title={t("off.remove")}
                          onClick={() => {
                            void bookingService
                              .removeTimeOff(entry.id)
                              .then(() => {
                                toast.success(t("off.removed"))
                                data.reload()
                              })
                              .catch((error: unknown) => toast.error(errorText(error)))
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <AppDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setEditing(null)
        }}
        title={editing?.id ? t("editTitle") : t("addTitle")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !draft?.name.trim()}
              onClick={() => void save()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL} htmlFor="provider-name">
                  {t("form.name")}
                </label>
                <AppInput
                  id="provider-name"
                  className={FIELD}
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="provider-title">
                  {t("form.title")}
                </label>
                <AppInput
                  id="provider-title"
                  className={FIELD}
                  maxLength={120}
                  placeholder={t("form.titlePlaceholder")}
                  value={draft.title ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value || null }))
                  }
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="provider-phone">
                  {t("form.phone")}
                </label>
                <AppInput
                  id="provider-phone"
                  className={FIELD}
                  dir="ltr"
                  inputMode="tel"
                  maxLength={30}
                  value={draft.phone ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value || null }))
                  }
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="provider-commission">
                  {t("form.commission")}
                </label>
                <AppInput
                  id="provider-commission"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  className={FIELD}
                  value={draft.commissionRate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      commissionRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>
                  {t("form.commissionHint")}
                </p>
              </div>
              <div>
                <span className={FIELD_LABEL}>{t("form.color")}</span>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={draft.color === color}
                      onClick={() => setDraft((current) => ({ ...current, color }))}
                      className={cn(
                        "size-9 rounded-full ring-offset-2 transition",
                        draft.color === color && "ring-2 ring-[#0b1738]"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className={FIELD_LABEL}>{t("form.services")}</span>
              {data.data?.services.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.data.services.map((service) => {
                    const on = draft.serviceIds.includes(service.id)
                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            serviceIds: on
                              ? current.serviceIds.filter((id) => id !== service.id)
                              : [...current.serviceIds, service.id],
                          }))
                        }
                        className={cn(
                          "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
                          on
                            ? "border-[#6d28d9] bg-[#f5f3ff] text-[#6d28d9]"
                            : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
                        )}
                      >
                        {service.name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-[#b54708]">{t("form.noServices")}</p>
              )}
            </div>

            <div>
              <span className={FIELD_LABEL}>{t("form.hours")}</span>
              <div className="divide-y divide-[#eef1f6] rounded-[12px] border border-[#e1e7f0]">
                {WEEK.map((weekday) => {
                  const periods = periodsOf(weekday)
                  return (
                    <div key={weekday} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                      <label className="flex w-[124px] shrink-0 items-center gap-2 pt-2 text-[13.5px] font-semibold text-[#0b1738]">
                        <AppSwitch
                          checked={periods.length > 0}
                          aria-label={format.weekday(weekday)}
                          onCheckedChange={(on) =>
                            setDraft((current) => ({
                              ...current,
                              hours: on
                                ? [...current.hours, { weekday, startMinute: 540, endMinute: 1020 }]
                                : current.hours.filter((period) => period.weekday !== weekday),
                            }))
                          }
                        />
                        {format.weekday(weekday)}
                      </label>
                      <div className="min-w-0 flex-1 space-y-2">
                        {periods.length === 0 ? (
                          <p className={cn("pt-2 text-[13px]", MUTED)}>{t("form.dayOff")}</p>
                        ) : (
                          periods.map(({ period, index }) => (
                            <div key={index} className="flex items-center gap-2">
                              <TimeField
                                className="w-[132px]"
                                ariaLabel={t("form.from")}
                                value={clockOf(period.startMinute)}
                                onChange={(next) =>
                                  changePeriod(index, { startMinute: minutesOfClock(next) })
                                }
                              />
                              <span className={MUTED}>–</span>
                              <TimeField
                                className="w-[132px]"
                                ariaLabel={t("form.to")}
                                allowEndOfDay
                                value={
                                  period.endMinute >= 24 * 60 ? "24:00" : clockOf(period.endMinute)
                                }
                                onChange={(next) =>
                                  changePeriod(index, { endMinute: minutesOfClock(next) })
                                }
                              />
                              {periods.length > 1 ? (
                                <button
                                  type="button"
                                  aria-label={t("form.removePeriod")}
                                  className="flex size-10 items-center justify-center rounded-[10px] text-[#b42318] hover:bg-[#fef3f2]"
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      hours: current.hours.filter(
                                        (_, position) => position !== index
                                      ),
                                    }))
                                  }
                                >
                                  <X className="size-4" />
                                </button>
                              ) : null}
                            </div>
                          ))
                        )}
                        {periods.length > 0 ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-[#6d28d9]"
                            onClick={() => {
                              const lastEnd = Math.max(
                                ...periods.map((entry) => entry.period.endMinute)
                              )
                              const start = Math.min(lastEnd + 60, 22 * 60)
                              setDraft((current) => ({
                                ...current,
                                hours: [
                                  ...current.hours,
                                  {
                                    weekday,
                                    startMinute: start,
                                    endMinute: Math.min(start + 120, 24 * 60),
                                  },
                                ],
                              }))
                            }}
                          >
                            {t("form.addPeriod")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <label className="flex items-start gap-3">
              <AppSwitch
                checked={draft.isActive}
                aria-label={t("form.active")}
                onCheckedChange={(on) => setDraft((current) => ({ ...current, isActive: on }))}
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-[#0b1738]">
                  {t("form.active")}
                </span>
                <span className={cn("block text-[12.5px] leading-5", MUTED)}>
                  {t("form.activeHint")}
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={off !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setOff(null)
        }}
        title={t("off.addTitle")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setOff(null)}
              disabled={busy}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy}
              onClick={() => void saveOff()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {off ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={FIELD_LABEL}>{t("off.who")}</span>
              <Choice
                value={off.providerId}
                onChange={(providerId) => setOff({ ...off, providerId })}
                ariaLabel={t("off.who")}
                options={[
                  { value: ALL, label: t("off.everyone") },
                  ...(data.data?.providers ?? []).map((provider) => ({
                    value: provider.id,
                    label: provider.name,
                  })),
                ]}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("off.kind")}</span>
              <Choice
                value={off.kind}
                onChange={(kind) => setOff({ ...off, kind: kind as TimeOffKind })}
                ariaLabel={t("off.kind")}
                options={TIME_OFF_KINDS.map((kind) => ({ value: kind, label: kinds(kind) }))}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("off.from")}</span>
              <DateField
                value={off.from}
                ariaLabel={t("off.from")}
                onChange={(from) => setOff({ ...off, from, to: from > off.to ? from : off.to })}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("off.to")}</span>
              <DateField
                value={off.to}
                ariaLabel={t("off.to")}
                onChange={(to) => setOff({ ...off, to, from: to < off.from ? to : off.from })}
              />
            </div>
            <label className="flex items-center gap-3 sm:col-span-2">
              <AppSwitch
                checked={off.fullDay}
                aria-label={t("off.fullDay")}
                onCheckedChange={(fullDay) => setOff({ ...off, fullDay })}
              />
              <span className="text-[13.5px] font-semibold text-[#0b1738]">{t("off.fullDay")}</span>
            </label>
            {off.fullDay ? null : (
              <div className="flex items-center gap-2 sm:col-span-2">
                <TimeField
                  className="w-[140px]"
                  ariaLabel={t("form.from")}
                  value={off.start}
                  onChange={(start) => setOff({ ...off, start })}
                />
                <span className={MUTED}>–</span>
                <TimeField
                  className="w-[140px]"
                  ariaLabel={t("form.to")}
                  value={off.end}
                  onChange={(end) => setOff({ ...off, end })}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="off-note">
                {t("off.note")}
              </label>
              <AppInput
                id="off-note"
                className={FIELD}
                maxLength={200}
                value={off.note}
                onChange={(event) => setOff({ ...off, note: event.target.value })}
              />
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null)
        }}
        title={removing ? t("removeTitle", { name: removing.name }) : ""}
        description={t("removeHint")}
        confirmLabel={t("confirmRemove")}
        cancelLabel={t("cancel")}
        confirmTone="destructive"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </BookingPage>
  )
}
