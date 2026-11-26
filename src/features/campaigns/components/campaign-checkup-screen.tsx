"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { subDays } from "date-fns"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  Info,
  MessageCircleQuestion,
  RefreshCw,
  ThumbsUp,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { toLocalDay } from "@/lib/local-day"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDateRangeFilter } from "@/components/app"

import {
  type CampaignCheckup,
  type CampaignCheckupAd,
  type CampaignCheckupAdStage,
  type CampaignCheckupAverages,
  type CampaignCheckupCampaign,
  type CampaignCheckupChange,
  type CampaignCheckupFinding,
  campaignPerformanceService,
} from "../services/campaign-performance.service"
import { CampaignModuleNav } from "./campaign-module-nav"
import { ariaSort, SortHeading, sortRows, useTableSort } from "./campaign-table-sort"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

// Same visual tokens as campaign-journey-screen.tsx in this feature.
const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

type CheckupTranslator = ReturnType<typeof useTranslations<"campaigns.checkupScreen">>

function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function formatNumber(value: number, locale: Locale, digits = 0) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: digits }).format(
    value
  )
}

// Money in the campaign's own currency, never converted: a campaign billed in dollars reads in
// dollars.
function formatMoney(value: number, currency: string | null, locale: Locale) {
  const amount = formatNumber(value, locale, value < 100 ? 2 : 0)
  if (!currency) return amount
  if (currency === "SAR") return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
  return locale === "ar" ? `${amount} ${currency}` : `${currency} ${amount}`
}

const STATE_PILL: Record<CampaignCheckupCampaign["state"], string> = {
  running: "bg-[#e9f8ef] text-[#1f9d55]",
  problem: "bg-[#fdeeee] text-[#e0484d]",
  paused: "bg-[#fff7e6] text-[#e08b00]",
  other: "bg-[#eef2f8] text-[#5b6b85]",
}

const KNOWN_PROBLEMS = new Set(["under_review", "rejected", "not_delivering", "pending", "limited"])

function stateLabel(campaign: { state: string; status: string }, t: CheckupTranslator) {
  const status = campaign.status.toLowerCase()
  if (campaign.state === "problem" && KNOWN_PROBLEMS.has(status)) {
    return t(`state.${status}` as "state.under_review")
  }
  return t(`state.${campaign.state}` as "state.running")
}

