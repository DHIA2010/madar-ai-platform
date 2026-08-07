"use client"

import { toast } from "sonner"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppPageHeader,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  RelativeTime,
} from "@/components/app"

import { useSessionMutations } from "../queries/use-session-mutations"
import { useSessionsQuery } from "../queries/use-sessions-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"

export function AdministrationSessionsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { data, isLoading, isError } = useSessionsQuery(administrationApplicationService)
  const { revokeSession } = useSessionMutations()
  const sessions = data ?? []

  async function handleTerminate(sessionId: string) {
    try {
      await revokeSession.mutateAsync(sessionId)
      toast.success("Session terminated")
    } catch {
      toast.error("Failed to terminate session")
    }
  }

  async function handleTerminateAllOthers() {
    const others = sessions.filter((session) => !session.current)
    if (others.length === 0) return

    try {
      await Promise.all(others.map((session) => revokeSession.mutateAsync(session.id)))
      toast.success(`Terminated ${others.length} other session(s)`)
    } catch {
      toast.error("Failed to terminate one or more sessions")
    }
  }

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Active Sessions"
        subtitle="Monitor device posture and revoke your active sessions."
        actions={
          <AppButton
            variant="outline"
            onClick={handleTerminateAllOthers}
            disabled={sessions.every((session) => session.current)}
          >
            Terminate all other sessions
          </AppButton>
        }
      />

      <AppCard
        title="Sessions"
        subtitle="Browser, device, IP, location, and activity state."
        className="shadow-sm"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sessions…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load sessions.</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>Browser</AppTableHead>
                  <AppTableHead>Device</AppTableHead>
                  <AppTableHead>IP</AppTableHead>
                  <AppTableHead>Location</AppTableHead>
                  <AppTableHead>Login Time</AppTableHead>
                  <AppTableHead>Last Activity</AppTableHead>
                  <AppTableHead>Status</AppTableHead>
                  <AppTableHead className="text-right">Actions</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {sessions.map((session) => (
                  <AppTableRow key={session.id}>
                    <AppTableCell>{session.browser}</AppTableCell>
                    <AppTableCell>{session.device}</AppTableCell>
                    <AppTableCell>{session.ip}</AppTableCell>
                    <AppTableCell>{session.location}</AppTableCell>
                    <AppTableCell>
                      <RelativeTime value={session.loginTime} fallback="-" />
                    </AppTableCell>
                    <AppTableCell>
                      <RelativeTime value={session.lastActivity} fallback="-" />
                    </AppTableCell>
                    <AppTableCell>
                      {session.current ? (
                        <AppBadge variant="default">Current</AppBadge>
                      ) : (
                        <AppBadge variant="outline">Active</AppBadge>
                      )}
                    </AppTableCell>
                    <AppTableCell>
                      <div className="flex justify-end">
                        <AppButton
                          size="sm"
                          variant="outline"
                          disabled={session.current}
                          onClick={() => handleTerminate(session.id)}
                        >
                          Terminate
                        </AppButton>
                      </div>
                    </AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          </div>
        )}
      </AppCard>
    </div>
  )
}
