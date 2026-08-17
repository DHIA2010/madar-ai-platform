import Link from "next/link"
import { ArrowUpRight, TrendingUp } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { MADAR_APP_URL } from "../marketing-constants"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(37,99,235,0.10),rgba(255,255,255,0))]"
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700">
          Marketing intelligence for e-commerce
        </span>

        <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          AI-Powered Marketing Intelligence for E-commerce
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          MADAR brings your advertising and commerce data together to help you understand campaign
          performance, monitor marketing KPIs, and make smarter decisions.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <AppButton size="lg" asChild className="px-8">
            <a href={MADAR_APP_URL} rel="noopener">
              Get Started
              <ArrowUpRight className="size-4" />
            </a>
          </AppButton>
          <AppButton size="lg" variant="outline" asChild className="px-8">
            <Link href={ROUTES.marketing.product}>Explore MADAR</Link>
          </AppButton>
        </div>

        <div className="relative mt-16 w-full max-w-5xl">
          <div
            aria-hidden="true"
            className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-tr from-blue-500/10 via-sky-400/10 to-cyan-400/10 blur-2xl"
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-slate-300" />
                <span className="size-2.5 rounded-full bg-slate-300" />
                <span className="size-2.5 rounded-full bg-slate-300" />
              </div>
              <span className="ml-2 text-xs font-medium text-slate-500">
                app.madar.my — Example dashboard
              </span>
            </div>

            <div className="grid gap-4 p-6 text-left sm:grid-cols-3">
              {[
                { label: "Total Revenue", value: "$482,300", delta: "+12.4%" },
                { label: "Marketing Spend", value: "$61,200", delta: "+4.1%" },
                { label: "ROAS", value: "4.8x", delta: "+0.6x" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{metric.value}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <TrendingUp className="size-3.5" />
                    {metric.delta}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Revenue trend</p>
                <svg viewBox="0 0 240 80" className="mt-3 h-20 w-full" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points="0,60 30,52 60,55 90,38 120,42 150,24 180,28 210,14 240,18"
                  />
                </svg>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Channel performance</p>
                <div className="mt-3 flex h-20 items-end gap-2">
                  {[38, 62, 45, 74, 50, 66, 58].map((height, index) => (
                    <span
                      key={index}
                      style={{ height: `${height}%` }}
                      className="flex-1 rounded-t-sm bg-sky-400/70"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            Example dashboard — illustrative interface preview, not live account data.
          </p>
        </div>
      </div>
    </section>
  )
}
