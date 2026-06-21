import type {
  ConnectionCenterRecord,
  ConnectionsFilterState,
  ConnectionsHealthState,
  ConnectorCatalogEntry,
} from "../types"

import type {
  Connection,
  ConnectionStatus,
  ConnectorCapability,
  SyncJobStatus,
} from "@/application/contracts"

const DEFAULT_WORKSPACE = "ws_connections_center"
const DEFAULT_TIMEZONE = "Asia/Riyadh"

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    connectorDefinitionId: "connector_def_salla",
    connectorId: "salla",
    key: "commerce.salla",
    displayName: "Salla",
    logo: "SA",
    version: "1.0.0",
    connectedAccountLabel: "Salla Store Account",
    workspaceLabel: "Madar Commerce",
    capabilities: ["products", "orders", "customers", "catalog", "media"],
  },
  {
    connectorDefinitionId: "connector_def_zid",
    connectorId: "zid",
    key: "commerce.zid",
    displayName: "Zid",
    logo: "ZI",
    version: "1.0.0",
    connectedAccountLabel: "Zid Store Account",
    workspaceLabel: "Madar Commerce",
    capabilities: ["products", "orders", "customers", "catalog", "media"],
  },
  {
    connectorDefinitionId: "connector_def_ga4",
    connectorId: "ga4",
    key: "analytics.ga4",
    displayName: "Google Analytics 4",
    logo: "GA",
    version: "1.0.0",
    connectedAccountLabel: "GA4 Property",
    workspaceLabel: "Madar Analytics",
    capabilities: ["traffic", "events", "conversions"],
  },
  {
    connectorDefinitionId: "connector_def_meta_ads",
    connectorId: "meta_ads",
    key: "ads.meta",
    displayName: "Meta Ads",
    logo: "ME",
    version: "1.0.0",
    connectedAccountLabel: "Meta Ads Account",
    workspaceLabel: "Madar Advertising",
    capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
  },
  {
    connectorDefinitionId: "connector_def_google_ads",
    connectorId: "google_ads",
    key: "ads.google",
    displayName: "Google Ads",
    logo: "GO",
    version: "1.0.0",
    connectedAccountLabel: "Google Ads Account",
    workspaceLabel: "Madar Advertising",
    capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
  },
  {
    connectorDefinitionId: "connector_def_tiktok_ads",
    connectorId: "tiktok_ads",
    key: "ads.tiktok",
    displayName: "TikTok Ads",
    logo: "TT",
    version: "1.0.0",
    connectedAccountLabel: "TikTok Ads Account",
    workspaceLabel: "Madar Advertising",
    capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
  },
  {
    connectorDefinitionId: "connector_def_snapchat_ads",
    connectorId: "snapchat_ads",
    key: "ads.snapchat",
    displayName: "Snapchat Ads",
    logo: "SC",
    version: "1.0.0",
    connectedAccountLabel: "Snapchat Ads Account",
    workspaceLabel: "Madar Advertising",
    capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
  },
]

export const CONNECTION_CENTER_STORAGE_KEY = "connections-center:v1"
export const CONNECTOR_ACCOUNTS_STORAGE_KEY = "connections-center:connector-accounts:v1"

export interface StoredConnectionReference {
  connectorDefinitionId: string
  connectionId: string
}

export interface StoredConnectorAccountRegistry {
  [connectorDefinitionId: string]: string[]
}

export function getDefaultWorkspaceId() {
  return DEFAULT_WORKSPACE
}

export function getDefaultTimezone() {
  return DEFAULT_TIMEZONE
}

export function normalizeConnectorId(definitionId: string) {
  return definitionId.replace(/^connector_def_/, "")
}

export function getConnectorCatalogEntry(
  connectorDefinitionId: string
): ConnectorCatalogEntry | null {
  return (
    CONNECTOR_CATALOG.find((entry) => entry.connectorDefinitionId === connectorDefinitionId) ?? null
  )
}

export function inferHealthState(
  connection: Connection,
  latestSyncStatus?: SyncJobStatus
): ConnectionsHealthState {
  if (connection.status === "paused") {
    return "Paused"
  }

  if (connection.status === "disconnected") {
    return "Disconnected"
  }

  if (
    connection.accessToken &&
    new Date(connection.accessToken.expiresAt).getTime() <= Date.now()
  ) {
    return "Expired Token"
  }

  if (latestSyncStatus === "running") {
    return "Running Sync"
  }

  if (latestSyncStatus === "queued") {
    return "Queued"
  }

  if (latestSyncStatus === "failed" || connection.status === "error") {
    return "Error"
  }

  if (connection.status === "draft" || connection.status === "authorized") {
    return "Warning"
  }

  return "Healthy"
}

function toLower(value: string | undefined) {
  return (value ?? "").toLocaleLowerCase()
}

