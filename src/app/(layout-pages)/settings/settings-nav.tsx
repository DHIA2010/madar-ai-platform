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
//
// Sale notes (/settings/notes) is deliberately NOT listed here -- it's a sub-resource of cashier
// configuration (a reusable note library, same shape as Tax Rates/Payment Methods), reached via
// its own "Manage sale notes" link inside CashierSettingsPage.tsx's "Sale settings" section
// instead, the same "drill in from where you're already looking" pattern most settings UIs use for
// a secondary resource rather than growing this rail into a nested tree for just one entry.

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { ROUTES } from "@/constants/routes"
import { getActiveApplications, type ApplicationCategoryId } from "@/features/applications"
import { useWorkspace } from "@/features/workspace"
import { cn } from "@/lib/utils"

interface SettingsSection {
  key: "general" | "devices" | "cashier" | "workspaces" | "payments" | "tax" | "zatca" | "backup"
  href?: string
  // Whether this section has no destination yet. When true, it's shown disabled with a reason.
  pending?: boolean
  // Same gate as the main sidebar's items: shown only when one of these applications is active.
  applications?: ApplicationCategoryId[]
}

const SECTIONS: SettingsSection[] = [
  { key: "general", href: ROUTES.settings },
  { key: "devices", href: ROUTES.settingsDevices, applications: ["pos"] },
  { key: "cashier", href: ROUTES.settingsCashier, applications: ["pos"] },
  { key: "workspaces", href: ROUTES.settingsWorkspaces },
  { key: "payments", href: ROUTES.settingsPayments },
  { key: "tax", href: ROUTES.settingsTaxes },
  { key: "zatca", href: ROUTES.settingsZatca, applications: ["pos"] },
  { key: "backup", pending: true },
]

// Metrics from the design source: 11px/14px padding, 11px radius, 13px label, and a resting fill
// on every row -- the rows are tinted rather than transparent, so the rail reads as a stack of
// chips. The design carries no icons here; the labels alone are the navigation.
const ROW_BASE = "relative block w-full rounded-[11px] px-3.5 py-[11px] text-right text-[13px]"

export function SettingsNav() {
  const t = useTranslations("settings.nav")
  const pathname = usePathname()
  const { currentOrganization } = useWorkspace()
  const activeApplications = getActiveApplications(currentOrganization?.settings)
  const sections = SECTIONS.filter(
    (section) =>
      !section.applications || section.applications.some((app) => activeApplications.includes(app))
  )

  // Longest match wins, so /settings/devices does not also light up /settings. The same rule the
  // sidebar uses for its own nested sections.
  const activeHref =
    sections
      .map((section) => section.href)
      .filter((href): href is string => Boolean(href))
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((left, right) => right.length - left.length)[0] ?? null

  return (
    <nav className="flex flex-col">
      <h2 className="mb-2.5 px-2 text-[13px] font-bold text-[#8098b4]">{t("heading")}</h2>

      <ul className="flex flex-col gap-1">
        {sections.map((section) => {
          const active = Boolean(section.href) && section.href === activeHref
          const label = t(`sections.${section.key}`)

          if (!section.href) {
            return (
              <li key={section.key}>
                <span
                  title={section.pending ? t("backupPendingReason") : undefined}
                  aria-disabled="true"
                  className={cn(
                    ROW_BASE,
                    "cursor-not-allowed bg-[#f7f9fc] font-medium text-[#c4cdd9]"
                  )}
                >
                  {label}
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
                {label}
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
