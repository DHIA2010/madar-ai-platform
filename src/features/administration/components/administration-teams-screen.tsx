"use client"

import {
  AppBadge,
  AppCard,
  AppPageHeader,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { IAM_TEAMS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

export function AdministrationTeamsScreen() {
  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Teams"
        subtitle="Organize members by function, manager, workspace, and ownership domain."
      />

      <AppCard
        title="Teams Management"
        subtitle="Cross-functional teams with workspace and management metadata."
        className="shadow-sm"
      >
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>Team</AppTableHead>
                <AppTableHead>Manager</AppTableHead>
                <AppTableHead>Members</AppTableHead>
                <AppTableHead>Workspace</AppTableHead>
                <AppTableHead>Description</AppTableHead>
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {IAM_TEAMS.map((team) => (
                <AppTableRow key={team.id}>
                  <AppTableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${team.color}`} />
                      {team.name}
                    </span>
                  </AppTableCell>
                  <AppTableCell>{team.manager}</AppTableCell>
                  <AppTableCell>{team.members}</AppTableCell>
                  <AppTableCell>
                    <AppBadge variant="outline">{team.workspace}</AppBadge>
                  </AppTableCell>
                  <AppTableCell>{team.description}</AppTableCell>
                </AppTableRow>
              ))}
            </AppTableBody>
          </AppTable>
        </div>
      </AppCard>
    </div>
  )
}
