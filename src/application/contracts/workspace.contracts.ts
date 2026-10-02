export interface SubscriptionDto {
  id: string
  status: "trialing" | "active" | "past_due"
  seats: number
  renewsAt: string | null
  plan: {
    id: string
    code: string
    name: string
    tier: "starter" | "growth" | "enterprise"
    workspaceLimit: number
    memberLimit: number
  }
}

// Purely-display org settings with no dedicated column (store name, country) live in the
// backend's free-form organizations.settings jsonb -- never queried/joined elsewhere, so a
// migration wasn't needed to add them.
export interface OrganizationSettingsDto {
  storeName?: string
  country?: string
  // Account identity as it appears on invoices and official documents.
  commercialRegistration?: string
  taxNumber?: string
  phone?: string
  email?: string
  website?: string
  // Saudi National Address, the format ZATCA expects on an invoice.
  addressShort?: string
  buildingNumber?: string
  street?: string
  secondaryNumber?: string
  district?: string
  postalCode?: string
  city?: string
  // Stored preference only -- see the notifications section in SettingsDashboard.
  notifyEmail?: boolean
  // Settings -> الضرائب's "إعدادات الفاتورة الضريبية" toggles -- see TaxesSettings.tsx. The real
  // rate/percentage lives in the separate tax_rates table, not here. There is no "show tax on
  // invoice" toggle -- a real tax invoice is legally required to show its VAT breakdown.
  taxAutoApplyToProducts?: boolean
  taxPricesIncludeTax?: boolean
  // "auto" (default, absent means auto too) applies taxPricesIncludeTax as every new product's
  // convention. "manual" instead shows a per-product dropdown on the Add Product form (see
  // AddProduct.tsx) so a merchant who genuinely sells some products gross and some net can decide
  // case by case, rather than being forced into one blanket rule for every new product.
  taxPriceEntryMode?: "auto" | "manual"
  // Which of the 4 top-level applications (see src/features/applications) this organization has
  // activated -- drives which sidebar nav items show and which Integrations categories appear.
  // Same opaque organizations.settings jsonb storage as everything else here; absent means
  // inactive (a brand-new organization starts with none of these set).
  advertisingEnabled?: boolean
  ecommerceEnabled?: boolean
  posEnabled?: boolean
  madarAppsEnabled?: boolean
  // Set on approval of a subscription activation request (see SubscriptionActivationRequestDto
  // below) -- the account-wide tier chosen at request time.
  currentPlanTier?: "starter" | "growth" | "pro" | "enterprise"
  // Free 7-day trial bookkeeping (see startApplicationTrial below), one set of 3 keys per
  // application. TrialEndsAt also doubles as the *Enabled flag's expiry: once past, the
  // application reads as inactive again even though *Enabled itself is never flipped back by a
  // scheduled job -- see resolveApplicationStatus. TrialUsed is permanent (never cleared) so a
  // trial can only ever be used once per application, even after it lapses or is deactivated.
  // Approving a real paid request always clears the matching TrialEndsAt to "".
  advertisingTrialEndsAt?: string
  advertisingTrialUsed?: boolean
  ecommerceTrialEndsAt?: string
  ecommerceTrialUsed?: boolean
  posTrialEndsAt?: string
  posTrialUsed?: boolean
  madarAppsTrialEndsAt?: string
  madarAppsTrialUsed?: boolean
}

export type SubscriptionApplication = "advertising" | "ecommerce" | "pos" | "madarApps"
export type SubscriptionPlanTier = "starter" | "growth" | "pro" | "enterprise"
export type SubscriptionRequestStatus = "pending" | "approved" | "rejected"

export interface SubscriptionActivationRequestDto {
  id: string
  organizationId: string
  organizationName: string
  requestedByUserId: string
  application: SubscriptionApplication
  planTier: SubscriptionPlanTier
  attachmentUrl: string
  attachmentContentType: string
  status: SubscriptionRequestStatus
  reviewedByUserId: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  // Real columns the API has always returned; they were simply never declared here, so nothing
  // downstream could read them. timezone and locale are both writable via PATCH.
  timezone?: string
  locale?: string
  createdAt?: string
  settings: OrganizationSettingsDto
  subscription: SubscriptionDto
  status?: "active" | "archived" | "deleted"
}

