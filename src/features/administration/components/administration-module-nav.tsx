"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

const IAM_NAV_ITEMS = [
  { href: ROUTES.administration, label: "Overview" },
  { href: ROUTES.administrationUsers, label: "Users" },
  { href: ROUTES.administrationRoles, label: "Roles" },
  { href: ROUTES.administrationPermissions, label: "Permissions" },
  { href: ROUTES.administrationTeams, label: "Teams" },
  { href: ROUTES.administrationInvitations, label: "Invitations" },
  { href: ROUTES.administrationActivityLog, label: "Activity Log" },
  { href: ROUTES.administrationAuditLog, label: "Audit Log" },
  { href: ROUTES.administrationSessions, label: "Sessions" },
]

export function AdministrationModuleNav() {
  const pathname = usePathname()

  return (
    <nav className="overflow-x-auto rounded-xl border border-border/70 bg-card p-1">
      <ul className="flex min-w-max items-center gap-1">
        {IAM_NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
