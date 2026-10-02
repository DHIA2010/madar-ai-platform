"use client"

import { createContext } from "react"

import type {
  ConnectedPlatformsCount,
  Organization,
  OrganizationCreatePayload,
  OrganizationSettings,
  TenantContext,
  Workspace,
  WorkspaceCreatePayload,
  WorkspaceSelectionPayload,
  WorkspaceStatus,
} from "../types"

import type {
  SubscriptionActivationRequestDto,
  SubscriptionRequestStatus,
} from "@/application/contracts"

export interface WorkspaceContextValue {
  currentWorkspace: Workspace | null
  currentOrganization: Organization | null
  availableWorkspaces: Workspace[]
  availableOrganizations: Organization[]
  tenantContext: TenantContext
  workspaceStatus: WorkspaceStatus
  switchWorkspace: (payload: WorkspaceSelectionPayload) => Promise<void>
  createOrganization: (payload: OrganizationCreatePayload) => Promise<Organization>
  createWorkspace: (payload: WorkspaceCreatePayload) => Promise<Workspace>
  updateOrganization: (
    organizationId: string,
    payload: {
      name?: string
      currency?: string
      timezone?: string
      locale?: string
      settings?: OrganizationSettings
    }
  ) => Promise<Organization>
  uploadOrganizationLogo: (organizationId: string, file: File) => Promise<Organization>
  getConnectedPlatformsCount: (organizationId: string) => Promise<ConnectedPlatformsCount>
  requestApplicationActivation: (
    organizationId: string,
    payload: {
      application: SubscriptionActivationRequestDto["application"]
      planTier: SubscriptionActivationRequestDto["planTier"]
      attachmentContentType: string
      attachmentDataBase64: string
    }
  ) => Promise<SubscriptionActivationRequestDto>
  listMyOrganizationSubscriptionRequests: (
    organizationId: string
  ) => Promise<SubscriptionActivationRequestDto[]>
  startApplicationTrial: (
    organizationId: string,
    application: SubscriptionActivationRequestDto["application"]
  ) => Promise<Organization>
  listAllSubscriptionActivationRequests: (
    status?: SubscriptionRequestStatus
  ) => Promise<SubscriptionActivationRequestDto[]>
  approveSubscriptionActivationRequest: (
    requestId: string
  ) => Promise<SubscriptionActivationRequestDto>
  rejectSubscriptionActivationRequest: (
    requestId: string,
    reason: string
  ) => Promise<SubscriptionActivationRequestDto>
  archiveOrganization: (organizationId: string) => Promise<Organization>
  restoreOrganization: (organizationId: string) => Promise<Organization>
  deleteOrganization: (organizationId: string) => Promise<Organization>
  updateWorkspace: (
    workspaceId: string,
    payload: {
      name?: string
      status?: "active" | "archived"
      metadata?: Record<string, string>
      settings?: Record<string, string | boolean | number>
    }
  ) => Promise<Workspace>
  archiveWorkspace: (workspaceId: string) => Promise<Workspace>
  restoreWorkspace: (workspaceId: string) => Promise<Workspace>
}

export const WorkspaceContextStore = createContext<WorkspaceContextValue | null>(null)
