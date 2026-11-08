"use client"

import { useEffect, useState } from "react"

import { useWorkspace } from "@/features/workspace"

import { entitlementsService, type OrganizationEntitlements } from "../services"
import type { ApplicationCategoryId } from "../types"

// The organization's plan entitlements (null until loaded or when they can't be read).
export function useEntitlements(): OrganizationEntitlements | null {
  const { currentOrganization } = useWorkspace()
  const organizationId = currentOrganization?.id ?? null
  const [entitlements, setEntitlements] = useState<OrganizationEntitlements | null>(null)
  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    entitlementsService
      .get()
      .then((next) => {
        if (!cancelled) setEntitlements(next)
      })
      .catch(() => {
        if (!cancelled) setEntitlements(null)
      })
    return () => {
      cancelled = true
    }
  }, [organizationId])
  return entitlements
}

// Apps a plan includes without their own subscription: POS نمو / احترافي bring suppliers,
// purchases and expenses; احترافي brings custom reports.
export function applicationsFromEntitlements(
  entitlements: OrganizationEntitlements | null
): ApplicationCategoryId[] {
  if (!entitlements) return []
  return [
    ...(entitlements.procurement ? (["procurement", "expenses"] as const) : []),
    ...(entitlements.customReports ? (["customReports"] as const) : []),
  ]
}
