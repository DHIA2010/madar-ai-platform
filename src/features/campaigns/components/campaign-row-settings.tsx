"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Copy, Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/app-errors"
import { cn } from "@/lib/utils"

import {
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import {
  type CampaignControlChanges,
  type CampaignControlLevel,
  type CampaignControlSettings,
  type CampaignPerformanceRow,
  campaignPerformanceService,
} from "../services/campaign-performance.service"
import { CALLS_TO_ACTION } from "../services/campaign-publishing.service"
import { CampaignAudiencePicker } from "./campaign-audience-picker"
import { CampaignLocationPicker } from "./campaign-location-picker"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"
import { campaignStatusPill } from "./campaign-status-pill"

import { type Locale, localeDirection } from "@/i18n/locales"

// The settings of a campaign, an ad group or an ad from the campaigns list, in one window with
// three uses: looking at them, changing them, and making a copy (with its own name and whatever
// should differ). Changes and copies are sent to the ad platform at once (backend: campaigns/
// control-service.ts) -- today Snapchat; the other platforms can be looked at.

export type RowSettingsMode = "view" | "edit" | "clone"

const FIELD =
  "h-12 rounded-xl border-[#d5dce8] bg-white px-4 text-[14px] font-medium text-[#0b1738] placeholder:text-[#98a2b3]"
const LABEL = "mb-1.5 block text-[13px] font-bold text-[#0b1738]"
const HINT = "mt-1.5 text-[12px] leading-5 text-[#6b7b96]"
const PRIMARY =
  "inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-[#1d4fd8] px-6 text-[14px] font-extrabold text-white hover:bg-[#1a45bd] disabled:opacity-60"
const SECONDARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#d5dce8] px-5 text-[14px] font-bold text-[#0b1738] hover:bg-[#f7f9fd] disabled:opacity-60"
const NOTE =
  "rounded-xl border border-[#fedf89] bg-[#fffcf5] px-4 py-3 text-[12.5px] font-semibold leading-6 text-[#93370d]"

// Snapchat's own limits (the same numbers the server holds).
const MIN_DAILY_BUDGET = 20
const HEADLINE_MAX = 34
const BRAND_NAME_MAX = 25
const MIN_AGE = 13
const MIN_AGE_TOP = 45
const MAX_AGE_TOP = 49

// A moment as its day in Riyadh (YYYY-MM-DD), which is what the date box holds.
function riyadhDay(instant: string | null): string {
  if (!instant) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(instant))
}

interface Draft {
  name: string
  dailyBudget: string
  endDate: string
  minAge: string
  maxAge: string
  gender: "all" | "male" | "female"
  headline: string
  brandName: string
  callToAction: string
  url: string
  regionIds: string[]
  cityKeys: string[]
  languages: string[]
  interestIds: string[]
}

function draftOf(settings: CampaignControlSettings, name: string): Draft {
  return {
    name,
    dailyBudget: settings.dailyBudget ? String(settings.dailyBudget) : "",
    endDate: riyadhDay(settings.endAt),
    minAge: settings.minAge ? String(settings.minAge) : "",
    maxAge: settings.maxAge ? String(settings.maxAge) : "",
    gender: settings.gender ?? "all",
    headline: settings.headline ?? "",
    brandName: settings.brandName ?? "",
    callToAction: settings.callToAction ?? "",
    url: settings.url ?? "",
    regionIds: settings.regions.map((region) => region.id),
    cityKeys: settings.cities.map((city) => city.key),
    languages: settings.languages.map((language) => language.id),
    interestIds: settings.interests.map((interest) => interest.id),
  }
}

