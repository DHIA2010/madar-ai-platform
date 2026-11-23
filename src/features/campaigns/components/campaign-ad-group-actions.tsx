"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react"
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
  type CampaignPerformanceRow,
  campaignPerformanceService,
} from "../services/campaign-performance.service"
import {
  type AnyCallToAction,
  callsToActionFor,
  campaignPublishingService,
  type Creative,
  creativeProblemFor,
  type PublishPlatform,
} from "../services/campaign-publishing.service"
import { CREATIVE_ACCEPT, CreativeThumb, useCreativeUploader } from "./campaign-creative-shared"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// What can be done to an ad group that is already running, straight from the campaigns list:
// add a new ad to it (a creative with its text; on Google a search ad's text), and change its
// daily budget. Each is sent to the ad platform at once (backend: campaigns/control-service.ts).

const FIELD =
  "h-12 rounded-xl border-[#d5dce8] bg-white px-4 text-[14px] font-medium text-[#0b1738] placeholder:text-[#98a2b3]"
const LABEL = "mb-1.5 block text-[13px] font-bold text-[#0b1738]"
const HINT = "mt-1.5 text-[12px] leading-5 text-[#6b7b96]"
const PRIMARY =
  "inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-[#1d4fd8] px-6 text-[14px] font-extrabold text-white hover:bg-[#1a45bd] disabled:opacity-60"
const SECONDARY =
  "h-12 rounded-xl border border-[#d5dce8] px-5 text-[14px] font-bold text-[#0b1738] hover:bg-[#f7f9fd]"

// Google's own limits for a search ad, and each platform's floor for a day's budget (the same
// numbers the server holds).
const MAX_HEADLINES = 15
const MAX_DESCRIPTIONS = 4
const MIN_DAILY_BUDGET: Record<Exclude<PublishPlatform, "google">, number> = {
  snapchat: 20,
  tiktok: 75,
  meta: 20,
}

const SOURCE_PLATFORM: Record<string, PublishPlatform> = {
  snapchat_ads: "snapchat",
  tiktok_ads: "tiktok",
  meta_ads: "meta",
  google_ads: "google",
}

// The ad platform a row of the campaigns list belongs to (its id starts with its source).
export function campaignRowPublishPlatform(
  row: Pick<CampaignPerformanceRow, "id">
): PublishPlatform | null {
  return SOURCE_PLATFORM[row.id.split(":")[0]] ?? null
}

// Whether an ad group's daily budget can be changed from Madar: on Google the budget sits on
// the campaign, not the ad group.
export function canChangeAdGroupBudget(row: Pick<CampaignPerformanceRow, "id">): boolean {
  const platform = campaignRowPublishPlatform(row)
  return platform !== null && platform !== "google"
}

// The platform's own reason when it refused, else the screen's own words.
function refusalText(error: unknown, fallback: string): string {
  if (error instanceof AppError && error.status === 422 && error.message) {
    return `${fallback} ${error.message}`
  }
  return fallback
}

