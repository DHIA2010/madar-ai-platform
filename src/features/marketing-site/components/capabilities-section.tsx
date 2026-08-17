import { Gauge, LayoutDashboard, Link2, Sparkles, Target, TrendingUp } from "lucide-react"

const CAPABILITIES = [
  {
    icon: LayoutDashboard,
    title: "Campaign Analytics",
    description: "Understand campaign performance across your advertising channels.",
  },
  {
    icon: Link2,
    title: "Cross-Channel Reporting",
    description: "Bring marketing performance data into a unified reporting experience.",
  },
  {
    icon: Target,
    title: "Conversion & Performance Tracking",
    description:
      "Monitor important marketing metrics and understand how campaigns perform against business outcomes.",
  },
  {
    icon: Gauge,
    title: "Marketing KPIs",
    description: "Track the metrics that matter to your business in one place.",
  },
  {
    icon: TrendingUp,
    title: "Data Integration",
    description: "Connect advertising, analytics, and commerce platforms.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Insights",
    description:
      "Use intelligent analysis to surface useful patterns and opportunities from marketing data.",
  },
]

export function CapabilitiesSection() {
  return (
    <section className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Key capabilities
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to understand your marketing.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <div
              key={capability.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50">
                <capability.icon className="size-5 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{capability.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{capability.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
