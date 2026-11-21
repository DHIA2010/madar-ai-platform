"use client"

// How the card looks, and what a card kept in a phone's wallet does: announce a new balance,
// show itself near the business's places, and carry a message from the business.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, LocateFixed, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { useLoad, useLoyaltyAccess, useLoyaltyError } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import type { LoyaltyLocation, LoyaltyProgram } from "../types/loyalty.types"
import { LoadFailed, Loading, LoyaltyCard, LoyaltyPage, ToggleRow } from "./shell"
import {
  CARD_COLORS,
  FIELD,
  FIELD_LABEL,
  HEADING,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_COLORS,
} from "./styles"

const MAX_PLACES = 10

function ColorPicker({
  label,
  value,
  onChange,
  swatches,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  swatches: string[]
}) {
  return (
    <div>
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            aria-pressed={value.toLowerCase() === swatch}
            className={cn(
              "size-9 rounded-full border border-[#d5dce8] transition",
              value.toLowerCase() === swatch ? "ring-2 ring-[#be185d] ring-offset-2" : ""
            )}
            style={{ backgroundColor: swatch }}
            onClick={() => onChange(swatch)}
          />
        ))}
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#e1e7f0] bg-white px-3 text-[12px] font-semibold text-[#52607a]">
          <input
            type="color"
            className="size-5 cursor-pointer border-0 bg-transparent p-0"
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span dir="ltr">{value}</span>
        </label>
      </div>
    </div>
  )
}