// A finding's sentence and its advice, written from the numbers the check-up sent with it.
function findingText(finding: CampaignCheckupFinding, t: CheckupTranslator, locale: Locale) {
  const v = finding.values
  const money = (key: string) => formatMoney(Number(v[key] ?? 0), finding.currency, locale)
  const count = (key: string, digits = 0) => formatNumber(Number(v[key] ?? 0), locale, digits)
  const ad = finding.adName ?? ""
  const title = t(`finding.${finding.kind}.title` as "finding.low_ctr.title")

  switch (finding.kind) {
    case "budget_hog": {
      const basis = String(v.basis) as "no_result" | "cost" | "ctr"
      return {
        title,
        body: t(`finding.budget_hog.${basis}` as "finding.budget_hog.cost", {
          ad,
          share: count("share"),
          spend: money("spend"),
          adCpa: money("adCpa"),
          othersCpa: money("othersCpa"),
          adCtr: count("adCtr", 2),
          othersCtr: count("othersCtr", 2),
        }),
        advice: t("finding.budget_hog.advice"),
      }
    }
    case "spend_no_result":
      return {
        title,
        body: t("finding.spend_no_result.body", {
          ad,
          spend: money("spend"),
          usualCpa: money("usualCpa"),
        }),
        advice: t("finding.spend_no_result.advice"),
      }
    case "clicks_no_result": {
      const reason = String(v.reason) as "page_drop" | "no_signup" | "unknown"
      return {
        title,
        body: t(`finding.clicks_no_result.${reason}` as "finding.clicks_no_result.unknown", {
          clicks: count("clicks"),
          pageViews: count("pageViews"),
          spend: money("spend"),
        }),
        advice: t(
          `finding.clicks_no_result.advice_${reason}` as "finding.clicks_no_result.advice_unknown"
        ),
      }
    }
    case "low_ctr":
      return {
        title,
        body: t("finding.low_ctr.body", {
          ad,
          adCtr: count("adCtr", 2),
          othersCtr: count("othersCtr", 2),
        }),
        advice: t("finding.low_ctr.advice"),
      }
    case "budget_reached":
      return {
        title,
        body: t("finding.budget_reached.body", {
          spendToday: money("spendToday"),
          dailyBudget: money("dailyBudget"),
        }),
        advice: t("finding.budget_reached.advice"),
      }
    case "budget_unspent":
      return {
        title,
        body: t("finding.budget_unspent.body", {
          spendYesterday: money("spendYesterday"),
          dailyBudget: money("dailyBudget"),
        }),
        advice: t("finding.budget_unspent.advice"),
      }
    case "not_delivering":
      return {
        title,
        body: t("finding.not_delivering.body", {
          status: stateLabel({ state: "problem", status: String(v.status) }, t),
        }),
        advice: t("finding.not_delivering.advice"),
      }
    case "edit_in_learning": {
      const fields = String(v.fields ?? "")
        .split(",")
        .filter(Boolean)
        .map((field) => t(`field.${field}` as "field.bid"))
        .join("، ")
      return {
        title,
        body: t(
          v.source === "platform"
            ? "finding.edit_in_learning.body_platform"
            : "finding.edit_in_learning.body_estimate",
          { entity: entityName(finding, t), fields }
        ),
        advice: t("finding.edit_in_learning.advice"),
      }
    }
    case "too_many_edits":
      return {
        title,
        body: t("finding.too_many_edits.body", {
          entity: entityName(finding, t),
          edits: count("edits"),
        }),
        advice: t("finding.too_many_edits.advice"),
      }
    case "big_budget_jump": {
      const percent = Number(v.percent ?? 0)
      return {
        title,
        body: t("finding.big_budget_jump.body", {
          entity: entityName(finding, t),
          oldValue: money("oldValue"),
          newValue: money("newValue"),
          percent: `${percent > 0 ? "+" : ""}${formatNumber(percent, locale)}`,
        }),
        advice: t("finding.big_budget_jump.advice"),
      }
    }
    case "bid_churn":
      return {
        title,
        body: t("finding.bid_churn.body", {
          entity: entityName(finding, t),
          edits: count("edits"),
        }),
        advice: t("finding.bid_churn.advice"),
      }
    case "on_off_flapping":
      return {
        title,
        body: t("finding.on_off_flapping.body", {
          entity: entityName(finding, t),
          switches: count("switches"),
        }),
        advice: t("finding.on_off_flapping.advice"),
      }
    case "ad_wait": {
      const parts = [t("finding.ad_wait.body", { ad, spend: money("spend") })]
      if (v.spendToJudge !== null && v.spendToJudge !== undefined && Number(v.spendToJudge) > 0) {
        parts.push(t("finding.ad_wait.needSpend", { amount: money("spendToJudge") }))
      }
      if (v.daysToJudge !== null && v.daysToJudge !== undefined && Number(v.daysToJudge) > 0) {
        parts.push(t("finding.ad_wait.needDays", { days: count("daysToJudge") }))
      }
      if (parts.length === 1) parts.push(t("finding.ad_wait.needMore"))
      if (v.othersCtr !== null && v.othersCtr !== undefined && Number(v.othersCtr) > 0) {
        parts.push(
          t(
            Number(v.adCtr) >= Number(v.othersCtr)
              ? "finding.ad_wait.signalUp"
              : "finding.ad_wait.signalDown",
            { adCtr: count("adCtr", 2), othersCtr: count("othersCtr", 2) }
          )
        )
      }
      return { title, body: parts.join(" "), advice: t("finding.ad_wait.advice") }
    }
    case "ad_promising":
      return {
        title,
        body:
          v.adCpa !== null && v.othersCpa !== null && Number(v.adCpa) > 0
            ? t("finding.ad_promising.body_cpa", {
                ad,
                adCpa: money("adCpa"),
                othersCpa: money("othersCpa"),
              })
            : t("finding.ad_promising.body_ctr", {
                ad,
                adCtr: count("adCtr", 2),
                othersCtr: count("othersCtr", 2),
              }),
        advice: t("finding.ad_promising.advice"),
      }
    case "ad_winning":
      return {
        title,
        body: t("finding.ad_winning.body", {
          ad,
          adCpa: money("adCpa"),
          othersCpa: money("othersCpa"),
          conversions: count("conversions", 1),
        }),
        advice: t("finding.ad_winning.advice"),
      }
    case "ad_tired": {
      const ctrFell =
        v.earlyCtr !== null &&
        v.recentCtr !== null &&
        Number(v.recentCtr) < Number(v.earlyCtr) * 0.8
      return {
        title,
        body: ctrFell
          ? t("finding.ad_tired.body_ctr", {
              ad,
              earlyCtr: count("earlyCtr", 2),
              recentCtr: count("recentCtr", 2),
            })
          : t("finding.ad_tired.body_cpa", {
              ad,
              earlyCpa: money("earlyCpa"),
              recentCpa: v.recentCpa === null ? t("change.noResults") : money("recentCpa"),
            }),
        advice: t("finding.ad_tired.advice"),
      }
    }
    case "ad_costly": {
      const body =
        v.adCpa === null
          ? t("finding.ad_costly.body_none", { ad, spend: money("spend") })
          : t("finding.ad_costly.body", {
              ad,
              adCpa: money("adCpa"),
              othersCpa: money("othersCpa"),
            })
      const diagnosis =
        v.diagnosis === "page" || v.diagnosis === "creative"
          ? ` ${t(`diagnosis.${v.diagnosis}` as "diagnosis.page")}`
          : ""
      return { title, body: `${body}${diagnosis}`, advice: t("finding.ad_costly.advice") }
    }
  }
}

