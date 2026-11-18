"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar as CalendarIcon,
  CreditCard,
  FileText,
  Gauge,
  Info,
  LayoutGrid,
  Loader2,
  Megaphone,
  MessageSquarePlus,
  Minus,
  Send,
  ShoppingBag,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

import {
  AppCard,
  AppButton,
  AppSearchableSelect,
  type AppSearchableSelectOption,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { useAiChat, useAiRecommendations } from "@/features/ai"
import type { AiChatScopeCategory } from "@/features/ai"
import type {
  ChatChartSpec,
  ChatConfidenceLevel,
  ChatContributionFinding,
  ChatDataQualityWarning,
  ChatDriverFinding,
  ChatFact,
  ChatInsight,
  ChatKpiCard,
  ChatRecommendation,
  ChatReportTable,
  ChatReportTableColumn,
  ChatSessionDto,
} from "@/features/ai/types/ai-chat.types"

type AiTranslator = ReturnType<typeof useTranslations<"ai">>

function formatLocaleNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar" : "en-US")
}

// Mirrors LiveVisitorsPage.tsx's formatCurrency convention exactly: ar gets a "ر.س" suffix, en
// gets a "SAR " prefix -- the one currency-string convention used across this whole rollout.
function formatCurrencyValue(value: number, locale: Locale): string {
  const amount = formatLocaleNumber(value, locale)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

function formatKpiValue(card: ChatKpiCard, locale: Locale): string {
  switch (card.format) {
    case "currency":
      return formatCurrencyValue(card.value, locale)
    case "multiple":
      return `${card.value.toFixed(2)}x`
    case "percent":
      return `${card.value.toFixed(1)}%`
    default:
      return formatLocaleNumber(card.value, locale)
  }
}

// Minimal, additive rendering of the deterministic structured.metrics already computed
// server-side (ai-chat/response-formatter.ts) -- never a chat redesign, just a small KPI strip
// under an assistant reply that has analytics-shaped data attached.
function ChatKpiRow({ cards }: { cards: ChatKpiCard[] }) {
  const locale = useLocale() as Locale
  if (cards.length === 0) return null
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map((card) => {
        const TrendIcon =
          card.trend === "up" ? ArrowUpRight : card.trend === "down" ? ArrowDownRight : Minus
        return (
          <div
            key={card.title}
            className="rounded-xl border border-border/60 bg-background/60 px-3 py-2"
          >
            <p className="text-[11px] text-muted-foreground">{card.title}</p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {formatKpiValue(card, locale)}
            </p>
            {card.changePercent !== null ? (
              <p
                className={cn(
                  "mt-0.5 flex items-center gap-0.5 text-[11px] font-medium",
                  card.trend === "up"
                    ? "text-emerald-600"
                    : card.trend === "down"
                      ? "text-rose-600"
                      : "text-muted-foreground"
                )}
              >
                <TrendIcon className="size-3" />
                {card.changePercent > 0 ? "+" : ""}
                {card.changePercent}%
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// A chart spec's `chartType` (line/bar/donut/table/comparison) is a hint about the underlying
// data's shape, not a request for a dedicated charting library here -- every type renders as
// either a plain table (chartType "table") or a simple proportional bar list (everything else),
// per the explicit "simple tables/bars, not a redesign" scope for this pass.
function ChatChartBlock({ chart }: { chart: ChatChartSpec }) {
  const locale = useLocale() as Locale
  const series = chart.series[0]
  if (!series || series.data.length === 0) return null

  if (chart.chartType === "table") {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
        <p className="border-b border-border/60 bg-background/60 px-3 py-1.5 text-[11px] font-semibold text-foreground">
          {chart.title}
        </p>
        <table className="w-full text-xs">
          <tbody>
            {series.data.map((point) => (
              <tr key={point.label} className="border-t border-border/40 first:border-t-0">
                <td className="px-3 py-1.5 text-muted-foreground">{point.label}</td>
                <td className="px-3 py-1.5 text-end font-semibold text-foreground">
                  {formatLocaleNumber(point.value, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const maxValue = Math.max(...series.data.map((point) => point.value), 1)
  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-[11px] font-semibold text-foreground">{chart.title}</p>
      <div className="mt-2 space-y-1.5">
        {series.data.map((point) => (
          <div key={point.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
              {point.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (point.value / maxValue) * 100)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-end text-[11px] font-semibold text-foreground">
              {formatLocaleNumber(point.value, locale)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Problem states first (so "غير متصل" never matches the "متصل" pattern below it), then positive
// states, everything else falls to a neutral badge -- this is purely a visual classification of an
// already-final Arabic label from the backend, never a translation or a judgment call about the
// underlying data. The backend always returns these status labels in Arabic regardless of UI
// locale (see the comment above), so this regex intentionally stays Arabic-only.
function statusBadgeClass(label: string): string {
  if (/ملغي|خطأ|غير متصل|متعثر|متوقف/.test(label)) return "bg-rose-50 text-rose-700"
  if (/مفتوحة|نشط|متصل|مكتمل/.test(label)) return "bg-emerald-50 text-emerald-700"
  return "bg-amber-50 text-amber-700"
}

function formatReportCell(
  value: string | number | null,
  format: ChatReportTableColumn["format"],
  locale: Locale
): string {
  if (value === null) return "—"
  switch (format) {
    case "currency":
      return formatCurrencyValue(Number(value), locale)
    case "percent":
      return `${Number(value).toFixed(1)}%`
    case "number":
      return formatLocaleNumber(Number(value), locale)
    default:
      return String(value)
  }
}

// The structural fix for the "raw pipe-delimited table" failure mode: a tool that returns a list
// of records (shifts, orders, stores) gets a real table here instead of being left for the LLM's
// prose to describe unassisted. Every cell's display value already came from the backend
// (response-formatter.ts) -- this component only lays it out and applies the per-column visual
// treatment (status badge vs. plain text vs. right-aligned number).
function ReportTableBlock({ table }: { table: ChatReportTable }) {
  const locale = useLocale() as Locale
  if (table.rows.length === 0) return null
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
      <p className="border-b border-border/60 bg-background/60 px-3 py-1.5 text-[11px] font-semibold text-foreground">
        {table.title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  className="whitespace-nowrap px-3 py-1.5 text-start font-medium"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-t border-border/40 first:border-t-0">
                {table.columns.map((column) => {
                  const value = row[column.key] ?? null
                  if (column.format === "status" && value !== null) {
                    return (
                      <td key={column.key} className="whitespace-nowrap px-3 py-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            statusBadgeClass(String(value))
                          )}
                        >
                          {value}
                        </span>
                      </td>
                    )
                  }
                  return (
                    <td key={column.key} className="whitespace-nowrap px-3 py-1.5 text-foreground">
                      {formatReportCell(value, column.format, locale)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Same principle as the KPI strip -- these are already-computed, hedged statements from
// response-formatter.ts, never text the frontend composes. Facts first (observed numbers), then
// insights (associative, confidence-labelled interpretations), visually subordinate to the
// message bubble's own prose.
function ChatFactsInsightsPanel({
  facts,
  insights,
}: {
  facts: ChatFact[]
  insights: ChatInsight[]
}) {
  if (facts.length === 0 && insights.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-3">
      {facts.length > 0 ? (
        <ul className="space-y-1 text-[11px] text-foreground">
          {facts.map((fact, index) => (
            <li key={index} className="flex gap-1.5">
              <span className="text-muted-foreground">•</span>
              <span>{fact.statement}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {insights.length > 0 ? (
        <ul
          className={cn(
            "space-y-1 text-[11px] text-muted-foreground",
            facts.length > 0 && "border-t border-border/40 pt-1.5"
          )}
        >
          {insights.map((insight, index) => (
            <li key={index} className="flex gap-1.5">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
              <span>{insight.statement}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const DRIVER_METRIC_KEYS = [
  "orders",
  "aov",
  "revenue",
  "spend",
  "roas",
  "cpa",
  "ctr",
  "cpc",
  "conversions",
] as const

function driverMetricLabel(metric: string, t: AiTranslator): string {
  if ((DRIVER_METRIC_KEYS as readonly string[]).includes(metric)) {
    return t(`metricLabels.${metric}` as "metricLabels.orders")
  }
  return metric
}

// Analysis Orchestration audit (Genie-upgrade, round 2) section 11/12: a dedicated callout for
// StructuredAnalyticsResponse.drivers, distinct from the general facts/insights panel -- the
// "primary driver" framing (section 4's "Revenue ↓ 79% / Orders ↓ 65% ... Primary driver:
// Orders") needs its own visual weight, not to be buried as one bullet among many.
function ChatDriversPanel({ drivers }: { drivers: ChatDriverFinding[] }) {
  const t = useTranslations("ai")
  if (drivers.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="text-[11px] font-semibold text-foreground">{t("chat.drivers.title")}</p>
      {drivers.map((driver, index) => {
        const TrendIcon = driver.direction === "up" ? ArrowUpRight : ArrowDownRight
        return (
          <div key={index} className="flex items-start gap-1.5 text-[11px]">
            <TrendIcon
              className={cn(
                "mt-0.5 size-3 shrink-0",
                driver.direction === "up" ? "text-emerald-600" : "text-rose-600"
              )}
            />
            <span className="text-foreground">
              <span className="font-medium">
                {driver.role === "primary"
                  ? t("chat.drivers.primary")
                  : t("chat.drivers.secondary")}
                {" — "}
                {driverMetricLabel(driver.metric, t)}:
              </span>{" "}
              <span className="text-muted-foreground">{driver.statement}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Same idea for StructuredAnalyticsResponse.contributions (section 5: "Campaign A contributed
// approximately 42% of the total decline") -- a ranked breakdown with each contributor's share
// of the total change, distinct from a plain ReportTable since it carries that share explicitly.
function ChatContributionsPanel({
  contributions,
  title,
}: {
  contributions: ChatContributionFinding[]
  title: string | null
}) {
  const t = useTranslations("ai")
  const locale = useLocale() as Locale
  if (contributions.length === 0) return null
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
      <p className="border-b border-border/60 bg-background/60 px-3 py-1.5 text-[11px] font-semibold text-foreground">
        {title ?? t("chat.contributions.defaultTitle")}
      </p>
      <div className="divide-y divide-border/40">
        {contributions.slice(0, 5).map((contribution, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]"
          >
            <span className="truncate text-foreground">{contribution.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={contribution.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {contribution.delta >= 0 ? "+" : ""}
                {formatLocaleNumber(contribution.delta, locale)}
              </span>
              {contribution.contributionSharePercent !== null ? (
                <span className="text-muted-foreground">
                  ({contribution.contributionSharePercent}%)
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Section 10: evidence-gated recommendations (generate_campaign_recommendations) were already
// computed and transmitted by the backend but had no rendering at all on this dashboard -- the
// type itself didn't declare the field (see ai-chat.types.ts's own comment). This closes that.
function ChatRecommendationsPanel({ recommendations }: { recommendations: ChatRecommendation[] }) {
  const t = useTranslations("ai")
  if (recommendations.length === 0) return null
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      {recommendations.map((recommendation, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-foreground">
              💡 {recommendation.entityName}
            </p>
            <span className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {t(
                `chat.recommendationsPanel.priority.${recommendation.priority}` as "chat.recommendationsPanel.priority.high"
              )}
            </span>
          </div>
          <p className="text-[11px] text-foreground">{recommendation.recommendedAction}</p>
          <p className="text-[11px] text-muted-foreground">{recommendation.reason}</p>
        </div>
      ))}
    </div>
  )
}

const CONFIDENCE_TINT: Record<ChatConfidenceLevel, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-orange-50 text-orange-700",
  insufficient: "bg-rose-50 text-rose-700",
}

// Section 16: confidence was already tracked end-to-end on the backend (ConfidenceLevel) but
// never surfaced to the user at all. Shown only alongside an actual analytical finding (a driver
// or contribution breakdown) -- a confidence label on a plain "what are my sales" lookup would
// be noise, not useful context; the spec's own framing is "communicate confidence WHEN
// APPROPRIATE," not unconditionally.
function ChatConfidenceBadge({
  confidence,
  hasAnalysis,
}: {
  confidence: ChatConfidenceLevel | null
  hasAnalysis: boolean
}) {
  const t = useTranslations("ai")
  if (!confidence || !hasAnalysis) return null
  const level = t(`chat.confidence.levels.${confidence}` as "chat.confidence.levels.high")
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px]">
      <span className={cn("rounded-full px-2 py-0.5 font-medium", CONFIDENCE_TINT[confidence])}>
        {t("chat.confidence.label", { level })}
      </span>
    </p>
  )
}

// Data-quality caveats (an incomplete period, a stale channel, a thin sample) -- distinct from the
// KPI/chart/table content above, so a genuinely honest answer still reads as trustworthy rather
// than burying the caveat inside a sentence of prose.
function ChatWarningsPanel({ warnings }: { warnings: ChatDataQualityWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="mt-2 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3">
      {warnings.map((warning, index) => (
        <p key={index} className="flex gap-1.5 text-[11px] text-amber-800">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>{warning.message}</span>
        </p>
      ))}
    </div>
  )
}

// Deterministic, templated follow-ups (response-formatter.ts's FOLLOW_UP_TEMPLATES) rendered as
// clickable chips that just populate the input -- never auto-sent, so the user stays in control of
// what actually gets asked next.
function ChatFollowUpChips({
  questions,
  onSelect,
}: {
  questions: string[]
  onSelect: (question: string) => void
}) {
  if (questions.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          className="rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          {question}
        </button>
      ))}
    </div>
  )
}

// --- The "التوصيات المقترحة" tab: recommendations the server works out from the account's own
// campaign numbers (GET /v1/ai/recommendations) -- the same evidence-gated ones the assistant
// uses. Nothing on it is sample text. ---

type RecommendationCategory = "growth" | "optimization" | "alert"

// Which tab a recommendation belongs under. "No action needed" belongs to none of them and
// shows only under "all".
function recommendationCategory(type: ChatRecommendation["type"]): RecommendationCategory | null {
  if (type === "budget_increase_consideration") return "growth"
  if (type === "budget_review" || type === "investigate_decline") return "alert"
  if (type === "no_action") return null
  return "optimization"
}

const CATEGORY_META: Record<RecommendationCategory | "none", { className: string }> = {
  growth: { className: "bg-emerald-50 text-emerald-600" },
  optimization: { className: "bg-blue-50 text-blue-600" },
  alert: { className: "bg-rose-50 text-rose-600" },
  none: { className: "bg-slate-100 text-slate-600" },
}

const RECOMMENDATION_TABS: Array<{ key: "all" | RecommendationCategory; icon?: LucideIcon }> = [
  { key: "all" },
  { key: "growth", icon: TrendingUp },
  { key: "optimization", icon: Gauge },
  { key: "alert", icon: AlertTriangle },
]

const CATEGORY_ICON: Record<AiChatScopeCategory, { icon: LucideIcon; tint: string }> = {
  advertising: { icon: Megaphone, tint: "bg-[#eef4ff] text-[#2878ff]" },
  ecommerce: { icon: ShoppingBag, tint: "bg-violet-50 text-violet-600" },
  pos: { icon: CreditCard, tint: "bg-emerald-50 text-emerald-600" },
  madarApps: { icon: LayoutGrid, tint: "bg-amber-50 text-amber-600" },
  procurement: { icon: Truck, tint: "bg-teal-50 text-teal-700" },
  expenses: { icon: Wallet, tint: "bg-rose-50 text-rose-600" },
}

const SUGGESTED_QUESTION_CONFIG: Record<
  AiChatScopeCategory,
  Array<{ key: string; icon: LucideIcon }>
> = {
  advertising: [
    { key: "bestRoas", icon: BarChart3 },
    { key: "increaseBudget", icon: Target },
    { key: "monthlySummary", icon: FileText },
  ],
  pos: [
    { key: "totalSales", icon: BarChart3 },
    { key: "returnedInvoices", icon: AlertCircle },
  ],
  ecommerce: [
    { key: "avgOrderValue", icon: BarChart3 },
    { key: "storeConnectionStatus", icon: AlertCircle },
  ],
  madarApps: [{ key: "kpiSummary", icon: FileText }],
  procurement: [{ key: "supplierSummary", icon: Truck }],
  expenses: [{ key: "topCategories", icon: Wallet }],
}

function RecommendationCard({
  item,
  onAsk,
}: {
  item: ChatRecommendation
  onAsk: (item: ChatRecommendation) => void
}) {
  const t = useTranslations("ai")
  const categoryKey = recommendationCategory(item.type) ?? "none"
  // The biggest measured change behind it -- a fact from the two periods, not a forecast.
  const change = [...item.evidence]
    .filter((evidence) => evidence.changePercent !== null)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))[0]

  return (
    <div className="rounded-2xl border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#2878ff]">
            <Megaphone className="size-4" />
          </span>
          <span className="truncate text-sm font-medium text-foreground">{item.entityName}</span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            CATEGORY_META[categoryKey].className
          )}
        >
          {t(
            `recommendationsView.categoryMeta.${categoryKey}` as "recommendationsView.categoryMeta.growth"
          )}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold text-foreground">{item.recommendedAction}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.reason}</p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div>
          {change ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("recommendationsView.measuredChange")}
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  (change.changePercent ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
                dir="ltr"
              >
                {(change.changePercent ?? 0) >= 0 ? "+" : ""}
                {(change.changePercent ?? 0).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">{driverMetricLabel(change.metric, t)}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(
                `chat.recommendationsPanel.priority.${item.priority}` as "chat.recommendationsPanel.priority.high"
              )}
            </p>
          )}
        </div>
        <AppButton variant="outline" size="sm" onClick={() => onAsk(item)}>
          {t("recommendationsView.askAssistant")}
        </AppButton>
      </div>
    </div>
  )
}

// The saved conversations beside the chat: pick one to read it again and carry on.
function ChatHistoryPanel({
  sessions,
  activeSessionId,
  disabled,
  locale,
  onOpen,
  onNew,
}: {
  sessions: ChatSessionDto[]
  activeSessionId: string | null
  disabled: boolean
  locale: Locale
  onOpen: (session: ChatSessionDto) => void
  onNew: () => void
}) {
  const t = useTranslations("ai")
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    [locale]
  )
  // A conversation gets its name from its first question: one without a name has nothing in it.
  const named = sessions.filter((session) => session.title || session.id === activeSessionId)

  return (
    <AppCard title={t("history.title")} className="rounded-2xl border-border/60 shadow-sm">
      <AppButton
        variant="outline"
        className="h-10 w-full justify-center gap-2 rounded-xl"
        disabled={disabled}
        onClick={onNew}
      >
        <span className="flex items-center justify-center gap-2">
          <MessageSquarePlus className="size-4" />
          {t("history.newChat")}
        </span>
      </AppButton>
      {named.length === 0 ? (
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          {t("history.empty")}
        </p>
      ) : (
        <ul className="mt-3 max-h-[420px] space-y-1 overflow-y-auto">
          {named.map((session) => {
            const isActive = session.id === activeSessionId
            const CategoryIcon = CATEGORY_ICON[session.applicationCategory]?.icon ?? Sparkles
            return (
              <li key={session.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onOpen(session)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors disabled:opacity-60",
                    isActive ? "bg-primary/10" : "hover:bg-muted"
                  )}
                >
                  <CategoryIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] text-foreground",
                        isActive ? "font-bold" : "font-medium"
                      )}
                    >
                      {session.title ?? t("history.untitled")}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {dateFormat.format(new Date(session.updatedAt))}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </AppCard>
  )
}

type PageView = "chat" | "recommendations"

const PAGE_VIEW_CONFIG: Array<{ key: PageView; icon: LucideIcon }> = [
  { key: "chat", icon: Sparkles },
  { key: "recommendations", icon: TrendingUp },
]

export default function AIAssistantDashboard() {
  const t = useTranslations("ai")
  const locale = useLocale() as Locale
  const [view, setView] = useState<PageView>("chat")
  const [activeTab, setActiveTab] = useState<"all" | RecommendationCategory>("all")
  const [period, setPeriod] = useState("30")
  const [chatInput, setChatInput] = useState("")
  const {
    messages,
    sessions,
    availableCategories,
    isSending,
    activeSessionId,
    sendMessage,
    cancelMessage,
    openSession,
    startNewChat,
  } = useAiChat()
  const recommendationsQuery = useAiRecommendations(Number(period), view === "recommendations")

  const [selectedCategory, setSelectedCategory] = useState<AiChatScopeCategory | null>(null)
  const activeCategory = selectedCategory ?? availableCategories[0] ?? null
  const activeCategoryLabel = activeCategory
    ? t(`categories.${activeCategory}` as "categories.advertising")
    : ""

  const categoryOptions = useMemo<AppSearchableSelectOption[]>(
    () =>
      availableCategories.map((category) => ({
        value: category,
        label: t(`categories.${category}` as "categories.advertising"),
        icon: CATEGORY_ICON[category].icon,
        tint: CATEGORY_ICON[category].tint,
      })),
    [availableCategories, t]
  )

  const filteredRecommendations = useMemo(() => {
    const all = recommendationsQuery.data?.recommendations ?? []
    if (activeTab === "all") return all
    return all.filter((item) => recommendationCategory(item.type) === activeTab)
  }, [activeTab, recommendationsQuery.data])

  // "Ask the assistant" on a recommendation: over to the chat with the question written, for
  // the person to send.
  function askAbout(item: ChatRecommendation) {
    setChatInput(
      t("recommendationsView.askPrompt", {
        entity: item.entityName,
        action: item.recommendedAction,
      })
    )
    if (availableCategories.includes("advertising")) setSelectedCategory("advertising")
    startNewChat()
    setView("chat")
  }

  function openSavedChat(session: ChatSessionDto) {
    setSelectedCategory(session.applicationCategory)
    void openSession(session.id)
  }

  async function handleSend(text: string) {
    const content = text.trim()
    if (!content || !activeCategory || isSending) return
    setChatInput("")
    try {
      await sendMessage(content, activeCategory)
    } catch (error) {
      // sendMessage/sendMessageStream route every expected failure (network error, stream
      // error, cancellation) through the per-message status machine instead of throwing -- this
      // only catches a genuinely unexpected bug, so surface it instead of repeating the old
      // silent `void handleSend(...)` swallow that hid the original timeout bug from the user.
      console.error("Unexpected error sending AI chat message", error)
    }
  }

  function handleCancel() {
    if (activeSessionId) cancelMessage(activeSessionId)
  }

  return (
    <div className="space-y-4" dir={localeDirection(locale)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="size-6 text-primary" />
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {view === "recommendations" ? (
            <AppSelect value={period} onValueChange={setPeriod}>
              <AppSelectTrigger className="h-10 gap-2 rounded-xl border-border bg-card px-3 text-sm font-medium text-foreground">
                <CalendarIcon className="size-4 text-muted-foreground" />
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent align="end">
                <AppSelectItem value="7">{t("period.last7Days")}</AppSelectItem>
                <AppSelectItem value="30">{t("period.last30Days")}</AppSelectItem>
                <AppSelectItem value="90">{t("period.last90Days")}</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 rounded-xl border border-border/60 bg-card p-1">
        {PAGE_VIEW_CONFIG.map((pageView) => {
          const Icon = pageView.icon
          const isActive = view === pageView.key
          return (
            <button
              key={pageView.key}
              type="button"
              onClick={() => setView(pageView.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t(`pageViews.${pageView.key}` as "pageViews.chat")}
            </button>
          )
        })}
      </div>

      {view === "chat" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <ChatHistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            disabled={isSending}
            locale={locale}
            onOpen={openSavedChat}
            onNew={startNewChat}
          />
          <AppCard title={t("pageViews.chat")} className="rounded-2xl border-border/60 shadow-sm">
            {availableCategories.length === 0 ? (
              <div className="flex flex-col items-center px-1 py-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted text-2xl">
                  🤖
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">
                  {t("chat.emptyState.title")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("chat.emptyState.description")}
                </p>
              </div>
            ) : (
              <>
                {availableCategories.length > 1 ? (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {t("chat.scopeLabel")}
                    </span>
                    <AppSearchableSelect
                      value={activeCategory ?? ""}
                      options={categoryOptions}
                      onChange={(value) => setSelectedCategory(value as AiChatScopeCategory)}
                      placeholder={t("chat.scopeSelect.placeholder")}
                      searchPlaceholder={t("chat.scopeSelect.searchPlaceholder")}
                      emptyLabel={t("chat.scopeSelect.emptyLabel")}
                      ariaLabel={t("chat.scopeSelect.ariaLabel")}
                      compact
                      triggerClassName="w-56"
                    />
                  </div>
                ) : null}

                <div className="flex flex-col px-1 py-2">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center text-center">
                      <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-blue-100 text-3xl">
                        🤖
                      </div>
                      <p className="mt-4 text-lg font-bold text-foreground">
                        {t("chat.welcome.greeting")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("chat.welcome.subtitle", { category: activeCategoryLabel })}
                      </p>

                      <div className="mt-5 w-full space-y-2.5">
                        {(activeCategory ? SUGGESTED_QUESTION_CONFIG[activeCategory] : []).map(
                          (question) => {
                            const Icon = question.icon
                            const label = activeCategory
                              ? t(
                                  `chat.suggestedQuestions.${activeCategory}.${question.key}` as "chat.suggestedQuestions.advertising.bestRoas"
                                )
                              : ""
                            return (
                              <button
                                key={question.key}
                                type="button"
                                onClick={() => setChatInput(label)}
                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-start text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                              >
                                <span>{label}</span>
                                <Icon className="size-4 shrink-0 text-muted-foreground" />
                              </button>
                            )
                          }
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[65vh] space-y-3 overflow-y-auto">
                      {messages.map((message) => {
                        // A message loaded from the DB (listMessages) has no status field at all
                        // (always implicitly "completed" -- see ChatStreamingMessageDto's own
                        // comment), so this only ever branches for a message created client-side
                        // during the current session's active send.
                        const isWaitingForFirstToken =
                          message.role === "assistant" &&
                          (message.status === "pending" || message.status === "streaming") &&
                          message.content.length === 0
                        const isFailed = message.status === "failed"
                        const isCancelled = message.status === "cancelled"
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                              message.role === "user"
                                ? "ms-auto bg-primary text-primary-foreground"
                                : message.role === "system_notice"
                                  ? "mx-auto bg-amber-50 text-amber-700"
                                  : isFailed
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-muted text-foreground"
                            )}
                          >
                            {isWaitingForFirstToken ? (
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <span className="flex gap-1">
                                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                                  <span className="size-1.5 animate-bounce rounded-full bg-current" />
                                </span>
                                {message.statusLabel ?? t("status.thinking")}
                              </span>
                            ) : (
                              <>
                                {message.content}
                                {message.status === "streaming" ? (
                                  <span className="ms-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-current align-middle" />
                                ) : null}
                                {isCancelled ? (
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {t("chat.cancelled")}
                                  </span>
                                ) : null}
                              </>
                            )}
                            {message.role === "assistant" && message.structured ? (
                              <>
                                <ChatKpiRow cards={message.structured.metrics} />
                                {message.structured.tables.map((table, index) => (
                                  <ReportTableBlock key={index} table={table} />
                                ))}
                                {message.structured.charts.map((chart, index) => (
                                  <ChatChartBlock key={index} chart={chart} />
                                ))}
                                <ChatDriversPanel drivers={message.structured.drivers} />
                                <ChatContributionsPanel
                                  contributions={message.structured.contributions}
                                  title={message.structured.contributionsTitle}
                                />
                                <ChatFactsInsightsPanel
                                  facts={message.structured.facts}
                                  insights={message.structured.insights}
                                />
                                <ChatRecommendationsPanel
                                  recommendations={message.structured.recommendations}
                                />
                                <ChatWarningsPanel warnings={message.structured.warnings} />
                                <ChatConfidenceBadge
                                  confidence={message.structured.confidence}
                                  hasAnalysis={
                                    message.structured.drivers.length > 0 ||
                                    message.structured.contributions.length > 0
                                  }
                                />
                                <ChatFollowUpChips
                                  questions={message.structured.followUpQuestions}
                                  onSelect={setChatInput}
                                />
                              </>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void handleSend(chatInput)
                        }
                      }}
                      placeholder={t("chat.input.placeholder")}
                      className="h-8 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {isSending ? (
                      <button
                        type="button"
                        aria-label={t("chat.input.stopLabel")}
                        onClick={handleCancel}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
                      >
                        <Square className="size-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={t("chat.input.sendLabel")}
                        disabled={!chatInput.trim()}
                        onClick={() => void handleSend(chatInput)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Send className="size-4 rtl:-scale-x-100" />
                      </button>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 shrink-0" />
                    {t("chat.footerHint", { category: activeCategoryLabel })}
                  </p>
                </div>
              </>
            )}
          </AppCard>
        </div>
      ) : (
        <AppCard
          title={t("pageViews.recommendations")}
          icon={<Sparkles className="size-4 text-primary" />}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-border/60">
            {RECOMMENDATION_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {Icon ? <Icon className="size-3.5" /> : null}
                  {t(`recommendationsView.tabs.${tab.key}` as "recommendationsView.tabs.all")}
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {recommendationsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("recommendationsView.loading")}
            </div>
          ) : recommendationsQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {t("recommendationsView.loadFailed")}
              </p>
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => void recommendationsQuery.refetch()}
              >
                {t("recommendationsView.retry")}
              </AppButton>
            </div>
          ) : filteredRecommendations.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("recommendationsView.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredRecommendations.map((item, index) => (
                <RecommendationCard
                  key={`${item.type}-${item.entityName}-${index}`}
                  item={item}
                  onAsk={askAbout}
                />
              ))}
            </div>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            {t("recommendationsView.note", { days: Number(period) })}
          </p>
        </AppCard>
      )}
    </div>
  )
}
