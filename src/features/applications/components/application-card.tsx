"use client"

import Link from "next/link"
import { Check, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import type { ApplicationDefinition } from "../types"

const PAGE_TEXT = "text-[#0b1738]"
const MUTED_TEXT = "text-[#6b7b96]"

const PRICING_BADGE_CLASS: Record<ApplicationDefinition["pricingModel"], string> = {
  free: "bg-[#e6f9ee] text-[#16a34a]",
  paid: "bg-[#fff2e8] text-[#c2540c]",
}

const PRICING_BADGE_LABEL: Record<ApplicationDefinition["pricingModel"], string> = {
  free: "مجاني",
  paid: "مدفوع",
}

export function ApplicationCard({
  application,
  activating,
  onActivate,
  onDeactivate,
}: {
  application: ApplicationDefinition
  activating: boolean
  onActivate: (application: ApplicationDefinition) => void
  onDeactivate: (application: ApplicationDefinition) => void
}) {
  const Icon = application.icon
  const isSubscribed = application.subscriptionStatus === "subscribed"
  const isPendingReview = application.subscriptionStatus === "pending_review"

  return (
    <div className="flex h-full flex-col rounded-[14px] border border-[#e1e7f0] bg-white p-4 transition-shadow duration-200 hover:shadow-[0_8px_20px_rgba(11,23,56,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-[10px]",
              application.accent.iconWrapperClassName
            )}
          >
            <Icon className="size-5" />
          </span>
          <p className={cn("text-[14px] font-bold leading-[19px]", PAGE_TEXT)}>
            {application.name}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
            PRICING_BADGE_CLASS[application.pricingModel]
          )}
        >
          {PRICING_BADGE_LABEL[application.pricingModel]}
        </span>
      </div>

      <p className={cn("mt-3 text-[11.5px] leading-[19px]", MUTED_TEXT)}>
        {application.shortDescription}
      </p>

      {application.featuresDisplay === "iconGrid" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {application.features.slice(0, 4).map((feature) => {
            const FeatureIcon = feature.icon
            return (
              <div
                key={feature.label}
                className="flex flex-col items-center gap-1.5 rounded-[10px] border border-[#eef2f8] bg-[#fafbfd] px-2 py-3 text-center"
              >
                {FeatureIcon ? <FeatureIcon className="size-4 text-[#5b6b85]" /> : null}
                <span className="text-[10.5px] font-semibold text-[#4c5d79]">{feature.label}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {application.features.map((feature) => (
            <li key={feature.label} className="flex items-start gap-2 text-[11.5px] text-[#334155]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-[#16a34a]" />
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        {application.priceLabel ? (
          <p className={cn("text-[12.5px] font-bold", PAGE_TEXT)}>{application.priceLabel}</p>
        ) : null}

        <div className={cn("flex items-center gap-2", application.priceLabel && "mt-4")}>
          <Link href={ROUTES.marketplaceDetails(application.id)} className="flex-1">
            <AppButton
              variant="outline"
              fullWidth
              className="h-10 rounded-[10px] border-[#e1e7f0] text-[12.5px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
            >
              معرفة المزيد
            </AppButton>
          </Link>
          {isPendingReview ? (
            <span className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] text-[12.5px] font-semibold text-[#b45309]">
              <Clock className="size-3.5" />
              قيد المراجعة
            </span>
          ) : application.primaryCta.label ? (
            <AppButton
              variant={isSubscribed ? "outline" : "default"}
              className={cn(
                "h-10 flex-1 rounded-[10px] text-[12.5px] font-semibold",
                isSubscribed
                  ? "border-[#e1e7f0] text-[#c2410c] hover:bg-[#fff2e8] hover:text-[#c2410c]"
                  : application.accent.primaryButtonClassName
              )}
              loading={activating}
              onClick={() => (isSubscribed ? onDeactivate(application) : onActivate(application))}
            >
              {isSubscribed ? "إلغاء التفعيل" : application.primaryCta.label}
            </AppButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}