// Only what differs from the settings as loaded, so nothing untouched is sent to the platform.
function changesOf(
  level: CampaignControlLevel,
  mode: "edit" | "clone",
  settings: CampaignControlSettings,
  draft: Draft
): CampaignControlChanges {
  const start = draftOf(settings, settings.name)
  const changes: CampaignControlChanges = {}
  if (draft.name.trim() !== settings.name) changes.name = draft.name.trim()
  if (level !== "ad" && mode === "edit" && draft.endDate !== start.endDate) {
    changes.endDate = draft.endDate || null
  }
  if (level === "adGroup") {
    if (draft.dailyBudget !== start.dailyBudget) changes.dailyBudget = Number(draft.dailyBudget)
    if (draft.minAge !== start.minAge && draft.minAge) changes.minAge = Number(draft.minAge)
    if (draft.maxAge !== start.maxAge) changes.maxAge = draft.maxAge ? Number(draft.maxAge) : null
    if (draft.gender !== start.gender) changes.gender = draft.gender
    const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()
    if (!same(draft.regionIds, start.regionIds) || !same(draft.cityKeys, start.cityKeys)) {
      changes.regionIds = draft.regionIds
      changes.cityKeys = draft.cityKeys
    }
    if (!same(draft.languages, start.languages)) changes.languages = draft.languages
    if (!same(draft.interestIds, start.interestIds)) changes.interestIds = draft.interestIds
  }
  if (level === "ad") {
    if (draft.headline.trim() !== start.headline) changes.headline = draft.headline.trim()
    if (draft.brandName.trim() !== start.brandName) changes.brandName = draft.brandName.trim()
    if (draft.callToAction !== start.callToAction) changes.callToAction = draft.callToAction
    if (draft.url.trim() !== start.url) changes.url = draft.url.trim()
  }
  return changes
}

