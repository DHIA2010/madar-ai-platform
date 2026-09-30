"use client"

import { useMemo, useState } from "react"

import { useWorkspace } from "@/features/workspace"

import {
  APPLICATION_CATALOG,
  APPLICATION_SETTINGS_KEY,
  MADAR_COMPLETE_BUNDLE,
  resolveApplicationStatus,
} from "../services"
import type {
  ApplicationCategoryId,
  ApplicationDefinition,
  ApplicationSubscriptionStatus,
} from "../types"

export interface ApplicationCategoryTab {
  id: ApplicationCategoryId | "all"
  label: string
  count: number
}

const CATEGORY_LABELS: Record<ApplicationCategoryId, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار",
}

const CATEGORY_ORDER: ApplicationCategoryId[] = ["advertising", "ecommerce", "pos", "madarApps"]

// Activation now persists on the organization (organizations.settings.<app>Enabled, see
// APPLICATION_SETTINGS_KEY) instead of living in local component state -- every
// activate/deactivate call below is a real updateOrganization request, and reloading the page
// reflects the same state because it's read straight from useWorkspace().currentOrganization.
export function useApplicationsCatalog() {
  const { currentOrganization, updateOrganization } = useWorkspace()
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<ApplicationCategoryId | "all">("all")
  const [activatingId, setActivatingId] = useState<string | null>(null)

  const statusById = useMemo<Record<string, ApplicationSubscriptionStatus>>(() => {
    const settings = currentOrganization?.settings
    return Object.fromEntries(
      APPLICATION_CATALOG.map((application) => [
        application.id,
        resolveApplicationStatus(application, settings),
      ])
    )
  }, [currentOrganization?.settings])

  const searchMatchedApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const withCurrentStatus = APPLICATION_CATALOG.map((application) => ({
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
  }, [searchQuery, statusById])

  const categoryTabs = useMemo<ApplicationCategoryTab[]>(() => {
    const all: ApplicationCategoryTab = {
      id: "all",
      label: "الكل",
      count: searchMatchedApplications.length,
    }
    const rest = CATEGORY_ORDER.map((category) => ({
      id: category,
      label: CATEGORY_LABELS[category],
      count: searchMatchedApplications.filter((application) => application.category === category)
        .length,
    }))
    return [all, ...rest]
  }, [searchMatchedApplications])

  const visibleApplications = useMemo<ApplicationDefinition[]>(() => {
    if (activeCategory === "all") {
      return searchMatchedApplications
    }
    return searchMatchedApplications.filter(
      (application) => application.category === activeCategory
    )
  }, [activeCategory, searchMatchedApplications])

  async function setApplicationActive(id: string, active: boolean) {
    if (!currentOrganization) return
    const application = APPLICATION_CATALOG.find((entry) => entry.id === id)
    if (!application) return

    setActivatingId(id)
    try {
      await updateOrganization(currentOrganization.id, {
        settings: { [APPLICATION_SETTINGS_KEY[application.category]]: active },
      })
    } finally {
      setActivatingId(null)
    }
  }

  async function activateApplication(id: string) {
    await setApplicationActive(id, true)
  }

  async function deactivateApplication(id: string) {
    await setApplicationActive(id, false)
  }

  async function activateAllApplications() {
    if (!currentOrganization) return
    setActivatingId(MADAR_COMPLETE_BUNDLE.id)
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
    bundle: MADAR_COMPLETE_BUNDLE,
    activateApplication,
    deactivateApplication,
    activateAllApplications,
    activatingId,
  }
}
