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

export function ConnectionSyncHistory({ connectionId }: { connectionId: string }) {
  const { getConnectionById } = useConnectionsCenter()
  const record = getConnectionById(connectionId)

  if (!record) {
    return (
      <AppPage>
        <AppContainer>
          <AppCard title="Sync History" subtitle="Connection not found" state="empty" />
        </AppContainer>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <h1 className="text-2xl font-semibold tracking-tight">Sync History</h1>
          <p className="text-sm text-muted-foreground">
            Sync Runs with duration, status, entities, errors, retry, trigger, and starter.
          </p>
        </AppSection>

        <AppSection>
          <AppCard title={`${record.platformName} sync history`}>
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>Sync Run</AppTableHead>
                  <AppTableHead>Duration</AppTableHead>
                  <AppTableHead>Status</AppTableHead>
                  <AppTableHead>Entities</AppTableHead>
                  <AppTableHead>Created</AppTableHead>
                  <AppTableHead>Updated</AppTableHead>
                  <AppTableHead>Skipped</AppTableHead>
                  <AppTableHead>Errors</AppTableHead>
                  <AppTableHead>Retry</AppTableHead>
                  <AppTableHead>Started By</AppTableHead>
                  <AppTableHead>Trigger</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {record.syncHistory?.runs.map((run) => {
                  const job = record.syncHistory?.jobs.find(
                    (entry) => entry.syncJobId === run.syncJobId
                  )
                  const result = run.result
                  const skipped =
                    result &&
                    typeof result.recordsRead === "number" &&
                    typeof result.recordsWritten === "number"
                      ? Math.max(result.recordsRead - result.recordsWritten, 0)
                      : 0

                  return (
                    <AppTableRow key={run.syncRunId}>
                      <AppTableCell>{run.syncRunId}</AppTableCell>
                      <AppTableCell>{result?.durationMs ?? "-"}</AppTableCell>
                      <AppTableCell>
                        <AppStatusBadge
                          status={
                            run.status === "completed"
                              ? "success"
                              : run.status === "failed"
                                ? "danger"
                                : "warning"
                          }
                          label={run.status}
                        />
                      </AppTableCell>
                      <AppTableCell>{result?.recordsRead ?? "-"}</AppTableCell>
                      <AppTableCell>{result?.recordsWritten ?? "-"}</AppTableCell>
                      <AppTableCell>{result?.recordsWritten ?? "-"}</AppTableCell>
                      <AppTableCell>{skipped}</AppTableCell>
                      <AppTableCell>{result?.recordsFailed ?? 0}</AppTableCell>
                      <AppTableCell>{run.attempt}</AppTableCell>
                      <AppTableCell>system</AppTableCell>
                      <AppTableCell>{job?.trigger ?? "-"}</AppTableCell>
                    </AppTableRow>
                  )
                })}
              </AppTableBody>
            </AppTable>
          </AppCard>
        </AppSection>

        <AppSection>
          <div className="flex flex-wrap gap-2">
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