// "Ad set «…»" or "Campaign «…»" for a note about how the account is managed.
function entityName(finding: CampaignCheckupFinding, t: CheckupTranslator) {
  return finding.values.level === "adset" && finding.adName
    ? t("entity.adset", { name: finding.adName })
    : t("entity.campaign", { name: finding.campaignName })
}

const STAGE_PILL: Record<CampaignCheckupAdStage, string> = {
  too_early: "bg-[#eef4ff] text-[#1d4fd8]",
  promising: "bg-[#e9f8ef] text-[#1f9d55]",
  winning: "bg-[#dcf5e6] text-[#137a3f]",
  steady: "bg-[#eef2f8] text-[#5b6b85]",
  tired: "bg-[#fff1cf] text-[#b36b00]",
  not_working: "bg-[#fdeeee] text-[#e0484d]",
}

// The look of a note by how much it asks of the merchant.
const SEVERITY_LOOK: Record<
  CampaignCheckupFinding["severity"],
  { card: string; icon: string; pill: string; Icon: typeof AlertTriangle }
> = {
  high: {
    card: "border-[#f6caca] bg-[#fff8f8]",
    icon: "text-[#e0484d]",
    pill: "bg-[#fdeeee] text-[#e0484d]",
    Icon: AlertTriangle,
  },
  medium: {
    card: "border-[#f3e2b8] bg-[#fffcf3]",
    icon: "text-[#e08b00]",
    pill: "bg-[#fff1cf] text-[#b36b00]",
    Icon: AlertTriangle,
  },
  info: {
    card: "border-[#cfdcf5] bg-[#f6f9ff]",
    icon: "text-[#1d4fd8]",
    pill: "bg-[#eef4ff] text-[#1d4fd8]",
    Icon: Hourglass,
  },
  good: {
    card: "border-[#c6ebd4] bg-[#f5fcf8]",
    icon: "text-[#1f9d55]",
    pill: "bg-[#e9f8ef] text-[#1f9d55]",
    Icon: ThumbsUp,
  },
}

// One setting's change in words: "Daily budget 50 → 100 (+100%)".
function changeText(change: CampaignCheckupChange, t: CheckupTranslator, locale: Locale) {
  const label = t(`field.${change.field}` as "field.bid")
  if (change.field === "status") {
    return `${label}: ${change.newValue === "on" ? t("change.on") : t("change.off")}`
  }
  if (change.field === "targeting") return t("change.targeting")
  const amount = (value: string | null) =>
    change.field === "bidStrategy" || change.field === "optimization"
      ? (value ?? "—")
      : formatMoney(Number(value ?? 0), change.currency, locale)
  const sign = locale === "ar" ? "٪" : "%"
  const arrow = locale === "ar" ? "←" : "→"
  const percent =
    change.changePercent === null
      ? ""
      : ` (${change.changePercent > 0 ? "+" : ""}${formatNumber(change.changePercent, locale)}${sign})`
  return `${label}: ${amount(change.oldValue)} ${arrow} ${amount(change.newValue)}${percent}`
}

function formatWhen(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(numberLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso))
}

