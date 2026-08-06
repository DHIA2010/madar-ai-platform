"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { toAppError } from "@/lib/app-errors"
import { traceFrontendExecution } from "@/lib/debug/frontend-execution-trace"

import { onWorkspaceLifecycleChanged, useWorkspace } from "@/features/workspace"

import type { StoredConnectionReference } from "../services"
import {
  appendConnectorAccount,
  CONNECTION_ACTION_IDS,
  connectionActionPolicy,
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
import type { Connection, SyncHistoryViewModel } from "@/application/contracts"

interface OAuthCallbackParamProfile {
  statusParam: string
  connectionIdParam: string
  accountNameParam: string
  allParams: string[]
}

const OAUTH_CALLBACK_PARAMS_BY_CONNECTOR_ID: Record<string, OAuthCallbackParamProfile> = {
  google_ads: {
    statusParam: "google_oauth",
    connectionIdParam: "google_connection_id",
    accountNameParam: "google_account_name",
    allParams: [
      "google_oauth",
      "google_connection_id",
      "google_connection_name",
      "google_account_name",
      "google_account_email",
    ],
  },
  snapchat_ads: {
    statusParam: "snapchat_oauth",
    connectionIdParam: "snapchat_connection_id",
    accountNameParam: "snapchat_account_name",
    allParams: [
      "snapchat_oauth",
      "snapchat_connection_id",
      "snapchat_project_id",
      "snapchat_status",
      "snapchat_account_name",
      "snapchat_connected_at",
    ],
  },
}

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
  const { currentWorkspace } = useWorkspace()
  const currentWorkspaceId = currentWorkspace?.id ?? null
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
    const matchedProfile = Object.values(OAUTH_CALLBACK_PARAMS_BY_CONNECTOR_ID).find(
      (profile) => params.get(profile.connectionIdParam) === connectionId
    )
    if (!matchedProfile) {
      return
    }

    for (const param of matchedProfile.allParams) {
      params.delete(param)
    }
    params.delete("reason")

    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery.length > 0 ? `?${nextQuery}` : ""}${window.location.hash}`
    window.history.replaceState(window.history.state, "", nextUrl)
  }, [])

  const buildRecord = useCallback(
    async (
      connection: Connection,
      statusViewModel: Awaited<
        ReturnType<typeof integrationApplicationService.getIntegrationStatus>
      >,
      requestId?: number
    ): Promise<ConnectionCenterRecord | null> => {
      traceFrontendExecution({
        step: "buildConnectionCards()",
        connectionId: connection.connectionId,
        customerId:
          typeof connection.metadata.customerId === "string"
            ? connection.metadata.customerId
            : null,
        connectionCount: records.length,
      })

      const [syncHistory, connectorHealth] = await Promise.all([
        integrationApplicationService
          .getSyncHistory({
            connectionId: connection.connectionId,
            limit: 20,
          })
          .catch(() => undefined as SyncHistoryViewModel | undefined),
        integrationApplicationService
          .getConnectorHealth({
            connectorId: connection.connectorId,
          })
          .catch(() => ({
            payload: {
              connectorId: connection.connectorId,
              status: "degraded" as const,
              score: 0,
              lastCheckedAt: new Date().toISOString(),
              checks: [],
            },
          })),
      ])

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
        statusViewModel.payload.recentEvents.find((event) => event.action.startsWith("sync."))

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
      const matchedCallbackEntry = callbackParams
        ? Object.entries(OAUTH_CALLBACK_PARAMS_BY_CONNECTOR_ID).find(
            ([, profile]) => callbackParams.get(profile.statusParam) === "connected"
          )
        : undefined
      const callbackConnectorId = matchedCallbackEntry?.[0] ?? null
      const callbackConnected = Boolean(matchedCallbackEntry)
      const callbackConnectionId = matchedCallbackEntry
        ? callbackParams?.get(matchedCallbackEntry[1].connectionIdParam)
        : null
      const callbackAccountName = matchedCallbackEntry
        ? callbackParams?.get(matchedCallbackEntry[1].accountNameParam)
        : null

      const allStoredRefs = loadStoredConnectionReferences()
      const otherWorkspaceRefs = allStoredRefs.filter(
        (ref) => ref.workspaceId && ref.workspaceId !== currentWorkspaceId
      )
      const refs = allStoredRefs.filter((ref) => ref.workspaceId === currentWorkspaceId)
      traceFrontendExecution({
        step: "fetchConnections()",
        connectionId: callbackConnectionId,
        connectionCount: refs.length,
        details: "loaded stored connection references",
      })

      if (callbackConnected && callbackConnectionId && callbackConnectorId) {
        const matchedCatalog = CONNECTOR_CATALOG.find(
          (entry) => entry.connectorId === callbackConnectorId
        )

        if (matchedCatalog) {
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
                entry.connectorDefinitionId === matchedCatalog.connectorDefinitionId &&
                entry.connectionId === callbackConnectionId
            )
          ) {
            refs.push({
              connectorDefinitionId: matchedCatalog.connectorDefinitionId,
              connectionId: callbackConnectionId,
              workspaceId: currentWorkspaceId ?? undefined,
            })
          }

          if (callbackAccountName) {
            appendConnectorAccount(matchedCatalog.connectorDefinitionId, callbackAccountName)
          }
        }
      }

      // Status for refs we already know about (from local storage) can be fetched
      // concurrently with recoverConnections(), since recoverConnections() only ever
      // adds refs on top of these — it never invalidates ones we already have.
      const prefetchedStatus = new Map(
        refs.map((ref) => [
          ref.connectionId,
          integrationApplicationService
            .getIntegrationStatus({ connectionId: ref.connectionId })
            .catch(() => null),
        ])
      )

      const recovered = await integrationApplicationService.recoverConnections()
      for (const recoveredConnection of recovered) {
        // recoverConnections() can restore a connection into the repository's
        // local state that a concurrently-fired prefetch above raced against
        // and missed (e.g. right after switching back from a workspace with no
        // connection, which prunes that local state). Refresh the status now
        // that recovery has settled, so the loop below doesn't use a stale
        // failed prefetch for a connection that actually exists.
        prefetchedStatus.set(
          recoveredConnection.payload.connectionId,
          integrationApplicationService
            .getIntegrationStatus({ connectionId: recoveredConnection.payload.connectionId })
            .catch(() => null)
        )

        if (
          refs.some(
            (entry) =>
              entry.connectorDefinitionId === recoveredConnection.payload.connectorDefinitionId &&
              entry.connectionId === recoveredConnection.payload.connectionId
          )
        ) {
          continue
        }

        refs.push({
          connectorDefinitionId: recoveredConnection.payload.connectorDefinitionId,
          connectionId: recoveredConnection.payload.connectionId,
          workspaceId: currentWorkspaceId ?? undefined,
        })
      }

      const resolvedRefs: StoredConnectionReference[] = []
      const nextRecords: ConnectionCenterRecord[] = []

      for (const storedRef of refs) {
        if (requestId !== bootstrapRequestIdRef.current) {
          return
        }

        let connection: Connection | null = null
        let status: Awaited<
          ReturnType<typeof integrationApplicationService.getIntegrationStatus>
        > | null = null

        try {
          status = await (prefetchedStatus.get(storedRef.connectionId) ??
            integrationApplicationService.getIntegrationStatus({
              connectionId: storedRef.connectionId,
            }))
          connection = status?.payload.connection ?? null
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
            status = await integrationApplicationService.getIntegrationStatus({
              connectionId: connection.connectionId,
            })
          } catch {
            // Keep existing draft connection if sync fails.
          }
        }

        if (!connection || !status) {
          connectionManager.forgetConnection(storedRef.connectionId)
          continue
        }

        // Skip if this canonical connection ID was already resolved (deduplicates after backend sync).
        if (resolvedRefs.some((r) => r.connectionId === connection.connectionId)) {
          continue
        }

        resolvedRefs.push({
          connectorDefinitionId: storedRef.connectorDefinitionId,
          connectionId: connection.connectionId,
          workspaceId: currentWorkspaceId ?? undefined,
        })

        try {
          const record = await buildRecord(connection, status, requestId)
          if (record) {
            nextRecords.push(record)
          }
        } catch {
          connectionManager.forgetConnection(connection.connectionId)
        }
      }

      if (requestId !== bootstrapRequestIdRef.current) {
        return
      }

      storeConnectionReferences([...otherWorkspaceRefs, ...resolvedRefs])
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
  }, [
    buildRecord,
    connectionManager,
    currentWorkspaceId,
    integrationApplicationService,
    records.length,
  ])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Archiving/restoring a workspace pauses/resumes its connections on the
  // backend; refetch so this stays in sync without requiring a manual
  // page refresh.
  useEffect(() => onWorkspaceLifecycleChanged(() => void bootstrap()), [bootstrap])

  const refreshConnection = useCallback(
    async (connectionId: string) => {
      const status = await integrationApplicationService.getIntegrationStatus({ connectionId })
      const next = await buildRecord(status.payload.connection, status)
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
      const jobId =
        record.integrationStatus.latestJob?.syncJobId ??
        `sync_job_${record.connection.connectionId}`

      await connectionManager.pauseSync(jobId)
      return refreshConnection(record.connection.connectionId)
    },
    [connectionManager, refreshConnection]
  )

  const resumeSync = useCallback(
    async (record: ConnectionCenterRecord) => {
      const jobId =
        record.integrationStatus.latestJob?.syncJobId ??
        `sync_job_${record.connection.connectionId}`

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

      const retryAction = connectionActionPolicy.getAction(
        {
          connection: record.connection,
          integrationStatus: record.integrationStatus,
        },
        CONNECTION_ACTION_IDS.RETRY
      )
      if (!retryAction.enabled) {
        throw new Error(
          retryAction.disabledReason ?? "Retry is unavailable for the latest operation."
        )
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
    disconnect,
    deleteConnection,
    connect,
    pauseSync,
    resumeSync,
    getConnectionById,
  }
}
