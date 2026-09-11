import type { ReactNode } from "react"

import { SettingsNav } from "./settings-nav"

// The rail sits beside every settings screen rather than inside each one, so a new section is a
// route and nothing else.
//
// -m-6 cancels the admin shell's page padding: the design runs the rail and the content pane edge
// to edge as one split surface, each supplying its own padding, rather than floating two cards
// inside a gutter. 4rem is the shell's header height, so the split fills the rest of the viewport.
//
// RTL: the nav is written first so it lands on the right and the content pane on the left, which
// is how the design reads. border-e is the rail's inner edge (its left in RTL).
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="-m-6 flex min-h-[calc(100svh-4rem)] items-stretch">
      <aside className="w-[230px] shrink-0 border-e border-[#e8edf3] bg-white px-3 py-5">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 px-[22px] py-6">{children}</div>
    </div>
  )
}
