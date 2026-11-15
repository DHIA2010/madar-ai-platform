import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Check,
  Headset,
  Megaphone,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Zap,
} from "lucide-react"

import { DashboardPreviewCard } from "./auth-showcase-panel"

interface RegisterShowcasePanelProps {
  eyebrow: string
  heading: string
  headingHighlight: string
  description: string
  featureCards: { key: string; title: string; description: string }[]
  badges: { key: string; label: string }[]
  footer: React.ReactNode
}

const FEATURE_ICON: Record<string, LucideIcon> = {
  ecommerce: ShoppingCart,
  ads: Megaphone,
  pos: BarChart3,
}

const BADGE_ICON: Record<string, LucideIcon> = {
  secure: ShieldCheck,
  fast: Zap,
  reports: BarChart3,
  support: Headset,
}

// The brand side of the sign-up page: what Madar is, a glimpse of the dashboard, and what the
// new account gets -- on the brand blue, so the form beside it stays the calm, white part.
export function RegisterShowcasePanel({
  eyebrow,
  heading,
  headingHighlight,
  description,
  featureCards,
  badges,
  footer,
}: RegisterShowcasePanelProps) {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 lg:flex">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -end-32 size-[28rem] rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute -bottom-40 -start-32 size-[30rem] rounded-full bg-indigo-900/40 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-[38rem] flex-col justify-center gap-9 px-10 py-12 xl:px-12">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur">
            <Sparkles className="size-3.5" />
            {eyebrow}
          </span>
          <h2 className="text-[34px] leading-[1.25] font-bold tracking-tight text-white xl:text-[40px]">
            {heading} <span className="block text-sky-200">{headingHighlight}</span>
          </h2>
          <p className="max-w-lg text-base leading-relaxed text-blue-50/90">{description}</p>
        </div>

        <div className="px-6">
          <div className="origin-center scale-[1.12]">
            <DashboardPreviewCard />
          </div>
        </div>

        <ul className="space-y-4">
          {featureCards.map((card) => {
            const Icon = FEATURE_ICON[card.key] ?? Check
            return (
              <li key={card.key} className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
                  <Icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">{card.title}</p>
                  <p className="text-sm leading-relaxed text-blue-50/80">{card.description}</p>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="space-y-4 border-t border-white/20 pt-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            {badges.map((badge) => {
              const Icon = BADGE_ICON[badge.key] ?? ShieldCheck
              return (
                <span
                  key={badge.key}
                  className="inline-flex items-center gap-2 text-sm font-medium text-white"
                >
                  <Icon className="size-4 text-sky-200" />
                  {badge.label}
                </span>
              )
            })}
          </div>
          <p className="text-sm text-blue-50/80">{footer}</p>
        </div>
      </div>
    </div>
  )
}
