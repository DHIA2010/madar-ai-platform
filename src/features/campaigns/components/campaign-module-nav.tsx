"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

const CAMPAIGN_NAV_ITEMS = [
  { href: ROUTES.campaigns, labelKey: "dashboard" },
  { href: `${ROUTES.campaigns}/list`, labelKey: "list" },
  { href: `${ROUTES.campaigns}/journey`, labelKey: "journey" },
  { href: ROUTES.campaignsCreate, labelKey: "create" },
  { href: `${ROUTES.campaigns}/creative-library`, labelKey: "creativeLibrary" },
  { href: `${ROUTES.campaigns}/templates`, labelKey: "templates" },
] as const

export function CampaignModuleNav() {
  const pathname = usePathname()
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
