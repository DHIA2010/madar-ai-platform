export interface GoogleOAuthStartInput {
  workspaceId?: string | null
  projectId?: string | null
  connectionName?: string | null
}

export interface GoogleOAuthStartResult {
  authorizationUrl: string
  connectionId: string
  state: string
  projectId: string
  workspaceId: string | null
}

export interface GoogleOAuthCallbackResult {
  connectionId: string
  projectId: string
  workspaceId: string | null
  organizationId: string
  accountName: string
  accountEmail: string | null
  connectedAt: string
  status: "connected"
}

export interface GoogleOAuthConnectionView {
  id: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  dataSourceId: string | null
  providerAccountId: string | null
  providerAccountName: string | null
  providerAccountEmail: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  status: "pending" | "connected" | "disconnected" | "error"
  connectionReference: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface GoogleAdsCustomerAccountView {
  id: string
  connectionId: string
  customerId: string
  displayName: string | null
  currencyCode: string | null
  timeZone: string | null
  status: "active" | "inactive"
  isSelected: boolean
  discoveredAt: string
  createdAt: string
  updatedAt: string
}
