"use client"

import Link from "next/link"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppPage,
  AppSection,
  AppStatusBadge,
} from "@/components/app"

import { useConnectionsCenter } from "../hooks"
import { getHealthTone, getStatusTone } from "../services"

export function ConnectionDetails({ connectionId }: { connectionId: string }) {
  const { getConnectionById } = useConnectionsCenter()
  const record = getConnectionById(connectionId)

  if (!record) {
    return (
      <AppPage>
        <AppContainer>
          <AppCard title="Connection Details" subtitle="Connection not found" state="empty" />
        </AppContainer>
      </AppPage>
    )
  }

  const latestJob = record.integrationStatus.latestJob
  const latestRun = record.integrationStatus.latestRun

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
            subtitle={`${record.connectedAccounts.length} Accounts Connected`}
            actions={
              <div className="flex gap-2">
                <AppStatusBadge
                  status={getStatusTone(record.connection.status)}
                  label={record.connection.status}
                />
                <AppStatusBadge
                  status={getHealthTone(record.healthState)}
                  label={record.healthState}
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
                  Manage accounts under the same connector.
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                {record.connectedAccounts.map((accountName) => (
                  <li key={accountName} className="rounded-md border bg-background px-3 py-2">
                    {accountName}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link href={ROUTES.integrationsNew}>
                  <AppButton size="sm" variant="outline">
                    Connect another account
                  </AppButton>
                </Link>
                <AppButton size="sm" variant="outline">
                  Remove account
                </AppButton>
                <AppButton size="sm" variant="outline">
                  Reconnect account
                </AppButton>
                <AppButton size="sm" variant="outline">
                  Change default account
                </AppButton>
              </div>
            </div>
          </AppCard>

          <AppCard title="Synchronization and Reliability">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Last Sync</dt>
              <dd>{record.lastSyncAt ?? "-"}</dd>
              <dt className="text-muted-foreground">Next Sync</dt>
              <dd>{record.nextSyncAt ?? "-"}</dd>
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
                  <div className="text-muted-foreground">{event.timestamp}</div>
                  <div>{event.message}</div>
                </div>
              ))}
            </div>
          </AppCard>
        </AppSection>

        <AppSection>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.integrationsSettings(connectionId)}>
              <AppButton variant="outline">Connection Settings</AppButton>
            </Link>
            <Link href={ROUTES.integrationsHistory(connectionId)}>
              <AppButton variant="outline">Sync History</AppButton>
            </Link>
            <Link href={ROUTES.integrationsHealth}>
              <AppButton variant="outline">Connection Health</AppButton>
            </Link>
            <Link href={ROUTES.integrations}>
              <AppButton variant="outline">Back to Overview</AppButton>
            </Link>
          </div>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