export function LoyaltyCardPage() {
  const t = useTranslations("loyalty.card")
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const loaded = useLoad(() => loyaltyService.program(), [])
  const [draft, setDraft] = useState<LoyaltyProgram | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (loaded.data) setDraft(loaded.data)
  }, [loaded.data])
  const set = <K extends keyof LoyaltyProgram>(key: K, value: LoyaltyProgram[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  const setPlace = (index: number, patch: Partial<LoyaltyLocation>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            locations: current.locations.map((place, at) =>
              at === index ? { ...place, ...patch } : place
            ),
          }
        : current
    )

  const save = async () => {
    if (!draft) return
    const places = draft.locations.filter(
      (place) =>
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude) &&
        !(place.latitude === 0 && place.longitude === 0)
    )
    setSaving(true)
    try {
      const saved = await loyaltyService.updateProgram({
        displayName: draft.displayName?.trim() || null,
        cardTitle: draft.cardTitle?.trim() || null,
        cardNote: draft.cardNote?.trim() || null,
        cardColor: draft.cardColor,
        textColor: draft.textColor,
        walletNotifyPoints: draft.walletNotifyPoints,
        nearbyEnabled: draft.nearbyEnabled,
        nearbyMessage: draft.nearbyMessage?.trim() || null,
        locations: places.map((place) => ({ ...place, name: place.name.trim() })),
      })
      setDraft(saved)
      toast.success(t("saved"))
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  const here = (index: number) => {
    if (!navigator.geolocation) {
      toast.error(t("locateFailed"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setPlace(index, {
          latitude: Math.round(position.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(position.coords.longitude * 1e6) / 1e6,
        }),
      () => toast.error(t("locateFailed")),
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  const send = async () => {
    setSending(true)
    try {
      const { sent } = await loyaltyService.sendWalletMessage(message.trim())
      toast.success(t("messageSent", { count: sent }))
      setMessage("")
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <LoyaltyPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && draft ? (
          <button type="button" className={PRIMARY_BUTTON} disabled={saving} onClick={save}>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-4">
            <section className={cn(PANEL, "p-5")}>
              <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("lookTitle")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("lookHint")}</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={FIELD_LABEL} htmlFor="card-name">
                    {t("businessName")}
                  </label>
                  <AppInput
                    id="card-name"
                    className={FIELD}
                    maxLength={80}
                    placeholder={loaded.data?.businessName}
                    value={draft.displayName ?? ""}
                    onChange={(event) => set("displayName", event.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor="card-title">
                    {t("cardTitle")}
                  </label>
                  <AppInput
                    id="card-title"
                    className={FIELD}
                    maxLength={40}
                    placeholder={t("cardTitlePlaceholder")}
                    value={draft.cardTitle ?? ""}
                    onChange={(event) => set("cardTitle", event.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={FIELD_LABEL} htmlFor="card-note">
                    {t("cardNote")}
                  </label>
                  <AppInput
                    id="card-note"
                    className={FIELD}
                    maxLength={120}
                    placeholder={t("cardNotePlaceholder")}
                    value={draft.cardNote ?? ""}
                    onChange={(event) => set("cardNote", event.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <ColorPicker
                    label={t("cardColor")}
                    value={draft.cardColor}
                    swatches={CARD_COLORS}
                    onChange={(next) => set("cardColor", next)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <ColorPicker
                    label={t("textColor")}
                    value={draft.textColor}
                    swatches={TEXT_COLORS}
                    onChange={(next) => set("textColor", next)}
                  />
                </div>
              </div>
            </section>

            <section className={cn(PANEL, "p-5")}>
              <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("walletTitle")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("walletHint")}</p>
              {draft.walletAvailable ? null : (
                <p className="mt-3 rounded-[12px] border border-[#fedf89] bg-[#fffaeb] px-3 py-2.5 text-[13px] leading-6 text-[#93370d]">
                  {t("walletUnavailable")}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-4">
                <ToggleRow
                  checked={draft.walletNotifyPoints}
                  onChange={(next) => set("walletNotifyPoints", next)}
                  title={t("notifyPoints")}
                  hint={t("notifyPointsHint")}
                />
                <ToggleRow
                  checked={draft.nearbyEnabled}
                  onChange={(next) => set("nearbyEnabled", next)}
                  title={t("nearby")}
                  hint={t("nearbyHint")}
                />
              </div>
              {draft.nearbyEnabled ? (
                <div className="mt-4 rounded-[14px] border border-[#eef1f6] p-4">
                  <label className={FIELD_LABEL} htmlFor="nearby-message">
                    {t("nearbyMessage")}
                  </label>
                  <AppInput
                    id="nearby-message"
                    className={FIELD}
                    maxLength={120}
                    placeholder={t("nearbyMessagePlaceholder")}
                    value={draft.nearbyMessage ?? ""}
                    onChange={(event) => set("nearbyMessage", event.target.value)}
                  />
                  <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("nearbyTokens")}</p>

                  <p className={cn("mt-4 text-[13px] font-bold", HEADING)}>{t("places")}</p>
                  <p className={cn("text-[12px] leading-5", MUTED)}>{t("placesHint")}</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {draft.locations.map((place, index) => (
                      <li
                        key={index}
                        className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
                      >
                        <AppInput
                          className={cn(FIELD, "col-span-2 sm:col-span-1")}
                          maxLength={80}
                          placeholder={t("placeName")}
                          aria-label={t("placeName")}
                          value={place.name}
                          onChange={(event) => setPlace(index, { name: event.target.value })}
                        />
                        <AppInput
                          dir="ltr"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className={FIELD}
                          placeholder={t("latitude")}
                          aria-label={t("latitude")}
                          value={place.latitude || ""}
                          onChange={(event) =>
                            setPlace(index, { latitude: Number(event.target.value) })
                          }
                        />
                        <AppInput
                          dir="ltr"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className={FIELD}
                          placeholder={t("longitude")}
                          aria-label={t("longitude")}
                          value={place.longitude || ""}
                          onChange={(event) =>
                            setPlace(index, { longitude: Number(event.target.value) })
                          }
                        />
                        <button
                          type="button"
                          className={cn(ICON_BUTTON, "size-11")}
                          aria-label={t("useHere")}
                          title={t("useHere")}
                          onClick={() => here(index)}
                        >
                          <LocateFixed className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={cn(ICON_BUTTON, "size-11 text-[#b42318]")}
                          aria-label={t("removePlace")}
                          title={t("removePlace")}
                          onClick={() =>
                            set(
                              "locations",
                              draft.locations.filter((_, at) => at !== index)
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {draft.locations.length < MAX_PLACES ? (
                    <button
                      type="button"
                      className={cn(SECONDARY_BUTTON, "mt-2")}
                      onClick={() =>
                        set("locations", [
                          ...draft.locations,
                          { name: "", latitude: 0, longitude: 0 },
                        ])
                      }
                    >
                      <Plus className="size-4" />
                      {t("addPlace")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className={cn(PANEL, "p-5")}>
              <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("messageTitle")}</h2>
              <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("messageHint")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <AppInput
                  className={cn(FIELD, "min-w-[220px] flex-1")}
                  maxLength={120}
                  placeholder={t("messagePlaceholder")}
                  aria-label={t("messageTitle")}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  disabled={sending || !message.trim() || !draft.walletAvailable}
                  onClick={() => void send()}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {t("messageSend")}
                </button>
              </div>
            </section>
          </fieldset>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className={cn(PANEL, "flex flex-col items-center gap-3 p-5")}>
              <p className={cn("self-start text-[13px] font-bold", HEADING)}>{t("preview")}</p>
              <LoyaltyCard
                look={{
                  businessName: draft.displayName?.trim() || loaded.data?.businessName || "",
                  cardColor: draft.cardColor,
                  textColor: draft.textColor,
                  cardTitle: draft.cardTitle?.trim() || null,
                  cardNote: draft.cardNote?.trim() || null,
                }}
                name={t("sampleName")}
                points={1250}
                code="1234567890"
              />
              <p className={cn("text-center text-[12px] leading-5", MUTED)}>{t("previewHint")}</p>
            </div>
          </aside>
        </div>
      )}
    </LoyaltyPage>
  )
}
