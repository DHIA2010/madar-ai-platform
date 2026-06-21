import { ValidationError } from "@/lib/app-errors"

import type {
  OrganizationDto,
  WorkspaceDto,
  WorkspaceSelectionDto,
} from "@/application/contracts/workspace.contracts"

const plans = {
  growth: {
    id: "plan_growth",
    code: "growth",
    name: "Growth",
    tier: "growth" as const,
    workspaceLimit: 10,
    memberLimit: 50,
  },
  enterprise: {
    id: "plan_enterprise",
    code: "enterprise",
    name: "Enterprise",
    tier: "enterprise" as const,
    workspaceLimit: 50,
    memberLimit: 500,
  },
}

const subscriptions = {
  northstar: {
    id: "sub_northstar",
    plan: plans.enterprise,
    status: "active" as const,
    seats: 120,
    renewsAt: "2027-01-01T00:00:00.000Z",
  },
  atlas: {
    id: "sub_atlas",
    plan: plans.growth,
    status: "trialing" as const,
    seats: 18,
    renewsAt: "2026-08-01T00:00:00.000Z",
  },
}

export const mockOrganizations: OrganizationDto[] = [
  {
    id: "org_northstar",
    name: "Northstar Group",
    slug: "northstar-group",
    subscription: subscriptions.northstar,
  },
  {
    id: "org_atlas",
    name: "Atlas Commerce",
    slug: "atlas-commerce",
    subscription: subscriptions.atlas,
  },
]

export const mockWorkspaces: WorkspaceDto[] = [
  {
    id: "ws_northstar_marketing",
    organizationId: "org_northstar",
    name: "Marketing Ops",
    slug: "marketing-ops",
    settings: {
      locale: "ar-SA",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      dateFormat: "dd/MM/yyyy",
    },
  },
  {
    id: "ws_northstar_retail",
    organizationId: "org_northstar",
    name: "Retail Performance",
    slug: "retail-performance",
    settings: {
      locale: "en-GB",
      timezone: "Europe/London",
      currency: "GBP",
      dateFormat: "dd/MM/yyyy",
    },
  },
  {
    id: "ws_atlas_growth",
    organizationId: "org_atlas",
    name: "Growth Lab",
    slug: "growth-lab",
    settings: {
      locale: "en-US",
      timezone: "America/New_York",
      currency: "USD",
      dateFormat: "MM/dd/yyyy",
    },
  },
]

export function waitForMock(duration = 40) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  })
}

export function findWorkspace(workspaceId: string) {
  return mockWorkspaces.find((workspace) => workspace.id === workspaceId) ?? null
}

export function assertValidWorkspaceSelection(payload: WorkspaceSelectionDto) {
  const organization = mockOrganizations.find((item) => item.id === payload.organizationId)
  if (!organization) {
    throw new ValidationError({
      code: "workspace_organization_not_found",
      message: "The selected organization could not be found.",
    })
  }

  const workspace = findWorkspace(payload.workspaceId)
  if (!workspace || workspace.organizationId !== organization.id) {
    throw new ValidationError({
      code: "workspace_selection_invalid",
      message: "The selected workspace does not belong to the organization.",
    })
  }

  return workspace
}
