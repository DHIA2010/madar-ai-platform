"use client"

// The rail down the side of every settings screen.
//
// This list is settings-only now: إدارة المنتجات / إدارة العملاء / المستخدمين والصلاحيات /
// التكاملات used to sit here too, linking straight out to those full platform areas -- but they
// are not settings, they are the app's own primary sections (each already has its own sidebar
// entry one click away), so listing them here duplicated the main nav instead of describing what
// this rail actually covers.
//
// Sections with no destination yet are shown disabled with a reason rather than hidden: the
// information architecture is the point of this rail, and a link that silently goes nowhere is
// worse than one that says it is not built.

import { usePathname } from "next/navigation"
import Link from "next/link"

import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"

interface SettingsSection {
  key: string
  label: string
  href?: string
  // Why it is not reachable yet, shown on hover. Absent means the section is live.
  pending?: string
}

const SECTIONS: SettingsSection[] = [
  { key: "general", label: "الإعدادات العامة", href: ROUTES.settings },
  { key: "devices", label: "إعدادات الأجهزة", href: ROUTES.settingsDevices },
  { key: "branches", label: "إدارة الفروع", href: ROUTES.settingsBranches },
  { key: "payments", label: "طرق الدفع", href: ROUTES.settingsPayments },
  { key: "tax", label: "الضرائب والفوترة", pending: "إعدادات الضرائب والفوترة غير متاحة بعد" },
  { key: "backup", label: "النسخ الاحتياطي", pending: "النسخ الاحتياطي غير متاح بعد" },
]

// Metrics from the design source: 11px/14px padding, 11px radius, 13px label, and a resting fill
// on every row -- the rows are tinted rather than transparent, so the rail reads as a stack of
// chips. The design carries no icons here; the labels alone are the navigation.
const ROW_BASE = "relative block w-full rounded-[11px] px-3.5 py-[11px] text-right text-[13px]"

export function SettingsNav() {
  const pathname = usePathname()

  // Longest match wins, so /settings/devices does not also light up /settings. The same rule the
  // sidebar uses for its own nested sections.
  const activeHref =
    SECTIONS.map((section) => section.href)
      .filter((href): href is string => Boolean(href))
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((left, right) => right.length - left.length)[0] ?? null

  return (
    <nav className="flex flex-col">
      <h2 className="mb-2.5 px-2 text-[13px] font-bold text-[#8098b4]">الإعدادات</h2>

      <ul className="flex flex-col gap-1">
        {SECTIONS.map((section) => {
          const active = Boolean(section.href) && section.href === activeHref

          if (!section.href) {
            return (
              <li key={section.key}>
                <span
                  title={section.pending}
                  aria-disabled="true"
                  className={cn(
                    ROW_BASE,
                    "cursor-not-allowed bg-[#f7f9fc] font-medium text-[#c4cdd9]"
                  )}
                >
                  {section.label}
                </span>
              </li>
            )
          }

          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  ROW_BASE,
                  "transition-colors",
                  active
                    ? "bg-[#eff6ff] font-bold text-[#2563eb]"
                    : "bg-[#f4f7fc] font-medium text-[#334155] hover:bg-[#eaf0fa] hover:text-[#0d1b3e]"
                )}
              >
                {/* RTL: start-0 puts the accent on the right edge, where the row begins. It runs
                    the full height of the row, per the design. */}
                {active ? (
                  <span className="absolute inset-y-0 start-0 w-1 rounded-s-[3px] bg-[#2563eb]" />
                ) : null}
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
      {/* The "تحتاج مساعدة؟" card that used to close out this rail now lives one level up, in the
          main app sidebar under its own الإعدادات entry (see nav-main.tsx) -- it shows there
          whenever any /settings page is open, the same condition this rail itself is scoped to. */}
    </nav>
  )
}
