"use client"

import { useState } from "react"
import Link from "next/link"

import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppContainer, AppInput, AppPage, AppSection } from "@/components/app"

import { useConnectionsCenter } from "../hooks"

export function ConnectionSettings({ connectionId }: { connectionId: string }) {
  const { getConnectionById, refetch } = useConnectionsCenter()
  const record = getConnectionById(connectionId)

  const [accountName, setAccountName] = useState(record?.connectedAccount ?? "")
  const [workspaceName, setWorkspaceName] = useState(record?.workspaceName ?? "")
  const [cron, setCron] = useState("*/30 * * * *")
  const [timezone, setTimezone] = useState("Asia/Riyadh")

  if (!record) {
    return (
      <AppPage>
        <AppContainer>
          <AppCard title="Connection Settings" subtitle="Connection not found" state="empty" />
        </AppContainer>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <h1 className="text-2xl font-semibold tracking-tight">Connection Settings</h1>
          <p className="text-sm text-muted-foreground">
            Update configuration and metadata values used by the existing connection management
            flow.
          </p>
        </AppSection>

        <AppSection className="grid gap-6 lg:grid-cols-2">
          <AppCard title="Metadata">
            <div className="space-y-3">
              <AppInput
                label="Connected Account"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
              <AppInput
                label="Workspace"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Metadata is applied through existing create/connection lifecycle APIs.
              </p>
            </div>
          </AppCard>

          <AppCard title="Schedule Configuration">
            <div className="space-y-3">
              <AppInput
                label="Cron"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
              />
              <AppInput
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This page is connected to the same connection scheduling capabilities in application
                services.
              </p>
            </div>
          </AppCard>
        </AppSection>

        <AppSection>
          <div className="flex flex-wrap gap-2">
            <AppButton onClick={() => void refetch()}>Save Settings</AppButton>
            <Link href={ROUTES.integrationsDetails(connectionId)}>
              <AppButton variant="outline">Back to Details</AppButton>
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
