import { Eye, Layers3, Sparkles, Timer } from "lucide-react"

const VALUE_PROPS = [
  {
    icon: Layers3,
    title: "One View of Marketing",
    description: "Bring important marketing data into one place.",
  },
  {
    icon: Timer,
    title: "Less Manual Reporting",
    description: "Reduce repetitive reporting and data consolidation work.",
  },
  {
    icon: Eye,
    title: "Clearer Performance",
    description: "Understand campaign performance through meaningful analytics.",
  },
  {
    icon: Sparkles,
    title: "Actionable Intelligence",
    description: "Turn marketing data into insights that can support better decisions.",
  },
]

export function WhyMadarSection() {
  return (
    <section className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Why MADAR</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Marketing intelligence that actually helps.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((item) => (
            <div key={item.title} className="text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                <item.icon className="size-5 text-blue-600" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
