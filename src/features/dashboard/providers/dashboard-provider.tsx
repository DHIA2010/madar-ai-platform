"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { useAuth } from "@/features/authentication"
import { useTenantContext } from "@/features/workspace"

import { createRefreshVersion, generateDashboardLayout } from "../engine"
import { dashboardWidgetRegistry } from "../registry"
import { DashboardContext } from "../state"
import type {
  DashboardContextValue,
  DashboardPackage,
  DashboardRefreshReason,
  WidgetRuntimeState,
} from "../types"

import { useApplicationServices } from "@/application"

function createWidgetStates() {
  return Object.values(dashboardWidgetRegistry).reduce<Record<string, WidgetRuntimeState>>(
    (widgetStates, entry) => {
      widgetStates[entry.widgetId] = {
        widgetId: entry.widgetId,
        status: "ready",
      }
      return widgetStates
    },
    {}
  )
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const tenantContext = useTenantContext()
  const { dashboardApplicationService } = useApplicationServices()
  const [dashboardPackage, setDashboardPackage] = useState<DashboardPackage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [widgetReadModels, setWidgetReadModels] = useState<
    DashboardContextValue["widgetReadModels"]
  >({})
  const [widgetReadModelViewModels, setWidgetReadModelViewModels] = useState<
    DashboardContextValue["widgetReadModelViewModels"]
  >({})
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [lastRefreshReason, setLastRefreshReason] = useState<DashboardRefreshReason | null>(null)
  const previousWorkspaceId = useRef<string | null>(tenantContext.workspaceId)

  const role = currentUser?.roles[0]?.name ?? null
  const input = useMemo(
    () => ({
      workspaceId: tenantContext.workspaceId,
      permissions: currentUser?.permissions ?? [],
      featureFlags: {},
      role,
    }),
    [currentUser?.permissions, role, tenantContext.workspaceId]
  )

  const layout = useMemo(
    () => (dashboardPackage ? generateDashboardLayout(dashboardPackage) : []),
    [dashboardPackage]
  )

  const manifests = useMemo(
    () =>
      Object.values(dashboardWidgetRegistry).reduce<DashboardContextValue["manifests"]>(
        (result, entry) => {
          result[entry.widgetId] = entry.manifest
          return result
        },
        {}
      ),
    []
  )

  const widgetStates = useMemo(() => createWidgetStates(), [])

  const loadDashboard = useCallback(async () => {
    setIsLoading(true)
    const bundle = await dashboardApplicationService.getDashboard(input)
    setDashboardPackage(bundle.dashboardPackage)
    setWidgetReadModels(bundle.readModels)
    setWidgetReadModelViewModels(bundle.viewModels)
    setIsLoading(false)
  }, [dashboardApplicationService, input])

  const requestRefresh = useCallback(
    async (reason: DashboardRefreshReason) => {
      setLastRefreshReason(reason)
      setRefreshVersion((currentVersion) => createRefreshVersion(currentVersion))
      const bundle = await dashboardApplicationService.refreshDashboard(input)
      setDashboardPackage(bundle.dashboardPackage)
      setWidgetReadModels(bundle.readModels)
      setWidgetReadModelViewModels(bundle.viewModels)
    },
    [dashboardApplicationService, input]
  )

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard()
    })
  }, [loadDashboard, pathname])

  useEffect(() => {
    if (previousWorkspaceId.current === tenantContext.workspaceId) {
      return
    }

    previousWorkspaceId.current = tenantContext.workspaceId
    queueMicrotask(() => {
      void requestRefresh("workspace-change")
    })
  }, [requestRefresh, tenantContext.workspaceId])

  const value = useMemo<DashboardContextValue>(
    () => ({
      dashboardPackage,
      layout,
      widgetStates,
      widgetReadModels,
      widgetReadModelViewModels,
      registry: dashboardWidgetRegistry,
      manifests,
      isLoading,
      refreshVersion,
      lastRefreshReason,
      requestRefresh,
    }),
    [
      dashboardPackage,
      isLoading,
      lastRefreshReason,
      layout,
      manifests,
      refreshVersion,
      requestRefresh,
      widgetReadModels,
      widgetReadModelViewModels,
      widgetStates,
    ]
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
