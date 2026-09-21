export type WorkspaceStatus = "idle" | "loading" | "ready" | "switching" | "error"

export interface Plan {
  id: string
  code: string
  name: string
  tier: "starter" | "growth" | "enterprise"
  workspaceLimit: number
  memberLimit: number
}

export interface Subscription {
  id: string
  plan: Plan
  status: "trialing" | "active" | "past_due"
  seats: number
  renewsAt: string | null
}

export interface WorkspaceSettings {
  locale: string
  timezone: string
  currency: string
  dateFormat: string
}

// storeName/country are purely-display fields with no dedicated backend column (stored in
// organizations.settings jsonb) -- see OrganizationSettingsDto in
// @/application/contracts/workspace.contracts for the backend-facing equivalent.
export interface OrganizationSettings {
  storeName?: string
  country?: string
  commercialRegistration?: string
  taxNumber?: string
  phone?: string
  email?: string
  website?: string
  addressShort?: string
  buildingNumber?: string
  street?: string
  secondaryNumber?: string
  district?: string
  postalCode?: string
  city?: string
  notifyEmail?: boolean
  // Settings -> الضرائب's "إعدادات الفاتورة الضريبية" toggles. Persisted the same opaque way as
  // every other field here (organizations.settings jsonb, no dedicated backend column). The real
  // tax rate/percentage itself lives in the separate tax_rates table (see
  // features/pos/services/tax-rates.service.ts), not here. There is no "show tax on invoice"
  // toggle -- a real tax invoice is legally required to show its VAT breakdown, so that was never
  // a real merchant preference to begin with.
  taxAutoApplyToProducts?: boolean
  taxPricesIncludeTax?: boolean
  // "auto" (default, absent means auto too) applies taxPricesIncludeTax as every new product's
  // convention. "manual" shows a per-product dropdown on the Add Product form instead, so a
  // merchant who genuinely sells some products gross and some net can decide case by case.
  taxPriceEntryMode?: "auto" | "manual"
}

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  // Real, writable organization columns (see OrganizationDto). Optional because older cached
  // read models and the mock gateway predate them.
  timezone?: string
  locale?: string
  createdAt?: string
  settings: OrganizationSettings
  subscription: Subscription
  status?: "active" | "archived" | "deleted"
}

export interface ConnectedPlatformsCount {
  connected: number
  total: number
  userCount: number
}

export interface Workspace {
  id: string
  organizationId: string
  name: string
  slug: string
  settings: WorkspaceSettings
  status?: "active" | "archived"
  // Free-form storefront fields (city, address, district, phone, email, code, managerId,
  // managerName, openedAt) live here -- see WorkspaceDto in @/application/contracts/workspace.contracts.
  metadata?: Record<string, string>
  createdAt?: string
}

export interface Membership {
  id: string
  userId: string
  organizationId: string
  workspaceId: string
  role: "owner" | "admin" | "member"
}

export interface TenantContext {
  organizationId: string | null
  workspaceId: string | null
  subscription: Subscription | null
  locale: string
  timezone: string
}

export interface WorkspaceContextModel {
  currentOrganization: Organization | null
  currentWorkspace: Workspace | null
  availableOrganizations: Organization[]
  availableWorkspaces: Workspace[]
  tenantContext: TenantContext
  workspaceStatus: WorkspaceStatus
}

export interface WorkspaceSelectionPayload {
  organizationId: string
  workspaceId: string
}

export interface WorkspaceCreatePayload {
  organizationId: string
  name: string
  description: string
  language: string
  timezone: string
  // Storefront detail fields, packed into the workspace's metadata alongside description --
  // absent when this payload comes from the plain header switcher's own "add workspace" flow.
  city?: string
  address?: string
  district?: string
  phone?: string
  email?: string
  code?: string
  managerId?: string
  managerName?: string
  openedAt?: string
  currency?: string
}

export interface OrganizationCreatePayload {
  name: string
  businessType: string
  region: string
}

export interface WorkspaceServiceSelection {
  organizationId: string | null
  workspaceId: string | null
}
