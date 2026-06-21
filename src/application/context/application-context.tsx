"use client"

import { createContext, useContext, useMemo } from "react"

import { InfrastructureProvider, useInfrastructureServices } from "@/infrastructure"

import {
  AuthenticationApplicationService,
  AttributionApplicationService,
  CampaignApplicationService,
  ConnectionManager,
  CustomerIntelligenceApplicationService,
  DashboardApplicationService,
  IntegrationApplicationService,
  PermissionApplicationService,
  SegmentationApplicationService,
  WorkspaceApplicationService,
} from "../services"

export interface ApplicationServicesContextValue {
  authenticationApplicationService: AuthenticationApplicationService
  attributionApplicationService: AttributionApplicationService
  integrationApplicationService: IntegrationApplicationService
  connectionManager: ConnectionManager
  workspaceApplicationService: WorkspaceApplicationService
  dashboardApplicationService: DashboardApplicationService
  campaignApplicationService: CampaignApplicationService
  customerIntelligenceApplicationService: CustomerIntelligenceApplicationService
  segmentationApplicationService: SegmentationApplicationService
  permissionApplicationService: PermissionApplicationService
}

const ApplicationServicesContext = createContext<ApplicationServicesContextValue | null>(null)

function ApplicationServicesProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticationRepository,
    attributionRepository,
    integrationRepository,
    campaignRepository,
    customerIntelligenceRepository,
    dashboardRepository,
    permissionGateway,
    segmentationRepository,
    sessionStorageGateway,
    workspaceRepository,
  } = useInfrastructureServices()

  const value = useMemo<ApplicationServicesContextValue>(
    () => ({
      authenticationApplicationService: new AuthenticationApplicationService(
        authenticationRepository,
        sessionStorageGateway
      ),
      attributionApplicationService: new AttributionApplicationService(attributionRepository),
      integrationApplicationService: new IntegrationApplicationService(integrationRepository),
      connectionManager: new ConnectionManager(integrationRepository),
      workspaceApplicationService: new WorkspaceApplicationService(workspaceRepository),
      dashboardApplicationService: new DashboardApplicationService(dashboardRepository),
      campaignApplicationService: new CampaignApplicationService(campaignRepository),
      customerIntelligenceApplicationService: new CustomerIntelligenceApplicationService(
        customerIntelligenceRepository
      ),
      segmentationApplicationService: new SegmentationApplicationService(segmentationRepository),
      permissionApplicationService: new PermissionApplicationService(permissionGateway),
    }),
    [
      authenticationRepository,
      attributionRepository,
      integrationRepository,
      campaignRepository,
      customerIntelligenceRepository,
      dashboardRepository,
      permissionGateway,
      segmentationRepository,
      sessionStorageGateway,
      workspaceRepository,
    ]
  )

  return (
    <ApplicationServicesContext.Provider value={value}>
      {children}
    </ApplicationServicesContext.Provider>
  )
}

export function ApplicationProvider({ children }: { children: React.ReactNode }) {
  return (
    <InfrastructureProvider>
      <ApplicationServicesProvider>{children}</ApplicationServicesProvider>
    </InfrastructureProvider>
  )
}

export function useApplicationServices() {
  const context = useContext(ApplicationServicesContext)

  if (!context) {
    throw new Error("useApplicationServices must be used inside ApplicationProvider")
  }

  return context
}
