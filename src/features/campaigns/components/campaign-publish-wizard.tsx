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
  Megaphone,
  MousePointerClick,
  PlugZap,
  Plus,
  ShoppingCart,
  Smartphone,
  Trash2,
  TriangleAlert,
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
  type AnyCallToAction,
  APP_NAME_MAX,
  appIconProblem,
  callsToActionFor,
  type CallToAction,
  campaignPublishingService,
  type Creative,
  creativeProblemFor,
  type Publication,
  PUBLISH_PLATFORMS,
  type PublishGender,
  type PublishObjective,
  type PublishOptions,
  type PublishPlatform,
  SNAPCHAT_GOALS,
  SNAPCHAT_MIN_SPEND_CAP,
  SNAPCHAT_OBJECTIVES,
  SNAPCHAT_TARGET_COST_GOALS,
  SNAPCHAT_WINDOW_GOALS,
  SNAPCHAT_WINDOWS,
  type SnapchatBidStrategy,
  type SnapchatConversionWindow,
  type SnapchatGoal,
} from "../services/campaign-publishing.service"
import {
  CampaignAudiencePicker,
  CampaignDevicePicker,
  type DeviceConnection,
  type DeviceSystem,
} from "./campaign-audience-picker"
import {
  CREATIVE_ACCEPT,
  CreativeThumb,
  SnapchatFitBadge,
  useCreativeUploader,
} from "./campaign-creative-shared"
import { CampaignLocationPicker } from "./campaign-location-picker"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"
import {
  CampaignTrackingFields,
  resolveTracking,
  type TrackingEdits,
} from "./campaign-tracking-fields"

import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD =
  "h-12 rounded-xl border-[#d5dce8] bg-white px-4 text-[14px] font-medium text-[#0b1738] placeholder:text-[#98a2b3]"

const STEPS = ["basics", "audience", "ad", "review"] as const
// Every age from 18 to 65 can be picked as the youngest or the oldest, on every platform.
// Snapchat's own targeting stops at an exact youngest age of 45 and an exact oldest age of 49
// (above that it only knows "and older"), so a choice past those is published as the nearest
// thing Snapchat can do, and the form says so under the ages (snapchatAges below).
const YOUNGEST_AGE = 18
const OLDEST_AGE = 65
const SNAPCHAT_MIN_AGE_TOP = 45
const SNAPCHAT_MAX_AGE_TOP = 49
const AGE_LIMITS = { minTop: OLDEST_AGE - 1, maxTop: OLDEST_AGE }
const agesBetween = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)
const NO_MAX_AGE = "none"
const PLATFORM_BADGE = {
  snapchat: "Snapchat",
  tiktok: "TikTok",
  meta: "Meta",
  google: "Google Search",
} as const
const POLL_MS = 2500
const MAX_KEYWORDS = 20
// Google's own limits for one search ad.
const MAX_GOOGLE_HEADLINES = 15
const MAX_GOOGLE_DESCRIPTIONS = 4
// The keywords as typed: one per line, or separated by commas.
const keywordsOf = (text: string) =>
  [
    ...new Set(
      text
        .split(/[\n,،]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_KEYWORDS)

interface Draft {
  platform: PublishPlatform
  accountKey: string
  name: string
  objective: PublishObjective
  // Snapchat only: what the ad set is delivered for ("" is Madar's own pick for the objective),
  // the campaign's spend caps and how Snapchat bids. Empty boxes mean "not set".
  goal: SnapchatGoal | ""
  campaignDailyCap: string
  campaignLifetimeCap: string
  bidStrategy: SnapchatBidStrategy
  bidAmount: string
  conversionWindow: SnapchatConversionWindow
  // Snapchat only: some of the country's regions, or some of its cities. Empty: all of it.
  regionIds: string[]
  cityKeys: string[]
  languages: string[]
  interestIds: string[]
  deviceSystem: DeviceSystem
  deviceConnection: DeviceConnection
  // Snapchat: an amount a day, or one amount for the whole run (which needs an end date).
  budgetKind: "daily" | "lifetime"
  lifetimeBudget: string
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
  // Meta: the text above the picture.
  text: string
  // Google: a search ad's three headlines, two descriptions and its keywords (one per line).
  headlines: string[]
  descriptions: string[]
  keywords: string
  callToAction: AnyCallToAction
  url: string
  // What was typed over Madar's own tracking words for the link.
  tracking: TrackingEdits
  startActive: boolean
  // Snapchat: a campaign can be made with several ad groups and several ads. The boxes above
  // are the ad group and the ad being worked on; the lists hold every one of them (the entry
  // being worked on is refreshed from the boxes whenever the lists are read), and the names
  // tell them apart once there is more than one.
  // Snapchat's app objective: the app's name, its App Store number, its Google Play package
  // name (one store is enough) and its icon, a creative in the library.
  appName: string
  appIosId: string
  appAndroidPackage: string
  appIconId: string
  groupName: string
  groups: GroupDraft[]
  groupAt: number
  adName: string
  ads: AdDraft[]
  adAt: number
}

// What each ad group has of its own: its budget and its audience. The dates, the country, the
// goal and the bid are the campaign's.
const GROUP_KEYS = [
  "groupName",
  "dailyBudget",
  "lifetimeBudget",
  "minAge",
  "maxAge",
  "gender",
  "regionIds",
  "cityKeys",
  "languages",
  "interestIds",
  "deviceSystem",
  "deviceConnection",
] as const
type GroupDraft = Pick<Draft, (typeof GROUP_KEYS)[number]>
// What each ad has of its own. The brand name and the link's tracking words are shared.
const AD_KEYS = ["adName", "creativeId", "headline", "callToAction", "url"] as const
type AdDraft = Pick<Draft, (typeof AD_KEYS)[number]>
const MAX_SLOTS = 5

const pickKeys = <K extends keyof Draft>(draft: Draft, keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, draft[key]])) as Pick<Draft, K>
// Every ad group and every ad, with the one being worked on as the boxes now have it.
const groupsOf = (draft: Draft): GroupDraft[] =>
  draft.groups.map((group, index) =>
    index === draft.groupAt ? pickKeys(draft, GROUP_KEYS) : group
  )
const adsOf = (draft: Draft): AdDraft[] =>
  draft.ads.map((ad, index) => (index === draft.adAt ? pickKeys(draft, AD_KEYS) : ad))

type Errors = Partial<Record<keyof Draft, string>>

