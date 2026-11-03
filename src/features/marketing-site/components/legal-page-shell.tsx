import Link from "next/link"
import { Languages } from "lucide-react"
import type { ReactNode } from "react"

import { MarketingFooter } from "./marketing-footer"
import { MarketingHeader } from "./marketing-header"

interface LegalPageShellProps {
  // Arabic is the default; the English text stays available for platform reviewers.
  locale?: "ar" | "en"
  title: string
  effectiveDate: string
  // The same document in the other language.
  alternateHref: string
  intro: ReactNode
  children: ReactNode
}

const COPY = {
  ar: { effective: "تاريخ السريان", alternate: "English version" },
  en: { effective: "Effective date", alternate: "النسخة العربية" },
} as const

export function LegalPageShell({
  locale = "ar",
  title,
  effectiveDate,
  alternateHref,
  intro,
  children,
}: LegalPageShellProps) {
  const isArabic = locale === "ar"
  const copy = COPY[locale]
  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-white text-slate-900 antialiased">
      <MarketingHeader />
      <main
        lang={locale}
        dir={isArabic ? "rtl" : "ltr"}
        className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <header className="mb-10 border-b border-slate-200 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {title}
            </h1>
            <Link
              href={alternateHref}
              lang={isArabic ? "en" : "ar"}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Languages className="size-4" />
              {copy.alternate}
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {copy.effective}: {effectiveDate}
          </p>
          <p
            className={
              isArabic
                ? "mt-4 text-base leading-8 text-slate-600"
                : "mt-4 text-base leading-7 text-slate-600"
            }
          >
            {intro}
          </p>
        </header>
        <div
          className={
            isArabic
              ? "space-y-10 text-[15px] leading-8 text-slate-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-6"
              : "space-y-10 text-sm leading-7 text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-6"
          }
        >
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
