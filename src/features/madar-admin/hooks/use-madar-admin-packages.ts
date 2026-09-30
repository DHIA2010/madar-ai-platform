"use client"

import { useState } from "react"

import { getPlans } from "../services"
import type { PlanTier } from "../types"

// Plan activation toggles and trial settings are local-only for this UI-only pass -- no
// persistence, resets on reload. Mirrors the discipline established in
// use-applications-catalog.ts for the same reason.
export function useMadarAdminPackages() {
  const [plans, setPlans] = useState(getPlans())
  const [trialDays, setTrialDays] = useState(14)
  const [defaultTrialPlan, setDefaultTrialPlan] = useState<PlanTier>("growth")
  const [trialCardRequired, setTrialCardRequired] = useState(true)
  const [autoUpgradeEnabled, setAutoUpgradeEnabled] = useState(true)
  const [renewalReminderEnabled, setRenewalReminderEnabled] = useState(true)
  const [suspendOnFailedPayment, setSuspendOnFailedPayment] = useState(false)
  const [gracePeriodDays, setGracePeriodDays] = useState(7)

  function togglePlanActive(tier: PlanTier) {
    setPlans((current) =>
      current.map((plan) => (plan.tier === tier ? { ...plan, isActive: !plan.isActive } : plan))
    )
  }

  return {
    plans,
    togglePlanActive,
    trialDays,
    setTrialDays,
    defaultTrialPlan,
    setDefaultTrialPlan,
    trialCardRequired,
    setTrialCardRequired,
    autoUpgradeEnabled,
    setAutoUpgradeEnabled,
    renewalReminderEnabled,
    setRenewalReminderEnabled,
    suspendOnFailedPayment,
    setSuspendOnFailedPayment,
    gracePeriodDays,
    setGracePeriodDays,
  }
}
