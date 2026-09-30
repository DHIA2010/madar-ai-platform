"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Clock, Crown } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import type { ApplicationCatalogEntry } from "../types"
import { isMadarCompleteBundle } from "../types"
import { ActivationConfirmDialog, type ActivationTarget } from "./activation-confirm-dialog"
import {
  ActivationRequestDialog,
  type ActivationRequestInput,
  type ActivationRequestTarget,
} from "./activation-request-dialog"

import { cairo } from "@/components/design/fonts"

const PAGE_TEXT = "text-[#0b1738]"
const MUTED_TEXT = "text-[#6b7b96]"

const PRICING_BADGE_CLASS: Record<"free" | "paid", string> = {
  free: "bg-[#e6f9ee] text-[#16a34a]",
  paid: "bg-[#fff2e8] text-[#c2540c]",
}

const PRICING_BADGE_LABEL: Record<"free" | "paid", string> = {
  free: "مجاني",
  paid: "مدفوع",
}

export function ApplicationDetailScreen({
  entry,
  onConfirmActivation,
  onSubmitActivationRequest,
}: {
  entry: ApplicationCatalogEntry
  // Deactivation + the مدار الكامل bundle's instant activation -- both still a plain confirm.
  onConfirmActivation: (target: ActivationTarget) => Promise<void>
  // A single paid application's activation -- now a tier + receipt request, not an instant confirm.
  onSubmitActivationRequest: (input: ActivationRequestInput) => Promise<void>
}) {
  const [pendingActivation, setPendingActivation] = useState<ActivationTarget | null>(null)
  const [pendingRequest, setPendingRequest] = useState<ActivationRequestTarget | null>(null)
  const isBundle = isMadarCompleteBundle(entry)

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      <Link
        href={ROUTES.marketplace}
        className="mb-3.5 flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6b85] hover:text-[#2878ff]"
      >
        <ArrowRight className="size-3.5" />
        العودة إلى التطبيقات
      </Link>

      <div className="rounded-[14px] border border-[#e1e7f0] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            {isBundle ? null : (
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-[12px]",
                  entry.accent.iconWrapperClassName
                )}
              >
                <entry.icon className="size-6" />
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={cn("text-[20px] font-extrabold", PAGE_TEXT)}>{entry.name}</h1>
                {isBundle ? (
                  <span className="rounded-full bg-[#fff3d6] px-2.5 py-1 text-[10.5px] font-bold text-[#c2900c]">
                    {entry.badgeLabel}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                      PRICING_BADGE_CLASS[entry.pricingModel]
                    )}
                  >
                    {PRICING_BADGE_LABEL[entry.pricingModel]}
                  </span>
                )}
              </div>
              {!isBundle && entry.priceLabel ? (
                <p className={cn("mt-1 text-[13px] font-bold", PAGE_TEXT)}>{entry.priceLabel}</p>
              ) : null}
            </div>
          </div>

          {isBundle ? (
            <div className="flex shrink-0 items-center gap-2">
              <AppButton
                className="h-11 rounded-[10px] bg-[#c2900c] text-[13px] font-semibold text-white hover:bg-[#a97b0a]"
                onClick={() =>
                  setPendingActivation({
                    id: entry.id,
                    name: entry.name,
                    confirmLabel: entry.primaryCtaLabel,
                    icon: Crown,
                    iconWrapperClassName: "bg-[#fff3d6] text-[#c2900c]",
                    confirmButtonClassName: "bg-[#c2900c] text-white hover:bg-[#a97b0a]",
                  })
                }
              >
                {entry.primaryCtaLabel}
              </AppButton>
            </div>
          ) : entry.primaryCta.label ? (
            <div className="flex shrink-0 items-center gap-2">
              {entry.subscriptionStatus === "subscribed" ? (
                <AppButton
                  variant="outline"
                  className="h-11 rounded-[10px] border-[#e1e7f0] text-[13px] font-semibold text-[#c2410c] hover:bg-[#fff2e8] hover:text-[#c2410c]"
                  onClick={() =>
                    setPendingActivation({
                      id: entry.id,
                      name: entry.name,
                      confirmLabel: "إلغاء التفعيل",
                      icon: entry.icon,
                      iconWrapperClassName: entry.accent.iconWrapperClassName,
                      intent: "deactivate",
                    })
                  }
                >
                  إلغاء التفعيل
                </AppButton>
              ) : entry.subscriptionStatus === "pending_review" ? (
                <span className="flex h-11 items-center gap-1.5 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-4 text-[13px] font-semibold text-[#b45309]">
                  <Clock className="size-4" />
                  قيد المراجعة
                </span>
              ) : (
                <AppButton
                  className={cn(
                    "h-11 rounded-[10px] text-[13px] font-semibold",
                    entry.accent.primaryButtonClassName
                  )}
                  onClick={() =>
                    setPendingRequest({
                      applicationId: entry.id,
                      name: entry.name,
                      icon: entry.icon,
                      iconWrapperClassName: entry.accent.iconWrapperClassName,
                    })
                  }
                >
                  {entry.primaryCta.label}
                </AppButton>
              )}
            </div>
          ) : null}
        </div>

        <p className={cn("mt-4 max-w-3xl text-[13px] leading-[23px]", MUTED_TEXT)}>
          {isBundle ? entry.description : entry.detailDescription}
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {(isBundle ? entry.benefits : entry.features.map((feature) => feature.label)).map(
            (item) => (
              <div key={item} className="flex items-center gap-2 text-[12.5px] text-[#334155]">
                <Check className="size-4 shrink-0 text-[#16a34a]" />
                {item}
              </div>
            )
          )}
        </div>
      </div>

      <ActivationConfirmDialog
        target={pendingActivation}
        onOpenChange={(open) => {
          if (!open) setPendingActivation(null)
        }}
        onConfirm={onConfirmActivation}
      />

      <ActivationRequestDialog
        target={pendingRequest}
        onOpenChange={(open) => {
          if (!open) setPendingRequest(null)
        }}
        onSubmit={onSubmitActivationRequest}
      />
    </div>
  )
}
