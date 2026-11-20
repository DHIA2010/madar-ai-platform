"use client"

// إنشاء حملة: four short steps that end in a real campaign on the ad platform (backend:
// campaigns/publishing/service.ts). Snapchat is the platform Madar can publish to today; the
// others are shown as coming soon rather than offered and then failing.
//
//   1. where and why   -- platform, ad account, name, goal
//   2. budget and who  -- daily budget, dates, country, age, gender
//   3. the ad          -- the creative, the words on it, where it leads
//   4. review          -- everything on one page, then publish
//
// Publishing runs on the server in the background; this screen asks for the campaign's record
// until it says published or failed, and shows Snapchat's own reason when it fails.

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  Check,
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  Loader2,
  MousePointerClick,
  PlugZap,
  UserPlus,
} from "lucide-react"

import { AppError } from "@/lib/app-errors"
import { toLocalDay } from "@/lib/local-day"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppDateField,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import {
  CALLS_TO_ACTION,
  type CallToAction,
  campaignPublishingService,
  type Creative,
  type Publication,
  type PublishGender,
  type PublishObjective,
  type PublishOptions,
  snapchatCreativeProblem,
} from "../services/campaign-publishing.service"
import {
  CREATIVE_ACCEPT,
  CreativeThumb,
  SnapchatFitBadge,
  useCreativeUploader,
} from "./campaign-creative-shared"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"

import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD =
  "h-12 rounded-xl border-[#d5dce8] bg-white px-4 text-[14px] font-medium text-[#0b1738] placeholder:text-[#98a2b3]"

const STEPS = ["basics", "audience", "ad", "review"] as const
const AGES = [18, 21, 25, 30, 35, 40, 45] as const
// Snapchat's oldest selectable age; above it means "and older".
const MAX_AGES = [24, 29, 34, 39, 44, 49] as const
const NO_MAX_AGE = "none"
const SOON_PLATFORMS = ["Meta", "TikTok", "Google Search"] as const
const POLL_MS = 2500

interface Draft {
  accountKey: string
  name: string
  objective: PublishObjective
  dailyBudget: string
  startDate: string
  endDate: string
  countryCode: string
  minAge: number
  maxAge: string
  gender: PublishGender
  creativeId: string
  brandName: string
  headline: string
  callToAction: CallToAction
  url: string
  startActive: boolean
}

type Errors = Partial<Record<keyof Draft, string>>

const accountKey = (account: { connectionId: string; adAccountId: string }) =>
  `${account.connectionId}|${account.adAccountId}`

function Field({
  label,
  hint,
  error,
  counter,
  children,
}: {
  label: string
  hint?: string
  error?: string
  counter?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={cn("text-[13.5px] font-bold", HEADING)}>{label}</p>
        {counter ? (
          <span className={cn("text-[11.5px] tabular-nums", MUTED)} dir="ltr">
            {counter}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] font-semibold text-[#d92d20]">{error}</p>
      ) : hint ? (
        <p className={cn("mt-1.5 text-[12px] leading-5", MUTED)}>{hint}</p>
      ) : null}
    </div>
  )
}

function Choice({
  selected,
  onClick,
  icon,
  title,
  description,
  disabled,
  badge,
}: {
  selected: boolean
  onClick?: () => void
  icon?: ReactNode
  title: string
  description?: string
  disabled?: boolean
  badge?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border-2 p-3.5 text-start transition-colors",
        selected
          ? "border-[#1d4fd8] bg-[#f3f7ff]"
          : "border-[#e1e7f0] bg-white hover:border-[#1d4fd8]/40",
        disabled && "cursor-not-allowed opacity-60 hover:border-[#e1e7f0]"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[14px] font-bold", HEADING)}>{title}</span>
        {description ? (
          <span className={cn("mt-0.5 block text-[12px] leading-5", MUTED)}>{description}</span>
        ) : null}
      </span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[11px] font-bold text-[#6b7b96]">
          {badge}
        </span>
      ) : selected ? (
        <CheckCircle2 className="size-5 shrink-0 text-[#1d4fd8]" />
      ) : null}
    </button>
  )
}

