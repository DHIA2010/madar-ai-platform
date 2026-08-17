import { cn } from "@/lib/utils"

import { AppBadge } from "@/components/app"

import { type IntegrationStatus, MARKETING_INTEGRATIONS } from "../marketing-constants"

const STATUS_STYLES: Record<IntegrationStatus, string> = {
  Available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "In Development": "border-amber-200 bg-amber-50 text-amber-700",
  "Coming Soon": "border-slate-200 bg-slate-100 text-slate-600",
}

export function IntegrationsSection() {
  return (
    <section id="integrations" className="bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Integrations
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Connect the tools that power your marketing.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            MADAR connects to the advertising and commerce platforms e-commerce businesses already
            use. Some integrations are available today; others are actively in development.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETING_INTEGRATIONS.map((integration) => (
            <div
              key={integration.name}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{integration.name}</h3>
                <AppBadge
                  variant="outline"
                  className={cn(
                    "shrink-0 whitespace-nowrap text-[11px] font-medium",
                    STATUS_STYLES[integration.status]
                  )}
                >
                  {integration.status}
                </AppBadge>
              </div>
              <p className="text-sm leading-6 text-slate-600">{integration.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
          <h3 className="text-sm font-semibold text-slate-900">Connecting TikTok advertising</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            MADAR can connect authorized businesses&rsquo; TikTok advertising accounts and use
            approved advertising data to provide campaign analytics and reporting. Access to TikTok
            data is only used with explicit account authorization through TikTok&rsquo;s official
            APIs, and only to power analytics and reporting inside MADAR.
          </p>
        </div>
      </div>
    </section>
  )
}
