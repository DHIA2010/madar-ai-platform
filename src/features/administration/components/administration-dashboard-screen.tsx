"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { ROUTES } from "@/constants/routes"

import { AppBadge, AppButton, AppCard, AppInput, AppPageHeader } from "@/components/app"

import { IAM_INVITATIONS, IAM_ROLES, IAM_TEAMS, IAM_USERS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

export function AdministrationDashboardScreen() {
  const [query, setQuery] = useState("")

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []

    const users = IAM_USERS.filter((user) => {
      return user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
    }).map((user) => ({ type: "User", label: `${user.fullName} · ${user.email}` }))

    const teams = IAM_TEAMS.filter((team) => team.name.toLowerCase().includes(term)).map(
      (team) => ({ type: "Team", label: team.name })
    )
    const roles = IAM_ROLES.filter((role) => role.name.toLowerCase().includes(term)).map(
      (role) => ({ type: "Role", label: role.name })
    )
    const invitations = IAM_INVITATIONS.filter((invitation) =>
      invitation.email.toLowerCase().includes(term)
    ).map((invitation) => ({
      type: "Invitation",
      label: invitation.email,
    }))

    return [...users, ...teams, ...roles, ...invitations].slice(0, 10)
  }, [query])

  const pendingInvitations = IAM_INVITATIONS.filter(
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
          <p className="text-3xl font-semibold">{IAM_USERS.length}</p>
        </AppCard>
        <AppCard
          title="Roles"
          subtitle="Default + custom"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{IAM_ROLES.length}</p>
        </AppCard>
        <AppCard
          title="Teams"
          subtitle="Cross-functional groups"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{IAM_TEAMS.length}</p>
        </AppCard>
        <AppCard
          title="Invitations"
          subtitle="Pending + accepted"
          className="shadow-sm"
          contentClassName="pt-0"
        >
          <p className="text-3xl font-semibold">{IAM_INVITATIONS.length}</p>
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
