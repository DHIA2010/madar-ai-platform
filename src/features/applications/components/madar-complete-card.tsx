"use client"

import Link from "next/link"
import { Check, Crown } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import type { MadarCompleteBundle } from "../types"

export function MadarCompleteCard({
  bundle,
  onSubscribe,
}: {
  bundle: MadarCompleteBundle
  onSubscribe: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-[#f4d98a] bg-gradient-to-l from-[#fffaf0] to-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-[#fff3d6] text-[#c2900c]">
          <Crown className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-extrabold text-[#0b1738]">{bundle.name}</h3>
            <span className="rounded-full bg-[#fff3d6] px-2.5 py-1 text-[10.5px] font-bold text-[#c2900c]">
              {bundle.badgeLabel}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#6b7b96]">{bundle.description}</p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {bundle.benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-1.5 text-[11.5px] text-[#334155]">
                <Check className="size-3.5 shrink-0 text-[#16a34a]" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href={ROUTES.marketplaceDetails(bundle.id)}>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
          >
            {bundle.secondaryCtaLabel}
          </AppButton>
        </Link>
        <AppButton
          className="h-10 rounded-[10px] bg-[#c2900c] text-[12.5px] font-semibold text-white hover:bg-[#a97b0a]"
          onClick={onSubscribe}
        >
          {bundle.primaryCtaLabel}
        </AppButton>
      </div>
    </div>
  )
}
