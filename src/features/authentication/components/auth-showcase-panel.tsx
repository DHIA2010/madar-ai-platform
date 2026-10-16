import { getTranslations } from "next-intl/server"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Headset,
  Megaphone,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"

interface ShowcaseFeatureCard {
  key: string
  title: string
  description: string
}

interface ShowcaseBadge {
  key: string
  label: string
}

// The simpler icon+title+description list the forgot/reset-password pages still use -- they
// weren't part of the signup/signin redesign, so they keep their original, simpler panel content
// instead of the new feature-card grid (which needs 3 specific, product-themed cards login/signup
// share) and just pick up the panel's new blue color scheme and dashboard preview.
interface ShowcaseListFeature {
  icon: LucideIcon
  title: string
  description: string
}

interface AuthShowcasePanelProps {
  eyebrow: string
  heading: string
  // Omitted for pages (forgot/reset-password) that haven't moved to the two-part
  // heading+highlight headline the signup/signin redesign introduced.
  headingHighlight?: string
  description: string
  featureCards?: ShowcaseFeatureCard[]
  badges?: ShowcaseBadge[]
  features?: ShowcaseListFeature[]
  // Login gets the richer platform-connector illustration (see auth-platform-connector.tsx)
  // wrapped around the dashboard preview; every other page just gets the preview on its own.
  visual?: React.ReactNode
  footer?: React.ReactNode
}

const FEATURE_CARD_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  ecommerce: { icon: ShoppingCart, tone: "bg-emerald-50 text-emerald-600" },
  ads: { icon: Megaphone, tone: "bg-violet-50 text-violet-600" },
  pos: { icon: BarChart3, tone: "bg-blue-50 text-blue-600" },
}

const BADGE_ICON: Record<string, LucideIcon> = {
  secure: ShieldCheck,
  fast: Zap,
  reports: BarChart3,
  support: Headset,
}

const KPI_ICONS = [ShoppingCart, BarChart3, Headset, Zap]

export async function DashboardPreviewCard() {
  const t = await getTranslations("authShowcase.preview")

  const kpis = [
    { label: t("sales"), value: "6,330", delta: "24.6%" },
    { label: t("orders"), value: "1,248", delta: "18.2%" },
    { label: t("customers"), value: "3,856", delta: "12.8%" },
    { label: t("roas"), value: "5.42", delta: "18.2%" },
  ]

  const channels = [
    { label: t("channels.online"), value: 45, color: "#2563eb" },
    { label: t("channels.pos"), value: 32, color: "#38bdf8" },
    { label: t("channels.ads"), value: 18, color: "#a78bfa" },
    { label: t("channels.other"), value: 5, color: "#cbd5e1" },
  ]

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-[24px] border border-white/60 bg-white/95 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="flex size-6 items-center justify-center rounded-md bg-blue-600 text-[10px] font-bold text-white">
            م
          </span>
          <p className="flex-1 truncate text-xs font-semibold text-slate-900">{t("title")}</p>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500">
            {t("dateRange")}
          </span>
        </div>

        <div className="flex">
          <div className="flex w-10 shrink-0 flex-col items-center gap-2 border-e border-slate-100 bg-slate-50/70 py-3">
            {KPI_ICONS.map((Icon, index) => (
              <span
                key={index}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md",
                  index === 0 ? "bg-blue-600 text-white" : "text-slate-300"
                )}
              >
                <Icon className="size-3.5" />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-3.5">
            <div className="grid grid-cols-2 gap-2">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-xl bg-slate-50 p-2.5">
                  <p className="truncate text-[10px] text-slate-500">{kpi.label}</p>
                  <p className="text-sm font-bold text-slate-900">{kpi.value}</p>
                  <p className="text-[10px] font-medium text-emerald-600">↑ {kpi.delta}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-100 p-2.5">
                <p className="text-[9px] font-medium text-slate-500">{t("revenueTrend")}</p>
                <svg viewBox="0 0 140 56" className="mt-1.5 h-12 w-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="showcaseArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,42 L14,38 L28,40 L42,30 L56,34 L70,20 L84,24 L98,12 L112,16 L126,6 L140,10 L140,56 L0,56 Z"
                    fill="url(#showcaseArea)"
                  />
                  <path
                    d="M0,42 L14,38 L28,40 L42,30 L56,34 L70,20 L84,24 L98,12 L112,16 L126,6 L140,10"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="rounded-xl border border-slate-100 p-2.5">
                <p className="text-[9px] font-medium text-slate-500">{t("salesDistribution")}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="size-10 shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(${(() => {
                        let start = 0
                        return channels
                          .map((c) => {
                            const end = start + c.value
                            const segment = `${c.color} ${start}% ${end}%`
                            start = end
                            return segment
                          })
                          .join(", ")
                      })()})`,
                    }}
                  />
                  <ul className="min-w-0 space-y-0.5">
                    {channels.slice(0, 2).map((c) => (
                      <li
                        key={c.label}
                        className="flex items-center gap-1 text-[9px] text-slate-600"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="truncate">{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureCardsGrid({ cards }: { cards: ShowcaseFeatureCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => {
        const style = FEATURE_CARD_STYLE[card.key] ?? FEATURE_CARD_STYLE.pos
        const Icon = style.icon
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-slate-100 bg-white/80 p-3.5 shadow-sm backdrop-blur"
          >
            <span className={cn("flex size-9 items-center justify-center rounded-xl", style.tone)}>
              <Icon className="size-4.5" />
            </span>
            <p className="mt-2.5 text-[13px] font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{card.description}</p>
          </div>
        )
      })}
    </div>
  )
}

function FeatureList({ features }: { features: ShowcaseListFeature[] }) {
  return (
    <ul className="space-y-4">
      {features.map((feature) => {
        const Icon = feature.icon
        return (
          <li key={feature.title} className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
              <p className="text-sm text-slate-600">{feature.description}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function TrustBadgesRow({ badges }: { badges: ShowcaseBadge[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-5 sm:grid-cols-4">
      {badges.map((badge) => {
        const Icon = BADGE_ICON[badge.key] ?? ShieldCheck
        return (
          <div key={badge.key} className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Icon className="size-4" />
            </span>
            <span className="text-xs font-medium text-slate-700">{badge.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export function AuthShowcasePanel({
  eyebrow,
  heading,
  headingHighlight,
  description,
  featureCards,
  badges,
  features,
  visual,
  footer,
}: AuthShowcasePanelProps) {
  return (
    <div className="relative hidden flex-col justify-center gap-8 bg-gradient-to-br from-blue-50 via-sky-50 to-white p-10 lg:flex xl:p-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -end-24 size-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -start-24 size-96 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <div className="relative space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur">
          <Sparkles className="size-3.5" />
          {eyebrow}
        </span>
        <h2 className="text-3xl font-bold text-slate-900">
          {heading}{" "}
          {headingHighlight ? <span className="text-blue-600">{headingHighlight}</span> : null}
        </h2>
        <p className="max-w-md text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="relative">{visual ?? <DashboardPreviewCard />}</div>

      <div className="relative space-y-6">
        {featureCards ? <FeatureCardsGrid cards={featureCards} /> : null}
        {features ? <FeatureList features={features} /> : null}
        {badges ? <TrustBadgesRow badges={badges} /> : null}
      </div>

      {footer ? (
        <div className="relative flex items-center gap-2 border-t border-slate-200/70 pt-5 text-sm text-slate-600">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export async function AuthTrustBadge() {
  const t = await getTranslations("authShowcase")

  return (
    <>
      <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
      {t("trustBadge")}
    </>
  )
}