export function AdGroupAddAdDialog({
  row,
  onClose,
  onAdded,
}: {
  row: CampaignPerformanceRow | null
  onClose: () => void
  onAdded: (row: CampaignPerformanceRow) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.addAd")
  const platform = row ? campaignRowPublishPlatform(row) : null
  return (
    <AppDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={row ? t("title", { name: row.name }) : undefined}
      contentClassName="max-w-[40rem]"
    >
      {row && platform ? (
        // Keyed by the ad group, so each one opens with an empty form.
        <AddAdForm key={row.id} row={row} platform={platform} onClose={onClose} onAdded={onAdded} />
      ) : null}
    </AppDialog>
  )
}

function AddAdForm({
  row,
  platform,
  onClose,
  onAdded,
}: {
  row: CampaignPerformanceRow
  platform: PublishPlatform
  onClose: () => void
  onAdded: (row: CampaignPerformanceRow) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.addAd")
  const p = useTranslations("campaigns.publish")
  const locale = useLocale() as Locale
  const fileInput = useRef<HTMLInputElement>(null)
  const isGoogle = platform === "google"
  const shown = platform === "google" ? "snapchat" : platform

  const [creatives, setCreatives] = useState<Creative[] | null>(isGoogle ? [] : null)
  const [name, setName] = useState("")
  const [creativeId, setCreativeId] = useState("")
  const [brandName, setBrandName] = useState("")
  const [headline, setHeadline] = useState("")
  const [text, setText] = useState("")
  const [callToAction, setCallToAction] = useState<AnyCallToAction>(
    platform === "snapchat" ? "MORE" : "LEARN_MORE"
  )
  const [url, setUrl] = useState("")
  const [headlines, setHeadlines] = useState(["", "", ""])
  const [descriptions, setDescriptions] = useState(["", ""])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isGoogle) return
    let cancelled = false
    campaignPublishingService
      .listCreatives()
      .then((items) => {
        if (!cancelled) setCreatives(items)
      })
      .catch(() => {
        if (!cancelled) setCreatives([])
      })
    return () => {
      cancelled = true
    }
  }, [isGoogle])

  const { upload, progress } = useCreativeUploader(
    useCallback(
      (creative: Creative) => {
        setCreatives((current) => [creative, ...(current ?? [])])
        if (!creativeProblemFor(shown, creative)) setCreativeId(creative.id)
      },
      [shown]
    )
  )

  const headlineMax = platform === "tiktok" ? 100 : platform === "meta" ? 40 : 34
  const filled = (list: string[]) => list.map((entry) => entry.trim()).filter(Boolean)
  const complete =
    name.trim().length >= 2 &&
    /^https:\/\/[^\s.]+\.[^\s]+$/i.test(url.trim()) &&
    (isGoogle
      ? filled(headlines).length >= 3 && filled(descriptions).length >= 2
      : Boolean(creativeId) &&
        Boolean(headline.trim()) &&
        (platform === "meta" ? Boolean(text.trim()) : Boolean(brandName.trim())))

  const submit = async () => {
    if (!complete) {
      setError(t("incomplete"))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await campaignPerformanceService.addAd(
        row.id,
        isGoogle
          ? {
              name: name.trim(),
              url: url.trim(),
              headlines: filled(headlines),
              descriptions: filled(descriptions),
            }
          : {
              name: name.trim(),
              url: url.trim(),
              creativeId,
              headline: headline.trim(),
              callToAction,
              ...(platform === "meta" ? { text: text.trim() } : { brandName: brandName.trim() }),
            }
      )
      toast.success(t("added"))
      onAdded(row)
      onClose()
    } catch (caught) {
      setError(refusalText(caught, t("failed")))
    } finally {
      setBusy(false)
    }
  }

  // A list of short text boxes that grows with a button: Google's headlines and descriptions.
  const textList = (
    values: string[],
    change: (next: string[]) => void,
    options: {
      minimum: number
      maximum: number
      maxLength: number
      placeholder: string
      add: string
    }
  ) => (
    <div className="space-y-2.5">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <AppInput
            className={FIELD}
            maxLength={options.maxLength}
            placeholder={p(options.placeholder as "ad.headlineNumber", { number: index + 1 })}
            value={value}
            onChange={(event) =>
              change(values.map((entry, at) => (at === index ? event.target.value : entry)))
            }
          />
          {values.length > options.minimum ? (
            <button
              type="button"
              aria-label={p("ad.removeLine")}
              title={p("ad.removeLine")}
              onClick={() => change(values.filter((_, at) => at !== index))}
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[#b42318] hover:bg-[#fef3f2]"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      {values.length < options.maximum ? (
        <button
          type="button"
          onClick={() => change([...values, ""])}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-dashed border-[#cfd8e6] px-4 text-[13px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60"
        >
          <Plus className="size-4" />
          {p(options.add as "ad.addHeadline")}
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-5" dir={localeDirection(locale)}>
      <div>
        <label className={LABEL}>{t("name")}</label>
        <AppInput
          className={FIELD}
          maxLength={120}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      {isGoogle ? (
        <>
          <div>
            <label className={LABEL}>{p("ad.headlines")}</label>
            {textList(headlines, setHeadlines, {
              minimum: 3,
              maximum: MAX_HEADLINES,
              maxLength: 30,
              placeholder: "ad.headlineNumber",
              add: "ad.addHeadline",
            })}
            <p className={HINT}>{p("ad.headlinesHint")}</p>
          </div>
          <div>
            <label className={LABEL}>{p("ad.descriptions")}</label>
            {textList(descriptions, setDescriptions, {
              minimum: 2,
              maximum: MAX_DESCRIPTIONS,
              maxLength: 90,
              placeholder: "ad.descriptionNumber",
              add: "ad.addDescription",
            })}
            <p className={HINT}>{p("ad.descriptionsHint")}</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={LABEL}>{p("ad.creative")}</label>
            <input
              ref={fileInput}
              type="file"
              accept={CREATIVE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                void upload(event.target.files)
                event.target.value = ""
              }}
            />
            {creatives === null ? (
              <Loader2 className="size-5 animate-spin text-[#98a2b3]" />
            ) : (
              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                <button
                  type="button"
                  disabled={progress !== null}
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#cfd8e6] bg-[#fafbfd] px-1 text-center text-[11.5px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60 disabled:opacity-60"
                >
                  {progress ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                  {progress ? p("ad.uploading") : p("ad.upload")}
                </button>
                {creatives.map((entry) => {
                  const selected = entry.id === creativeId
                  const unfit = creativeProblemFor(shown, entry) !== null
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={unfit}
                      title={entry.name}
                      onClick={() => setCreativeId(entry.id)}
                      className={cn(
                        "relative overflow-hidden rounded-xl border-2 transition-colors",
                        selected ? "border-[#1d4fd8]" : "border-transparent",
                        unfit && "cursor-not-allowed opacity-45"
                      )}
                    >
                      <CreativeThumb creative={entry} className="aspect-[9/16]" />
                      {selected ? (
                        <span className="absolute end-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-[#1d4fd8] text-white">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
            <p className={HINT}>{p(`ad.creativeHints.${shown}`)}</p>
          </div>

          {platform === "meta" ? (
            <div>
              <label className={LABEL}>{p("ad.text")}</label>
              <AppInput
                className={FIELD}
                maxLength={125}
                placeholder={p("ad.textPlaceholder")}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className={LABEL}>{p("ad.brandName")}</label>
              <AppInput
                className={FIELD}
                maxLength={25}
                placeholder={p("ad.brandNamePlaceholder")}
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
              />
            </div>
          )}

          <div>
            <label className={LABEL}>
              {p(platform === "tiktok" ? "ad.tiktokText" : "ad.headline")}
            </label>
            <AppInput
              className={FIELD}
              maxLength={headlineMax}
              placeholder={p("ad.headlinePlaceholder")}
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
            />
          </div>

          <div>
            <label className={LABEL}>{p("ad.callToAction")}</label>
            <AppSelect
              value={callToAction}
              onValueChange={(value) => setCallToAction(value as AnyCallToAction)}
              dir={localeDirection(locale)}
            >
              <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                {callsToActionFor(platform).map((value) => (
                  <AppSelectItem
                    key={value}
                    value={value}
                    className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                  >
                    {p(`callsToAction.${value}`)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </>
      )}

      <div>
        <label className={LABEL}>{p("ad.url")}</label>
        <AppInput
          className={cn(FIELD, "text-start")}
          dir="ltr"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <p className={HINT}>{p("ad.urlHint")}</p>
      </div>

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
          {busy ? t("adding") : t("submit")}
        </button>
      </div>
    </div>
  )
}

export function AdGroupBudgetDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CampaignPerformanceRow | null
  onClose: () => void
  onSaved: (row: CampaignPerformanceRow, dailyBudget: number) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.budget")
  return (
    <AppDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={row ? t("title", { name: row.name }) : undefined}
      contentClassName="max-w-[26rem]"
    >
      {row ? <BudgetForm key={row.id} row={row} onClose={onClose} onSaved={onSaved} /> : null}
    </AppDialog>
  )
}

function BudgetForm({
  row,
  onClose,
  onSaved,
}: {
  row: CampaignPerformanceRow
  onClose: () => void
  onSaved: (row: CampaignPerformanceRow, dailyBudget: number) => void
}) {
  const t = useTranslations("campaigns.listScreen.controls.budget")
  const locale = useLocale() as Locale
  const platform = campaignRowPublishPlatform(row)
  const minimum = platform && platform !== "google" ? MIN_DAILY_BUDGET[platform] : 20
  const currency = row.currency ?? "SAR"
  const currencyLabel = currency === "SAR" && locale === "ar" ? "ر.س" : currency
  const [amount, setAmount] = useState(row.dailyBudget ? String(row.dailyBudget) : "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value < minimum) {
      setError(t("tooLow", { minimum, currency: currencyLabel }))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await campaignPerformanceService.setDailyBudget(row.id, value)
      toast.success(t("saved"))
      onSaved(row, value)
      onClose()
    } catch (caught) {
      setError(refusalText(caught, t("failed")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir={localeDirection(locale)}>
      <div>
        <label className={LABEL}>{t("label")}</label>
        <div className="relative">
          <AppInput
            className={cn(FIELD, "pe-16")}
            type="number"
            inputMode="decimal"
            min={minimum}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-[13px] font-bold text-[#6b7b96]">
            {currencyLabel}
          </span>
        </div>
        <p className={HINT}>{t("hint", { minimum, currency: currencyLabel })}</p>
      </div>
      {error ? (
        <p className="rounded-xl border border-[#fecdca] bg-[#fffbfa] px-4 py-3 text-[13px] font-semibold leading-6 text-[#b42318]">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <button type="button" disabled={busy} onClick={onClose} className={SECONDARY}>
          {t("cancel")}
        </button>
        <button type="button" disabled={busy} onClick={() => void submit()} className={PRIMARY}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("submit")}
        </button>
      </div>
    </div>
  )
}
