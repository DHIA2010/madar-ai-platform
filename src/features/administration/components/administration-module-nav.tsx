"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  BarChart3,
  Grid2x2,
  History,
  Mail,
  Monitor,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { type Locale, localeDirection } from "@/i18n/locales"

const NAV_ITEMS = [
  { href: ROUTES.administration, key: "overview", icon: Grid2x2 },
  { href: ROUTES.administrationUsers, key: "users", icon: Users },
  { href: ROUTES.administrationRoles, key: "roles", icon: ShieldCheck },
  { href: ROUTES.administrationTeams, key: "teams", icon: UsersRound },
  { href: ROUTES.administrationInvitations, key: "invitations", icon: Mail },
  { href: ROUTES.administrationActivityLog, key: "activityLog", icon: History },
  { href: ROUTES.administrationAuditLog, key: "auditLog", icon: BarChart3 },
  { href: ROUTES.administrationSessions, key: "sessions", icon: Monitor },
] as const

export function AdministrationModuleNav() {
  const t = useTranslations("administration.nav")
  const locale = useLocale() as Locale
  const pathname = usePathname()

  return (
    <nav
      dir={localeDirection(locale)}
      className="overflow-x-auto rounded-2xl border border-[#e8edf3] bg-white p-1.5"
    >
      <ul className="flex min-w-max items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold transition-colors",
                  active
                    ? "bg-[#2563eb] text-white"
                    : "text-[#5b6b85] hover:bg-[#f4f7fc] hover:text-[#0d1b3e]"
                )}
              >
                <Icon className="size-3.5" />
                {t(item.key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
