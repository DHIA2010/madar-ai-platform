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
import {
  type ApplicationPricing,
  formatRiyals,
  purchasablePackages,
} from "../services/pricing.service"
import type {
  ApplicationCategoryId,
  ApplicationDefinition,
  ApplicationSubscriptionStatus,
} from "../types"
import { usePricingCatalog } from "./use-pricing"

import type { BillingInterval, SubscriptionActivationRequestDto } from "@/application/contracts"

export interface ApplicationCategoryTab {
  id: ApplicationCategoryId | "all"
  label: string
  count: number
}

// Drives trial-availability lookups -- needs every REAL category, including "procurement" (it
// has its own trial/enablement even though its card is filed under the "madarApps" tab, see
// TAB_ORDER below for that distinction).
const CATEGORY_ORDER: ApplicationCategoryId[] = [
  "advertising",
  "ecommerce",
  "pos",
  "madarApps",
  "procurement",
  "expenses",
  "ai",
  "customReports",
]

// Drives the marketplace's own category tabs/pills -- "procurement" is deliberately absent here:
// its card is filed under the "madarApps" tab (via ApplicationDefinition.tabCategory) rather than
// getting a dedicated tab of its own, even though it's billed/enforced independently.
const TAB_ORDER: ApplicationCategoryId[] = ["advertising", "ecommerce", "pos", "madarApps"]

type Translator = ReturnType<typeof useTranslations<"applications">>

// The marketplace card's price line, from Madar Admin pricing: the cheapest monthly price
// ("from"), else the cheapest yearly one, a fixed app's single price, or "contact us".
function priceLabelFor(pricing: ApplicationPricing | undefined, t: Translator): string | undefined {
  if (!pricing) return undefined
  if (pricing.mode === "free") return t("pricing.freeFor", { days: pricing.freeDays ?? 0 })
  if (pricing.mode === "contact") return t("pricing.contactUs")
  const packages = purchasablePackages(pricing)
  if (packages.length === 0) return t("pricing.contactUs")
  const cheapest = (prices: Array<number | null>) =>
    prices.filter((price): price is number => price !== null).sort((a, b) => a - b)[0]
  const monthly = cheapest(packages.map((pkg) => pkg.monthlyPriceHalalas))
  const yearly = cheapest(packages.map((pkg) => pkg.yearlyPriceHalalas))
  const price = monthly ?? yearly
  if (price === undefined) return t("pricing.contactUs")
  const period = monthly !== undefined ? t("pricing.perMonth") : t("pricing.perYear")
  return t(pricing.mode === "fixed" ? "pricing.fixed" : "pricing.startingFrom", {
    price: formatRiyals(price),
    period,
  })
}

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
    activateFreeApplication: activateFreeApplicationFor,
  } = useWorkspace()
  const t = useTranslations("applications")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<ApplicationCategoryId | "all">("all")
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [pendingRequests, setPendingRequests] = useState<SubscriptionActivationRequestDto[]>([])

  const pricing = usePricingCatalog()
  const pricingByApplication = useMemo(
    () => new Map((pricing ?? []).map((entry) => [entry.application, entry])),
    [pricing]
  )
  // Paid cards show Madar Admin's live price (until it loads, the catalog's own label).
  const catalog = useMemo(
    () =>
      buildApplicationCatalog(t).map((application) =>
        application.priceLabel === undefined
          ? application
          : {
              ...application,
              priceLabel:
                priceLabelFor(pricingByApplication.get(application.category), t) ??
                application.priceLabel,
              pricingModel:
                pricingByApplication.get(application.category)?.mode === "free"
                  ? "free"
                  : application.pricingModel,
            }
      ),
    [t, pricingByApplication]
  )
  const bundle = useMemo(
    () => ({
      ...buildMadarCompleteBundle(t),
      priceLabel: priceLabelFor(pricingByApplication.get("madarComplete"), t),
    }),
    [t, pricingByApplication]
  )

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
    () =>
      new Set(
        pendingRequests
          .map((request) => request.application)
          .filter(
            (application): application is ApplicationCategoryId => application !== "madarComplete"
          )
      ),
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
        // A free app needs no trial.
        pricingByApplication.get(category)?.mode !== "free" &&
          isTrialAvailable(category, settings, pendingApplications),
      ])
    ) as Record<ApplicationCategoryId, boolean>
  }, [currentOrganization?.settings, pendingApplications, pricingByApplication])

  const searchMatchedApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const withCurrentStatus = catalog
      .map((application) => ({
        ...application,
        subscriptionStatus: statusById[application.id] ?? application.subscriptionStatus,
      }))
      // Apps Madar Admin hid stay listed only for customers who already have (or requested) them.
      .filter(
        (application) =>
          pricingByApplication.get(application.category)?.visible !== false ||
          application.subscriptionStatus !== "not_subscribed"
      )
    if (query.length === 0) {
      return withCurrentStatus
    }
    return withCurrentStatus.filter(
      (application) =>
        application.name.toLowerCase().includes(query) ||
        application.shortDescription.toLowerCase().includes(query)
    )
  }, [catalog, searchQuery, statusById, pricingByApplication])

  const categoryTabs = useMemo<ApplicationCategoryTab[]>(() => {
    const all: ApplicationCategoryTab = {
      id: "all",
      label: t("categories.all"),
      count: searchMatchedApplications.length,
    }
    const rest = TAB_ORDER.map((category) => ({
      id: category,
      label: t(`categories.${category}`),
      count: searchMatchedApplications.filter(
        (application) => (application.tabCategory ?? application.category) === category
      ).length,
    }))
    return [all, ...rest]
  }, [searchMatchedApplications, t])

  const visibleApplications = useMemo<ApplicationDefinition[]>(() => {
    if (activeCategory === "all") {
      return searchMatchedApplications
    }
    return searchMatchedApplications.filter(
      (application) => (application.tabCategory ?? application.category) === activeCategory
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

  // An application (or the bundle) Madar Admin sells as free -- on right away, no payment.
  async function activateFreeApplication(id: string) {
    if (!currentOrganization) return
    const application =
      id === bundle.id
        ? ("madarComplete" as const)
        : catalog.find((entry) => entry.id === id)?.category
    if (!application) return

    setActivatingId(id)
    try {
      await activateFreeApplicationFor(currentOrganization.id, application)
    } finally {
      setActivatingId(null)
    }
  }

  // A bank-transfer request for one application or the bundle: the chosen package and billing
  // period plus the receipt. Priced server-side; a Madar staff approval activates it.
  async function submitActivationRequest(input: {
    applicationId: string
    packageId: string
    interval: BillingInterval
    attachmentContentType: string
    attachmentDataBase64: string
  }) {
    if (!currentOrganization) return
    const application =
      input.applicationId === bundle.id
        ? ("madarComplete" as const)
        : catalog.find((entry) => entry.id === input.applicationId)?.category
    if (!application) return

    setActivatingId(input.applicationId)
    try {
      await requestApplicationActivation(currentOrganization.id, {
        application,
        packageId: input.packageId,
        interval: input.interval,
        attachmentContentType: input.attachmentContentType,
        attachmentDataBase64: input.attachmentDataBase64,
      })
      await refetchPendingRequests()
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
    bundleVisible: pricingByApplication.get("madarComplete")?.visible !== false,
    deactivateApplication,
    submitActivationRequest,
    startTrial,
    activateFreeApplication,
    pricingByApplication,
    activatingId,
  }
}
