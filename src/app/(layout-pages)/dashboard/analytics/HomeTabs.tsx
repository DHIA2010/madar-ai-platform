"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Megaphone, ShoppingBag, Store } from "lucide-react"

import { cn } from "@/lib/utils"

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

export function HomeTabs() {
  const t = useTranslations("dashboard.homeTabs")
  const locale = useLocale() as Locale
  const [tab, setTab] = useState<HomeTab>("pos")

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TAB_ORDER.map((key) => {
          const active = tab === key
          const Icon = TAB_ICON[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
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