// The ad groups (or the ads) of the campaign as tabs: pick one to work on, add a copy of the
// one being worked on, or remove one.
function SlotTabs({
  labels,
  at,
  onPick,
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
}: {
  labels: string[]
  at: number
  onPick: (index: number) => void
  onAdd: () => void
  onRemove: (index: number) => void
  addLabel: string
  removeLabel: (label: string) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist">
      {labels.map((label, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex h-11 items-center overflow-hidden rounded-xl border-2 text-[13px] font-bold transition-colors",
            index === at
              ? "border-[#1d4fd8] bg-[#f3f7ff] text-[#1d4fd8]"
              : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/40"
          )}
        >
          <button
            type="button"
            role="tab"
            aria-selected={index === at}
            onClick={() => onPick(index)}
            className="h-full max-w-[220px] truncate px-4"
          >
            {label}
          </button>
          {labels.length > 1 ? (
            <button
              type="button"
              aria-label={removeLabel(label)}
              onClick={() => onRemove(index)}
              className="flex h-full w-9 items-center justify-center border-s border-current/20 text-[#98a2b3] hover:text-[#b42318]"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </span>
      ))}
      {labels.length < MAX_SLOTS ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-dashed border-[#c7d2e6] bg-white px-4 text-[13px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60"
        >
          <Plus className="size-4" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}

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

// Each objective's icon and colour.
const OBJECTIVE_LOOK: Record<PublishObjective, { icon: typeof Megaphone; className: string }> = {
  awareness: { icon: Megaphone, className: "bg-[#fff4e5] text-[#b54708]" },
  traffic: { icon: MousePointerClick, className: "bg-[#eef4ff] text-[#1d4fd8]" },
  leads: { icon: UserPlus, className: "bg-[#e7f8ee] text-[#137a41]" },
  sales: { icon: ShoppingCart, className: "bg-[#f4ebff] text-[#6941c6]" },
  app: { icon: Smartphone, className: "bg-[#e6f6fb] text-[#0e7090]" },
}

function Choice({
  selected,
  onClick,
  icon,
  title,
  description,
  note,
  disabled,
  badge,
}: {
  selected: boolean
  onClick?: () => void
  icon?: ReactNode
  title: string
  description?: string
  // A second, quieter line under the description.
  note?: string
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
        {note ? (
          <span className="mt-1 block text-[11.5px] font-semibold leading-5 text-[#475467]">
            {note}
          </span>
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
  const [draft, setDraft] = useState<Draft>(() => {
    const base = {
      platform: "snapchat" as PublishPlatform,
      accountKey: "",
      name: "",
      objective: "traffic",
      goal: "",
      campaignDailyCap: "",
      campaignLifetimeCap: "",
      bidStrategy: "auto",
      bidAmount: "",
      conversionWindow: "SWIPE_28DAY_VIEW_1DAY",
      regionIds: [],
      cityKeys: [],
      languages: [],
      interestIds: [],
      deviceSystem: "all",
      deviceConnection: "all",
      budgetKind: "daily",
      lifetimeBudget: "",
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
      text: "",
      headlines: ["", "", ""],
      descriptions: ["", ""],
      keywords: "",
      callToAction: "MORE",
      url: "",
      tracking: {},
      startActive: false,
      appName: "",
      appIosId: "",
      appAndroidPackage: "",
      appIconId: "",
      groupName: "",
      groups: [],
      groupAt: 0,
      adName: "",
      ads: [],
      adAt: 0,
    } satisfies Draft as Draft
    return {
      ...base,
      groups: [pickKeys(base, GROUP_KEYS)],
      ads: [pickKeys(base, AD_KEYS)],
    }
  })

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  // The app's icon is uploaded into the library like any creative, and chosen at once.
  const iconInput = useRef<HTMLInputElement>(null)
  const { upload: uploadIcon, progress: iconProgress } = useCreativeUploader(
    useCallback((creative: Creative) => {
      setCreatives((current) => [creative, ...current])
      setDraft((current) => ({ ...current, appIconId: creative.id }))
      setErrors((current) => ({ ...current, appIconId: undefined }))
    }, [])
  )

  const load = useCallback(() => {
    setLoadFailed(false)
    Promise.all([campaignPublishingService.options(), campaignPublishingService.listCreatives()])
      .then(([loaded, library]) => {
        setOptions(loaded)
        setCreatives(library)
        // Opens on the first platform that has a connected account.
        const platform = PUBLISH_PLATFORMS.find((entry) => loaded[entry].accounts.length > 0)
        if (platform) {
          setDraft((current) =>
            current.accountKey
              ? current
              : {
                  ...current,
                  platform,
                  accountKey: accountKey(loaded[platform].accounts[0]),
                  callToAction: platform === "snapchat" ? "MORE" : "LEARN_MORE",
                  dailyBudget: String(
                    Math.max(
                      Number(current.dailyBudget) || 0,
                      loaded.limits.minDailyBudgets[platform]
                    )
                  ),
                }
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
      setDraft((current) =>
        current.platform !== "google" && !creativeProblemFor(current.platform, creative)
          ? { ...current, creativeId: creative.id }
          : current
      )
      setErrors((current) => ({ ...current, creativeId: undefined }))
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

  const accounts = useMemo(
    () => options?.[draft.platform].accounts ?? [],
    [options, draft.platform]
  )
  const anyAccount = options
    ? PUBLISH_PLATFORMS.some((entry) => options[entry].accounts.length > 0)
    : false
  const isGoogle = draft.platform === "google"
  const isSnapchat = draft.platform === "snapchat"
  // The other platforms are published with traffic or leads only.
  const objective: PublishObjective =
    isSnapchat || draft.objective === "leads" ? draft.objective : "traffic"
  // An app campaign's ads open the app's store page: no link, and buttons of their own.
  const isApp = isSnapchat && objective === "app"
  const appIcon = creatives.find((entry) => entry.id === draft.appIconId) ?? null
  const appStoreUrl = draft.appIosId.trim()
    ? `https://apps.apple.com/app/id${draft.appIosId.trim()}`
    : `https://play.google.com/store/apps/details?id=${draft.appAndroidPackage.trim()}`
  // Choosing or leaving the app objective swaps every ad's button for one that fits.
  const chooseObjective = (next: PublishObjective) => {
    setErrors({})
    setDraft((current) => {
      const offered = callsToActionFor(current.platform, next)
      const fit = (button: AnyCallToAction) => (offered.includes(button) ? button : offered[0])
      return {
        ...current,
        objective: next,
        callToAction: fit(current.callToAction),
        ads: current.ads.map((ad) => ({ ...ad, callToAction: fit(ad.callToAction) })),
      }
    })
  }
  const goals = SNAPCHAT_GOALS[objective]
  // A goal chosen for another objective falls back to this objective's own pick.
  const goal: SnapchatGoal = draft.goal && goals.includes(draft.goal) ? draft.goal : goals[0]
  const shownPlatform = draft.platform === "google" ? "snapchat" : draft.platform
  const problemOf = (entry: Creative) => creativeProblemFor(shownPlatform, entry)
  const keywords = keywordsOf(draft.keywords)

  // Another platform: its first account, a button it offers, and a budget it accepts. The chosen
  // file stays only if it fits the new platform.
  const choosePlatform = (platform: PublishPlatform) => {
    if (!options || platform === draft.platform) return
    const first = options[platform].accounts[0]
    if (!first) return
    setDraft((current) => {
      const chosen = creatives.find((entry) => entry.id === current.creativeId)
      return {
        ...current,
        platform,
        accountKey: accountKey(first),
        callToAction: callsToActionFor(platform).includes(current.callToAction)
          ? current.callToAction
          : platform === "snapchat"
            ? "MORE"
            : "LEARN_MORE",
        creativeId:
          platform !== "google" && chosen && !creativeProblemFor(platform, chosen)
            ? current.creativeId
            : "",
        dailyBudget: String(
          Math.max(Number(current.dailyBudget) || 0, options.limits.minDailyBudgets[platform])
        ),
        // Ages the new platform cannot take exactly fall back to its nearest choice.
        minAge: Math.min(current.minAge, AGE_LIMITS.minTop),
        maxAge:
          current.maxAge !== NO_MAX_AGE && Number(current.maxAge) > AGE_LIMITS.maxTop
            ? NO_MAX_AGE
            : current.maxAge,
      }
    })
    setErrors({})
  }
  const account = accounts.find((entry) => accountKey(entry) === draft.accountKey) ?? null
  const creative = creatives.find((entry) => entry.id === draft.creativeId) ?? null
  const limits = options?.limits
  const currency = account?.currency ?? "SAR"
  const currencyLabel = currency === "SAR" && locale === "ar" ? "ر.س" : currency
  // A budget for the whole run is spread over the days from the first to the last, both counted;
  // what it comes to a day is what the caps and the floor are held against.
  const lifetime = draft.platform === "snapchat" && draft.budgetKind === "lifetime"
  const runDays =
    draft.startDate && draft.endDate && draft.endDate >= draft.startDate
      ? Math.round(
          (Date.parse(`${draft.endDate}T00:00:00Z`) - Date.parse(`${draft.startDate}T00:00:00Z`)) /
            86_400_000
        ) + 1
      : 0
  const lifetimeBudget = Number(draft.lifetimeBudget)
  // What an ad group comes to a day.
  const dailyOf = (group: Pick<GroupDraft, "dailyBudget" | "lifetimeBudget">) =>
    lifetime
      ? runDays > 0
        ? Math.round((Number(group.lifetimeBudget) / runDays) * 100) / 100
        : 0
      : Number(group.dailyBudget)
  const budget = dailyOf(draft)
  // Only Snapchat takes several ad groups and ads; elsewhere it is the one being worked on.
  const multi = draft.platform === "snapchat"
  const groups = multi ? groupsOf(draft) : [pickKeys(draft, GROUP_KEYS)]
  const ads = multi ? adsOf(draft) : [pickKeys(draft, AD_KEYS)]
  const groupAt = multi ? draft.groupAt : 0
  const adAt = multi ? draft.adAt : 0
  // What the whole campaign may spend in a day: every ad group together.
  const totalBudget =
    Math.round(groups.reduce((sum, group) => sum + (dailyOf(group) || 0), 0) * 100) / 100
  const groupLabel = (group: GroupDraft, index: number) =>
    group.groupName.trim() || t("slots.group", { n: index + 1 })
  const adLabel = (ad: AdDraft, index: number) =>
    ad.adName.trim() || t("slots.ad", { n: index + 1 })

  // Working on another ad group or ad: the boxes are kept in the list, then filled from it.
  const showGroup = (index: number) =>
    setDraft((current) => {
      const all = groupsOf(current)
      return { ...current, groups: all, ...all[index], groupAt: index }
    })
  const showAd = (index: number) =>
    setDraft((current) => {
      const all = adsOf(current)
      return { ...current, ads: all, ...all[index], adAt: index }
    })
  // A new one starts as a copy of the one being worked on, so only what differs is changed.
  const addGroup = () => {
    setErrors({})
    setDraft((current) => {
      const all = groupsOf(current).map((group, index) => ({
        ...group,
        groupName: group.groupName.trim() || t("slots.group", { n: index + 1 }),
      }))
      const copy = { ...all[current.groupAt], groupName: t("slots.group", { n: all.length + 1 }) }
      return { ...current, groups: [...all, copy], ...copy, groupAt: all.length }
    })
  }
  const addAd = () => {
    setErrors({})
    setDraft((current) => {
      const all = adsOf(current).map((ad, index) => ({
        ...ad,
        adName: ad.adName.trim() || t("slots.ad", { n: index + 1 }),
      }))
      const copy = { ...all[current.adAt], adName: t("slots.ad", { n: all.length + 1 }) }
      return { ...current, ads: [...all, copy], ...copy, adAt: all.length }
    })
  }
  const removeGroup = (index: number) => {
    setErrors({})
    setDraft((current) => {
      const all = groupsOf(current).filter((_, other) => other !== index)
      const next = Math.min(
        index < current.groupAt ? current.groupAt - 1 : current.groupAt,
        all.length - 1
      )
      return { ...current, groups: all, ...all[next], groupAt: next }
    })
  }
  const removeAd = (index: number) => {
    setErrors({})
    setDraft((current) => {
      const all = adsOf(current).filter((_, other) => other !== index)
      const next = Math.min(index < current.adAt ? current.adAt - 1 : current.adAt, all.length - 1)
      return { ...current, ads: all, ...all[next], adAt: next }
    })
  }
  const minimumBudget = limits?.minDailyBudgets?.[draft.platform] ?? limits?.minDailyBudget ?? 20
  const headlineMax =
    draft.platform === "tiktok"
      ? (limits?.tiktokTextMax ?? 100)
      : draft.platform === "meta"
        ? (limits?.metaHeadlineMax ?? 40)
        : (limits?.headlineMax ?? 34)

  const validate = (index: number): Errors => {
    const found: Errors = {}
    if (index === 0) {
      if (!account) found.accountKey = t("errors.account")
      if (draft.name.trim().length < 2) found.name = t("errors.name")
      if (isApp) {
        const ios = draft.appIosId.trim()
        const android = draft.appAndroidPackage.trim()
        if (!draft.appName.trim()) found.appName = t("errors.appName")
        if (!ios && !android) found.appIosId = t("errors.appStore")
        else if (ios && !/^\d{5,15}$/.test(ios)) found.appIosId = t("errors.appIosId")
        if (android && !/^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/.test(android)) {
          found.appAndroidPackage = t("errors.appAndroidPackage")
        }
        if (!appIcon) found.appIconId = t("errors.appIcon")
        else if (appIconProblem(appIcon)) found.appIconId = t("errors.appIconFit")
      }
    }
    if (index === 1) {
      const minimum = minimumBudget
      // Every ad group is checked; the first one with something wrong is the one shown.
      for (const [index, group] of groups.entries()) {
        const wrong: Errors = {}
        const whole = Number(group.lifetimeBudget)
        const daily = dailyOf(group)
        if (lifetime) {
          if (runDays === 0) wrong.dailyBudget = t("errors.lifetimeEnd")
          else if (!Number.isFinite(whole) || whole < minimum * runDays) {
            wrong.dailyBudget = t("errors.lifetimeBudget", {
              minimum: minimum * runDays,
              days: runDays,
              currency: currencyLabel,
            })
          }
        } else if (!Number.isFinite(daily) || daily < minimum) {
          wrong.dailyBudget = t("errors.budget", { minimum, currency: currencyLabel })
        }
        if (!isGoogle && group.maxAge !== NO_MAX_AGE && Number(group.maxAge) <= group.minAge) {
          wrong.maxAge = t("errors.ageRange")
        }
        if (groups.length > 1 && group.groupName.trim().length < 2) {
          wrong.groupName = t("errors.slotName")
        }
        if (Object.keys(wrong).length > 0) {
          if (index !== groupAt) showGroup(index)
          Object.assign(found, wrong)
          break
        }
      }
      if (!draft.startDate) found.startDate = t("errors.startDate")
      else if (draft.startDate < toLocalDay(new Date())) found.startDate = t("errors.startPast")
      if (draft.endDate && draft.endDate < draft.startDate) found.endDate = t("errors.endDate")
      if (isSnapchat) {
        const dailyCap = Number(draft.campaignDailyCap)
        if (
          draft.campaignDailyCap &&
          !(dailyCap >= SNAPCHAT_MIN_SPEND_CAP && dailyCap >= totalBudget * 0.25)
        ) {
          found.campaignDailyCap = t("errors.dailyCap", {
            minimum: SNAPCHAT_MIN_SPEND_CAP,
            currency: currencyLabel,
          })
        }
        const lifetimeCap = Number(draft.campaignLifetimeCap)
        if (
          draft.campaignLifetimeCap &&
          !(lifetimeCap >= SNAPCHAT_MIN_SPEND_CAP && lifetimeCap >= totalBudget)
        ) {
          found.campaignLifetimeCap = t("errors.lifetimeCap", {
            minimum: SNAPCHAT_MIN_SPEND_CAP,
            currency: currencyLabel,
          })
        }
        if (draft.bidStrategy !== "auto") {
          if (!(Number(draft.bidAmount) > 0)) found.bidAmount = t("errors.bidAmount")
          else if (
            draft.bidStrategy === "target_cost" &&
            !SNAPCHAT_TARGET_COST_GOALS.includes(goal)
          ) {
            found.bidStrategy = t("errors.targetCostGoal")
          }
        }
      }
    }
    if (index === 2 && isGoogle) {
      if (draft.headlines.filter((entry) => entry.trim()).length < 3) {
        found.headlines = t("errors.headlines")
      }
      if (draft.descriptions.filter((entry) => entry.trim()).length < 2) {
        found.descriptions = t("errors.descriptions")
      }
      if (keywords.length === 0) found.keywords = t("errors.keywords")
    }
    if (index === 2 && !isGoogle) {
      if (draft.platform !== "meta" && !draft.brandName.trim()) {
        found.brandName = t("errors.brandName")
      }
      if (draft.platform === "meta" && !draft.text.trim()) found.text = t("errors.text")
      // Every ad is checked; the first one with something wrong is the one shown.
      for (const [at, ad] of ads.entries()) {
        const wrong: Errors = {}
        const file = creatives.find((entry) => entry.id === ad.creativeId) ?? null
        if (!file) wrong.creativeId = t("errors.creative")
        else if (problemOf(file)) {
          wrong.creativeId = t(
            draft.platform === "snapchat" ? "errors.creativeFit" : "errors.creativeFitOther"
          )
        }
        if (!ad.headline.trim()) wrong.headline = t("errors.headline")
        if (!isApp && !/^https:\/\/[^\s.]+\.[^\s]+$/i.test(ad.url.trim())) {
          wrong.url = t("errors.url")
        }
        if (ads.length > 1 && ad.adName.trim().length < 2) wrong.adName = t("errors.slotName")
        if (Object.keys(wrong).length > 0) {
          if (at !== adAt) showAd(at)
          Object.assign(found, wrong)
          break
        }
      }
    }
    if (index === 2 && isGoogle) {
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
      "PUBLISH_TEXT_NOT_SUITABLE",
      "PUBLISH_SETTINGS_NOT_SUITABLE",
      "PUBLISH_APP_NOT_SUITABLE",
      "PUBLISH_OBJECTIVE_NOT_SUPPORTED",
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
    if (!account || (!isGoogle && !creative)) return
    // The first ad group and the first ad are the campaign's own; the rest go along with them.
    const [firstGroup, ...moreGroups] = groups
    const [firstAd, ...moreAds] = ads
    const maxAgeOf = (group: GroupDraft) =>
      group.maxAge === NO_MAX_AGE ? null : Number(group.maxAge)
    setSubmitting(true)
    setSubmitError(null)
    const common = {
      connectionId: account.connectionId,
      adAccountId: account.adAccountId,
      name: draft.name.trim(),
      objective,
      dailyBudget: dailyOf(firstGroup),
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      countryCode: draft.countryCode,
      // A search ad is aimed by what people search, not by who they are.
      minAge: isGoogle ? 18 : firstGroup.minAge,
      maxAge: isGoogle ? null : maxAgeOf(firstGroup),
      gender: isGoogle ? ("all" as const) : firstGroup.gender,
      // An app ad opens the app's store page; that page stands in as the campaign's link.
      url: isApp ? appStoreUrl : (isGoogle ? draft.url : firstAd.url).trim(),
      tracking: resolveTracking(draft.platform, { campaign: draft.name }, draft.tracking),
      startActive: draft.startActive,
    }
    const creativeId = firstAd.creativeId
    try {
      setPublication(
        await campaignPublishingService.publish(
          draft.platform === "google"
            ? {
                ...common,
                platform: "google",
                headlines: draft.headlines.map((entry) => entry.trim()).filter(Boolean),
                descriptions: draft.descriptions.map((entry) => entry.trim()).filter(Boolean),
                keywords,
              }
            : draft.platform === "meta"
              ? {
                  ...common,
                  platform: "meta",
                  creativeId,
                  headline: firstAd.headline.trim(),
                  text: draft.text.trim(),
                  callToAction: firstAd.callToAction,
                }
              : {
                  ...common,
                  platform: draft.platform,
                  creativeId,
                  brandName: draft.brandName.trim(),
                  headline: firstAd.headline.trim(),
                  callToAction: firstAd.callToAction,
                  ...(isSnapchat
                    ? {
                        goal,
                        campaignDailyCap: draft.campaignDailyCap
                          ? Number(draft.campaignDailyCap)
                          : null,
                        campaignLifetimeCap: draft.campaignLifetimeCap
                          ? Number(draft.campaignLifetimeCap)
                          : null,
                        bidStrategy: draft.bidStrategy,
                        bidAmount: draft.bidStrategy === "auto" ? null : Number(draft.bidAmount),
                        conversionWindow: SNAPCHAT_WINDOW_GOALS.includes(goal)
                          ? draft.conversionWindow
                          : null,
                        regionIds: firstGroup.regionIds,
                        cityKeys: firstGroup.cityKeys,
                        languages: firstGroup.languages,
                        interestIds: firstGroup.interestIds,
                        deviceSystem: firstGroup.deviceSystem,
                        deviceConnection: firstGroup.deviceConnection,
                        lifetimeBudget: lifetime ? Number(firstGroup.lifetimeBudget) : null,
                        ...(isApp
                          ? {
                              app: {
                                name: draft.appName.trim(),
                                iosAppId: draft.appIosId.trim() || null,
                                androidPackage: draft.appAndroidPackage.trim() || null,
                                iconCreativeId: draft.appIconId,
                              },
                            }
                          : {}),
                        ...(moreGroups.length > 0
                          ? {
                              adGroupName: groupLabel(firstGroup, 0),
                              moreAdGroups: moreGroups.map((group, index) => ({
                                name: groupLabel(group, index + 1),
                                dailyBudget: dailyOf(group),
                                lifetimeBudget: lifetime ? Number(group.lifetimeBudget) : null,
                                minAge: group.minAge,
                                maxAge: maxAgeOf(group),
                                gender: group.gender,
                                regionIds: group.regionIds,
                                cityKeys: group.cityKeys,
                                languages: group.languages,
                                interestIds: group.interestIds,
                                deviceSystem: group.deviceSystem,
                                deviceConnection: group.deviceConnection,
                              })),
                            }
                          : {}),
                        ...(moreAds.length > 0
                          ? {
                              adName: adLabel(firstAd, 0),
                              moreAds: moreAds.map((ad, index) => ({
                                name: adLabel(ad, index + 1),
                                creativeId: ad.creativeId,
                                headline: ad.headline.trim(),
                                callToAction: ad.callToAction as CallToAction,
                                url: isApp ? appStoreUrl : ad.url.trim(),
                              })),
                            }
                          : {}),
                      }
                    : {}),
                }
        )
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
  if (!anyAccount) {
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
      "TIKTOK_NO_PIXEL",
      "TIKTOK_NO_IDENTITY",
      "TIKTOK_MEDIA_NOT_READY",
      "TIKTOK_ACCESS_DENIED",
      "META_NO_PAGE",
      "META_NO_PIXEL",
      "META_MEDIA_NOT_READY",
      "META_ACCESS_DENIED",
      "GOOGLE_ACCESS_DENIED",
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
                setStep(errorCode.includes("_MEDIA") ? 2 : 3)
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

  // What Snapchat will really be asked for, when the ages picked are past what it can target.
  const snapchatAges =
    draft.platform === "snapchat" &&
    (draft.minAge > SNAPCHAT_MIN_AGE_TOP ||
      (draft.maxAge !== NO_MAX_AGE && Number(draft.maxAge) > SNAPCHAT_MAX_AGE_TOP))
      ? {
          minAge: Math.min(draft.minAge, SNAPCHAT_MIN_AGE_TOP),
          maxAge:
            draft.maxAge !== NO_MAX_AGE && Number(draft.maxAge) <= SNAPCHAT_MAX_AGE_TOP
              ? draft.maxAge
              : NO_MAX_AGE,
        }
      : null
  const shownAges = snapchatAges ?? { minAge: draft.minAge, maxAge: draft.maxAge }
  const ageLabel =
    shownAges.maxAge === NO_MAX_AGE
      ? t("audience.agePlus", { age: shownAges.minAge })
      : t("audience.ageRange", { min: shownAges.minAge, max: shownAges.maxAge })

  const summary: Array<{ label: string; value: string }> = [
    {
      label: t("review.platform"),
      value: `${t(`platforms.${draft.platform}`)} · ${account?.name ?? ""}`,
    },
    { label: t("review.name"), value: draft.name },
    { label: t("review.objective"), value: t(`objectives.${objective}.title`) },
    ...(isSnapchat
      ? [
          { label: t("review.goal"), value: t(`goals.${goal}`) },
          ...(SNAPCHAT_WINDOW_GOALS.includes(goal)
            ? [
                {
                  label: t("optimization.window"),
                  value: t(`optimization.windows.${draft.conversionWindow}`),
                },
              ]
            : []),
          ...(draft.campaignDailyCap
            ? [
                {
                  label: t("advanced.dailyCap"),
                  value: `${draft.campaignDailyCap} ${currencyLabel}`,
                },
              ]
            : []),
          ...(draft.campaignLifetimeCap
            ? [
                {
                  label: t("advanced.lifetimeCap"),
                  value: `${draft.campaignLifetimeCap} ${currencyLabel}`,
                },
              ]
            : []),
          {
            label: t("advanced.bidStrategy"),
            value:
              draft.bidStrategy === "auto"
                ? t("advanced.bidStrategies.auto")
                : `${t(`advanced.bidStrategies.${draft.bidStrategy}`)} · ${draft.bidAmount} ${currencyLabel}`,
          },
        ]
      : []),
    {
      label: t("review.budget"),
      value: lifetime
        ? t("review.lifetimeBudgetValue", {
            amount: groups.reduce((sum, group) => sum + (Number(group.lifetimeBudget) || 0), 0),
            currency: currencyLabel,
          })
        : t("review.budgetValue", {
            amount: groups.length > 1 ? totalBudget : draft.dailyBudget,
            currency: currencyLabel,
          }),
    },
    ...(groups.length > 1
      ? [
          {
            label: t("review.adGroups"),
            value: groups.map((group, index) => groupLabel(group, index)).join("، "),
          },
        ]
      : []),
    ...(ads.length > 1 || groups.length > 1
      ? [
          {
            label: t("review.ads"),
            value: t("review.adsValue", {
              ads: ads.length,
              groups: groups.length,
              total: ads.length * groups.length,
            }),
          },
        ]
      : []),
    {
      label: t("review.dates"),
      value: draft.endDate
        ? t("review.datesRange", { start: draft.startDate, end: draft.endDate })
        : t("review.datesOpen", { start: draft.startDate }),
    },
    {
      label: t("review.audience"),
      value: isGoogle
        ? t(`countries.${draft.countryCode}`)
        : `${t(`countries.${draft.countryCode}`)}${
            isSnapchat && draft.regionIds.length > 0
              ? ` (${t("places.regionsCount", { count: draft.regionIds.length })})`
              : isSnapchat && draft.cityKeys.length > 0
                ? ` (${t("places.citiesCount", { count: draft.cityKeys.length })})`
                : ""
          } · ${ageLabel} · ${t(`audience.genders.${draft.gender}`)}${
            isSnapchat && draft.languages.length > 0
              ? ` · ${t("audiences.languagesCount", { count: draft.languages.length })}`
              : ""
          }${
            isSnapchat && draft.interestIds.length > 0
              ? ` · ${t("audiences.interestsCount", { count: draft.interestIds.length })}`
              : ""
          }`,
    },
    { label: t("review.headline"), value: isGoogle ? draft.headlines[0] : draft.headline },
    ...(isGoogle ? [{ label: t("review.keywords"), value: keywords.join("، ") }] : []),
    ...(isApp
      ? [
          { label: t("review.app"), value: draft.appName },
          { label: t("review.url"), value: appStoreUrl },
        ]
      : [{ label: t("review.url"), value: draft.url }]),
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
                {PUBLISH_PLATFORMS.map((platform) => {
                  // A platform with no connected account cannot be chosen, and says why.
                  const connected = options[platform].accounts.length > 0
                  return (
                    <Choice
                      key={platform}
                      selected={draft.platform === platform}
                      disabled={!connected}
                      onClick={() => choosePlatform(platform)}
                      icon={
                        <PlatformBadge platform={PLATFORM_BADGE[platform]} className="size-10" />
                      }
                      title={t(`platforms.${platform}`)}
                      description={connected ? t(`platforms.${platform}Hint`) : undefined}
                      badge={
                        connected
                          ? undefined
                          : platform === "meta" && options.meta.needsPermission
                            ? t("platforms.needsPermission")
                            : t("platforms.notConnected")
                      }
                    />
                  )
                })}
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

            <Field
              label={t("basics.objective")}
              hint={isSnapchat ? t("basics.objectiveHint") : undefined}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(isSnapchat ? SNAPCHAT_OBJECTIVES : (["traffic", "leads"] as const)).map(
                  (entry) => {
                    const look = OBJECTIVE_LOOK[entry]
                    return (
                      <Choice
                        key={entry}
                        selected={objective === entry}
                        onClick={() => chooseObjective(entry)}
                        icon={
                          <span
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-xl",
                              look.className
                            )}
                          >
                            <look.icon className="size-5" />
                          </span>
                        }
                        title={t(`objectives.${entry}.title`)}
                        description={t(`objectives.${entry}.hint`)}
                        note={
                          !isSnapchat
                            ? undefined
                            : entry === "app"
                              ? t("objectives.formatApp")
                              : t("objectives.format")
                        }
                      />
                    )
                  }
                )}
              </div>
            </Field>

            {isApp ? (
              <div className="space-y-5 rounded-xl border border-[#e1e7f0] bg-[#f7f9fd] p-4">
                <div>
                  <p className={cn("text-[13px] font-bold", HEADING)}>{t("app.title")}</p>
                  <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("app.note")}</p>
                </div>
                <Field label={t("app.name")} error={errors.appName}>
                  <AppInput
                    className={FIELD}
                    maxLength={APP_NAME_MAX}
                    value={draft.appName}
                    onChange={(event) => set("appName", event.target.value)}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t("app.iosId")} hint={t("app.iosIdHint")} error={errors.appIosId}>
                    <AppInput
                      className={cn(FIELD, "text-start")}
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="1234567890"
                      value={draft.appIosId}
                      onChange={(event) => set("appIosId", event.target.value)}
                    />
                  </Field>
                  <Field
                    label={t("app.androidPackage")}
                    hint={t("app.androidPackageHint")}
                    error={errors.appAndroidPackage}
                  >
                    <AppInput
                      className={cn(FIELD, "text-start")}
                      dir="ltr"
                      placeholder="com.example.app"
                      value={draft.appAndroidPackage}
                      onChange={(event) => set("appAndroidPackage", event.target.value)}
                    />
                  </Field>
                </div>
                <Field label={t("app.icon")} hint={t("app.iconHint")} error={errors.appIconId}>
                  <input
                    ref={iconInput}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(event) => {
                      void uploadIcon(event.target.files)
                      event.target.value = ""
                    }}
                  />
                  <div className="flex items-center gap-3">
                    {appIcon ? (
                      <CreativeThumb
                        creative={appIcon}
                        className="size-16 shrink-0 overflow-hidden rounded-2xl border border-[#e1e7f0]"
                      />
                    ) : null}
                    <button
                      type="button"
                      disabled={iconProgress !== null}
                      onClick={() => iconInput.current?.click()}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-dashed border-[#cfd8e6] bg-white px-4 text-[13px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60 disabled:opacity-60"
                    >
                      {iconProgress ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ImagePlus className="size-4" />
                      )}
                      {appIcon ? t("app.iconChange") : t("app.iconUpload")}
                    </button>
                  </div>
                </Field>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {isSnapchat ? (
              <div className="space-y-3 rounded-xl border border-[#e1e7f0] bg-[#f7f9fd] p-4">
                <p className={cn("text-[13px] font-bold", HEADING)}>{t("slots.groupsTitle")}</p>
                <SlotTabs
                  labels={groups.map((group, index) => groupLabel(group, index))}
                  at={groupAt}
                  onPick={(index) => {
                    setErrors({})
                    showGroup(index)
                  }}
                  onAdd={addGroup}
                  onRemove={removeGroup}
                  addLabel={t("slots.addGroup")}
                  removeLabel={(label) => t("slots.remove", { name: label })}
                />
                <p className={cn("text-[12px] leading-5", MUTED)}>{t("slots.groupsNote")}</p>
                {groups.length > 1 ? (
                  <Field label={t("slots.groupName")} error={errors.groupName}>
                    <AppInput
                      className={FIELD}
                      maxLength={120}
                      value={draft.groupName}
                      onChange={(event) => set("groupName", event.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {isSnapchat ? (
              <div className="flex flex-wrap gap-2">
                {(["daily", "lifetime"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={draft.budgetKind === kind}
                    onClick={() => set("budgetKind", kind)}
                    className={cn(
                      "inline-flex h-11 items-center justify-center rounded-xl border-2 px-4 text-[13px] font-bold transition-colors",
                      draft.budgetKind === kind
                        ? "border-[#1d4fd8] bg-[#f3f7ff] text-[#1d4fd8]"
                        : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/40"
                    )}
                  >
                    {t(`audience.budgetKinds.${kind}`)}
                  </button>
                ))}
              </div>
            ) : null}

            <Field
              label={lifetime ? t("audience.lifetimeBudget") : t("audience.budget")}
              hint={
                lifetime
                  ? runDays > 0 && lifetimeBudget > 0
                    ? t("audience.lifetimeBudgetHint", {
                        days: runDays,
                        day: Math.round(budget),
                        currency: currencyLabel,
                      })
                    : t("audience.lifetimeBudgetNeedsEnd")
                  : Number.isFinite(budget) && budget > 0
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
                  min={minimumBudget}
                  value={lifetime ? draft.lifetimeBudget : draft.dailyBudget}
                  onChange={(event) =>
                    set(lifetime ? "lifetimeBudget" : "dailyBudget", event.target.value)
                  }
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
                // Another country has its own regions and cities.
                (value) =>
                  setDraft((current) => ({
                    ...current,
                    countryCode: value,
                    regionIds: [],
                    cityKeys: [],
                    interestIds: [],
                    groups: current.groups.map((group) => ({
                      ...group,
                      regionIds: [],
                      cityKeys: [],
                      interestIds: [],
                    })),
                  })),
                (limits?.countries ?? ["sa"]).map((code) => ({
                  value: code,
                  label: t(`countries.${code}`),
                }))
              )}
            </Field>

            {isSnapchat && account ? (
              <Field label={t("places.label")}>
                <CampaignLocationPicker
                  // Its own state (which way is open) belongs to the ad group being worked on.
                  key={`${account.connectionId}:${draft.countryCode}:${groupAt}`}
                  connectionId={account.connectionId}
                  countryCode={draft.countryCode}
                  value={{ regionIds: draft.regionIds, cityKeys: draft.cityKeys }}
                  onChange={(places) => setDraft((current) => ({ ...current, ...places }))}
                />
              </Field>
            ) : null}

            {isSnapchat && account ? (
              <CampaignAudiencePicker
                key={`audience:${account.connectionId}:${draft.countryCode}`}
                connectionId={account.connectionId}
                countryCode={draft.countryCode}
                value={{ languages: draft.languages, interestIds: draft.interestIds }}
                onChange={(audience) => setDraft((current) => ({ ...current, ...audience }))}
              />
            ) : null}

            {isSnapchat ? (
              <CampaignDevicePicker
                value={{
                  deviceSystem: draft.deviceSystem,
                  deviceConnection: draft.deviceConnection,
                }}
                onChange={(devices) => setDraft((current) => ({ ...current, ...devices }))}
              />
            ) : null}

            {isGoogle ? (
              <p className="rounded-xl border border-[#e1e7f0] bg-[#f7f9fd] px-4 py-3 text-[12.5px] leading-6 text-[#475467]">
                {t("audience.googleNote")}
              </p>
            ) : null}

            <div className={cn("grid gap-5 sm:grid-cols-2", isGoogle && "hidden")}>
              <Field label={t("audience.minAge")}>
                {selectField(
                  String(draft.minAge),
                  (value) => {
                    const minAge = Number(value)
                    setDraft((current) => ({
                      ...current,
                      minAge,
                      maxAge:
                        current.maxAge !== NO_MAX_AGE && Number(current.maxAge) <= minAge
                          ? NO_MAX_AGE
                          : current.maxAge,
                    }))
                    setErrors((current) => ({ ...current, maxAge: undefined }))
                  },
                  agesBetween(YOUNGEST_AGE, AGE_LIMITS.minTop).map((age) => ({
                    value: String(age),
                    label: String(age),
                  }))
                )}
              </Field>
              <Field label={t("audience.maxAge")} error={errors.maxAge}>
                {selectField(draft.maxAge, (value) => set("maxAge", value), [
                  { value: NO_MAX_AGE, label: t("audience.noMaxAge") },
                  // Only ages above the youngest one chosen.
                  ...agesBetween(draft.minAge + 1, AGE_LIMITS.maxTop).map((age) => ({
                    value: String(age),
                    label: String(age),
                  })),
                ])}
              </Field>
            </div>

            {snapchatAges ? (
              <p className="rounded-xl border border-[#fedf89] bg-[#fffaeb] px-4 py-3 text-[12.5px] leading-6 text-[#93370d]">
                {t("audience.snapchatAgeNote", { ages: ageLabel })}
              </p>
            ) : null}

            <div className={isGoogle ? "hidden" : undefined}>
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
            </div>

            {isSnapchat ? (
              <>
                <div className="space-y-5 rounded-xl border border-[#e1e7f0] bg-white p-4">
                  <div>
                    <p className={cn("text-[14px] font-bold", HEADING)}>
                      {t("optimization.title")}
                    </p>
                    <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>
                      {t("optimization.hint")}
                    </p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={t("audience.goal")}
                      hint={
                        goal.startsWith("APP_")
                          ? t("audience.goalHintInstalls")
                          : t("audience.goalHint")
                      }
                    >
                      {selectField(
                        goal,
                        (value) => set("goal", value as SnapchatGoal),
                        goals.map((entry) => ({ value: entry, label: t(`goals.${entry}`) }))
                      )}
                    </Field>
                    <Field
                      label={t("optimization.window")}
                      hint={
                        SNAPCHAT_WINDOW_GOALS.includes(goal)
                          ? t("optimization.windowHint")
                          : t("optimization.windowFixed")
                      }
                    >
                      {SNAPCHAT_WINDOW_GOALS.includes(goal) ? (
                        selectField(
                          draft.conversionWindow,
                          (value) => set("conversionWindow", value as SnapchatConversionWindow),
                          SNAPCHAT_WINDOWS.map((entry) => ({
                            value: entry,
                            label: t(`optimization.windows.${entry}`),
                          }))
                        )
                      ) : (
                        <p
                          className={cn("flex h-12 items-center text-[14px] font-semibold", MUTED)}
                        >
                          {t("optimization.windows.SWIPE_28DAY_VIEW_1DAY")}
                        </p>
                      )}
                    </Field>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={t("advanced.bidStrategy")}
                      hint={t(`advanced.bidStrategyHints.${draft.bidStrategy}`)}
                      error={errors.bidStrategy}
                    >
                      {selectField(
                        draft.bidStrategy,
                        (value) => set("bidStrategy", value as SnapchatBidStrategy),
                        (["auto", "target_cost", "max_bid"] as const).map((entry) => ({
                          value: entry,
                          label: t(`advanced.bidStrategies.${entry}`),
                        }))
                      )}
                    </Field>
                    {draft.bidStrategy === "auto" ? null : (
                      <Field
                        label={
                          draft.bidStrategy === "target_cost"
                            ? t("optimization.targetCost", { goal: t(`goals.${goal}`) })
                            : t("advanced.bidAmount")
                        }
                        error={errors.bidAmount}
                      >
                        <div className="relative">
                          <AppInput
                            className={cn(FIELD, "pe-16")}
                            type="number"
                            inputMode="decimal"
                            placeholder={t("advanced.none")}
                            value={draft.bidAmount}
                            onChange={(event) => set("bidAmount", event.target.value)}
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
                    )}
                  </div>
                </div>

                <div className="space-y-5 rounded-xl border border-[#e1e7f0] bg-[#fafbfe] p-4">
                  <div>
                    <p className={cn("text-[14px] font-bold", HEADING)}>{t("advanced.title")}</p>
                    <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("advanced.hint")}</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={t("advanced.dailyCap")}
                      hint={t("advanced.dailyCapHint")}
                      error={errors.campaignDailyCap}
                    >
                      <div className="relative">
                        <AppInput
                          className={cn(FIELD, "pe-16")}
                          type="number"
                          inputMode="decimal"
                          placeholder={t("advanced.none")}
                          value={draft.campaignDailyCap}
                          onChange={(event) => set("campaignDailyCap", event.target.value)}
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
                    <Field
                      label={t("advanced.lifetimeCap")}
                      hint={t("advanced.lifetimeCapHint")}
                      error={errors.campaignLifetimeCap}
                    >
                      <div className="relative">
                        <AppInput
                          className={cn(FIELD, "pe-16")}
                          type="number"
                          inputMode="decimal"
                          placeholder={t("advanced.none")}
                          value={draft.campaignLifetimeCap}
                          onChange={(event) => set("campaignLifetimeCap", event.target.value)}
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
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {step === 2 && isGoogle ? (
          <div className="space-y-6">
            <Field label={t("ad.headlines")} hint={t("ad.headlinesHint")} error={errors.headlines}>
              <div className="space-y-2.5">
                {draft.headlines.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <AppInput
                      className={FIELD}
                      maxLength={limits?.googleHeadlineMax ?? 30}
                      placeholder={t("ad.headlineNumber", { number: index + 1 })}
                      value={value}
                      onChange={(event) =>
                        set(
                          "headlines",
                          draft.headlines.map((entry, at) =>
                            at === index ? event.target.value : entry
                          )
                        )
                      }
                    />
                    {draft.headlines.length > 3 ? (
                      <button
                        type="button"
                        aria-label={t("ad.removeLine")}
                        title={t("ad.removeLine")}
                        onClick={() =>
                          set(
                            "headlines",
                            draft.headlines.filter((_, at) => at !== index)
                          )
                        }
                        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[#b42318] hover:bg-[#fef3f2]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {draft.headlines.length < MAX_GOOGLE_HEADLINES ? (
                  <button
                    type="button"
                    onClick={() => set("headlines", [...draft.headlines, ""])}
                    className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-dashed border-[#cfd8e6] px-4 text-[13px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60"
                  >
                    <Plus className="size-4" />
                    {t("ad.addHeadline")}
                  </button>
                ) : null}
              </div>
            </Field>

            <Field
              label={t("ad.descriptions")}
              hint={t("ad.descriptionsHint")}
              error={errors.descriptions}
            >
              <div className="space-y-2.5">
                {draft.descriptions.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <AppInput
                      className={FIELD}
                      maxLength={limits?.googleDescriptionMax ?? 90}
                      placeholder={t("ad.descriptionNumber", { number: index + 1 })}
                      value={value}
                      onChange={(event) =>
                        set(
                          "descriptions",
                          draft.descriptions.map((entry, at) =>
                            at === index ? event.target.value : entry
                          )
                        )
                      }
                    />
                    {draft.descriptions.length > 2 ? (
                      <button
                        type="button"
                        aria-label={t("ad.removeLine")}
                        title={t("ad.removeLine")}
                        onClick={() =>
                          set(
                            "descriptions",
                            draft.descriptions.filter((_, at) => at !== index)
                          )
                        }
                        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[#b42318] hover:bg-[#fef3f2]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {draft.descriptions.length < MAX_GOOGLE_DESCRIPTIONS ? (
                  <button
                    type="button"
                    onClick={() => set("descriptions", [...draft.descriptions, ""])}
                    className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-dashed border-[#cfd8e6] px-4 text-[13px] font-bold text-[#1d4fd8] hover:border-[#1d4fd8]/60"
                  >
                    <Plus className="size-4" />
                    {t("ad.addDescription")}
                  </button>
                ) : null}
              </div>
            </Field>

            <Field
              label={t("ad.keywords")}
              hint={t("ad.keywordsHint")}
              error={errors.keywords}
              counter={`${keywords.length}/${MAX_KEYWORDS}`}
            >
              <textarea
                rows={5}
                className="w-full rounded-xl border border-[#d5dce8] bg-white px-4 py-3 text-[14px] font-medium leading-7 text-[#0b1738] outline-none placeholder:text-[#98a2b3] focus:border-[#1d4fd8]"
                placeholder={t("ad.keywordsPlaceholder")}
                value={draft.keywords}
                onChange={(event) => set("keywords", event.target.value)}
              />
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

            <CampaignTrackingFields
              platform={draft.platform}
              url={draft.url}
              defaults={{ campaign: draft.name }}
              edits={draft.tracking}
              onChange={(tracking) => set("tracking", tracking)}
            />

            {/* The ad roughly as a Google search result shows it. */}
            <div>
              <p className={cn("mb-2 text-[12px] font-bold", MUTED)}>{t("ad.preview")}</p>
              <div className="rounded-xl border border-[#e1e7f0] bg-white p-4 text-start">
                <p dir="ltr" className="truncate text-end text-[12px] text-[#475467]">
                  {draft.url
                    .trim()
                    .replace(/^https:\/\//i, "")
                    .split(/[/?#]/)[0] || "example.com"}
                </p>
                <p className="mt-1 text-[16px] font-bold leading-7 text-[#1a0dab]">
                  {draft.headlines.filter((entry) => entry.trim()).join(" | ") ||
                    t("ad.headlinePlaceholder")}
                </p>
                <p className="mt-1 text-[13px] leading-6 text-[#475467]">
                  {draft.descriptions.filter((entry) => entry.trim()).join(" ")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 && !isGoogle ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-6">
              {isSnapchat ? (
                <div className="space-y-3 rounded-xl border border-[#e1e7f0] bg-[#f7f9fd] p-4">
                  <p className={cn("text-[13px] font-bold", HEADING)}>{t("slots.adsTitle")}</p>
                  <SlotTabs
                    labels={ads.map((ad, index) => adLabel(ad, index))}
                    at={adAt}
                    onPick={(index) => {
                      setErrors({})
                      showAd(index)
                    }}
                    onAdd={addAd}
                    onRemove={removeAd}
                    addLabel={t("slots.addAd")}
                    removeLabel={(label) => t("slots.remove", { name: label })}
                  />
                  <p className={cn("text-[12px] leading-5", MUTED)}>
                    {groups.length > 1
                      ? t("slots.adsNoteGroups", { groups: groups.length })
                      : t("slots.adsNote")}
                  </p>
                  {ads.length > 1 ? (
                    <Field label={t("slots.adName")} error={errors.adName}>
                      <AppInput
                        className={FIELD}
                        maxLength={120}
                        value={draft.adName}
                        onChange={(event) => set("adName", event.target.value)}
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
              <Field
                label={t("ad.creative")}
                hint={t(`ad.creativeHints.${shownPlatform}`)}
                error={errors.creativeId}
              >
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
                    const unfit = problemOf(entry) !== null
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
                {creative && draft.platform === "snapchat" ? (
                  <div className="mt-2.5">
                    <SnapchatFitBadge creative={creative} />
                  </div>
                ) : null}
                {creative && draft.platform !== "snapchat" ? (
                  <span
                    className={cn(
                      "mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      problemOf(creative)
                        ? "bg-[#fff4e5] text-[#b54708]"
                        : "bg-[#e7f8ee] text-[#137a41]"
                    )}
                  >
                    {problemOf(creative) ? (
                      <TriangleAlert className="size-3" />
                    ) : (
                      <CheckCircle2 className="size-3" />
                    )}
                    {t(`ad.fit.${problemOf(creative) ?? "ok"}`)}
                  </span>
                ) : null}
              </Field>

              {draft.platform === "meta" ? (
                <Field
                  label={t("ad.text")}
                  hint={t("ad.textHint")}
                  error={errors.text}
                  counter={`${draft.text.length}/${limits?.metaTextMax ?? 125}`}
                >
                  <AppInput
                    className={FIELD}
                    maxLength={limits?.metaTextMax ?? 125}
                    placeholder={t("ad.textPlaceholder")}
                    value={draft.text}
                    onChange={(event) => set("text", event.target.value)}
                  />
                </Field>
              ) : (
                <Field
                  label={t("ad.brandName")}
                  hint={t(
                    draft.platform === "tiktok" ? "ad.brandNameHintTiktok" : "ad.brandNameHint"
                  )}
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
              )}

              <Field
                label={t(draft.platform === "tiktok" ? "ad.tiktokText" : "ad.headline")}
                hint={t(draft.platform === "tiktok" ? "ad.tiktokTextHint" : "ad.headlineHint")}
                error={errors.headline}
                counter={`${draft.headline.length}/${headlineMax}`}
              >
                <AppInput
                  className={FIELD}
                  maxLength={headlineMax}
                  placeholder={t("ad.headlinePlaceholder")}
                  value={draft.headline}
                  onChange={(event) => set("headline", event.target.value)}
                />
              </Field>

              <Field label={t("ad.callToAction")}>
                {selectField(
                  draft.callToAction,
                  (value) => set("callToAction", value as AnyCallToAction),
                  callsToActionFor(draft.platform, objective).map((value) => ({
                    value,
                    label: t(`callsToAction.${value}`),
                  }))
                )}
              </Field>

              {isApp ? (
                <p className="rounded-xl border border-[#e1e7f0] bg-[#f7f9fd] px-4 py-3 text-[12.5px] leading-6 text-[#475467]">
                  {t("app.adNote", { name: draft.appName })}
                </p>
              ) : (
                <>
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

                  <CampaignTrackingFields
                    platform={draft.platform}
                    url={draft.url}
                    defaults={{ campaign: draft.name }}
                    edits={draft.tracking}
                    onChange={(tracking) => set("tracking", tracking)}
                  />
                </>
              )}
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
            <div
              className={cn(
                "grid gap-5",
                creative && !isGoogle && "sm:grid-cols-[140px_minmax(0,1fr)]"
              )}
            >
              {creative && !isGoogle ? (
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
                    // Every ad group together, and a whole-run budget as what it comes to a day.
                    amount: Math.round(totalBudget),
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
