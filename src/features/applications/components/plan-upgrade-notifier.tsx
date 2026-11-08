"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

// The event lib/errors/app-error.ts fires (PLAN_FEATURE_REQUIRED_EVENT) -- feature code can't
// import that module, so the name is repeated here.
const PLAN_FEATURE_REQUIRED_EVENT = "madar:plan-feature-required"

const KNOWN_FEATURES = [
  "shiftCash",
  "customRoles",
  "procurement",
  "customReports",
  "maxAdPlatforms",
  "maxStores",
] as const
type KnownFeature = (typeof KNOWN_FEATURES)[number]

// One notice for every feature the customer's plan doesn't include: whichever screen hit it, the
// server refused it with PLAN_FEATURE_NOT_INCLUDED, and this explains it with a way to upgrade.
export function PlanUpgradeNotifier() {
  const t = useTranslations("applications.planUpgrade")
  const router = useRouter()

  useEffect(() => {
    function onRequired(event: Event) {
      const feature = (event as CustomEvent<{ feature?: string }>).detail?.feature
      const known = KNOWN_FEATURES.includes(feature as KnownFeature)
        ? (feature as KnownFeature)
        : null
      toast.error(t("title"), {
        id: "plan-feature-required",
        description: known ? t(`features.${known}`) : t("description"),
        action: { label: t("cta"), onClick: () => router.push(ROUTES.marketplace) },
      })
    }
    window.addEventListener(PLAN_FEATURE_REQUIRED_EVENT, onRequired)
    return () => window.removeEventListener(PLAN_FEATURE_REQUIRED_EVENT, onRequired)
  }, [t, router])

  return null
}
