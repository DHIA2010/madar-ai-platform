"use client"

import { createContext, useContext, useMemo, useState } from "react"

import { createSessionManager } from "./identity"
import type { InfrastructureServices } from "./gateways"
import {
  createAIIntelligenceRepository,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
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
  const [aiIntelligenceRepository] = useState(() => createAIIntelligenceRepository())
  const [integrationRepository] = useState(() =>
    createIntegrationRepository({
      getSession: () => sessionStorageGateway.restore(),
      getWorkspaceId: getWorkspaceIdFromStorage,
    })
  )
  const [campaignRepository] = useState(() => createCampaignRepository())
  const [customerIntelligenceRepository] = useState(() => createCustomerIntelligenceRepository())
  const [segmentationRepository] = useState(() => createSegmentationRepository())
  const [notificationRepository] = useState(() => createNotificationRepository())

  const aiIntelligenceGateway = aiIntelligenceRepository
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
      aiIntelligenceRepository,
      authenticationRepository,
      attributionRepository,
      integrationRepository,
      workspaceRepository,
      dashboardRepository,
      campaignRepository,
      customerIntelligenceRepository,
      segmentationRepository,
      notificationRepository,
      aiIntelligenceGateway,
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
      aiIntelligenceGateway,
      aiIntelligenceRepository,
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
