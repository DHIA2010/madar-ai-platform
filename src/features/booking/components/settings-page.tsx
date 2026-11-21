"use client"

// The business's public booking page (its address, what it says, whether it is open) and the
// rules every online booking follows.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Copy, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppInput, AppSwitch } from "@/components/app"

import { useBookingAccess, useBookingError, useLoad } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type { BookingSettings } from "../types/booking.types"
import { ImageField } from "./image-field"
import { ShareBox } from "./share-box"
import { BookingPage, Choice, LoadFailed, Loading } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  MUTED,
  PALETTE,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXTAREA,
} from "./styles"

const INTERVALS = [10, 15, 20, 30, 45, 60]
const LEAD_TIMES = [0, 30, 60, 120, 240, 720, 1440, 2880]
const DEADLINES = [0, 60, 120, 240, 720, 1440, 2880]

function Toggle({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  title: string
  hint: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-start gap-3">
      <AppSwitch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={title}
      />
      <span>
        <span className="block text-[13.5px] font-semibold text-[#0b1738]">{title}</span>
        <span className={cn("block text-[12.5px] leading-5", MUTED)}>{hint}</span>
      </span>
    </label>
  )
}

export function BookingSettingsPage() {
  const t = useTranslations("booking.settings")
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const loaded = useLoad(() => bookingService.settings(), [])
  const [draft, setDraft] = useState<BookingSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [feed, setFeed] = useState<string | null>(null)
  const [secretKey, setSecretKey] = useState("")
  const showFeed = (renew: boolean) => {
    void (renew ? bookingService.renewCalendarFeed() : bookingService.calendarFeed())
      .then(({ token }) => {
        setFeed(bookingService.calendarFeedUrl(token))
        if (renew) toast.success(t("auto.feedRenewed"))
      })
      .catch((error: unknown) => toast.error(errorText(error)))
  }

  useEffect(() => {
    if (loaded.data) setDraft(loaded.data)
  }, [loaded.data])

  const set = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  const slug = (draft?.slug ?? "").trim().toLowerCase()
  const slugOk = slug === "" || /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(slug)
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const savedLink =
    loaded.data?.slug && loaded.data.onlineEnabled
      ? `${origin}${ROUTES.publicBookingPage(loaded.data.slug)}`
      : null

  // How long before or after: "at any time", minutes, hours or days.
  const span = (minutes: number) =>
    minutes === 0
      ? t("spans.none")
      : minutes < 60
        ? t("spans.minutes", { count: minutes })
        : minutes < 1440
          ? t("spans.hours", { count: minutes / 60 })
          : t("spans.days", { count: minutes / 1440 })

  const save = async () => {
    if (!draft || !slugOk) return
    if (draft.onlineEnabled && !slug) {
      toast.error(t("page.slugNeeded"))
      return
    }
    const publishable = (draft.moyasarPublishableKey ?? "").trim()
    if (
      draft.paymentMode !== "off" &&
      (!publishable || !(draft.moyasarSecretSet || secretKey.trim()))
    ) {
      toast.error(t("pay.keysNeeded"))
      return
    }
    setSaving(true)
    try {
      // The secret key goes first and on its own: Moyasar is asked whether it is real.
      if (secretKey.trim()) {
        await bookingService.savePaymentKey(secretKey.trim())
        setSecretKey("")
      }
      const saved = await bookingService.updateSettings({
        ...draft,
        slug: slug || null,
        moyasarPublishableKey: publishable || null,
      })
      loaded.setData(saved)
      toast.success(t("saved"))
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && draft ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={saving || !slugOk}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("save")}
          </button>
        ) : null
      }
    >
      {loaded.failed ? (
        <LoadFailed onRetry={loaded.reload} />
      ) : draft === null ? (
        <Loading />
      ) : (
        <fieldset disabled={!canManage} className="grid gap-4 lg:grid-cols-2">
          <div className={cn(PANEL, "space-y-4 p-5 lg:col-span-2")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("look.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("look.hint")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <span className={FIELD_LABEL}>{t("look.cover")}</span>
                <ImageField
                  label={t("look.cover")}
                  value={draft.coverUrl}
                  onChange={(next) => set("coverUrl", next)}
                />
              </div>
              <div>
                <span className={FIELD_LABEL}>{t("look.logo")}</span>
                <ImageField
                  shape="square"
                  label={t("look.logo")}
                  value={draft.logoUrl}
                  onChange={(next) => set("logoUrl", next)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={FIELD_LABEL} htmlFor="booking-tagline">
                  {t("look.tagline")}
                </label>
                <AppInput
                  id="booking-tagline"
                  className={FIELD}
                  maxLength={140}
                  placeholder={t("look.taglinePlaceholder")}
                  value={draft.tagline ?? ""}
                  onChange={(event) => set("tagline", event.target.value || null)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-instagram">
                  {t("look.instagram")}
                </label>
                <AppInput
                  id="booking-instagram"
                  dir="ltr"
                  className={FIELD}
                  placeholder="https://instagram.com/..."
                  value={draft.instagramUrl ?? ""}
                  onChange={(event) => set("instagramUrl", event.target.value || null)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-map">
                  {t("look.map")}
                </label>
                <AppInput
                  id="booking-map"
                  dir="ltr"
                  className={FIELD}
                  placeholder="https://maps.app.goo.gl/..."
                  value={draft.mapUrl ?? ""}
                  onChange={(event) => set("mapUrl", event.target.value || null)}
                />
              </div>
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("look.color")}</span>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={(draft.accentColor ?? PALETTE[0]) === color}
                    onClick={() => set("accentColor", color)}
                    className={cn(
                      "size-9 rounded-full ring-offset-2 transition",
                      (draft.accentColor ?? PALETTE[0]) === color && "ring-2 ring-[#0b1738]"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#e1e7f0] bg-white px-3 text-[12px] font-semibold text-[#52607a]">
                  <input
                    type="color"
                    className="size-5 cursor-pointer border-0 bg-transparent p-0"
                    aria-label={t("look.color")}
                    value={draft.accentColor ?? PALETTE[0]}
                    onChange={(event) => set("accentColor", event.target.value)}
                  />
                  <span dir="ltr">{draft.accentColor ?? PALETTE[0]}</span>
                </label>
              </div>
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("look.gallery")}</span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("look.galleryHint")}</p>
              <div className="flex flex-wrap gap-3">
                {draft.gallery.map((picture, index) => (
                  <ImageField
                    key={`${index}:${picture}`}
                    shape="square"
                    label={t("look.gallery")}
                    value={picture}
                    onChange={(next) =>
                      set(
                        "gallery",
                        next
                          ? draft.gallery.map((entry, at) => (at === index ? next : entry))
                          : draft.gallery.filter((_, at) => at !== index)
                      )
                    }
                  />
                ))}
                {draft.gallery.length < 8 ? (
                  <ImageField
                    key={`new-${draft.gallery.length}`}
                    shape="square"
                    label={t("look.gallery")}
                    value={null}
                    onChange={(next) =>
                      next ? set("gallery", [...draft.gallery, next]) : undefined
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className={cn(PANEL, "space-y-4 p-5")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("page.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("page.hint")}</p>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="booking-slug">
                {t("page.slug")}
              </label>
              <div
                dir="ltr"
                className="flex h-11 items-center overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white focus-within:border-[#6d28d9] focus-within:ring-2 focus-within:ring-[#6d28d9]/15"
              >
                <span className="shrink-0 border-e border-[#e1e7f0] bg-[#f7f9fc] px-3 text-[12.5px] leading-[44px] text-[#667085]">
                  {origin.replace(/^https?:\/\//, "")}
                  {ROUTES.publicBookingPage("")}
                </span>
                <input
                  id="booking-slug"
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] text-[#0b1738] outline-none"
                  maxLength={60}
                  placeholder="my-salon"
                  spellCheck={false}
                  value={draft.slug ?? ""}
                  onChange={(event) => set("slug", event.target.value)}
                />
              </div>
              <p className={cn("mt-1 text-[12px] leading-5", slugOk ? MUTED : "text-[#b42318]")}>
                {t("page.slugHint")}
              </p>
            </div>
            <Toggle
              checked={draft.onlineEnabled}
              onChange={(next) => set("onlineEnabled", next)}
              title={t("page.open")}
              hint={t("page.openHint")}
            />
            {savedLink ? (
              <ShareBox link={savedLink} businessName={loaded.data?.displayName ?? null} />
            ) : null}
            <div>
              <label className={FIELD_LABEL} htmlFor="booking-display-name">
                {t("page.name")}
              </label>
              <AppInput
                id="booking-display-name"
                className={FIELD}
                maxLength={120}
                placeholder={t("page.namePlaceholder")}
                value={draft.displayName ?? ""}
                onChange={(event) => set("displayName", event.target.value || null)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="booking-description">
                {t("page.description")}
              </label>
              <textarea
                id="booking-description"
                rows={3}
                maxLength={600}
                className={TEXTAREA}
                value={draft.description ?? ""}
                onChange={(event) => set("description", event.target.value || null)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-phone-field">
                  {t("page.phone")}
                </label>
                <AppInput
                  id="booking-phone-field"
                  className={FIELD}
                  dir="ltr"
                  inputMode="tel"
                  maxLength={30}
                  value={draft.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value || null)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-address">
                  {t("page.address")}
                </label>
                <AppInput
                  id="booking-address"
                  className={FIELD}
                  maxLength={300}
                  value={draft.address ?? ""}
                  onChange={(event) => set("address", event.target.value || null)}
                />
              </div>
            </div>
          </div>

          <div className={cn(PANEL, "space-y-4 p-5")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("rules.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("rules.hint")}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className={FIELD_LABEL}>{t("rules.interval")}</span>
                <Choice
                  value={String(draft.slotIntervalMinutes)}
                  onChange={(next) => set("slotIntervalMinutes", Number(next))}
                  ariaLabel={t("rules.interval")}
                  options={[...new Set([...INTERVALS, draft.slotIntervalMinutes])]
                    .sort((a, b) => a - b)
                    .map((minutes) => ({ value: String(minutes), label: span(minutes) }))}
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("rules.intervalHint")}</p>
              </div>
              <div>
                <span className={FIELD_LABEL}>{t("rules.lead")}</span>
                <Choice
                  value={String(draft.leadTimeMinutes)}
                  onChange={(next) => set("leadTimeMinutes", Number(next))}
                  ariaLabel={t("rules.lead")}
                  options={[...new Set([...LEAD_TIMES, draft.leadTimeMinutes])]
                    .sort((a, b) => a - b)
                    .map((minutes) => ({ value: String(minutes), label: span(minutes) }))}
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("rules.leadHint")}</p>
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-advance">
                  {t("rules.advance")}
                </label>
                <AppInput
                  id="booking-advance"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  className={FIELD}
                  value={draft.advanceDays}
                  onChange={(event) =>
                    set(
                      "advanceDays",
                      Math.min(365, Math.max(1, Math.round(Number(event.target.value) || 1)))
                    )
                  }
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("rules.advanceHint")}</p>
              </div>
            </div>
            <Toggle
              checked={draft.autoConfirm}
              onChange={(next) => set("autoConfirm", next)}
              title={t("rules.autoConfirm")}
              hint={t("rules.autoConfirmHint")}
            />
            <Toggle
              checked={draft.cancellationAllowed}
              onChange={(next) => set("cancellationAllowed", next)}
              title={t("rules.cancel")}
              hint={t("rules.cancelHint")}
            />
            {draft.cancellationAllowed ? (
              <div className="max-w-[280px]">
                <span className={FIELD_LABEL}>{t("rules.deadline")}</span>
                <Choice
                  value={String(draft.cancellationDeadlineMinutes)}
                  onChange={(next) => set("cancellationDeadlineMinutes", Number(next))}
                  ariaLabel={t("rules.deadline")}
                  options={[...new Set([...DEADLINES, draft.cancellationDeadlineMinutes])]
                    .sort((a, b) => a - b)
                    .map((minutes) => ({ value: String(minutes), label: span(minutes) }))}
                />
              </div>
            ) : null}
          </div>
          <div className={cn(PANEL, "space-y-4 p-5")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("auto.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("auto.hint")}</p>
            </div>
            <Toggle
              checked={draft.whatsappConfirmation}
              onChange={(next) => set("whatsappConfirmation", next)}
              title={t("auto.confirmation")}
              hint={t("auto.confirmationHint")}
            />
            <Toggle
              checked={draft.whatsappReminder}
              onChange={(next) => set("whatsappReminder", next)}
              title={t("auto.reminder")}
              hint={t("auto.reminderHint")}
            />
            {draft.whatsappReminder ? (
              <div className="max-w-[280px]">
                <span className={FIELD_LABEL}>{t("auto.reminderBefore")}</span>
                <Choice
                  value={String(draft.reminderHoursBefore)}
                  onChange={(next) => set("reminderHoursBefore", Number(next))}
                  ariaLabel={t("auto.reminderBefore")}
                  options={[...new Set([2, 3, 6, 12, 24, 48, draft.reminderHoursBefore])]
                    .sort((a, b) => a - b)
                    .map((hours) => ({ value: String(hours), label: span(hours * 60) }))}
                />
              </div>
            ) : null}
            <p className="rounded-[12px] bg-[#fff7e6] px-3 py-2.5 text-[12.5px] leading-6 text-[#93370d]">
              {t("auto.whatsappNote")}
            </p>
            <Toggle
              checked={draft.invoiceOnCompletion}
              onChange={(next) => set("invoiceOnCompletion", next)}
              title={t("auto.invoice")}
              hint={t("auto.invoiceHint")}
            />
            <div>
              <p className="text-[13.5px] font-semibold text-[#0b1738]">{t("auto.feed")}</p>
              <p className={cn("text-[12.5px] leading-5", MUTED)}>{t("auto.feedHint")}</p>
              {feed ? (
                <div className="mt-2 rounded-[12px] bg-[#f7f9fc] p-3">
                  <p className="text-[12.5px] break-all text-[#0b1738]" dir="ltr">
                    {feed}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(feed)
                          .then(() => toast.success(t("page.copied")))
                      }}
                    >
                      <Copy className="size-4" />
                      {t("page.copy")}
                    </button>
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      onClick={() => showFeed(true)}
                    >
                      <RefreshCw className="size-4" />
                      {t("auto.feedRenew")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={cn(SECONDARY_BUTTON, "mt-2")}
                  onClick={() => showFeed(false)}
                >
                  {t("auto.feedShow")}
                </button>
              )}
            </div>
          </div>

          <div className={cn(PANEL, "space-y-4 p-5")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("loyalty.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("loyalty.hint")}</p>
            </div>
            <p className="rounded-[12px] bg-[#f7f9fc] px-3 py-2.5 text-[13px] leading-6 text-[#52607a]">
              {t("loyalty.moved")}{" "}
              <Link href={ROUTES.loyaltySettings} className="font-bold text-[#6d28d9] underline">
                {t("loyalty.open")}
              </Link>
            </p>
            <Toggle
              checked={draft.reviewsEnabled}
              onChange={(next) => set("reviewsEnabled", next)}
              title={t("loyalty.reviews")}
              hint={t("loyalty.reviewsHint")}
            />
          </div>
          <div className={cn(PANEL, "space-y-4 p-5 lg:col-span-2")}>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">{t("pay.title")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("pay.hint")}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className={FIELD_LABEL}>{t("pay.mode")}</span>
                <Choice
                  value={draft.paymentMode}
                  onChange={(next) => set("paymentMode", next as BookingSettings["paymentMode"])}
                  ariaLabel={t("pay.mode")}
                  options={[
                    { value: "off", label: t("pay.off"), hint: t("pay.offHint") },
                    { value: "deposit", label: t("pay.deposit"), hint: t("pay.depositHint") },
                    { value: "full", label: t("pay.full"), hint: t("pay.fullHint") },
                  ]}
                />
              </div>
              {draft.paymentMode === "deposit" ? (
                <div>
                  <label className={FIELD_LABEL} htmlFor="pay-percent">
                    {t("pay.percent")}
                  </label>
                  <AppInput
                    id="pay-percent"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    className={FIELD}
                    value={draft.depositPercent}
                    onChange={(event) =>
                      set(
                        "depositPercent",
                        Math.min(99, Math.max(1, Math.round(Number(event.target.value) || 1)))
                      )
                    }
                  />
                </div>
              ) : null}
              <div>
                <label className={FIELD_LABEL} htmlFor="pay-publishable">
                  {t("pay.publishable")}
                </label>
                <AppInput
                  id="pay-publishable"
                  className={FIELD}
                  dir="ltr"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="pk_live_..."
                  value={draft.moyasarPublishableKey ?? ""}
                  onChange={(event) => set("moyasarPublishableKey", event.target.value || null)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="pay-secret">
                  {t("pay.secret")}
                </label>
                <AppInput
                  id="pay-secret"
                  type="password"
                  className={FIELD}
                  dir="ltr"
                  spellCheck={false}
                  autoComplete="new-password"
                  placeholder={draft.moyasarSecretSet ? t("pay.secretSaved") : "sk_live_..."}
                  value={secretKey}
                  onChange={(event) => setSecretKey(event.target.value)}
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("pay.secretHint")}</p>
              </div>
            </div>
            <p className="rounded-[12px] bg-[#f5f3ff] px-3 py-2.5 text-[12.5px] leading-6 text-[#5b21b6]">
              {t("pay.note")}
            </p>
          </div>
        </fieldset>
      )}
    </BookingPage>
  )
}
