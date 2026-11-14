"use client"

import { useEffect, useState } from "react"

import { useWorkspace } from "@/features/workspace"

import { entitlementsService, type OrganizationEntitlements } from "../services"
import type { ApplicationCategoryId } from "../types"

// The organization's plan entitlements (null until loaded or when they can't be read), and
// whether the answer is in yet -- for a screen that must not show "locked" while still asking.
export function useEntitlementsState(): {
  entitlements: OrganizationEntitlements | null
  loaded: boolean
} {
  const { currentOrganization } = useWorkspace()
  const organizationId = currentOrganization?.id ?? null
  const [state, setState] = useState<{
    organizationId: string | null
    entitlements: OrganizationEntitlements | null
  }>({ organizationId: null, entitlements: null })
  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    entitlementsService
      .get()
      .then((next) => {
        if (!cancelled) setState({ organizationId, entitlements: next })
      })
      .catch(() => {
        if (!cancelled) setState({ organizationId, entitlements: null })
      })
    return () => {
      cancelled = true
    }
  }, [organizationId])
  const loaded = organizationId !== null && state.organizationId === organizationId
  return { entitlements: loaded ? state.entitlements : null, loaded }
}

export function useEntitlements(): OrganizationEntitlements | null {
  return useEntitlementsState().entitlements
}

// Apps a plan includes without their own subscription: POS نمو / احترافي bring suppliers,
// purchases and expenses; احترافي brings custom reports and invoicing.
export function applicationsFromEntitlements(
  entitlements: OrganizationEntitlements | null
): ApplicationCategoryId[] {
  if (!entitlements) return []
  return [
    ...(entitlements.procurement ? (["procurement", "expenses"] as const) : []),
    ...(entitlements.customReports ? (["customReports"] as const) : []),
    ...(entitlements.invoicing ? (["invoicing"] as const) : []),
  ]
}
