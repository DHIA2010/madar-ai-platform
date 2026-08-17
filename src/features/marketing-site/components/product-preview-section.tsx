const METRICS = [
  { label: "Total Revenue", value: "$482,300" },
  { label: "Marketing Spend", value: "$61,200" },
  { label: "ROAS", value: "4.8x" },
  { label: "Conversions", value: "3,214" },
  { label: "CPA", value: "$19.05" },
  { label: "CTR", value: "2.6%" },
  { label: "Conversion Rate", value: "3.1%" },
]

const CHANNEL_PERFORMANCE = [
  { label: "Google Ads", value: 82 },
  { label: "Meta Ads", value: 68 },
  { label: "Snapchat Ads", value: 51 },
  { label: "Organic", value: 40 },
]

export function ProductPreviewSection() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Product preview
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            See your marketing performance at a glance.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            An example of the analytics dashboard businesses see once their advertising and commerce
            platforms are connected.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/5">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
            <span className="text-xs font-medium text-slate-500">Marketing Overview</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
              Example dashboard
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-5 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                <p className="mt-1.5 text-xl font-semibold text-slate-900">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-px bg-slate-200 lg:grid-cols-2">
            <div className="bg-white p-6">
              <p className="text-sm font-semibold text-slate-900">Revenue trend</p>
              <svg viewBox="0 0 320 120" className="mt-4 h-32 w-full" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="0,90 40,78 80,84 120,55 160,62 200,32 240,40 280,18 320,25"
                />
                <polyline
                  fill="none"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  points="0,100 40,96 80,92 120,86 160,80 200,72 240,64 280,58 320,52"
                />
              </svg>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-blue-600" /> Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-slate-400" /> Marketing spend
                </span>
              </div>
            </div>

            <div className="bg-white p-6">
              <p className="text-sm font-semibold text-slate-900">Channel performance</p>
              <div className="mt-5 space-y-3">
                {CHANNEL_PERFORMANCE.map((channel) => (
                  <div key={channel.label}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{channel.label}</span>
                      <span>{channel.value}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400"
                        style={{ width: `${channel.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Figures shown are illustrative and used only to demonstrate the product interface.
        </p>
      </div>
    </section>
  )
}
