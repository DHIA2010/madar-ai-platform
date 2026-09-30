"use client"

import { cn } from "@/lib/utils"

import type { ApplicationCategoryTab } from "../hooks"
import type { ApplicationCategoryId } from "../types"

export function ApplicationCategoryTabs({
  tabs,
  activeCategory,
  onSelect,
}: {
  tabs: ApplicationCategoryTab[]
  activeCategory: ApplicationCategoryId | "all"
  onSelect: (category: ApplicationCategoryId | "all") => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = tab.id === activeCategory
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40",
              active
                ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
                : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
            )}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10.5px] font-bold",
                active ? "bg-white/20 text-white" : "bg-[#f4f7fc] text-[#8190a8]"
              )}
            >
              {tab.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