export function CampaignPublishWizard({ onPublished }: { onPublished?: () => void }) {
  const t = useTranslations("campaigns.publish")
  const locale = useLocale() as Locale
  const searchParams = useSearchParams()
  const fileInput = useRef<HTMLInputElement>(null)
  const top = useRef<HTMLDivElement>(null)

  const [options, setOptions] = useState<PublishOptions | null>(null)
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [publication, setPublication] = useState<Publication | null>(null)
  const [switching, setSwitching] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => ({
    accountKey: "",
    name: "",
    objective: "traffic",
    dailyBudget: "50",
    startDate: toLocalDay(new Date()),
    endDate: "",
    countryCode: "sa",
    minAge: 18,
    maxAge: NO_MAX_AGE,
    gender: "all",
    creativeId: searchParams.get("creative") ?? "",
    brandName: "",
    headline: "",
    callToAction: "MORE",
    url: "",
    startActive: false,
  }))

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const load = useCallback(() => {
    setLoadFailed(false)
    Promise.all([campaignPublishingService.options(), campaignPublishingService.listCreatives()])
      .then(([loaded, library]) => {
        setOptions(loaded)
        setCreatives(library)
        const first = loaded.snapchat.accounts[0]
        if (first) {
          setDraft((current) =>
            current.accountKey ? current : { ...current, accountKey: accountKey(first) }
          )
        }
      })
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { upload, progress } = useCreativeUploader(
    useCallback((creative: Creative) => {
      setCreatives((current) => [creative, ...current])
      if (!snapchatCreativeProblem(creative)) {
        setDraft((current) => ({ ...current, creativeId: creative.id }))
        setErrors((current) => ({ ...current, creativeId: undefined }))
      }
    }, [])
  )

  // While a publish is running, ask for its record until it settles.
  useEffect(() => {
    if (publication?.status !== "publishing") return
    const timer = window.setTimeout(() => {
      campaignPublishingService
        .getPublication(publication.id)
        .then((next) => {
          setPublication(next)
          if (next.status === "published") onPublished?.()
        })
        // A dropped request is asked again on the next tick.
        .catch(() => setPublication((current) => (current ? { ...current } : current)))
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [publication, onPublished])

  const accounts = useMemo(() => options?.snapchat.accounts ?? [], [options])
  const account = accounts.find((entry) => accountKey(entry) === draft.accountKey) ?? null
  const creative = creatives.find((entry) => entry.id === draft.creativeId) ?? null
  const limits = options?.limits
  const currency = account?.currency ?? "SAR"
  const currencyLabel = currency === "SAR" && locale === "ar" ? "ر.س" : currency
  const budget = Number(draft.dailyBudget)

  const validate = (index: number): Errors => {
    const found: Errors = {}
    if (index === 0) {
      if (!account) found.accountKey = t("errors.account")
      if (draft.name.trim().length < 2) found.name = t("errors.name")
    }
    if (index === 1) {
      const minimum = limits?.minDailyBudget ?? 20
      if (!Number.isFinite(budget) || budget < minimum) {
        found.dailyBudget = t("errors.budget", { minimum, currency: currencyLabel })
      }
      if (!draft.startDate) found.startDate = t("errors.startDate")
      else if (draft.startDate < toLocalDay(new Date())) found.startDate = t("errors.startPast")
      if (draft.endDate && draft.endDate < draft.startDate) found.endDate = t("errors.endDate")
      if (draft.maxAge !== NO_MAX_AGE && Number(draft.maxAge) <= draft.minAge) {
        found.maxAge = t("errors.ageRange")
      }
    }
    if (index === 2) {
      if (!creative) found.creativeId = t("errors.creative")
      else if (snapchatCreativeProblem(creative)) found.creativeId = t("errors.creativeFit")
      if (!draft.brandName.trim()) found.brandName = t("errors.brandName")
      if (!draft.headline.trim()) found.headline = t("errors.headline")
      if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(draft.url.trim())) found.url = t("errors.url")
    }
    return found
  }

  // Each step opens from its top, not wherever the last one was scrolled to.
  const goTo = (index: number) => {
    setStep(index)
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  const goNext = () => {
    const found = validate(step)
    setErrors(found)
    if (Object.keys(found).length === 0) goTo(step + 1)
  }

  const publishErrorText = (error: unknown): string => {
    const code = error instanceof AppError ? error.code : ""
    const known = [
      "PUBLISH_ACCOUNT_NOT_CONNECTED",
      "PUBLISH_BUDGET_TOO_LOW",
      "PUBLISH_START_IN_PAST",
      "PUBLISH_END_BEFORE_START",
      "PUBLISH_AGE_RANGE",
      "PUBLISH_INVALID_URL",
      "PUBLISH_CREATIVE_NOT_SUITABLE",
      "CREATIVE_NOT_FOUND",
    ]
    if (known.includes(code)) return t(`requestErrors.${code}`)
    if (error instanceof AppError && error.status === 403) return t("requestErrors.forbidden")
    return t("requestErrors.generic")
  }

  const publish = async () => {
    for (const index of [0, 1, 2]) {
      const found = validate(index)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        goTo(index)
        return
      }
    }
    if (!account || !creative) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      setPublication(
        await campaignPublishingService.publish({
          platform: "snapchat",
          connectionId: account.connectionId,
          adAccountId: account.adAccountId,
          name: draft.name.trim(),
          objective: draft.objective,
          dailyBudget: budget,
          startDate: draft.startDate,
          endDate: draft.endDate || null,
          countryCode: draft.countryCode,
          minAge: draft.minAge,
          maxAge: draft.maxAge === NO_MAX_AGE ? null : Number(draft.maxAge),
          gender: draft.gender,
          creativeId: creative.id,
          brandName: draft.brandName.trim(),
          headline: draft.headline.trim(),
          callToAction: draft.callToAction,
          url: draft.url.trim(),
          startActive: draft.startActive,
        })
      )
    } catch (error) {
      setSubmitError(publishErrorText(error))
    } finally {
      setSubmitting(false)
    }
  }

  const switchOn = async () => {
    if (!publication) return
    setSwitching(true)
    try {
      setPublication(await campaignPublishingService.setActive(publication.id, true))
      onPublished?.()
    } catch {
      setSubmitError(t("result.switchFailed"))
    } finally {
      setSwitching(false)
    }
  }

  const startOver = () => {
    setPublication(null)
    setSubmitError(null)
    setStep(0)
    setDraft((current) => ({ ...current, name: "", headline: "", creativeId: "" }))
  }

  if (loadFailed) {
    return (
      <div className={cn(PANEL, "p-10 text-center")}>
        <p className={cn("text-[14.5px] font-bold", HEADING)}>{t("loadFailed")}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 h-12 rounded-xl border border-[#e1e7f0] px-6 text-[13.5px] font-bold text-[#1d4fd8]"
        >
          {t("retry")}
        </button>
      </div>
    )
  }

  if (!options) {
    return (
      <div className={cn(PANEL, "flex items-center justify-center py-24 text-[#98a2b3]")}>
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  // Nothing to publish to yet: say so, and lead to where a platform is connected.
  if (accounts.length === 0) {
    return (
      <div className={cn(PANEL, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
        <span className="flex size-14 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
          <PlugZap className="size-6" />
        </span>
        <p className={cn("text-[17px] font-extrabold", HEADING)}>{t("noAccount.title")}</p>
        <p className={cn("max-w-[480px] text-[13px] leading-6", MUTED)}>{t("noAccount.body")}</p>
        <Link
          href={ROUTES.integrations}
          className="mt-2 inline-flex h-12 items-center rounded-xl bg-[#1d4fd8] px-6 text-[14px] font-bold text-white hover:bg-[#1a45bd]"
        >
          {t("noAccount.action")}
        </Link>
      </div>
    )
  }

  // After "publish": the wait, then the outcome.
  if (publication) {
    const failed = publication.status === "failed"
    const published = publication.status === "published"
    const errorCode = publication.error?.code ?? ""
    const knownFailure = [
      "SNAPCHAT_NO_PUBLIC_PROFILE",
      "SNAPCHAT_NO_PIXEL",
      "SNAPCHAT_MEDIA_NOT_READY",
      "SNAPCHAT_ACCESS_DENIED",
      "PUBLISH_INTERRUPTED",
      "CREATIVE_STORAGE_UNAVAILABLE",
    ].includes(errorCode)
    return (
      <div className={cn(PANEL, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
        {published ? (
          <span className="flex size-16 items-center justify-center rounded-full bg-[#e7f8ee] text-[#137a41]">
            <Check className="size-8" />
          </span>
        ) : failed ? (
          <span className="flex size-16 items-center justify-center rounded-full bg-[#fef3f2] text-[#d92d20]">
            <CircleAlert className="size-8" />
          </span>
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
            <Loader2 className="size-8 animate-spin" />
          </span>
        )}
        <p className={cn("text-[19px] font-extrabold", HEADING)}>
          {published
            ? t("result.publishedTitle")
            : failed
              ? t("result.failedTitle")
              : t("result.publishingTitle")}
        </p>
        <p className={cn("max-w-[520px] text-[13.5px] leading-7", MUTED)}>
          {published
            ? publication.platformStatus === "active"
              ? t("result.publishedActive", { name: publication.name })
              : t("result.publishedPaused", { name: publication.name })
            : failed
              ? knownFailure
                ? t(`result.failures.${errorCode}`)
                : t("result.failures.generic")
              : t("result.publishingBody")}
        </p>
        {failed && publication.error?.reason && !knownFailure ? (
          <p
            dir="ltr"
            className="max-w-[560px] rounded-xl border border-[#fecdca] bg-[#fffbfa] px-4 py-3 text-start text-[12.5px] leading-6 text-[#b42318]"
          >
            {publication.error.reason}
          </p>
        ) : null}
        {submitError ? (
          <p className="text-[12.5px] font-semibold text-[#d92d20]">{submitError}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {published && publication.platformStatus === "paused" ? (
            <button
              type="button"
              disabled={switching}
              onClick={() => void switchOn()}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#16a34a] px-6 text-[14px] font-bold text-white hover:bg-[#15803d] disabled:opacity-60"
            >
              {switching ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("result.switchOn")}
            </button>
          ) : null}
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setPublication(null)
                setStep(errorCode.startsWith("SNAPCHAT_MEDIA") ? 2 : 3)
              }}
              className="h-12 rounded-xl bg-[#1d4fd8] px-6 text-[14px] font-bold text-white hover:bg-[#1a45bd]"
            >
              {t("result.backToEdit")}
            </button>
          ) : null}
          {published ? (
            <>
              <button
                type="button"
                onClick={startOver}
                className="h-12 rounded-xl border border-[#d5dce8] px-6 text-[14px] font-bold text-[#0b1738] hover:bg-[#f7f9fd]"
              >
                {t("result.another")}
              </button>
              <Link
                href={`${ROUTES.campaigns}/list`}
                className="inline-flex h-12 items-center rounded-xl border border-[#d5dce8] px-6 text-[14px] font-bold text-[#0b1738] hover:bg-[#f7f9fd]"
              >
                {t("result.toList")}
              </Link>
            </>
          ) : null}
        </div>
        {published ? (
          <p className={cn("mt-1 max-w-[520px] text-[12px] leading-6", MUTED)}>
            {t("result.reviewNote")}
          </p>
        ) : null}
      </div>
    )
  }

  const selectField = (
    value: string,
    onChange: (value: string) => void,
    items: Array<{ value: string; label: string }>
  ) => (
    <AppSelect value={value} onValueChange={onChange} dir={localeDirection(locale)}>
      <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
        <AppSelectValue />
      </AppSelectTrigger>
      <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
        {items.map((item) => (
          <AppSelectItem
            key={item.value}
            value={item.value}
            className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
          >
            {item.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelect>
  )

  const ageLabel =
    draft.maxAge === NO_MAX_AGE
      ? t("audience.agePlus", { age: draft.minAge })
      : t("audience.ageRange", { min: draft.minAge, max: draft.maxAge })

  const summary: Array<{ label: string; value: string }> = [
    { label: t("review.platform"), value: `${t("platforms.snapchat")} · ${account?.name ?? ""}` },
    { label: t("review.name"), value: draft.name },
    { label: t("review.objective"), value: t(`objectives.${draft.objective}.title`) },
    {
      label: t("review.budget"),
      value: t("review.budgetValue", { amount: draft.dailyBudget, currency: currencyLabel }),
    },
    {
      label: t("review.dates"),
      value: draft.endDate
        ? t("review.datesRange", { start: draft.startDate, end: draft.endDate })
        : t("review.datesOpen", { start: draft.startDate }),
    },
    {
      label: t("review.audience"),
      value: `${t(`countries.${draft.countryCode}`)} · ${ageLabel} · ${t(`audience.genders.${draft.gender}`)}`,
    },
    { label: t("review.headline"), value: draft.headline },
    { label: t("review.url"), value: draft.url },
  ]

  return (
    <div ref={top} className={cn(PANEL, "scroll-mt-4 p-5 md:p-7")} dir={localeDirection(locale)}>
      <ol className="mx-auto mb-7 flex w-full max-w-3xl items-center gap-2">
        {STEPS.map((key, index) => {
          const done = index < step
          const current = index === step
          return (
            <li key={key} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                disabled={index > step}
                onClick={() => goTo(index)}
                className="flex min-w-0 items-center gap-2.5 text-start disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors",
                    done && "bg-[#16a34a] text-white",
                    current && "bg-[#1d4fd8] text-white",
                    !done && !current && "bg-[#eef1f6] text-[#6b7b96]"
                  )}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[13.5px] font-bold sm:block",
                    current ? HEADING : MUTED
                  )}
                >
                  {t(`steps.${key}`)}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    done ? "bg-[#16a34a]" : "bg-[#e1e7f0]"
                  )}
                />
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h2 className={cn("text-[19px] font-extrabold", HEADING)}>
            {t(`stepTitles.${STEPS[step]}`)}
          </h2>
          <p className={cn("mt-1 text-[13px] leading-6", MUTED)}>{t(`stepHints.${STEPS[step]}`)}</p>
        </div>

        {step === 0 ? (
          <>
            <Field label={t("basics.platform")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Choice
                  selected
                  icon={<PlatformBadge platform="Snapchat" className="size-10" />}
                  title={t("platforms.snapchat")}
                  description={t("platforms.snapchatHint")}
                />
                {SOON_PLATFORMS.map((platform) => (
                  <Choice
                    key={platform}
                    selected={false}
                    disabled
                    icon={<PlatformBadge platform={platform} className="size-10" />}
                    title={t(
                      `platforms.${platform === "Google Search" ? "google" : platform.toLowerCase()}`
                    )}
                    badge={t("platforms.soon")}
                  />
                ))}
              </div>
            </Field>

            {accounts.length > 1 ? (
              <Field label={t("basics.account")} error={errors.accountKey}>
                {selectField(
                  draft.accountKey,
                  (value) => set("accountKey", value),
                  accounts.map((entry) => ({
                    value: accountKey(entry),
                    label: entry.currency ? `${entry.name} (${entry.currency})` : entry.name,
                  }))
                )}
              </Field>
            ) : null}

            <Field label={t("basics.name")} hint={t("basics.nameHint")} error={errors.name}>
              <AppInput
                className={FIELD}
                maxLength={120}
                placeholder={t("basics.namePlaceholder")}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </Field>

            <Field label={t("basics.objective")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Choice
                  selected={draft.objective === "traffic"}
                  onClick={() => set("objective", "traffic")}
                  icon={
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#1d4fd8]">
                      <MousePointerClick className="size-5" />
                    </span>
                  }
                  title={t("objectives.traffic.title")}
                  description={t("objectives.traffic.hint")}
                />
                <Choice
                  selected={draft.objective === "leads"}
                  onClick={() => set("objective", "leads")}
                  icon={
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e7f8ee] text-[#137a41]">
                      <UserPlus className="size-5" />
                    </span>
                  }
                  title={t("objectives.leads.title")}
                  description={t("objectives.leads.hint")}
                />
              </div>
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Field
              label={t("audience.budget")}
              hint={
                Number.isFinite(budget) && budget > 0
                  ? t("audience.budgetHint", {
                      week: Math.round(budget * 7),
                      currency: currencyLabel,
                    })
                  : undefined
              }
              error={errors.dailyBudget}
            >
              <div className="relative">
                <AppInput
                  className={cn(FIELD, "pe-16")}
                  type="number"
                  inputMode="decimal"
                  min={limits?.minDailyBudget ?? 20}
                  value={draft.dailyBudget}
                  onChange={(event) => set("dailyBudget", event.target.value)}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-0 end-4 flex items-center text-[13px] font-bold",
                    MUTED
                  )}
                >
                  {currencyLabel}
                </span>
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("audience.startDate")} error={errors.startDate}>
                <AppDateField
                  value={draft.startDate}
                  onChange={(value) => set("startDate", value)}
                  clearable={false}
                  triggerClassName="!h-12 w-full rounded-xl"
                />
              </Field>
              <Field
                label={t("audience.endDate")}
                hint={t("audience.endDateHint")}
                error={errors.endDate}
              >
                <AppDateField
                  value={draft.endDate}
                  onChange={(value) => set("endDate", value)}
                  placeholder={t("audience.endDatePlaceholder")}
                  triggerClassName="!h-12 w-full rounded-xl"
                />
              </Field>
            </div>

            <Field label={t("audience.country")}>
              {selectField(
                draft.countryCode,
                (value) => set("countryCode", value),
                (limits?.countries ?? ["sa"]).map((code) => ({
                  value: code,
                  label: t(`countries.${code}`),
                }))
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("audience.minAge")}>
                {selectField(
                  String(draft.minAge),
                  (value) => set("minAge", Number(value)),
                  AGES.map((age) => ({ value: String(age), label: String(age) }))
                )}
              </Field>
              <Field label={t("audience.maxAge")} error={errors.maxAge}>
                {selectField(draft.maxAge, (value) => set("maxAge", value), [
                  { value: NO_MAX_AGE, label: t("audience.noMaxAge") },
                  ...MAX_AGES.map((age) => ({ value: String(age), label: String(age) })),
                ])}
              </Field>
            </div>

            <Field label={t("audience.gender")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(["all", "male", "female"] as const).map((gender) => (
                  <Choice
                    key={gender}
                    selected={draft.gender === gender}
                    onClick={() => set("gender", gender)}
                    title={t(`audience.genders.${gender}`)}
                  />
                ))}
              </div>
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-6">
              <Field label={t("ad.creative")} hint={t("ad.creativeHint")} error={errors.creativeId}>
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
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    disabled={progress !== null}
                    onClick={() => fileInput.current?.click()}
                    className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#cfd8e6] bg-[#fafbfd] px-2 text-center text-[12px] font-bold text-[#1d4fd8] transition-colors hover:border-[#1d4fd8]/60 disabled:opacity-60"
                  >
                    {progress ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <ImagePlus className="size-5" />
                    )}
                    {progress ? t("ad.uploading") : t("ad.upload")}
                  </button>
                  {creatives.map((entry) => {
                    const selected = entry.id === draft.creativeId
                    const unfit = snapchatCreativeProblem(entry) !== null
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={unfit}
                        title={entry.name}
                        onClick={() => set("creativeId", entry.id)}
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
                {creative ? (
                  <div className="mt-2.5">
                    <SnapchatFitBadge creative={creative} />
                  </div>
                ) : null}
              </Field>

              <Field
                label={t("ad.brandName")}
                hint={t("ad.brandNameHint")}
                error={errors.brandName}
                counter={`${draft.brandName.length}/${limits?.brandNameMax ?? 25}`}
              >
                <AppInput
                  className={FIELD}
                  maxLength={limits?.brandNameMax ?? 25}
                  placeholder={t("ad.brandNamePlaceholder")}
                  value={draft.brandName}
                  onChange={(event) => set("brandName", event.target.value)}
                />
              </Field>

              <Field
                label={t("ad.headline")}
                hint={t("ad.headlineHint")}
                error={errors.headline}
                counter={`${draft.headline.length}/${limits?.headlineMax ?? 34}`}
              >
                <AppInput
                  className={FIELD}
                  maxLength={limits?.headlineMax ?? 34}
                  placeholder={t("ad.headlinePlaceholder")}
                  value={draft.headline}
                  onChange={(event) => set("headline", event.target.value)}
                />
              </Field>

              <Field label={t("ad.callToAction")}>
                {selectField(
                  draft.callToAction,
                  (value) => set("callToAction", value as CallToAction),
                  CALLS_TO_ACTION.map((value) => ({ value, label: t(`callsToAction.${value}`) }))
                )}
              </Field>

              <Field label={t("ad.url")} hint={t("ad.urlHint")} error={errors.url}>
                <AppInput
                  className={cn(FIELD, "text-start")}
                  dir="ltr"
                  inputMode="url"
                  placeholder="https://"
                  value={draft.url}
                  onChange={(event) => set("url", event.target.value)}
                />
              </Field>
            </div>

            {/* The ad roughly as Snapchat shows it: the creative full-screen, the brand and
                headline over it, the button at the bottom. */}
            <div className="mx-auto w-[220px]">
              <p className={cn("mb-2 text-center text-[12px] font-bold", MUTED)}>
                {t("ad.preview")}
              </p>
              <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] border-[5px] border-[#0b1738] bg-[#0b1738]">
                {creative ? (
                  <CreativeThumb creative={creative} className="absolute inset-0" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-white/60">
                    {t("ad.previewEmpty")}
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3 text-start">
                  <p className="truncate text-[12px] font-extrabold text-white">
                    {draft.brandName || t("ad.brandNamePlaceholder")}
                  </p>
                  <p className="truncate text-[10.5px] text-white/85">
                    {draft.headline || t("ad.headlinePlaceholder")}
                  </p>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
                  <span className="block rounded-full bg-white py-1.5 text-center text-[11px] font-extrabold text-[#0b1738]">
                    {t(`callsToAction.${draft.callToAction}`)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]">
              {creative ? (
                <CreativeThumb
                  creative={creative}
                  className="mx-auto aspect-[9/16] w-[140px] rounded-xl"
                />
              ) : null}
              <dl className="divide-y divide-[#eef1f6] rounded-xl border border-[#e1e7f0]">
                {summary.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <dt className={cn("shrink-0 text-[12.5px] font-semibold", MUTED)}>
                      {row.label}
                    </dt>
                    <dd
                      className={cn(
                        "min-w-0 break-words text-end text-[13.5px] font-bold",
                        HEADING
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <Field label={t("review.start")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Choice
                  selected={!draft.startActive}
                  onClick={() => set("startActive", false)}
                  title={t("review.startPaused")}
                  description={t("review.startPausedHint")}
                />
                <Choice
                  selected={draft.startActive}
                  onClick={() => set("startActive", true)}
                  title={t("review.startNow")}
                  description={t("review.startNowHint", {
                    amount: draft.dailyBudget,
                    currency: currencyLabel,
                  })}
                />
              </div>
            </Field>

            {submitError ? (
              <p className="rounded-xl border border-[#fecdca] bg-[#fffbfa] px-4 py-3 text-[13px] font-semibold text-[#b42318]">
                {submitError}
              </p>
            ) : null}
          </>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-[#eef1f6] pt-5">
          <button
            type="button"
            disabled={step === 0 || submitting}
            onClick={() => goTo(step - 1)}
            className="h-12 min-w-28 rounded-xl border border-[#d5dce8] px-5 text-[14px] font-bold text-[#0b1738] hover:bg-[#f7f9fd] disabled:invisible"
          >
            {t("back")}
          </button>
          <p className={cn("hidden text-[12px] sm:block", MUTED)}>
            {t("stepCount", { current: step + 1, total: STEPS.length })}
          </p>
          {step === STEPS.length - 1 ? (
            <button
              // Its own key, so the "next" button never turns into this one mid-click.
              key="publish"
              type="button"
              disabled={submitting}
              onClick={() => void publish()}
              className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-xl bg-[#16a34a] px-6 text-[14px] font-extrabold text-white hover:bg-[#15803d] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("publish")}
            </button>
          ) : (
            <button
              key="next"
              type="button"
              onClick={goNext}
              className="h-12 min-w-44 rounded-xl bg-[#1d4fd8] px-6 text-[14px] font-extrabold text-white hover:bg-[#1a45bd]"
            >
              {t("next")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
