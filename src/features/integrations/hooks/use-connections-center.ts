"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { toAppError } from "@/lib/app-errors"
import { traceFrontendExecution } from "@/lib/debug/frontend-execution-trace"

import {
  appendConnectorAccount,
  CONNECTOR_CATALOG,
  filterConnectionRecords,
  inferHealthState,
  loadStoredConnectionReferences,
  loadStoredConnectorAccounts,
  removeStoredConnectionReference,
  removeStoredConnectorAccounts,
  storeConnectionReferences,
} from "../services"
import type { ConnectionCenterRecord, ConnectionsFilterState } from "../types"

import { useApplicationServices } from "@/application/context"
import type { Connection, SyncHistoryViewModel, SyncJob } from "@/application/contracts"

const DEFAULT_FILTERS: ConnectionsFilterState = {
  search: "",
  status: "all",
  health: "all",
  platform: "all",
  workspace: "all",
  capability: "all",
}

export function useConnectionsCenter() {
  const { connectionManager, integrationApplicationService } = useApplicationServices()
  const [records, setRecords] = useState<ConnectionCenterRecord[]>([])
  const [filters, setFilters] = useState<ConnectionsFilterState>(DEFAULT_FILTERS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bootstrapRequestIdRef = useRef(0)

  const clearOAuthCallbackParams = useCallback((connectionId: string) => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const callbackConnectionId = params.get("google_connection_id")
    if (callbackConnectionId !== connectionId && params.get("google_oauth") !== "connected") {
      return
    }

    params.delete("google_oauth")
    params.delete("google_connection_id")
    params.delete("google_connection_name")
    params.delete("google_account_name")
    params.delete("google_account_email")
    params.delete("reason")

    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery.length > 0 ? `?${nextQuery}` : ""}${window.location.hash}`
    window.history.replaceState(window.history.state, "", nextUrl)
  }, [])

  const buildRecord = useCallback(
    async (connection: Connection, requestId?: number): Promise<ConnectionCenterRecord | null> => {
      traceFrontendExecution({
        step: "buildConnectionCards()",
        connectionId: connection.connectionId,
        customerId:
          typeof connection.metadata.customerId === "string"
            ? connection.metadata.customerId
            : null,
        connectionCount: records.length,
      })

      const statusViewModel = await integrationApplicationService.getIntegrationStatus({
        connectionId: connection.connectionId,
      })

      if (requestId !== undefined && requestId !== bootstrapRequestIdRef.current) {
        return null
      }

      let syncHistory: SyncHistoryViewModel | undefined
      try {
        syncHistory = await integrationApplicationService.getSyncHistory({
          connectionId: connection.connectionId,
          limit: 20,
        })
      } catch {
        syncHistory = undefined
      }

      if (requestId !== undefined && requestId !== bootstrapRequestIdRef.current) {
        return null
      }

      const connectorHealth = await integrationApplicationService.getConnectorHealth({
        connectorId: connection.connectorId,
      })

      if (requestId !== undefined && requestId !== bootstrapRequestIdRef.current) {
        return null
      }

      const health = connectionManager.getHealth(connection.connectionId)
      const scheduler = connectionManager.getScheduler(connection.connectionId)
      const history = connectionManager.getHistory(connection.connectionId)
      const catalogEntry =
        CONNECTOR_CATALOG.find(
          (item) => item.connectorDefinitionId === connection.connectorDefinitionId
        ) ?? CONNECTOR_CATALOG[0]

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
        healthScore: connectorHealth.payload.score,
        healthLabel: connectorHealth.payload.status,
      }
    },
    [connectionManager, integrationApplicationService, records.length]
  )

  const bootstrap = useCallback(async () => {
    const requestId = ++bootstrapRequestIdRef.current
    setIsLoading(true)
    setError(null)

    traceFrontendExecution({
      step: "bootstrapConnections()",
      connectionCount: records.length,
      details: `requestId=${requestId}`,
    })

    try {
      const callbackParams =
        typeof window === "undefined" ? null : new URLSearchParams(window.location.search)
      const callbackConnected = callbackParams?.get("google_oauth") === "connected"
      const callbackConnectionId = callbackParams?.get("google_connection_id")
      const callbackAccountName = callbackParams?.get("google_account_name")

      const refs = loadStoredConnectionReferences()
      traceFrontendExecution({
        step: "fetchConnections()",
        connectionId: callbackConnectionId,
        connectionCount: refs.length,
        details: "loaded stored connection references",
      })

      if (callbackConnected && callbackConnectionId) {
        const googleCatalog = CONNECTOR_CATALOG.find((entry) => entry.connectorId === "google_ads")

        if (googleCatalog) {
          try {
            await integrationApplicationService.validateConnection({
              connectionId: callbackConnectionId,
            })
          } catch {
            // Ignore and continue; bootstrap should remain resilient.
          }

          if (
            !refs.some(
              (entry) =>
                entry.connectorDefinitionId === googleCatalog.connectorDefinitionId &&
                entry.connectionId === callbackConnectionId
            )
          ) {
            refs.push({
              connectorDefinitionId: googleCatalog.connectorDefinitionId,
              connectionId: callbackConnectionId,
            })
          }

          if (callbackAccountName) {
            appendConnectorAccount(googleCatalog.connectorDefinitionId, callbackAccountName)
          }
        }
      }

      if (refs.length === 0) {
        const recovered = await integrationApplicationService.recoverConnections()
        for (const recoveredConnection of recovered) {
          refs.push({
            connectorDefinitionId: recoveredConnection.payload.connectorDefinitionId,
            connectionId: recoveredConnection.payload.connectionId,
          })
        }
      }

      const resolvedRefs: Array<{ connectorDefinitionId: string; connectionId: string }> = []
      const nextRecords: ConnectionCenterRecord[] = []

      for (const storedRef of refs) {
        if (requestId !== bootstrapRequestIdRef.current) {
          return
        }

        let connection: Connection | null = null

        try {
          const status = await integrationApplicationService.getIntegrationStatus({
            connectionId: storedRef.connectionId,
          })
          connection = status.payload.connection
        } catch {
          connection = null
        }

        // If connection is draft (possibly stale after session reset), try backend sync.
        if (connection && connection.status === "draft") {
          try {
            const validated = await integrationApplicationService.validateConnection({
              connectionId: connection.connectionId,
            })
            connection = validated.payload
          } catch {
            // Keep existing draft connection if sync fails.
          }
        }

        if (!connection) {
          continue
        }

        // Skip if this canonical connection ID was already resolved (deduplicates after backend sync).
        if (resolvedRefs.some((r) => r.connectionId === connection.connectionId)) {
          continue
        }

        resolvedRefs.push({
          connectorDefinitionId: storedRef.connectorDefinitionId,
          connectionId: connection.connectionId,
        })

        const record = await buildRecord(connection, requestId)
        if (record) {
          nextRecords.push(record)
        }
      }

      if (requestId !== bootstrapRequestIdRef.current) {
        return
      }

      storeConnectionReferences(resolvedRefs)
      setRecords(nextRecords)
    } catch (error) {
      if (requestId !== bootstrapRequestIdRef.current) {
        return
      }

      setError(toAppError(error).message)
    } finally {
      if (requestId === bootstrapRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [buildRecord, integrationApplicationService, records.length])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const refreshConnection = useCallback(
    async (connectionId: string) => {
      const status = await integrationApplicationService.getIntegrationStatus({ connectionId })
      const next = await buildRecord(status.payload.connection)
      if (!next) {
        return null
      }

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
      const refreshed = await refreshConnection(connectionId)
      if (!refreshed) {
        throw new Error("Connection could not be refreshed after sync.")
      }

      return refreshed
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
      })
      return refreshConnection(connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const deleteConnection = useCallback(
    async (connectionId: string) => {
      bootstrapRequestIdRef.current += 1

      const record = records.find((entry) => entry.connection.connectionId === connectionId)
      traceFrontendExecution({
        step: "deleteConnection()",
        connectionId,
        customerId:
          typeof record?.connection.metadata.customerId === "string"
            ? record.connection.metadata.customerId
            : null,
        connectionCount: records.length,
      })

      await connectionManager.deleteConnection({ connectionId })

      removeStoredConnectionReference(connectionId)
      if (record) {
        const remainingReferences = loadStoredConnectionReferences().filter(
          (entry) => entry.connectorDefinitionId === record.connectorDefinitionId
        )
        if (remainingReferences.length === 0) {
          removeStoredConnectorAccounts(record.connectorDefinitionId)
        }
      }

      clearOAuthCallbackParams(connectionId)

      setRecords((current) =>
        current.filter((entry) => entry.connection.connectionId !== connectionId)
      )

      traceFrontendExecution({
        step: "invalidateQueries()",
        connectionId,
        customerId:
          typeof record?.connection.metadata.customerId === "string"
            ? record.connection.metadata.customerId
            : null,
        connectionCount: Math.max(0, records.length - 1),
        details:
          "No React Query invalidation in Connections Center; local state/storage invalidation only",
      })

      traceFrontendExecution({
        step: "refetchConnections()",
        connectionId,
        customerId:
          typeof record?.connection.metadata.customerId === "string"
            ? record.connection.metadata.customerId
            : null,
        connectionCount: Math.max(0, records.length - 1),
      })

      await bootstrap()
    },
    [bootstrap, clearOAuthCallbackParams, connectionManager, records]
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
    deleteConnection,
    connect,
    pauseSync,
    resumeSync,
    getConnectionById,
  }
}
