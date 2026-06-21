"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { toAppError } from "@/lib/app-errors"

import {
  CONNECTOR_CATALOG,
  filterConnectionRecords,
  getDefaultTimezone,
  getDefaultWorkspaceId,
  inferHealthState,
  loadStoredConnectionReferences,
  loadStoredConnectorAccounts,
  mergeCatalogWithRegistry,
  storeConnectionReferences,
} from "../services"
import type { ConnectionCenterRecord, ConnectionsFilterState } from "../types"

import { useApplicationServices } from "@/application/context"
import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncHistoryViewModel,
  SyncJob,
} from "@/application/contracts"

const DEFAULT_FILTERS: ConnectionsFilterState = {
  search: "",
  status: "all",
  health: "all",
  platform: "all",
  workspace: "all",
  capability: "all",
}

function oauthCredentialPayload(connectorId: string) {
  return {
    type: "oauth" as const,
    payload: {
      clientId: `${connectorId}_client_id`,
      clientSecret: `${connectorId}_client_secret`,
      redirectUri: "https://madar.local/callback",
    },
  }
}

export function useConnectionsCenter() {
  const { connectionManager, integrationApplicationService } = useApplicationServices()
  const [records, setRecords] = useState<ConnectionCenterRecord[]>([])
  const [filters, setFilters] = useState<ConnectionsFilterState>(DEFAULT_FILTERS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const buildRecord = useCallback(
    async (connection: Connection): Promise<ConnectionCenterRecord> => {
      const statusViewModel = await integrationApplicationService.getIntegrationStatus({
        connectionId: connection.connectionId,
      })

      let syncHistory: SyncHistoryViewModel | undefined
      try {
        syncHistory = await integrationApplicationService.getSyncHistory({
          connectionId: connection.connectionId,
          limit: 20,
        })
      } catch {
        syncHistory = undefined
      }

      const health = connectionManager.getHealth(connection.connectionId)
      const scheduler = connectionManager.getScheduler(connection.connectionId)
      const history = connectionManager.getHistory(connection.connectionId)
      const registry = connectionManager.getRegistry()
      const catalog = mergeCatalogWithRegistry(registry.connectors)
      const catalogEntry =
        catalog.find((item) => item.connectorDefinitionId === connection.connectorDefinitionId) ??
        catalog[0]

      const latestSyncStatus = statusViewModel.payload.latestJob?.status
      const accountsRegistry = loadStoredConnectorAccounts()
      const metadataAccountName =
        typeof connection.metadata.accountName === "string"
          ? connection.metadata.accountName
          : undefined
      const connectedAccounts = accountsRegistry[connection.connectorDefinitionId]?.length
        ? accountsRegistry[connection.connectorDefinitionId]
        : metadataAccountName
          ? [metadataAccountName]
          : [catalogEntry?.connectedAccountLabel ?? "Connected account"]
      const lastErrorEvent =
        history?.events.find((event) => event.eventType === "sync_failed") ??
        statusViewModel.payload.recentEvents.find((event) => event.action === "sync")

      return {
        connectorDefinitionId: connection.connectorDefinitionId,
        connectorId: connection.connectorId,
        platformName: catalogEntry?.displayName ?? connection.connectorDefinitionId,
        platformLogo: catalogEntry?.logo ?? "CN",
        version: catalogEntry?.version ?? "1.0.0",
        capabilities: catalogEntry?.capabilities ?? [],
        workspaceName:
          connection.metadata.workspaceName ?? catalogEntry?.workspaceLabel ?? "Madar Workspace",
        connectedAccount:
          connectedAccounts[0] ?? catalogEntry?.connectedAccountLabel ?? "Connected account",
        connectedAccounts,
        connection,
        integrationStatus: statusViewModel.payload,
        syncHistory: syncHistory?.payload,
        healthState: inferHealthState(connection, latestSyncStatus),
        retryCount: health?.retryCount ?? 0,
        lastError: lastErrorEvent?.message,
        tokenExpiresAt: connection.accessToken?.expiresAt,
        nextSyncAt: scheduler?.retryQueue[0]?.nextRunAt ?? health?.nextSyncAt,
        lastSyncAt: connection.lastSyncedAt ?? health?.lastSyncAt,
        latestSyncStatus,
      }
    },
    [connectionManager, integrationApplicationService]
  )

  const bootstrap = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const registry = connectionManager.getRegistry()
      const catalog = mergeCatalogWithRegistry(registry.connectors).filter((connector) =>
        CONNECTOR_CATALOG.some(
          (catalogEntry) => catalogEntry.connectorDefinitionId === connector.connectorDefinitionId
        )
      )
      const refs = loadStoredConnectionReferences()

      const resolvedRefs: Array<{ connectorDefinitionId: string; connectionId: string }> = []
      const nextRecords: ConnectionCenterRecord[] = []

      for (const connector of catalog) {
        const storedRef = refs.find(
          (entry) => entry.connectorDefinitionId === connector.connectorDefinitionId
        )
        let connection: Connection | null = null

        if (storedRef) {
          try {
            const status = await integrationApplicationService.getIntegrationStatus({
              connectionId: storedRef.connectionId,
            })
            connection = status.payload.connection
          } catch {
            connection = null
          }
        }

        if (!connection) {
          const created = await connectionManager.createConnection({
            workspaceId: getDefaultWorkspaceId(),
            connectorDefinitionId: connector.connectorDefinitionId,
            connectorId: connector.connectorId,
            metadata: {
              accountName: connector.connectedAccountLabel,
              workspaceName: connector.workspaceLabel,
            },
            credential: oauthCredentialPayload(connector.connectorId),
          })

          const connectInput: AuthorizeConnectorRequestDto = {
            connectionId: created.connectionId,
            authorizationCode: `${connector.connectorId}_auth_code`,
          }
          await connectionManager.connect(connectInput)

          await connectionManager.scheduleSync({
            connectionId: created.connectionId,
            cron: "*/30 * * * *",
            timezone: getDefaultTimezone(),
            enabled: true,
          })

          await connectionManager.runSync({
            connectionId: created.connectionId,
            trigger: "scheduled",
          })

          connection = created
        }

        resolvedRefs.push({
          connectorDefinitionId: connector.connectorDefinitionId,
          connectionId: connection.connectionId,
        })

        nextRecords.push(await buildRecord(connection))
      }

      storeConnectionReferences(resolvedRefs)
      setRecords(nextRecords)
    } catch (error) {
      setError(toAppError(error).message)
    } finally {
      setIsLoading(false)
    }
  }, [buildRecord, connectionManager, integrationApplicationService])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const refreshConnection = useCallback(
    async (connectionId: string) => {
      const status = await integrationApplicationService.getIntegrationStatus({ connectionId })
      const next = await buildRecord(status.payload.connection)
      setRecords((current) => {
        const exists = current.some((entry) => entry.connection.connectionId === connectionId)
        if (!exists) {
          return [next, ...current]
        }

        return current.map((entry) =>
          entry.connection.connectionId === connectionId ? next : entry
        )
      })
      return next
    },
    [buildRecord, integrationApplicationService]
  )

  const runSync = useCallback(
    async (connectionId: string) => {
      await connectionManager.runSync({ connectionId, trigger: "manual" })
      return refreshConnection(connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const refreshToken = useCallback(
    async (connectionId: string) => {
      await connectionManager.refreshConnection({ connectionId })
      return refreshConnection(connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const disconnect = useCallback(
    async (connectionId: string) => {
      await connectionManager.disconnectConnection({
        connectionId,
        reason: "Disconnected from Connections Center",
      })
      return refreshConnection(connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const connect = useCallback(
    async (connectionId: string) => {
      await connectionManager.connect({
        connectionId,
        authorizationCode: `${connectionId}_reconnect_code`,
      })
      return refreshConnection(connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const pauseSync = useCallback(
    async (record: ConnectionCenterRecord) => {
      const latestJob: SyncJob | undefined = record.integrationStatus.latestJob
      if (!latestJob) {
        await connectionManager.runSync({
          connectionId: record.connection.connectionId,
          trigger: "manual",
        })
      }

      const jobId =
        record.integrationStatus.latestJob?.syncJobId ??
        (
          await integrationApplicationService.getIntegrationStatus({
            connectionId: record.connection.connectionId,
          })
        ).payload.latestJob?.syncJobId

      if (!jobId) {
        return
      }

      await connectionManager.pauseSync(jobId)
      return refreshConnection(record.connection.connectionId)
    },
    [connectionManager, integrationApplicationService, refreshConnection]
  )

  const resumeSync = useCallback(
    async (record: ConnectionCenterRecord) => {
      const jobId = record.integrationStatus.latestJob?.syncJobId
      if (!jobId) {
        return
      }

      await connectionManager.resumeSync(jobId)
      return refreshConnection(record.connection.connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const retrySync = useCallback(
    async (record: ConnectionCenterRecord) => {
      const jobId = record.integrationStatus.latestJob?.syncJobId
      if (!jobId) {
        return
      }

      await connectionManager.runRetryQueue(record.connection.connectionId)
      return refreshConnection(record.connection.connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const filteredRecords = useMemo(
    () => filterConnectionRecords(records, filters),
    [records, filters]
  )

  const updateFilters = useCallback((next: Partial<ConnectionsFilterState>) => {
    setFilters((current) => ({ ...current, ...next }))
  }, [])

  const getConnectionById = useCallback(
    (connectionId: string) =>
      records.find((record) => record.connection.connectionId === connectionId) ?? null,
    [records]
  )

  const availableFilters = useMemo(() => {
    const platforms = [...new Set(records.map((record) => record.platformName))]
    const workspaces = [...new Set(records.map((record) => record.workspaceName))]
    const capabilities = [...new Set(records.flatMap((record) => record.capabilities))]

    return {
      platforms,
      workspaces,
      capabilities,
    }
  }, [records])

  return {
    isLoading,
    error,
    records,
    filteredRecords,
    filters,
    availableFilters,
    updateFilters,
    refetch: bootstrap,
    runSync,
    retrySync,
    refreshToken,
    disconnect,
    connect,
    pauseSync,
    resumeSync,
    getConnectionById,
  }
}
