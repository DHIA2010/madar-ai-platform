import type { PermissionContext } from "@/lib/permissions"

import type { AttributionGateway as AttributionGatewayContract } from "./attribution.contracts"
import type { AuthGateway, SessionStoragePort } from "./authentication.contracts"
import type { CampaignGateway as CampaignGatewayContract } from "./campaign.contracts"
import type { CustomerIntelligenceGateway as CustomerIntelligenceGatewayContract } from "./customer-intelligence.contracts"
import type { DashboardGateway as DashboardGatewayContract } from "./dashboard.contracts"
import type { IntegrationGateway as IntegrationGatewayContract } from "./integration.contracts"
import type { SegmentationGateway as SegmentationGatewayContract } from "./segmentation.contracts"
import type { WorkspaceGateway as WorkspaceGatewayContract } from "./workspace.contracts"

export type AuthenticationGateway = AuthGateway
export type AttributionGateway = AttributionGatewayContract
export type SessionStorageGateway = SessionStoragePort
export type DashboardGateway = DashboardGatewayContract
export type WorkspaceGateway = WorkspaceGatewayContract
export type CampaignGateway = CampaignGatewayContract
export type CustomerIntelligenceGateway = CustomerIntelligenceGatewayContract
export type SegmentationGateway = SegmentationGatewayContract
export type IntegrationGateway = IntegrationGatewayContract
export type AuthenticationRepository = AuthGateway
export type AttributionRepository = AttributionGatewayContract
export type DashboardRepository = DashboardGatewayContract
export type WorkspaceRepository = WorkspaceGatewayContract
export type CampaignRepository = CampaignGatewayContract
export type CustomerIntelligenceRepository = CustomerIntelligenceGatewayContract
export type SegmentationRepository = SegmentationGatewayContract
export type IntegrationRepository = IntegrationGatewayContract

export interface PermissionGateway {
  can(permission: string, availablePermissions: string[], context?: PermissionContext): boolean
  canAny(
    permissions: string[],
    availablePermissions: string[],
    context?: PermissionContext
  ): boolean
  canAll(
    permissions: string[],
    availablePermissions: string[],
    context?: PermissionContext
  ): boolean
}

export interface FeatureFlagGateway {
  getFlag(name: string): boolean | undefined
  getFlags(): Record<string, boolean>
  isEnabled(name: string): boolean
}

export interface NotificationGateway {
  notify(notification?: {
    title?: string
    message?: string
    level?: "info" | "success" | "warning" | "error"
  }): Promise<void>
}

export type NotificationRepository = NotificationGateway
