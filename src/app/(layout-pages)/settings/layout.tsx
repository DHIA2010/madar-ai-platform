import type { ReactNode } from "react"
import { getLocale } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import { SettingsNav } from "./settings-nav"

// The rail sits beside every settings screen rather than inside each one, so a new section is a
// route and nothing else.
//
// -m-6 cancels the admin shell's page padding: the design runs the rail and the content pane edge
// to edge as one split surface, each supplying its own padding, rather than floating two cards
// inside a gutter. 4rem is the shell's header height, so the split fills the rest of the viewport.
//
// RTL: in Arabic the nav is written first so it lands on the right and the content pane on the
// left, which is how the design reads; border-e/start-0 follow the active locale's own direction
// rather than being hardcoded to that one layout.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as Locale
  return (
    <div
      dir={localeDirection(locale)}
      className="-m-6 flex min-h-[calc(100svh-4rem)] flex-col items-stretch md:flex-row"
    >
      {/* On a phone the rail stacks above the content instead of squeezing it. */}
      <aside className="w-full shrink-0 border-b border-[#e8edf3] bg-white px-3 py-5 md:w-[230px] md:border-b-0 md:border-e">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 px-[22px] py-6">{children}</div>
    </div>
  )
}
