import { Activity, AlertTriangle, GitCompare, PieChart, TrendingUp, Wallet } from "lucide-react"

const INSIGHT_CATEGORIES = [
  { icon: TrendingUp, label: "Performance changes" },
  { icon: AlertTriangle, label: "Campaign anomalies" },
  { icon: GitCompare, label: "Channel comparisons" },
  { icon: Wallet, label: "Budget efficiency" },
  { icon: Activity, label: "Conversion trends" },
  { icon: PieChart, label: "Marketing opportunities" },
]

export function AiIntelligenceSection() {
  return (
    <section className="bg-slate-950 py-20 text-white sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            AI marketing intelligence
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            From marketing data to meaningful insights.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            MADAR is being built to help businesses interpret marketing data rather than simply
            display raw numbers. Its AI capabilities are designed to help identify patterns and
            surface useful context across the metrics that matter.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INSIGHT_CATEGORIES.map((category) => (
            <div
              key={category.label}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <category.icon className="size-5 shrink-0 text-sky-400" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-100">{category.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
