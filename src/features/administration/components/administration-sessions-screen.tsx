"use client"

import { useState } from "react"

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
} from "@/components/app"

import { IAM_SESSIONS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

export function AdministrationSessionsScreen() {
  const [sessions, setSessions] = useState(IAM_SESSIONS)

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Active Sessions"
        subtitle="Monitor device posture and revoke active sessions (UI-only)."
        actions={
          <AppButton
            variant="outline"
            onClick={() => setSessions((current) => current.filter((session) => session.current))}
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
                  <AppTableCell>{session.loginTime}</AppTableCell>
                  <AppTableCell>{session.lastActivity}</AppTableCell>
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
                        onClick={() =>
                          setSessions((current) => current.filter((item) => item.id !== session.id))
                        }
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
      </AppCard>
    </div>
  )
}