export function CampaignRowSettingsDialog({
  row,
  mode,
  onModeChange,
  onClose,
  onEdited,
  onCloned,
}: {
  row: CampaignPerformanceRow | null
  mode: RowSettingsMode
  onModeChange: (mode: RowSettingsMode) => void
  onClose: () => void
  onEdited: (row: CampaignPerformanceRow, settings: CampaignControlSettings) => void
  onCloned: (row: CampaignPerformanceRow) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.manage")
  const level = row ? (row.level as CampaignControlLevel) : "campaign"
  return (
    <AppDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={row ? t(`titles.${mode}.${level}`, { name: row.name }) : undefined}
      contentClassName="max-w-[36rem]"
    >
      {row ? (
        // Keyed by the row, so each one opens on its own settings.
        <SettingsBody
          key={row.id}
          row={row}
          level={level}
          mode={mode}
          onModeChange={onModeChange}
          onClose={onClose}
          onEdited={onEdited}
          onCloned={onCloned}
        />
      ) : null}
    </AppDialog>
  )
}

function SettingsBody({
  row,
  level,
  mode,
  onModeChange,
  onClose,
  onEdited,
  onCloned,
}: {
  row: CampaignPerformanceRow
  level: CampaignControlLevel
  mode: RowSettingsMode
  onModeChange: (mode: RowSettingsMode) => void
  onClose: () => void
  onEdited: (row: CampaignPerformanceRow, settings: CampaignControlSettings) => void
  onCloned: (row: CampaignPerformanceRow) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.manage")
  const c = useTranslations("campaigns")
  const p = useTranslations("campaigns.publish")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [settings, setSettings] = useState<CampaignControlSettings | "error" | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    campaignPerformanceService
      .getSettings(row.id, level)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded)
      })
      .catch(() => {
        if (!cancelled) setSettings("error")
      })
    return () => {
      cancelled = true
    }
  }, [row.id, level])

  // Each use starts from the settings as they are; a copy gets a name of its own to begin with.
  useEffect(() => {
    if (!settings || settings === "error") return
    setError(null)
    setDraft(
      draftOf(settings, mode === "clone" ? t("copyName", { name: settings.name }) : settings.name)
    )
  }, [settings, mode, t])

  if (settings === null) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-[#98a2b3]" />
      </div>
    )
  }
  if (settings === "error") {
    return <p className="py-8 text-center text-[13px] text-[#b42318]">{t("loadFailed")}</p>
  }

  const currency = row.currency ?? "SAR"
  const currencyLabel = currency === "SAR" && locale === "ar" ? "ر.س" : currency
  const day = (instant: string | null) =>
    instant
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
          timeZone: "Asia/Riyadh",
          dateStyle: "medium",
        }).format(new Date(instant))
      : null
  const ages =
    settings.minAge === null
      ? null
      : settings.maxAge
        ? t("values.ageRange", { from: settings.minAge, to: settings.maxAge })
        : t("values.ageFrom", { from: settings.minAge })
  const callToActionLabel = (value: string | null) =>
    value && (CALLS_TO_ACTION as readonly string[]).includes(value)
      ? p(`callsToAction.${value}` as "callsToAction.MORE")
      : value

  // The platform's own code words in plain words, where Madar knows them.
  const worded = (group: "goals" | "objectives", code: string | null) =>
    code && t.has(`${group}.${code}` as "goals.SWIPES")
      ? t(`${group}.${code}` as "goals.SWIPES")
      : code
  const regions = new Intl.DisplayNames([locale], { type: "region" })
  const country = (code: string) => {
    try {
      return regions.of(code) ?? code
    } catch {
      return code
    }
  }

  if (mode === "view") {
    const pill = campaignStatusPill(settings.status, c)
    const lines: Array<[string, React.ReactNode]> = [
      [t("fields.name"), settings.name],
      [
        t("fields.status"),
        <span
          key="status"
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
            pill.className
          )}
        >
          {pill.label}
        </span>,
      ],
      [t("fields.objective"), worded("objectives", settings.objective)],
      [t("fields.goal"), worded("goals", settings.goal)],
      [
        t("fields.dailyBudget"),
        settings.dailyBudget ? `${settings.dailyBudget} ${currencyLabel}` : null,
      ],
      [t("fields.start"), day(settings.startAt)],
      [
        t("fields.end"),
        level === "ad" ? null : (day(settings.endAt) ?? (settings.live ? t("values.noEnd") : null)),
      ],
      [
        t("fields.countries"),
        settings.countries.length ? settings.countries.map(country).join("، ") : null,
      ],
      [
        t("fields.regions"),
        settings.regions.length
          ? settings.regions
              .map((region) => (locale === "ar" ? region.nameAr : null) ?? region.name)
              .join("، ")
          : null,
      ],
      [
        t("fields.cities"),
        settings.cities.length
          ? settings.cities.map((city) => (locale === "ar" ? city.nameAr : city.name)).join("، ")
          : null,
      ],
      [
        t("fields.languages"),
        settings.languages.length
          ? settings.languages
              .map((entry) => (locale === "ar" ? entry.nameAr : null) ?? entry.name)
              .join("، ")
          : null,
      ],
      [
        t("fields.interests"),
        settings.interests.length
          ? settings.interests
              .map((entry) => (locale === "ar" ? entry.nameAr : null) ?? entry.name)
              .join("، ")
          : null,
      ],
      [t("fields.ages"), ages],
      [t("fields.gender"), settings.gender ? p(`audience.genders.${settings.gender}`) : null],
      [t("fields.brandName"), settings.brandName],
      [t("fields.headline"), settings.headline],
      [t("fields.text"), settings.text],
      [t("fields.callToAction"), callToActionLabel(settings.callToAction)],
      [
        t("fields.url"),
        settings.url ? (
          <span key="url" dir="ltr" className="break-all text-start text-[#1d4fd8]">
            {settings.url}
          </span>
        ) : null,
      ],
    ]
    return (
      <div className="space-y-4" dir={dir}>
        <dl className="divide-y divide-[#eef1f6] rounded-xl border border-[#e1e7f0]">
          {lines
            .filter(([, value]) => value !== null && value !== "")
            .map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="shrink-0 text-[12.5px] font-semibold text-[#6b7b96]">{label}</dt>
                <dd className="min-w-0 text-end text-[13px] font-bold text-[#0b1738]">{value}</dd>
              </div>
            ))}
        </dl>
        <p className={HINT}>
          {t(settings.live ? "source.live" : "source.synced", {
            platform: c(`publish.platforms.${settings.platform}` as "publish.platforms.snapchat"),
          })}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#eef1f6] pt-4">
          <button type="button" onClick={onClose} className={SECONDARY}>
            {t("close")}
          </button>
          {settings.canClone ? (
            <button type="button" onClick={() => onModeChange("clone")} className={SECONDARY}>
              <Copy className="size-4" />
              {t("actions.clone")}
            </button>
          ) : null}
          {settings.canEdit ? (
            <button type="button" onClick={() => onModeChange("edit")} className={PRIMARY}>
              <Pencil className="size-4" />
              {t("actions.edit")}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!draft) return null
  const allowed = mode === "edit" ? settings.canEdit : settings.canClone
  if (!allowed) {
    return (
      <div className="space-y-4" dir={dir}>
        <p className={NOTE}>{t("notAvailable")}</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={SECONDARY}>
            {t("close")}
          </button>
        </div>
      </div>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  const changes = changesOf(level, mode, settings, draft)

  const problem = (): string | null => {
    if (draft.name.trim().length < 2) return t("problems.name")
    if (level === "adGroup") {
      if (!(Number(draft.dailyBudget) >= MIN_DAILY_BUDGET)) {
        return t("problems.budget", { minimum: MIN_DAILY_BUDGET, currency: currencyLabel })
      }
      const from = Number(draft.minAge)
      const to = draft.maxAge ? Number(draft.maxAge) : null
      if (!(from >= MIN_AGE && from <= MIN_AGE_TOP)) {
        return t("problems.minAge", { from: MIN_AGE, to: MIN_AGE_TOP })
      }
      if (to !== null && (to <= from || to > MAX_AGE_TOP)) {
        return t("problems.maxAge", { top: MAX_AGE_TOP })
      }
    }
    if (level === "ad") {
      if (!draft.headline.trim() || !draft.brandName.trim()) return t("problems.adText")
      if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(draft.url.trim())) {
        return t("problems.url")
      }
    }
    return null
  }

  const submit = async () => {
    const found = problem()
    if (found) {
      setError(found)
      return
    }
    if (mode === "edit" && Object.keys(changes).length === 0) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (mode === "edit") {
        const saved = await campaignPerformanceService.edit(row.id, level, changes)
        toast.success(t("saved"))
        onEdited(row, saved)
      } else {
        await campaignPerformanceService.clone(row.id, level, {
          ...changes,
          name: draft.name.trim(),
        })
        toast.success(t("cloned"))
        onCloned(row)
      }
      onClose()
    } catch (caught) {
      const fallback = t(mode === "edit" ? "saveFailed" : "cloneFailed")
      setError(
        caught instanceof AppError && caught.status === 422 && caught.message
          ? `${fallback} ${caught.message}`
          : fallback
      )
    } finally {
      setBusy(false)
    }
  }

  // Changing who sees an ad group, or what an ad says, sends its ads back to Snapchat's review.
  const reviewAgain =
    mode === "edit" &&
    (changes.minAge !== undefined ||
      changes.maxAge !== undefined ||
      changes.gender !== undefined ||
      changes.headline !== undefined ||
      changes.brandName !== undefined ||
      changes.callToAction !== undefined ||
      changes.url !== undefined ||
      changes.regionIds !== undefined ||
      changes.languages !== undefined ||
      changes.interestIds !== undefined)

  return (
    <div className="space-y-5" dir={dir}>
      {mode === "clone" ? <p className={HINT}>{t(`cloneHints.${level}`)}</p> : null}

      <div>
        <label className={LABEL}>{t("fields.name")}</label>
        <AppInput
          className={FIELD}
          maxLength={120}
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
        />
      </div>

      {level === "adGroup" ? (
        <>
          <div>
            <label className={LABEL}>{t("fields.dailyBudget")}</label>
            <div className="relative">
              <AppInput
                className={cn(FIELD, "pe-16")}
                type="number"
                inputMode="decimal"
                min={MIN_DAILY_BUDGET}
                value={draft.dailyBudget}
                onChange={(event) => set("dailyBudget", event.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-[13px] font-bold text-[#6b7b96]">
                {currencyLabel}
              </span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL}>{p("audience.minAge")}</label>
              <AppInput
                className={FIELD}
                type="number"
                inputMode="numeric"
                min={MIN_AGE}
                max={MIN_AGE_TOP}
                value={draft.minAge}
                onChange={(event) => set("minAge", event.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("fields.maxAge")}</label>
              <AppInput
                className={FIELD}
                type="number"
                inputMode="numeric"
                max={MAX_AGE_TOP}
                placeholder={t("values.noMaxAge")}
                value={draft.maxAge}
                onChange={(event) => set("maxAge", event.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>{t("fields.gender")}</label>
              <AppSelect
                value={draft.gender}
                onValueChange={(value) => set("gender", value as Draft["gender"])}
                dir={dir}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  {(["all", "male", "female"] as const).map((value) => (
                    <AppSelectItem
                      key={value}
                      value={value}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {p(`audience.genders.${value}`)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
          <p className={HINT}>{t("ageHint", { top: MAX_AGE_TOP })}</p>
          {settings.countries.length === 1 ? (
            <div>
              <label className={LABEL}>{p("places.label")}</label>
              <CampaignLocationPicker
                // The row's id carries its connection: "<source>:<connection>:<account>:<id>".
                connectionId={row.id.split(":")[1] ?? ""}
                countryCode={settings.countries[0].toLowerCase()}
                value={{ regionIds: draft.regionIds, cityKeys: draft.cityKeys }}
                onChange={(places) =>
                  setDraft((current) => (current ? { ...current, ...places } : current))
                }
              />
            </div>
          ) : null}
          {settings.countries.length === 1 ? (
            <CampaignAudiencePicker
              connectionId={row.id.split(":")[1] ?? ""}
              countryCode={settings.countries[0].toLowerCase()}
              value={{ languages: draft.languages, interestIds: draft.interestIds }}
              onChange={(audience) =>
                setDraft((current) => (current ? { ...current, ...audience } : current))
              }
            />
          ) : null}
        </>
      ) : null}

      {level !== "ad" && mode === "edit" ? (
        <div>
          <label className={LABEL}>{p("audience.endDate")}</label>
          <AppInput
            className={cn(FIELD, "text-start")}
            type="date"
            dir="ltr"
            value={draft.endDate}
            onChange={(event) => set("endDate", event.target.value)}
          />
          <p className={HINT}>{p("audience.endDateHint")}</p>
        </div>
      ) : null}

      {level === "ad" ? (
        <>
          <div>
            <label className={LABEL}>{t("fields.brandName")}</label>
            <AppInput
              className={FIELD}
              maxLength={BRAND_NAME_MAX}
              value={draft.brandName}
              onChange={(event) => set("brandName", event.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>{t("fields.headline")}</label>
            <AppInput
              className={FIELD}
              maxLength={HEADLINE_MAX}
              value={draft.headline}
              onChange={(event) => set("headline", event.target.value)}
            />
          </div>
          {draft.callToAction ? (
            <div>
              <label className={LABEL}>{t("fields.callToAction")}</label>
              <AppSelect
                value={draft.callToAction}
                onValueChange={(value) => set("callToAction", value)}
                dir={dir}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  {[...new Set([draft.callToAction, ...CALLS_TO_ACTION])].map((value) => (
                    <AppSelectItem
                      key={value}
                      value={value}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {callToActionLabel(value)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          ) : null}
          <div>
            <label className={LABEL}>{t("fields.url")}</label>
            <AppInput
              className={cn(FIELD, "text-start")}
              dir="ltr"
              inputMode="url"
              value={draft.url}
              onChange={(event) => set("url", event.target.value)}
            />
            <p className={HINT}>{t("urlHint")}</p>
          </div>
        </>
      ) : null}

      {reviewAgain ? <p className={NOTE}>{t("reviewAgain")}</p> : null}
      {error ? (
        <p className="rounded-xl border border-[#fecdca] bg-[#fffbfa] px-4 py-3 text-[13px] font-semibold leading-6 text-[#b42318]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-[#eef1f6] pt-4">
        <button type="button" disabled={busy} onClick={onClose} className={SECONDARY}>
          {t("cancel")}
        </button>
        <button type="button" disabled={busy} onClick={() => void submit()} className={PRIMARY}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy
            ? t(mode === "edit" ? "saving" : "cloning")
            : t(mode === "edit" ? "save" : "makeCopy")}
        </button>
      </div>
    </div>
  )
}
