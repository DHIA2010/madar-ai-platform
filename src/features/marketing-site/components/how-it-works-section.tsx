import { Cable, Database, Lightbulb, LineChart } from "lucide-react"

const STEPS = [
  {
    number: "01",
    title: "Connect",
    description: "Connect your marketing and commerce platforms.",
    icon: Cable,
  },
  {
    number: "02",
    title: "Collect",
    description: "MADAR securely retrieves authorized data from connected platforms.",
    icon: Database,
  },
  {
    number: "03",
    title: "Analyze",
    description:
      "MADAR organizes campaign, advertising, and commerce data into meaningful metrics.",
    icon: LineChart,
  },
  {
    number: "04",
    title: "Understand",
    description:
      "Use dashboards and insights to understand performance and identify opportunities.",
    icon: Lightbulb,
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            From raw marketing data to clear decisions.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="text-xs font-semibold tracking-wide text-slate-300">
                {step.number}
              </span>
              <div className="mt-3 flex size-11 items-center justify-center rounded-xl bg-blue-50">
                <step.icon className="size-5 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
