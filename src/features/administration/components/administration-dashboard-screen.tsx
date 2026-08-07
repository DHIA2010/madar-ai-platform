"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { ROUTES } from "@/constants/routes"

import { AppBadge, AppButton, AppCard, AppInput, AppPageHeader } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useInvitationsQuery } from "../queries/use-invitations-query"
import { useRolesQuery } from "../queries/use-roles-query"
import { useTeamsQuery } from "../queries/use-teams-query"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"

export function AdministrationDashboardScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const organizationId = currentOrganization?.id

  const usersQuery = useUsersQuery(administrationApplicationService, organizationId)
  const rolesQuery = useRolesQuery(administrationApplicationService, organizationId)
  const teamsQuery = useTeamsQuery(administrationApplicationService, organizationId)
  const invitationsQuery = useInvitationsQuery(administrationApplicationService, organizationId)

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data])
  const invitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data])

  const [query, setQuery] = useState("")

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []

    const userResults = users
      .filter(
        (user) =>
          user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
      )
      .map((user) => ({ type: "User", label: `${user.fullName} · ${user.email}` }))

    const teamResults = teams
      .filter((team) => team.name.toLowerCase().includes(term))
      .map((team) => ({ type: "Team", label: team.name }))

    const roleResults = roles
      .filter((role) => role.name.toLowerCase().includes(term))
      .map((role) => ({ type: "Role", label: role.name }))

    const invitationResults = invitations
      .filter((invitation) => invitation.email.toLowerCase().includes(term))
      .map((invitation) => ({ type: "Invitation", label: invitation.email }))

    return [...userResults, ...teamResults, ...roleResults, ...invitationResults].slice(0, 10)
  }, [invitations, query, roles, teams, users])

  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === "pending"
  ).length

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Administration"
        subtitle="Enterprise Identity & Access Management for users, roles, permissions, and governance."
        actions={
          <div className="flex items-center gap-2">
            <AppBadge variant="outline">Pending invitations: {pendingInvitations}</AppBadge>
            <AppButton asChild>
              <Link href={ROUTES.administrationInvitations}>Invite users</Link>
            </AppButton>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppCard
          title="Users"
          subtitle="Managed identities"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{users.length}</p>
        </AppCard>
        <AppCard
          title="Roles"
          subtitle="Default + custom"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{roles.length}</p>
        </AppCard>
        <AppCard
          title="Teams"
          subtitle="Cross-functional groups"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{teams.length}</p>
        </AppCard>
        <AppCard
          title="Invitations"
          subtitle="Pending + accepted"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{invitations.length}</p>
        </AppCard>
      </div>

      <AppCard title="Global IAM Search" subtitle="Search users, teams, roles, and invitations.">
        <div className="space-y-3">
          <AppInput
            placeholder="Search IAM entities"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() === "" ? (
            <p className="text-sm text-muted-foreground">Start typing to search IAM entities.</p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No IAM entities match your query.</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((result) => (
                <div
                  key={`${result.type}-${result.label}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                >
                  <span>{result.label}</span>
                  <AppBadge variant="outline">{result.type}</AppBadge>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppCard>
    </div>
  )
}
