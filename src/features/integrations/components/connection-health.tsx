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
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useConnectionsCenter } from "../hooks"
import { getHealthTone } from "../services"

export function ConnectionHealthPage() {
  const { filteredRecords } = useConnectionsCenter()

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <h1 className="text-2xl font-semibold tracking-tight">Connection Health</h1>
          <p className="text-sm text-muted-foreground">
            View connector health states: Healthy, Warning, Error, Expired Token, Paused,
            Disconnected, Running Sync, and Queued.
          </p>
        </AppSection>

        <AppSection>
          <AppCard title="Health matrix">
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>Platform</AppTableHead>
                  <AppTableHead>State</AppTableHead>
                  <AppTableHead>Status</AppTableHead>
                  <AppTableHead>Last Sync</AppTableHead>
                  <AppTableHead>Next Sync</AppTableHead>
                  <AppTableHead>Token Expiration</AppTableHead>
                  <AppTableHead>Retry Count</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {filteredRecords.map((record) => (
                  <AppTableRow key={`health-${record.connection.connectionId}`}>
                    <AppTableCell>
                      <Link href={ROUTES.integrationsDetails(record.connection.connectionId)}>
                        {record.platformName}
                      </Link>
                    </AppTableCell>
                    <AppTableCell>
                      <AppStatusBadge
                        status={getHealthTone(record.healthState)}
                        label={record.healthState}
                      />
                    </AppTableCell>
                    <AppTableCell>{record.connection.status}</AppTableCell>
                    <AppTableCell>{record.lastSyncAt ?? "-"}</AppTableCell>
                    <AppTableCell>{record.nextSyncAt ?? "-"}</AppTableCell>
                    <AppTableCell>{record.tokenExpiresAt ?? "-"}</AppTableCell>
                    <AppTableCell>{record.retryCount}</AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          </AppCard>
        </AppSection>

        <AppSection>
          <Link href={ROUTES.integrations}>
            <AppButton variant="outline">Back to Overview</AppButton>
          </Link>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
