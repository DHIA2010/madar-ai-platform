"use client"

import { createContext, useContext, useMemo, useState } from "react"

import { createSessionManager } from "./identity"
import type { InfrastructureServices } from "./gateways"
import {
  createAuthenticationRepository,
  createAttributionRepository,
  createCampaignRepository,
  createCustomerIntelligenceRepository,
  createDashboardRepository,
  createIntegrationRepository,
  createNotificationRepository,
  createSegmentationRepository,
  createWorkspaceRepository,
} from "./data"
import { createMockFeatureFlagGateway, createMockPermissionGateway } from "./mock"

const InfrastructureContext = createContext<InfrastructureServices | null>(null)

function getWorkspaceIdFromStorage() {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    return parsed.state?.currentWorkspace?.id ?? null
  } catch {
    return null
  }
}

export function InfrastructureProvider({ children }: { children: React.ReactNode }) {
  const [sessionStorageGateway] = useState(() => createSessionManager())

  const [authenticationRepository] = useState(() =>
    createAuthenticationRepository({
      getSession: () => sessionStorageGateway.restore(),
      getWorkspaceId: getWorkspaceIdFromStorage,
    })
  )
  const [workspaceRepository] = useState(() =>
    createWorkspaceRepository({
      getSession: () => sessionStorageGateway.restore(),
      getWorkspaceId: getWorkspaceIdFromStorage,
    })
  )
  const [dashboardRepository] = useState(() =>
    createDashboardRepository({
      getSession: () => sessionStorageGateway.restore(),
      getWorkspaceId: getWorkspaceIdFromStorage,
    })
  )
  const [attributionRepository] = useState(() => createAttributionRepository())
  const [integrationRepository] = useState(() => createIntegrationRepository())
  const [campaignRepository] = useState(() => createCampaignRepository())
  const [customerIntelligenceRepository] = useState(() => createCustomerIntelligenceRepository())
  const [segmentationRepository] = useState(() => createSegmentationRepository())
  const [notificationRepository] = useState(() => createNotificationRepository())

  const authenticationGateway = authenticationRepository
  const attributionGateway = attributionRepository
  const integrationGateway = integrationRepository
  const workspaceGateway = workspaceRepository
  const dashboardGateway = dashboardRepository
  const campaignGateway = campaignRepository
  const customerIntelligenceGateway = customerIntelligenceRepository
  const segmentationGateway = segmentationRepository
  const notificationGateway = notificationRepository

  const [permissionGateway] = useState(() => createMockPermissionGateway())
  const [featureFlagGateway] = useState(() => createMockFeatureFlagGateway())

  const value = useMemo<InfrastructureServices>(
    () => ({
      authenticationRepository,
      attributionRepository,
      integrationRepository,
      workspaceRepository,
      dashboardRepository,
      campaignRepository,
      customerIntelligenceRepository,
      segmentationRepository,
      notificationRepository,
      authenticationGateway,
      attributionGateway,
      integrationGateway,
      workspaceGateway,
      dashboardGateway,
      campaignGateway,
      customerIntelligenceGateway,
      segmentationGateway,
      permissionGateway,
      featureFlagGateway,
      notificationGateway,
      sessionStorageGateway,
    }),
    [
      authenticationRepository,
      authenticationGateway,
      attributionGateway,
      attributionRepository,
      integrationGateway,
      integrationRepository,
      dashboardRepository,
      dashboardGateway,
      campaignGateway,
      campaignRepository,
      customerIntelligenceGateway,
      customerIntelligenceRepository,
      featureFlagGateway,
      notificationRepository,
      notificationGateway,
      permissionGateway,
      segmentationGateway,
      segmentationRepository,
      sessionStorageGateway,
      workspaceRepository,
      workspaceGateway,
    ]
  )

  return <InfrastructureContext.Provider value={value}>{children}</InfrastructureContext.Provider>
}

export function useInfrastructureServices() {
  const context = useContext(InfrastructureContext)

  if (!context) {
    throw new Error("useInfrastructureServices must be used inside InfrastructureProvider")
  }

  return context
}
