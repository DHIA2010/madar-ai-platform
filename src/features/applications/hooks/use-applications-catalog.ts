"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import { useWorkspace } from "@/features/workspace"

import {
  APPLICATION_SETTINGS_KEY,
  APPLICATION_TRIAL_ENDS_AT_KEY,
  buildApplicationCatalog,
  buildMadarCompleteBundle,
  isTrialAvailable,
  resolveApplicationStatus,
} from "../services"
import type {
  ApplicationCategoryId,
  ApplicationDefinition,
  ApplicationSubscriptionStatus,
} from "../types"

import type {
  SubscriptionActivationRequestDto,
  SubscriptionPlanTier,
} from "@/application/contracts"

export interface ApplicationCategoryTab {
  id: ApplicationCategoryId | "all"
  label: string
  count: number
}

const CATEGORY_ORDER: ApplicationCategoryId[] = ["advertising", "ecommerce", "pos", "madarApps"]

// Activating a paid application now submits a SubscriptionActivationRequestDto (tier + receipt)
// instead of flipping organizations.settings directly -- only a Madar staff approval in the
// internal admin console does that (see submitActivationRequest below). Deactivation stays
// instant/self-service, same as before -- no approval needed to turn something off.
export function useApplicationsCatalog() {
  const {
    currentOrganization,
    updateOrganization,
    requestApplicationActivation,
    listMyOrganizationSubscriptionRequests,
    startApplicationTrial,
  } = useWorkspace()
  const t = useTranslations("applications")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<ApplicationCategoryId | "all">("all")
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [pendingRequests, setPendingRequests] = useState<SubscriptionActivationRequestDto[]>([])

  const catalog = useMemo(() => buildApplicationCatalog(t), [t])
  const bundle = useMemo(() => buildMadarCompleteBundle(t), [t])

  const organizationId = currentOrganization?.id ?? null

  const refetchPendingRequests = useCallback(async () => {
    if (!organizationId) return
    const requests = await listMyOrganizationSubscriptionRequests(organizationId)
    setPendingRequests(requests.filter((request) => request.status === "pending"))
  }, [organizationId, listMyOrganizationSubscriptionRequests])

  useEffect(() => {
    refetchPendingRequests()
  }, [refetchPendingRequests])

  const pendingApplications = useMemo(
    () => new Set(pendingRequests.map((request) => request.application)),
    [pendingRequests]
  )

  const statusById = useMemo<Record<string, ApplicationSubscriptionStatus>>(() => {
    const settings = currentOrganization?.settings
    return Object.fromEntries(
      catalog.map((application) => [
        application.id,
        resolveApplicationStatus(application, settings, pendingApplications),
      ])
    )
  }, [catalog, currentOrganization?.settings, pendingApplications])

  const trialAvailableByCategory = useMemo<Record<ApplicationCategoryId, boolean>>(() => {
    const settings = currentOrganization?.settings
    return Object.fromEntries(
      CATEGORY_ORDER.map((category) => [
        category,
        isTrialAvailable(category, settings, pendingApplications),
      ])
    ) as Record<ApplicationCategoryId, boolean>
  }, [currentOrganization?.settings, pendingApplications])

  const searchMatchedApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const withCurrentStatus = catalog.map((application) => ({
      ...application,
      subscriptionStatus: statusById[application.id] ?? application.subscriptionStatus,
    }))
    if (query.length === 0) {
      return withCurrentStatus
    }
    return withCurrentStatus.filter(
      (application) =>
        application.name.toLowerCase().includes(query) ||
        application.shortDescription.toLowerCase().includes(query)
    )
  }, [catalog, searchQuery, statusById])

  const categoryTabs = useMemo<ApplicationCategoryTab[]>(() => {
    const all: ApplicationCategoryTab = {
      id: "all",
      label: t("categories.all"),
      count: searchMatchedApplications.length,
    }
    const rest = CATEGORY_ORDER.map((category) => ({
      id: category,
      label: t(`categories.${category}`),
      count: searchMatchedApplications.filter((application) => application.category === category)
        .length,
    }))
    return [all, ...rest]
  }, [searchMatchedApplications, t])

  const visibleApplications = useMemo<ApplicationDefinition[]>(() => {
    if (activeCategory === "all") {
      return searchMatchedApplications
    }
    return searchMatchedApplications.filter(
      (application) => application.category === activeCategory
    )
  }, [activeCategory, searchMatchedApplications])

  async function deactivateApplication(id: string) {
    if (!currentOrganization) return
    const application = catalog.find((entry) => entry.id === id)
    if (!application) return

    setActivatingId(id)
    try {
      await updateOrganization(currentOrganization.id, {
        settings: {
          [APPLICATION_SETTINGS_KEY[application.category]]: false,
          // resolveApplicationStatus treats a still-unexpired trial as "trial" (effectively
          // active) REGARDLESS of *Enabled -- clearing only *Enabled left a trial app showing
          // as still active after "cancel activation" (confirmed as a real production bug,
          // 2026-10-05: the toast succeeded but the card never updated). APPLICATION_TRIAL_USED_KEY
          // deliberately stays untouched -- cancelling must not grant a second free trial.
          [APPLICATION_TRIAL_ENDS_AT_KEY[application.category]]: "",
        },
      })
    } finally {
      setActivatingId(null)
    }
  }

  async function startTrial(id: string) {
    if (!currentOrganization) return
    const application = catalog.find((entry) => entry.id === id)
    if (!application) return

    setActivatingId(id)
    try {
      await startApplicationTrial(currentOrganization.id, application.category)
    } finally {
      setActivatingId(null)
    }
  }

  async function submitActivationRequest(input: {
    applicationId: string
    planTier: SubscriptionPlanTier
    attachmentContentType: string
    attachmentDataBase64: string
  }) {
    if (!currentOrganization) return
    const application = catalog.find((entry) => entry.id === input.applicationId)
    if (!application) return

    setActivatingId(input.applicationId)
    try {
      await requestApplicationActivation(currentOrganization.id, {
        application: application.category,
        planTier: input.planTier,
        attachmentContentType: input.attachmentContentType,
        attachmentDataBase64: input.attachmentDataBase64,
      })
      await refetchPendingRequests()
    } finally {
      setActivatingId(null)
    }
  }

  // مدار الكامل still activates all 4 instantly -- it's a distinct "buy everything" fast path
  // that doesn't carry its own plan-tier concept the way an individual application's request
  // does. Aligning it with the same request/approval flow is a follow-up, not part of this pass.
  async function activateAllApplications() {
    if (!currentOrganization) return
    setActivatingId(bundle.id)
    try {
      await updateOrganization(currentOrganization.id, {
        settings: {
          advertisingEnabled: true,
          ecommerceEnabled: true,
          posEnabled: true,
          madarAppsEnabled: true,
        },
      })
    } finally {
      setActivatingId(null)
    }
  }

  return {
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    categoryTabs,
    visibleApplications,
    // Exposed so a single-application view (the [appId] detail page) can resolve one
    // application's live status, and look itself up via getApplicationById, without duplicating
    // the settings+pending-request logic or the translation-merge logic above.
    catalog,
    statusById,
    trialAvailableByCategory,
    bundle,
    deactivateApplication,
    submitActivationRequest,
    startTrial,
    activateAllApplications,
    activatingId,
  }
}
