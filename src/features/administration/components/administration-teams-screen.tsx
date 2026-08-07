"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppDialog,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTextarea,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useTeamMutations } from "../queries/use-team-mutations"
import { useTeamsQuery } from "../queries/use-teams-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"

type TeamDraft = {
  name: string
  description: string
  workspaceId: string
}

const defaultDraft: TeamDraft = {
  name: "",
  description: "",
  workspaceId: "",
}

export function AdministrationTeamsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { data, isLoading, isError } = useTeamsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { createTeam } = useTeamMutations(currentOrganization?.id)
  const teams = data ?? []

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultDraft)

  async function handleCreateTeam() {
    if (!currentOrganization || draft.name.trim().length === 0) return

    try {
      await createTeam.mutateAsync({
        organizationId: currentOrganization.id,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        workspaceId: draft.workspaceId || undefined,
      })
      setDraft(defaultDraft)
      setOpen(false)
      toast.success(`Team "${draft.name.trim()}" created`)
    } catch {
      toast.error("Failed to create team")
    }
  }

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Teams"
        subtitle="Organize members by function, manager, workspace, and ownership domain."
        actions={<AppButton onClick={() => setOpen(true)}>Create Team</AppButton>}
      />

      <AppCard
        title="Teams Management"
        subtitle="Cross-functional teams with workspace and management metadata."
        className="shadow-sm"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load teams.</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet. Create the first one.</p>
        ) : (
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
                {teams.map((team) => (
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
                    <AppTableCell>{team.description || "—"}</AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          </div>
        )}
      </AppCard>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="Create Team"
        description="Cross-functional teams organize members by workspace and ownership domain."
        footer={
          <>
            <AppButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              onClick={handleCreateTeam}
              disabled={createTeam.isPending || draft.name.trim().length === 0}
            >
              Create team
            </AppButton>
          </>
        }
        contentClassName="sm:max-w-2xl"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <AppInput
            label="Team name"
            wrapperClassName="md:col-span-2"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />

          <AppSelect
            value={draft.workspaceId}
            onValueChange={(next) => setDraft((current) => ({ ...current, workspaceId: next }))}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Workspace (optional)" />
            </AppSelectTrigger>
            <AppSelectContent position="popper" align="start">
              {availableWorkspaces.map((workspace) => (
                <AppSelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppTextarea
            label="Description"
            className="min-h-[90px]"
            wrapperClassName="md:col-span-2"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
        </div>
      </AppDialog>
    </div>
  )
}