function FunnelStep(props: { label: string; value: string; note?: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 rounded-[12px] border border-[#e1e7f0] bg-[#f8fafd] px-4 py-3.5",
        props.last && "border-[#bcd3ff] bg-[#eef4ff]"
      )}
    >
      <p className={cn("text-[11.5px]", MUTED)}>{props.label}</p>
      <p className={cn("mt-1 text-[22px] font-extrabold tabular-nums", HEADING)}>{props.value}</p>
      <p className={cn("mt-0.5 min-h-[16px] text-[11px]", MUTED)}>{props.note ?? ""}</p>
    </div>
  )
}

// The ad account check-up (GET /v1/campaigns/performance/checkup): what a media buyer reads off
// an ad account, laid out for a merchant who is not one -- is each campaign running, where people
// drop between the ad and a result, and which ad or campaign needs a decision, with the numbers.
// The ads table's columns, and what an ad holds for each (nothing where the number means
// nothing: page views a platform does not report, the cost of a result when there was none).
type AdColumn =
  | "ad"
  | "stage"
  | "spend"
  | "share"
  | "impressions"
  | "clicks"
  | "ctr"
  | "pageViews"
  | "results"
  | "cpa"
// Stages in the order a merchant reads them: what to act on first.
const STAGE_ORDER: Record<CampaignCheckupAdStage, number> = {
  not_working: 0,
  tired: 1,
  too_early: 2,
  promising: 3,
  steady: 4,
  winning: 5,
}

function adValue(ad: CampaignCheckup["ads"][number], column: AdColumn) {
  if (column === "ad") return ad.name
  if (column === "stage") return ad.stage === null ? null : STAGE_ORDER[ad.stage]
  if (column === "share") return ad.spendShare
  if (column === "results") return ad.conversions
  if (column === "cpa") return ad.conversions > 0 ? ad.cpa : null
  return ad[column]
}

