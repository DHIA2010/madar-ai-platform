import type { ReactNode } from "react"

import { MarketingFooter } from "./marketing-footer"
import { MarketingHeader } from "./marketing-header"

interface LegalPageShellProps {
  title: string
  effectiveDate: string
  intro: ReactNode
  children: ReactNode
}

export function LegalPageShell({ title, effectiveDate, intro, children }: LegalPageShellProps) {
  return (
    <div lang="en" dir="ltr" className="min-h-screen bg-white text-slate-900 antialiased">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-slate-500">Effective date: {effectiveDate}</p>
          <p className="mt-4 text-base leading-7 text-slate-600">{intro}</p>
        </header>
        <div className="space-y-10 text-sm leading-7 text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
