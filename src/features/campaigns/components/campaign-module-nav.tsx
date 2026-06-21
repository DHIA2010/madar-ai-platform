"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

const CAMPAIGN_NAV_ITEMS = [
  { href: ROUTES.campaigns, label: "Campaign Dashboard" },
  { href: `${ROUTES.campaigns}/list`, label: "Campaign List" },
  { href: ROUTES.campaignsCreate, label: "Create Campaign" },
  { href: `${ROUTES.campaigns}/creative-library`, label: "Creative Library" },
  { href: `${ROUTES.campaigns}/templates`, label: "Templates" },
]

export function CampaignModuleNav() {
  const pathname = usePathname()

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
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
