"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Megaphone, ShoppingBag, Store } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { getActiveApplications, type ApplicationCategoryId } from "@/features/applications"
import { useWorkspace } from "@/features/workspace"

import PosSummaryDashboard from "./PosSummaryDashboard"
import CampaignsSummaryDashboard from "./CampaignsSummaryDashboard"
import StoresSummaryDashboard from "./StoresSummaryDashboard"

import { type Locale, localeDirection } from "@/i18n/locales"

type HomeTab = "stores" | "campaigns" | "pos"

const TAB_ICON: Record<HomeTab, React.ComponentType<{ className?: string }>> = {
  stores: Store,
  campaigns: Megaphone,
  pos: ShoppingBag,
}
// Right-to-left visual order in the reference design (Stores, Campaigns, POS reading right to
// left) -- array order stays logical/LTR-authored; the flex row itself flips via `dir`.
const TAB_ORDER: HomeTab[] = ["stores", "campaigns", "pos"]

// Which application each tab's content is actually scoped to (confirmed by reading each
// *SummaryDashboard.tsx's own data fetching -- PosSummaryDashboard reads POS reports,
// CampaignsSummaryDashboard reads ad-campaign/channel reports, StoresSummaryDashboard reads real
// orders/stores). Drives which tabs this organization even gets to see, reusing the same
// activation flags app-sidebar.tsx's own nav filtering reads.
const TAB_APPLICATION: Record<HomeTab, ApplicationCategoryId> = {
  stores: "ecommerce",
  campaigns: "advertising",
  pos: "pos",
}

export function HomeTabs() {
  const t = useTranslations("dashboard.homeTabs")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { currentOrganization } = useWorkspace()

  const activeApplications = getActiveApplications(currentOrganization?.settings)
  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((tabKey) => activeApplications.includes(TAB_APPLICATION[tabKey])),
    [activeApplications]
  )

  // Explicit user selection only -- null until a tab is clicked. The actually-displayed tab
  // (below) is derived during render instead of synced back into this state via an effect, so a
  // previously-selected tab that gets deactivated out from under the user falls back to the
  // first still-visible one without a setState-in-effect render cascade.
  const [selectedTab, setSelectedTab] = useState<HomeTab | null>(null)
  const tab =
    selectedTab && visibleTabs.includes(selectedTab) ? selectedTab : (visibleTabs[0] ?? null)

  // No application activated at all -- every tab's content is scoped to one specific
  // application, so there is nothing for this page to show. Send the organization to the
  // marketplace instead of rendering an empty home page, the same destination the sidebar's own
  // "Home" link is hidden in favor of for a brand-new org (see app-sidebar.tsx's
  // ANY_APPLICATION comment).
  useEffect(() => {
    if (visibleTabs.length === 0) {
      router.replace(ROUTES.marketplace)
    }
  }, [visibleTabs, router])

  if (visibleTabs.length === 0 || !tab) {
    return null
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {visibleTabs.map((key) => {
          const active = tab === key
          const Icon = TAB_ICON[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedTab(key)}
              className={cn(
                "flex h-11 items-center gap-2 rounded-full border px-5 text-[13.5px] font-bold transition-all",
                active
                  ? "border-[#2878ff] bg-[#2878ff] text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)]"
                  : "border-[#e1e7f0] bg-white text-[#0b1738] hover:-translate-y-px hover:border-[#c4d5f0]"
              )}
            >
              <Icon className="size-4" />
              {t(key)}
            </button>
          )
        })}
      </div>

      {tab === "pos" ? (
        <PosSummaryDashboard />
      ) : tab === "campaigns" ? (
        <CampaignsSummaryDashboard />
      ) : (
        <StoresSummaryDashboard />
      )}
    </div>
  )
}