function includesNeedle(value: string | undefined, needle: string) {
  return toLower(value).includes(toLower(needle))
}

export function filterConnectionRecords(
  records: ConnectionCenterRecord[],
  filters: ConnectionsFilterState
): ConnectionCenterRecord[] {
  return records.filter((record) => {
    if (filters.status !== "all" && record.connection.status !== filters.status) {
      return false
    }

    if (filters.health !== "all" && record.healthState !== filters.health) {
      return false
    }

    if (filters.platform !== "all" && record.platformName !== filters.platform) {
      return false
    }

    if (filters.workspace !== "all" && record.workspaceName !== filters.workspace) {
      return false
    }

    if (filters.capability !== "all" && !record.capabilities.includes(filters.capability)) {
      return false
    }

    if (!filters.search.trim()) {
      return true
    }

    const needle = filters.search.trim()
    return (
      includesNeedle(record.platformName, needle) ||
      includesNeedle(record.workspaceName, needle) ||
      includesNeedle(record.connectedAccount, needle) ||
      includesNeedle(record.connection.status, needle)
    )
  })
}

export function loadStoredConnectionReferences(): StoredConnectionReference[] {
  if (typeof window === "undefined") {
    return []
  }

  const raw = window.localStorage.getItem(CONNECTION_CENTER_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as StoredConnectionReference[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item): item is StoredConnectionReference =>
        typeof item?.connectorDefinitionId === "string" && typeof item?.connectionId === "string"
    )
  } catch {
    return []
  }
}

export function storeConnectionReferences(references: StoredConnectionReference[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(CONNECTION_CENTER_STORAGE_KEY, JSON.stringify(references))
}

export function loadStoredConnectorAccounts(): StoredConnectorAccountRegistry {
  if (typeof window === "undefined") {
    return {}
  }

  const raw = window.localStorage.getItem(CONNECTOR_ACCOUNTS_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as StoredConnectorAccountRegistry
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const normalized: StoredConnectorAccountRegistry = {}
    for (const [connectorDefinitionId, accounts] of Object.entries(parsed)) {
      if (!Array.isArray(accounts)) {
        continue
      }

      const cleanedAccounts = accounts.filter(
        (account): account is string => typeof account === "string"
      )
      normalized[connectorDefinitionId] = [...new Set(cleanedAccounts)]
    }

    return normalized
  } catch {
    return {}
  }
}

export function storeConnectorAccounts(registry: StoredConnectorAccountRegistry) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(CONNECTOR_ACCOUNTS_STORAGE_KEY, JSON.stringify(registry))
}

export function appendConnectorAccount(
  connectorDefinitionId: string,
  accountName: string
): string[] {
  const normalizedAccountName = accountName.trim()
  if (!normalizedAccountName) {
    return []
  }

  const registry = loadStoredConnectorAccounts()
  const existing = registry[connectorDefinitionId] ?? []
  const next = [...new Set([...existing, normalizedAccountName])]
  registry[connectorDefinitionId] = next
  storeConnectorAccounts(registry)
  return next
}

export function mergeCatalogWithRegistry(
  registryEntries: Array<{ connectorDefinitionId: string; connectorId: string }>
): ConnectorCatalogEntry[] {
  const byDefinition = new Map<string, ConnectorCatalogEntry>()

  for (const entry of CONNECTOR_CATALOG) {
    byDefinition.set(entry.connectorDefinitionId, entry)
  }

  for (const registryEntry of registryEntries) {
    if (byDefinition.has(registryEntry.connectorDefinitionId)) {
      continue
    }

    const inferredName = registryEntry.connectorDefinitionId
      .replace(/^connector_def_/, "")
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ")

    byDefinition.set(registryEntry.connectorDefinitionId, {
      connectorDefinitionId: registryEntry.connectorDefinitionId,
      connectorId: registryEntry.connectorId,
      key: registryEntry.connectorId,
      displayName: inferredName,
      logo: inferredName
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      version: "1.0.0",
      connectedAccountLabel: `${inferredName} Account`,
      workspaceLabel: "Madar Workspace",
      capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
    })
  }

  return [...byDefinition.values()]
}

export function getStatusTone(status: ConnectionStatus) {
  if (status === "connected" || status === "valid") {
    return "success"
  }

  if (status === "paused" || status === "authorized" || status === "draft") {
    return "warning"
  }

  if (status === "error" || status === "disconnected") {
    return "danger"
  }

  return "neutral"
}

export function getHealthTone(state: ConnectionsHealthState) {
  if (state === "Healthy") {
    return "success"
  }

  if (state === "Warning" || state === "Queued" || state === "Running Sync" || state === "Paused") {
    return "warning"
  }

  if (state === "Error" || state === "Expired Token" || state === "Disconnected") {
    return "danger"
  }

  return "neutral"
}

export function getCapabilityLabel(capability: ConnectorCapability) {
  return capability.replace("_", " ")
}
