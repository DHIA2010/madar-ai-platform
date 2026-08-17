import { ArrowDown, Layers, LineChart, Megaphone, Sparkles, Target } from "lucide-react"

const FLOW_STEPS = [
  { icon: Megaphone, label: "Advertising Platforms" },
  { icon: Layers, label: "MADAR" },
  { icon: Target, label: "Unified Marketing Data" },
  { icon: LineChart, label: "Analytics & Insights" },
  { icon: Sparkles, label: "Better Decisions" },
]

export function WhatIsMadarSection() {
  return (
    <section id="product" className="bg-white py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            What is MADAR
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Marketing data, connected.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            MADAR is a marketing analytics and intelligence platform built for e-commerce
            businesses. It connects advertising and commerce data into a unified view so businesses
            can understand where their marketing performance is coming from and where there is room
            to improve.
          </p>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Instead of jumping between separate ad accounts, spreadsheets, and store dashboards,
            MADAR helps businesses move from fragmented marketing data to one unified view of
            performance.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-8">
          <ul className="flex flex-col items-center gap-3">
            {FLOW_STEPS.map((step, index) => (
              <li key={step.label} className="flex w-full flex-col items-center">
                <div className="flex w-full max-w-xs items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <step.icon className="size-5 shrink-0 text-blue-600" aria-hidden="true" />
                  <span className="text-sm font-medium text-slate-800">{step.label}</span>
                </div>
                {index < FLOW_STEPS.length - 1 ? (
                  <ArrowDown className="my-2 size-4 text-slate-300" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
