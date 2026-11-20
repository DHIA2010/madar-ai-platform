"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

const CAMPAIGN_NAV_ITEMS = [
  { href: ROUTES.campaigns, labelKey: "dashboard" },
  { href: `${ROUTES.campaigns}/list`, labelKey: "list" },
  { href: ROUTES.campaignsCheckup, labelKey: "checkup" },
  { href: `${ROUTES.campaigns}/journey`, labelKey: "journey" },
  { href: ROUTES.campaignsCreate, labelKey: "create" },
  { href: `${ROUTES.campaigns}/creative-library`, labelKey: "creativeLibrary" },
  // Templates are left out: the page only holds placeholders.
] as const

export function CampaignModuleNav() {
  // Without the trailing slash the app adds to every address, so the open tab is marked.
  const pathname = usePathname().replace(/(.)\/$/, "$1")
  const t = useTranslations("campaigns.moduleNav")

  return (
    <nav className="overflow-x-auto rounded-xl border border-border/70 bg-card p-1">
      <ul className="flex min-w-max items-center gap-1">
        {CAMPAIGN_NAV_ITEMS.map((item) => {
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
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
