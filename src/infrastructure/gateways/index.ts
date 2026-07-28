import type {
  AIIntelligenceGateway,
  AIIntelligenceRepository,
  AttributionGateway,
  AttributionRepository,
  IntegrationGateway,
  IntegrationRepository,
  AuthenticationRepository,
  AuthenticationGateway,
  CampaignGateway,
  CampaignRepository,
  CustomerIntelligenceGateway,
  CustomerIntelligenceRepository,
  DashboardRepository,
  FeatureFlagGateway,
  NotificationRepository,
  NotificationGateway,
  PermissionGateway,
  SegmentationGateway,
  SegmentationRepository,
  SessionStorageGateway,
  WorkspaceRepository,
} from "@/application/contracts/infrastructure.contracts"
import type { DashboardGateway } from "@/application/contracts/dashboard.contracts"
import type { WorkspaceGateway } from "@/application/contracts/workspace.contracts"

export interface InfrastructureServices {
  aiIntelligenceRepository: AIIntelligenceRepository
  authenticationRepository: AuthenticationRepository
  attributionRepository: AttributionRepository
  integrationRepository: IntegrationRepository
  workspaceRepository: WorkspaceRepository
  dashboardRepository: DashboardRepository
  campaignRepository: CampaignRepository
  customerIntelligenceRepository: CustomerIntelligenceRepository
  segmentationRepository: SegmentationRepository
  notificationRepository: NotificationRepository

  aiIntelligenceGateway: AIIntelligenceGateway
  authenticationGateway: AuthenticationGateway
  attributionGateway: AttributionGateway
  integrationGateway: IntegrationGateway
  workspaceGateway: WorkspaceGateway
  dashboardGateway: DashboardGateway
  campaignGateway: CampaignGateway
  customerIntelligenceGateway: CustomerIntelligenceGateway
  segmentationGateway: SegmentationGateway
  permissionGateway: PermissionGateway
  featureFlagGateway: FeatureFlagGateway
  notificationGateway: NotificationGateway
  sessionStorageGateway: SessionStorageGateway
}

export type {
  AIIntelligenceGateway,
  AIIntelligenceRepository,
  AttributionGateway,
  AttributionRepository,
  IntegrationGateway,
  IntegrationRepository,
  AuthenticationRepository,
  AuthenticationGateway,
  CampaignGateway,
  CampaignRepository,
  CustomerIntelligenceGateway,
  CustomerIntelligenceRepository,
  SegmentationGateway,
  SegmentationRepository,
  DashboardRepository,
  DashboardGateway,
  FeatureFlagGateway,
  NotificationRepository,
  NotificationGateway,
  PermissionGateway,
  SessionStorageGateway,
  WorkspaceRepository,
  WorkspaceGateway,
}
