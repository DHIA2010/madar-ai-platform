import { getTranslations } from "next-intl/server"
import type { LucideIcon } from "lucide-react"
import { ShieldCheck } from "lucide-react"

interface ShowcaseFeature {
  icon: LucideIcon
  title: string
  description: string
}

interface AuthShowcasePanelProps {
  eyebrow: string
  heading: React.ReactNode
  description: string
  features: ShowcaseFeature[]
  footer?: React.ReactNode
}

async function DashboardPreviewCard() {
  const t = await getTranslations("authShowcase.preview")

  const channelLegend = [
    { label: "Google", color: "#4285F4" },
    { label: "Snapchat", color: "#22c55e" },
    { label: "Meta", color: "#8b5cf6" },
    { label: "TikTok", color: "#ec4899" },
    { label: t("otherChannel"), color: "#cbd5e1" },
  ]

  return (
    <div className="relative mx-auto w-full max-w-md">
      <span className="absolute -top-5 end-4 z-10 flex size-14 -rotate-6 items-center justify-center rounded-2xl bg-white/90 text-violet-600 shadow-lg backdrop-blur">
        <svg viewBox="0 0 24 24" fill="none" className="size-7">
          <path
            d="M4 19h16M7 15l3-4 3 2 4-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="absolute top-24 -start-6 z-10 flex size-12 rotate-6 items-center justify-center rounded-2xl bg-white/90 text-emerald-600 shadow-lg backdrop-blur">
        <svg viewBox="0 0 24 24" fill="none" className="size-6">
          <path
            d="M3 17l5-5 4 4 8-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="rounded-[28px] border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold text-slate-900">{t("title")}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{t("roas")}</p>
            <p className="text-base font-bold text-slate-900">5.42</p>
            <p className="text-[11px] font-medium text-emerald-600">18.2%</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{t("revenue")}</p>
            <p className="text-base font-bold text-slate-900">345,678</p>
            <p className="text-[11px] font-medium text-emerald-600">24.6%</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{t("spend")}</p>
            <p className="text-base font-bold text-slate-900">63,850</p>
            <p className="text-[11px] font-medium text-emerald-600">12.8%</p>
          </div>
        </div>

        <div className="relative mt-4 h-28 w-full">
          <svg viewBox="0 0 300 100" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="showcaseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,75 L30,68 L60,72 L90,55 L120,60 L150,40 L180,45 L210,25 L240,32 L270,15 L300,20 L300,100 L0,100 Z"
              fill="url(#showcaseArea)"
            />
            <path
              d="M0,75 L30,68 L60,72 L90,55 L120,60 L150,40 L180,45 L210,25 L240,32 L270,15 L300,20"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="absolute end-[8%] top-[8%] rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md">
            345,678
          </span>
        </div>

        <div className="mt-3 flex justify-between text-[10px] text-slate-400">
          <span>{t("days.sat")}</span>
          <span>{t("days.sun")}</span>
          <span>{t("days.mon")}</span>
          <span>{t("days.tue")}</span>
          <span>{t("days.wed")}</span>
        </div>
      </div>

      <div className="absolute -bottom-8 -start-8 w-52 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold text-slate-900">{t("topChannels")}</p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="size-14 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(${channelLegend
                .map((c, i) => `${c.color} ${i * 20}% ${(i + 1) * 20}%`)
                .join(", ")})`,
            }}
          />
          <ul className="min-w-0 space-y-1">
            {channelLegend.slice(0, 3).map((c) => (
              <li key={c.label} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function AuthShowcasePanel({
  eyebrow,
  heading,
  description,
  features,
  footer,
}: AuthShowcasePanelProps) {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-10 lg:flex xl:p-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -end-24 size-96 rounded-full bg-violet-200/50 blur-3xl" />
        <div className="absolute -bottom-24 -start-24 size-96 rounded-full bg-indigo-200/50 blur-3xl" />
      </div>

      <div className="relative pt-10">
        <DashboardPreviewCard />
      </div>

      <div className="relative mt-16 space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-violet-600">{eyebrow}</p>
          <h2 className="text-3xl font-bold text-slate-900">{heading}</h2>
          <p className="max-w-md text-sm leading-6 text-slate-600">{description}</p>
        </div>

        <ul className="space-y-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <li key={feature.title} className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
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

        {footer ? (
          <div className="flex items-center gap-2 border-t border-slate-200/70 pt-5 text-sm text-slate-600">
            {footer}
          </div>
        ) : null}
      </div>
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
