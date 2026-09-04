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
    payload: { name?: string; currency?: string; settings?: OrganizationSettings }
  ) => Promise<Organization>
  uploadOrganizationLogo: (organizationId: string, file: File) => Promise<Organization>
  getConnectedPlatformsCount: (organizationId: string) => Promise<ConnectedPlatformsCount>
  archiveOrganization: (organizationId: string) => Promise<Organization>
  restoreOrganization: (organizationId: string) => Promise<Organization>
  updateWorkspace: (workspaceId: string, payload: { name?: string }) => Promise<Workspace>
  archiveWorkspace: (workspaceId: string) => Promise<Workspace>
  restoreWorkspace: (workspaceId: string) => Promise<Workspace>
}

export const WorkspaceContextStore = createContext<WorkspaceContextValue | null>(null)