export function CampaignCheckupScreen() {
  const t = useTranslations("campaigns.checkupScreen")
  const tc = useTranslations("campaigns")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: subDays(today, 6), to: today }
  })
  const [runCount, setRunCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [checkup, setCheckup] = useState<CampaignCheckup | null>(null)
  // The ads table can be ordered by any of its columns.
  const adsSort = useTableSort<AdColumn>()
  // The ad whose comparison is open under its row.
  const [openAdId, setOpenAdId] = useState<string | null>(null)

  const startDate = dateRange?.from ? toLocalDay(dateRange.from) : undefined
  const endDay = dateRange?.to ?? dateRange?.from
  const endDate = endDay ? toLocalDay(endDay) : undefined

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(false)
      try {
        const result = await campaignPerformanceService.getCheckup({ startDate, endDate })
        if (!cancelled) setCheckup(result)
      } catch (error) {
        console.error("Failed to run the campaign check-up", error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, runCount])

  function askAssistant(finding: CampaignCheckupFinding) {
    const text = findingText(finding, t, locale)
    const prompt = t("askPrompt", { campaign: finding.campaignName, finding: text.body })
    router.push(`${ROUTES.ai}?ask=${encodeURIComponent(prompt)}`)
  }

  const actFindings = (checkup?.findings ?? []).filter(
    (finding) => finding.severity === "high" || finding.severity === "medium"
  )
  const infoFindings = (checkup?.findings ?? []).filter(
    (finding) => finding.severity === "info" || finding.severity === "good"
  )

  function noteCard(finding: CampaignCheckupFinding, index: number) {
    const text = findingText(finding, t, locale)
    const look = SEVERITY_LOOK[finding.severity]
    return (
      <li
        key={`${finding.kind}:${finding.campaignId}:${finding.adName ?? ""}:${index}`}
        className={cn("rounded-[12px] border p-4", look.card)}
      >
        <div className="flex items-start gap-2.5">
          <look.Icon className={cn("mt-0.5 size-4 shrink-0", look.icon)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-[13.5px] font-extrabold", HEADING)}>{text.title}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", look.pill)}>
                {t(`severity.${finding.severity}` as "severity.high")}
              </span>
            </div>
            <p className={cn("mt-1 flex items-center gap-1.5 text-[11.5px]", MUTED)}>
              <PlatformBadge
                platform={finding.platform}
                className="size-5"
                iconClassName="size-3"
              />
              <span className="truncate">{finding.campaignName}</span>
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[#334155]">{text.body}</p>
            <p className={cn("mt-1 text-[12.5px] font-semibold", HEADING)}>{text.advice}</p>
            <button
              type="button"
              onClick={() => askAssistant(finding)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[9px] border border-[#cfdcf5] bg-white px-3 py-1.5 text-[12px] font-bold text-[#1d4fd8] transition-colors hover:bg-[#eef4ff]"
            >
              <MessageCircleQuestion className="size-3.5" />
              {t("askAssistant")}
            </button>
          </div>
        </div>
      </li>
    )
  }

  const funnel = checkup?.funnel
  const rate = (part: number, whole: number) =>
    whole > 0
      ? t("funnel.ofPrevious", { rate: formatNumber((part / whole) * 100, locale, 2) })
      : undefined
  const beforeResults = funnel ? (funnel.pageViews ?? funnel.clicks) : 0
  // Only campaigns that are on, or that spent in the period, are worth a status line.
  const statusCampaigns = (checkup?.campaigns ?? []).filter(
    (campaign) => campaign.state !== "paused" || campaign.spend > 0
  )

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
            <button
              type="button"
              onClick={() => setRunCount((count) => count + 1)}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1a45bd] disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              {isLoading ? t("checking") : t("runNow")}
            </button>
          </div>
        </div>

        <CampaignModuleNav />

        {loadError ? (
          <div className={cn(PANEL, "px-4 py-10 text-center text-[12.5px] text-[#e0484d]")}>
            {t("loadError")}
          </div>
        ) : !checkup ? (
          <div className={cn(PANEL, "px-4 py-10 text-center text-[12.5px]", MUTED)}>
            {t("checking")}
          </div>
        ) : checkup.campaigns.length === 0 ? (
          <div className={cn(PANEL, "px-4 py-12 text-center")}>
            <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("emptyTitle")}</p>
            <p className={cn("mt-2 text-[12px]", MUTED)}>{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className={cn("space-y-4 transition-opacity", isLoading && "opacity-60")}>
            <section className={cn(PANEL, "p-4 md:p-5")}>
              <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("statusTitle")}</h2>
              <ul className="mt-3 divide-y divide-[#f1f4f9]">
                {statusCampaigns.map((campaign) => (
                  <li key={campaign.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <PlatformBadge
                      platform={campaign.platform}
                      className="size-8"
                      iconClassName="size-4"
                    />
                    <p className={cn("min-w-0 flex-1 truncate text-[13px] font-bold", HEADING)}>
                      {campaign.name}
                    </p>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        STATE_PILL[campaign.state]
                      )}
                    >
                      {stateLabel(campaign, t)}
                    </span>
                    <p className={cn("text-[12px] tabular-nums", MUTED)}>
                      {campaign.dailyBudget
                        ? t("todaySpend", {
                            spent: formatMoney(campaign.spendToday, campaign.currency, locale),
                            budget: formatMoney(campaign.dailyBudget, campaign.currency, locale),
                          })
                        : t("todaySpendNoBudget", {
                            spent: formatMoney(campaign.spendToday, campaign.currency, locale),
                          })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {funnel ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("funnelTitle")}</h2>
                  <p className={cn("text-[12px] tabular-nums", MUTED)}>
                    {funnel.spend === null
                      ? t("funnel.mixedCurrencies")
                      : `${t("funnel.spend")}: ${formatMoney(funnel.spend, funnel.currency, locale)}`}
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-2.5 md:flex-row">
                  <FunnelStep
                    label={t("funnel.impressions")}
                    value={formatNumber(funnel.impressions, locale)}
                  />
                  <FunnelStep
                    label={t("funnel.clicks")}
                    value={formatNumber(funnel.clicks, locale)}
                    note={rate(funnel.clicks, funnel.impressions)}
                  />
                  {funnel.pageViews !== null ? (
                    <FunnelStep
                      label={t("funnel.pageViews")}
                      value={formatNumber(funnel.pageViews, locale)}
                      note={rate(funnel.pageViews, funnel.clicks)}
                    />
                  ) : null}
                  <FunnelStep
                    label={t("funnel.conversions")}
                    value={formatNumber(funnel.conversions, locale, 1)}
                    note={
                      funnel.conversions > 0
                        ? rate(funnel.conversions, beforeResults)
                        : t("funnel.noResults")
                    }
                  />
                  <FunnelStep
                    last
                    label={t("funnel.costPerResult")}
                    value={
                      funnel.cpa === null ? "—" : formatMoney(funnel.cpa, funnel.currency, locale)
                    }
                  />
                </div>
                <p className={cn("mt-2.5 flex items-center gap-1.5 text-[11.5px]", MUTED)}>
                  <Info className="size-3.5" />
                  {t("funnel.delayNote")}
                </p>
              </section>
            ) : null}

            <section className={cn(PANEL, "p-4 md:p-5")}>
              <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("findingsTitle")}</h2>
              {actFindings.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#1f9d55]">
                  <CheckCircle2 className="size-4" />
                  {t("noFindings")}
                </p>
              ) : (
                <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                  {actFindings.map((finding, index) => noteCard(finding, index))}
                </ul>
              )}
            </section>

            {infoFindings.length > 0 ? (
              <section className={cn(PANEL, "p-4 md:p-5")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>
                  {t("findingsInfoTitle")}
                </h2>
                <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                  {infoFindings.map((finding, index) => noteCard(finding, index))}
                </ul>
              </section>
            ) : null}

            <section className={cn(PANEL, "p-4 md:p-5")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("adsTitle")}</h2>
                {checkup.ads.length > 0 ? (
                  <p className={cn("text-[11.5px]", MUTED)}>{t("compare.hint")}</p>
                ) : null}
              </div>
              {checkup.ads.length === 0 ? (
                <p className={cn("mt-3 text-[12.5px]", MUTED)}>{t("noAds")}</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-center">
                    <thead>
                      <tr>
                        {(
                          [
                            { key: "ad", label: t("columns.ad"), align: "text-start" },
                            { key: "stage", label: t("columns.stage") },
                            { key: "spend", label: tc("metrics.columns.spend") },
                            { key: "share", label: t("columns.share") },
                            { key: "impressions", label: tc("metrics.columns.impressions") },
                            { key: "clicks", label: tc("metrics.columns.clicks") },
                            { key: "ctr", label: tc("metrics.columns.ctr") },
                            { key: "pageViews", label: t("columns.pageViews") },
                            { key: "results", label: t("columns.results") },
                            { key: "cpa", label: t("columns.costPerResult") },
                          ] as Array<{ key: AdColumn; label: string; align?: string }>
                        ).map((column) => (
                          <th
                            key={column.key}
                            aria-sort={ariaSort(adsSort.sort, column.key)}
                            className={cn(
                              "border-b border-[#eef2f8] px-3 py-2 text-[11px] font-semibold",
                              MUTED,
                              column.align ?? "text-center"
                            )}
                          >
                            <SortHeading
                              label={column.label}
                              column={column.key}
                              sort={adsSort.sort}
                              onSort={adsSort.toggle}
                              text={column.key === "ad"}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(checkup.ads, adsSort.sort, adValue).map((ad) => (
                        <Fragment key={ad.id}>
                          <tr
                            onClick={() => setOpenAdId((open) => (open === ad.id ? null : ad.id))}
                            className={cn(
                              "cursor-pointer border-b border-[#f4f7fb] hover:bg-[#f8fafd]",
                              openAdId === ad.id && "bg-[#f8fafd]"
                            )}
                          >
                            <td className="px-3 py-3 text-start">
                              <div className="flex items-center gap-2.5">
                                <ChevronDown
                                  className={cn(
                                    "size-4 shrink-0 text-[#9aa8bf] transition-transform",
                                    openAdId === ad.id && "rotate-180"
                                  )}
                                />
                                <PlatformBadge
                                  platform={ad.platform}
                                  className="size-8"
                                  iconClassName="size-4"
                                />
                                <div className="min-w-0">
                                  <p className={cn("truncate text-[12.5px] font-bold", HEADING)}>
                                    {ad.name}
                                    {ad.running ? null : (
                                      <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">
                                        {t("adStopped")}
                                      </span>
                                    )}
                                  </p>
                                  <p className={cn("truncate text-[11px]", MUTED)}>
                                    {ad.campaignName}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <StageCell ad={ad} t={t} locale={locale} />
                            </td>
                            <td className="px-3 py-3 tabular-nums whitespace-nowrap text-[#334155]">
                              {formatMoney(ad.spend, ad.currency, locale)}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {formatNumber(ad.spendShare, locale, 1)}%
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {formatNumber(ad.impressions, locale)}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {formatNumber(ad.clicks, locale)}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {formatNumber(ad.ctr, locale, 2)}%
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {ad.pageViews === null ? "—" : formatNumber(ad.pageViews, locale)}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-[#334155]">
                              {formatNumber(ad.conversions, locale, 1)}
                            </td>
                            <td className="px-3 py-3 tabular-nums whitespace-nowrap text-[#334155]">
                              {ad.conversions > 0 ? formatMoney(ad.cpa, ad.currency, locale) : "—"}
                            </td>
                          </tr>
                          {openAdId === ad.id ? (
                            <tr className="border-b border-[#eef2f8] bg-[#fbfcfe]">
                              <td colSpan={10} className="px-4 py-4">
                                <AdComparison ad={ad} t={t} locale={locale} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <ChangesSection changes={checkup.changes ?? []} t={t} locale={locale} />
          </div>
        )}
      </div>
    </div>
  )
}

// An ad's stage, with what is still to go before it can be judged.
function StageCell(props: { ad: CampaignCheckupAd; t: CheckupTranslator; locale: Locale }) {
  const { ad, t, locale } = props
  if (ad.stage === null) return <span className={cn("text-[12px]", MUTED)}>—</span>
  const left: string[] = []
  if (ad.stage === "too_early" || ad.stage === "promising") {
    if (ad.spendToJudge && ad.spendToJudge > 0) {
      left.push(t("stageLeft", { amount: formatMoney(ad.spendToJudge, ad.currency, locale) }))
    }
    if (ad.daysToJudge && ad.daysToJudge > 0) {
      left.push(t("stageDaysLeft", { days: formatNumber(ad.daysToJudge, locale) }))
    }
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold",
          STAGE_PILL[ad.stage]
        )}
      >
        {t(`stage.${ad.stage}` as "stage.steady")}
      </span>
      {left.length > 0 ? (
        <span className={cn("whitespace-nowrap text-[10.5px]", MUTED)}>{left.join(" · ")}</span>
      ) : null}
    </div>
  )
}

// The ad against the campaign's other ads and against the whole account, rate by rate.
function AdComparison(props: { ad: CampaignCheckupAd; t: CheckupTranslator; locale: Locale }) {
  const { ad, t, locale } = props
  const own: CampaignCheckupAverages = {
    ctr: ad.impressions > 0 ? ad.ctr : null,
    cpc: ad.cpc,
    cpm: ad.cpm,
    cpa: ad.conversions > 0 ? ad.cpa : null,
    cvr: ad.cvr,
  }
  // For rates a higher number is better; for costs a lower one is.
  const metrics: Array<{
    key: keyof CampaignCheckupAverages
    money: boolean
    higherIsBetter: boolean
  }> = [
    { key: "ctr", money: false, higherIsBetter: true },
    { key: "cpc", money: true, higherIsBetter: false },
    { key: "cpm", money: true, higherIsBetter: false },
    { key: "cpa", money: true, higherIsBetter: false },
    { key: "cvr", money: false, higherIsBetter: true },
  ]
  const show = (value: number | null, money: boolean) =>
    value === null
      ? "—"
      : money
        ? formatMoney(value, ad.currency, locale)
        : `${formatNumber(value, locale, 2)}${locale === "ar" ? "٪" : "%"}`
  const tone = (value: number | null, against: number | null, higherIsBetter: boolean) => {
    if (value === null || against === null || against === 0) return "text-[#334155]"
    const better = higherIsBetter ? value >= against * 1.1 : value <= against * 0.9
    const worse = higherIsBetter ? value <= against * 0.9 : value >= against * 1.1
    return better ? "text-[#1f9d55]" : worse ? "text-[#e0484d]" : "text-[#334155]"
  }
  const reading =
    ad.diagnosis === "page" || ad.diagnosis === "creative"
      ? t(`diagnosis.${ad.diagnosis}` as "diagnosis.page")
      : null
  return (
    <div className="space-y-3 text-start">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-center text-[12.5px]">
          <thead>
            <tr className={cn("text-[11px]", MUTED)}>
              <th className="px-2 py-1.5 text-start font-semibold">{t("compare.metric")}</th>
              <th className="px-2 py-1.5 font-semibold">{t("compare.this")}</th>
              <th className="px-2 py-1.5 font-semibold">{t("compare.campaign")}</th>
              <th className="px-2 py-1.5 font-semibold">{t("compare.account")}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.key} className="border-t border-[#eef2f8]">
                <td className={cn("px-2 py-1.5 text-start font-semibold", HEADING)}>
                  {t(`compare.${metric.key}` as "compare.ctr")}
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 font-bold tabular-nums",
                    tone(
                      own[metric.key],
                      ad.campaignAverage?.[metric.key] ?? null,
                      metric.higherIsBetter
                    )
                  )}
                >
                  {show(own[metric.key], metric.money)}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-[#334155]">
                  {show(ad.campaignAverage?.[metric.key] ?? null, metric.money)}
                </td>
                <td className="px-2 py-1.5 tabular-nums text-[#334155]">
                  {show(ad.accountAverage?.[metric.key] ?? null, metric.money)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[12px]", MUTED)}>
        {ad.ageDays !== null ? (
          <span>{t("compare.age", { days: formatNumber(Math.floor(ad.ageDays), locale) })}</span>
        ) : null}
        {ad.trend ? (
          <span>
            {t("compare.trend", {
              earlyCtr: formatNumber(ad.trend.earlyCtr, locale, 2),
              recentCtr: formatNumber(ad.trend.recentCtr, locale, 2),
            })}
          </span>
        ) : null}
      </div>
      {reading ? <p className={cn("text-[12.5px] font-semibold", HEADING)}>{reading}</p> : null}
    </div>
  )
}

// What was changed in the campaigns and ad sets, and the days before against the days after.
function ChangesSection(props: {
  changes: CampaignCheckupChange[]
  t: CheckupTranslator
  locale: Locale
}) {
  const { changes, t, locale } = props
  const effectText = (change: CampaignCheckupChange) => {
    if (!change.effect) return null
    const { before, after } = change.effect
    const cost = (value: number | null) =>
      value === null ? t("change.noResults") : formatMoney(value, change.currency, locale)
    const lines = [t("change.cpa", { before: cost(before.cpa), after: cost(after.cpa) })]
    if (before.ctr !== null && after.ctr !== null) {
      lines.push(
        t("change.ctr", {
          before: formatNumber(before.ctr, locale, 2),
          after: formatNumber(after.ctr, locale, 2),
        })
      )
    }
    return lines
  }
  return (
    <section className={cn(PANEL, "p-4 md:p-5")}>
      <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("changesTitle")}</h2>
      <p className={cn("mt-1 text-[12px]", MUTED)}>{t("changesSubtitle")}</p>
      {changes.length === 0 ? (
        <p className={cn("mt-3 text-[12.5px]", MUTED)}>{t("noChanges")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-start text-[12.5px]">
            <thead>
              <tr className={cn("text-[11px]", MUTED)}>
                <th className="border-b border-[#eef2f8] px-3 py-2 text-start font-semibold">
                  {t("changeColumns.when")}
                </th>
                <th className="border-b border-[#eef2f8] px-3 py-2 text-start font-semibold">
                  {t("changeColumns.where")}
                </th>
                <th className="border-b border-[#eef2f8] px-3 py-2 text-start font-semibold">
                  {t("changeColumns.what")}
                </th>
                <th className="border-b border-[#eef2f8] px-3 py-2 text-start font-semibold">
                  {t("changeColumns.learning")}
                </th>
                <th className="border-b border-[#eef2f8] px-3 py-2 text-start font-semibold">
                  {t("changeColumns.effect")}
                </th>
              </tr>
            </thead>
            <tbody>
              {changes.slice(0, 100).map((change) => {
                const effect = effectText(change)
                return (
                  <tr key={change.id} className="border-b border-[#f4f7fb] align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[#334155]">
                      {formatWhen(change.changedAt, locale)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <PlatformBadge
                          platform={change.platform}
                          className="size-6"
                          iconClassName="size-3"
                        />
                        <div className="min-w-0">
                          <p className={cn("truncate font-bold", HEADING)}>{change.name}</p>
                          {change.level === "adset" && change.campaignName ? (
                            <p className={cn("truncate text-[11px]", MUTED)}>
                              {change.campaignName}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[#334155]">{changeText(change, t, locale)}</td>
                    <td className="px-3 py-2.5">
                      {change.duringLearning ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-[#fdeeee] px-2 py-0.5 text-[10.5px] font-bold text-[#e0484d]">
                          {change.learningSource === "platform"
                            ? t("change.inLearning")
                            : t("change.inLearningEstimate")}
                        </span>
                      ) : (
                        <span className={MUTED}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[#334155]">
                      {effect ? (
                        effect.map((line) => (
                          <p key={line} className="tabular-nums">
                            {line}
                          </p>
                        ))
                      ) : (
                        <span className={MUTED}>{t("change.tooSoon")}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={cn("mt-2.5 flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Info className="size-3.5" />
        {t("changesNote")}
      </p>
    </section>
  )
}
