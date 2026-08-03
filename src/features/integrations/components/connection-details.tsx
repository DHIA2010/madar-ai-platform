"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import {
  AppCard,
  AppConfirmDialog,
  AppContainer,
  AppPage,
  AppSection,
  AppStatusBadge,
  RelativeTime,
} from "@/components/app"

import { useConnectionsCenter } from "../hooks"
import {
  CONNECTION_ACTION_IDS,
  type ConnectionActionDefinition,
  connectionActionPolicy,
  getHealthTone,
  getStatusTone,
} from "../services"
import { ConnectionActionsMenu } from "./connection-actions-menu"

export function ConnectionDetails({ connectionId }: { connectionId: string }) {
  const router = useRouter()
  const {
    connect,
    deleteConnection,
    disconnect,
    getConnectionById,
    isLoading,
    pauseSync,
    resumeSync,
    retrySync,
  } = useConnectionsCenter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingAction, setPendingAction] = useState<ConnectionActionDefinition | null>(null)
  const record = getConnectionById(connectionId)

  if (!record) {
    return (
      <AppPage>
        <AppContainer>
          <AppCard
            title="Connection Details"
            subtitle={isLoading ? undefined : "Connection not found"}
            state={isLoading ? "loading" : "empty"}
          />
        </AppContainer>
      </AppPage>
    )
  }

  const latestJob = record.integrationStatus.latestJob
  const latestRun = record.integrationStatus.latestRun
  const availableActions = connectionActionPolicy.getAvailableActions({
    connection: record.connection,
    integrationStatus: record.integrationStatus,
  })

  const onDeleteConnection = async () => {
    if (isDeleting) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteConnection(connectionId)
      toast.success("Connection deleted successfully.")
      setIsDeleteDialogOpen(false)
      router.push(ROUTES.integrations)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete connection."
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConnectionAction = async (action: ConnectionActionDefinition) => {
    if (action.requiresConfirmation) {
      setPendingAction(action)
      setIsDeleteDialogOpen(true)
      return
    }

    switch (action.id) {
      case CONNECTION_ACTION_IDS.RECONNECT:
        await connect(connectionId)
        return
      case CONNECTION_ACTION_IDS.PAUSE_SYNC:
        await pauseSync(record)
        return
      case CONNECTION_ACTION_IDS.RESUME_SYNC:
        await resumeSync(record)
        return
      case CONNECTION_ACTION_IDS.RETRY:
        await retrySync(record)
        return
      case CONNECTION_ACTION_IDS.DISCONNECT:
        await disconnect(connectionId)
        return
      case CONNECTION_ACTION_IDS.DELETE_CONNECTION:
        setPendingAction(action)
        setIsDeleteDialogOpen(true)
        return
      default:
        return
    }
  }

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <h1 className="text-2xl font-semibold tracking-tight">Connection Details</h1>
          <p className="text-sm text-muted-foreground">
            General Information, Authentication, Health, Capabilities, Sync Stats, Errors, Rate
            Limit, Configuration, and Metadata.
          </p>
        </AppSection>

        <AppSection className="grid gap-6 lg:grid-cols-2">
          <AppCard
            title={record.platformName}
            subtitle="Connection details"
            actions={
              <div className="flex items-center gap-2">
                <AppStatusBadge
                  status={getStatusTone(record.connection.status)}
                  label={record.connection.status}
                />
                <AppStatusBadge
                  status={getHealthTone(record.healthState)}
                  label={record.healthState}
                />
                <ConnectionActionsMenu
                  actions={availableActions}
                  menuLabel="Connection actions"
                  onActionSelect={(action) => {
                    void handleConnectionAction(action)
                  }}
                />
              </div>
            }
          >
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Connection ID</dt>
              <dd>{record.connection.connectionId}</dd>
              <dt className="text-muted-foreground">Connector ID</dt>
              <dd>{record.connectorId}</dd>
              <dt className="text-muted-foreground">Workspace</dt>
              <dd>{record.workspaceName}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{record.version}</dd>
              <dt className="text-muted-foreground">Authentication Status</dt>
              <dd>{record.connection.status}</dd>
              <dt className="text-muted-foreground">Token Expiration</dt>
              <dd>{record.tokenExpiresAt ?? "-"}</dd>
            </dl>

            <div className="mt-5 space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">Connected Accounts</p>
                <p className="text-xs text-muted-foreground">
                  Current account and customer selection used by this connection.
                </p>
              </div>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Connected Google Account</dt>
                  <dd className="mt-1 font-medium">
                    {record.connection.metadata.accountEmail?.trim() ||
                      record.connectedAccount ||
                      "-"}
                  </dd>
                </div>
                <div className="rounded-md border bg-background px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Selected Customer</dt>
                  <dd className="mt-1 font-medium">{record.connectedAccount || "-"}</dd>
                </div>
                <div className="rounded-md border bg-background px-3 py-2 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Customer ID</dt>
                  <dd className="mt-1 font-medium">
                    {record.connection.metadata.customerId?.trim() || "-"}
                  </dd>
                </div>
              </dl>
            </div>
          </AppCard>

          <AppCard title="Synchronization and Reliability">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Last Sync</dt>
              <dd>
                <RelativeTime value={record.lastSyncAt} fallback="-" />
              </dd>
              <dt className="text-muted-foreground">Next Sync</dt>
              <dd>
                <RelativeTime value={record.nextSyncAt} fallback="-" />
              </dd>
              <dt className="text-muted-foreground">Sync Status</dt>
              <dd>{record.latestSyncStatus ?? "-"}</dd>
              <dt className="text-muted-foreground">Retry Count</dt>
              <dd>{record.retryCount}</dd>
              <dt className="text-muted-foreground">Rate Limit Remaining</dt>
              <dd>{latestJob?.rateLimit?.remaining ?? "-"}</dd>
              <dt className="text-muted-foreground">Rate Limit Reset</dt>
              <dd>{latestJob?.rateLimit?.resetAt ?? "-"}</dd>
              <dt className="text-muted-foreground">Sync Duration</dt>
              <dd>{latestRun?.result?.durationMs ?? "-"}</dd>
              <dt className="text-muted-foreground">Last Error</dt>
              <dd>{record.lastError ?? latestRun?.errorMessage ?? "-"}</dd>
            </dl>
          </AppCard>

          <AppCard title="Capabilities and Metadata">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {record.capabilities.map((capability) => (
                  <AppStatusBadge key={capability} status="neutral" label={capability} />
                ))}
              </div>
              <pre className="overflow-x-auto rounded-md border p-3 text-xs">
                {JSON.stringify(record.connection.metadata, null, 2)}
              </pre>
            </div>
          </AppCard>

          <AppCard id="logs" title="Recent Logs and Events">
            <div className="space-y-2 text-sm">
              {record.integrationStatus.recentEvents.map((event) => (
                <div key={event.eventId} className="rounded-md border p-2">
                  <div className="font-medium">{event.action}</div>
                  <div className="text-muted-foreground">
                    <RelativeTime value={event.timestamp} fallback="-" />
                  </div>
                  <div>{event.message}</div>
                </div>
              ))}
            </div>
          </AppCard>
        </AppSection>

        <AppConfirmDialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            if (!isDeleting) {
              setIsDeleteDialogOpen(open)
              if (!open) {
                setPendingAction(null)
              }
            }
          }}
          title={pendingAction?.confirmation?.title ?? ""}
          description={pendingAction?.confirmation?.description ?? ""}
          cancelLabel="Cancel"
          confirmLabel={pendingAction?.confirmation?.confirmLabel ?? ""}
          confirmTone="destructive"
          loading={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setIsDeleteDialogOpen(false)
              setPendingAction(null)
            }
          }}
          onConfirm={() => {
            void onDeleteConnection()
          }}
        />
      </AppContainer>
    </AppPage>
  )
}
