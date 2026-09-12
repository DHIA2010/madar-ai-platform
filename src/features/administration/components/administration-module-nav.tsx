"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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

const NAV_ITEMS = [
  { href: ROUTES.administration, label: "نظرة عامة", icon: Grid2x2 },
  { href: ROUTES.administrationUsers, label: "المستخدمون", icon: Users },
  { href: ROUTES.administrationRoles, label: "الأدوار", icon: ShieldCheck },
  { href: ROUTES.administrationTeams, label: "الفرق", icon: UsersRound },
  { href: ROUTES.administrationInvitations, label: "الدعوات", icon: Mail },
  { href: ROUTES.administrationActivityLog, label: "السجل الشامل", icon: History },
  { href: ROUTES.administrationAuditLog, label: "سجلات التدقيق", icon: BarChart3 },
  { href: ROUTES.administrationSessions, label: "الجلسات النشطة", icon: Monitor },
]

export function AdministrationModuleNav() {
  const pathname = usePathname()

  return (
    <nav dir="rtl" className="overflow-x-auto rounded-2xl border border-[#e8edf3] bg-white p-1.5">
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
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
