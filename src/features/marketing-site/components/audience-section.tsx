import { Check } from "lucide-react"

const AUDIENCES = [
  "E-commerce Store Owners",
  "Marketing Managers",
  "Performance Marketers",
  "Growth Teams",
  "E-commerce Agencies",
]

const PAIN_POINTS = [
  "Marketing data is spread across multiple platforms.",
  "Campaign performance is difficult to compare.",
  "Reporting is time-consuming.",
  "Important insights are buried in raw data.",
  "Business owners need a clear picture of marketing performance.",
]

export function AudienceSection() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Who MADAR is for
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Built for modern e-commerce teams.
          </h2>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {AUDIENCES.map((audience) => (
            <span
              key={audience}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
            >
              {audience}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50/60 p-8">
          <h3 className="text-base font-semibold text-slate-900">
            Common marketing data challenges
          </h3>
          <ul className="mt-5 space-y-3">
            {PAIN_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-slate-700">
                <Check className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-7 text-slate-600">
            MADAR addresses these problems by connecting marketing and commerce data into one place,
            organizing it into clear metrics, and helping teams spend less time consolidating data
            and more time acting on it.
          </p>
        </div>
      </div>
    </section>
  )
}
