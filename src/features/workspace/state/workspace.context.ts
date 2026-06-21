"use client"

import { createContext } from "react"

import type {
  Organization,
  OrganizationCreatePayload,
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
}

export const WorkspaceContextStore = createContext<WorkspaceContextValue | null>(null)