export interface ConnectedPlatformsCountDto {
  connected: number
  total: number
  userCount: number
}

export interface WorkspaceDto {
  id: string
  organizationId: string
  name: string
  slug: string
  settings: {
    locale: string
    timezone: string
    currency: string
    dateFormat: string
  }
  status?: "active" | "archived"
  // A real backend column (workspaces.metadata jsonb, migration 002) with no fixed shape --
  // branch-management fields (city, address, district, phone, email, code, managerId,
  // managerName, openedAt) live here rather than in dedicated columns, the same way
  // OrganizationSettingsDto's fields live in organizations.settings.
  metadata?: Record<string, string>
  createdAt?: string
}

export interface WorkspaceSelectionDto {
  organizationId: string
  workspaceId: string
}

export interface WorkspaceServiceSelectionDto {
  organizationId: string | null
  workspaceId: string | null
}

export interface WorkspaceRepository {
  getOrganizations(): Promise<OrganizationDto[]>
  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]>
  getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null>
  switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto>
  createOrganization(payload: {
    name: string
    metadata?: Record<string, string>
  }): Promise<OrganizationDto>
  updateOrganization(
    organizationId: string,
    payload: {
      name?: string
      currency?: string
      timezone?: string
      locale?: string
      settings?: OrganizationSettingsDto
    }
  ): Promise<OrganizationDto>
  uploadOrganizationLogo(
    organizationId: string,
    payload: { contentType: string; dataBase64: string }
  ): Promise<OrganizationDto>
  getConnectedPlatformsCount(organizationId: string): Promise<ConnectedPlatformsCountDto>
  requestApplicationActivation(
    organizationId: string,
    payload: {
      application: SubscriptionApplication
      planTier: SubscriptionPlanTier
      attachmentContentType: string
      attachmentDataBase64: string
    }
  ): Promise<SubscriptionActivationRequestDto>
  listMyOrganizationSubscriptionRequests(
    organizationId: string
  ): Promise<SubscriptionActivationRequestDto[]>
  // Instant, no-approval-needed free trial -- returns the updated organization directly (unlike
  // requestApplicationActivation, which only ever returns the pending request itself) since the
  // application is active immediately.
  startApplicationTrial(
    organizationId: string,
    application: SubscriptionApplication
  ): Promise<OrganizationDto>
  // Cross-tenant, platform-admin only -- backs the Madar Admin review console. Reuses this same
  // authenticated repository/adapter rather than standing up a second DI subsystem for 3 methods.
  listAllSubscriptionActivationRequests(
    status?: SubscriptionRequestStatus
  ): Promise<SubscriptionActivationRequestDto[]>
  approveSubscriptionActivationRequest(requestId: string): Promise<SubscriptionActivationRequestDto>
  rejectSubscriptionActivationRequest(
    requestId: string,
    reason: string
  ): Promise<SubscriptionActivationRequestDto>
  archiveOrganization(organizationId: string): Promise<OrganizationDto>
  restoreOrganization(organizationId: string): Promise<OrganizationDto>
  // Soft delete (POST /v1/organizations/:id/delete): the record is marked deleted and becomes
  // unwritable, it is not erased.
  deleteOrganization(organizationId: string): Promise<OrganizationDto>
  createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto>
  updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string
      status?: "active" | "archived"
      metadata?: Record<string, string>
      settings?: Record<string, string | boolean | number>
    }
  ): Promise<WorkspaceDto>
  archiveWorkspace(workspaceId: string): Promise<WorkspaceDto>
  restoreWorkspace(workspaceId: string): Promise<WorkspaceDto>
}

export type WorkspaceGateway = WorkspaceRepository

export interface WorkspaceContextViewModel {
  currentOrganization: OrganizationDto | null
  currentWorkspace: WorkspaceDto | null
  availableOrganizations: OrganizationDto[]
  availableWorkspaces: WorkspaceDto[]
}
