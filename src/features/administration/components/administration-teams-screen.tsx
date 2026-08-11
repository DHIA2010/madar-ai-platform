"use client"

import { useMemo, useState } from "react"
import { Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppConfirmDialog,
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

import { useTeamMembersQuery } from "../queries/use-team-members-query"
import { useTeamMutations } from "../queries/use-team-mutations"
import { useTeamsQuery } from "../queries/use-teams-query"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"
import type { AdministrationTeamDto } from "@/application/contracts"

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

function TeamDialog({
  open,
  onOpenChange,
  team,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: AdministrationTeamDto | null
}) {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { createTeam, updateTeam, addTeamMember, removeTeamMember } = useTeamMutations(
    currentOrganization?.id
  )

  const [draft, setDraft] = useState<TeamDraft>(() =>
    team
      ? {
          name: team.name,
          description: team.description === "—" ? "" : team.description,
          workspaceId: team.workspaceId ?? "",
        }
      : defaultDraft
  )
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([])
  const [selectedAddUserId, setSelectedAddUserId] = useState("")

  const { data: memberData, isLoading: membersLoading } = useTeamMembersQuery(
    administrationApplicationService,
    team?.id
  )
  const { data: userData } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )

  const members = useMemo(() => memberData ?? [], [memberData])
  const users = useMemo(() => userData ?? [], [userData])
  const memberUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const addableUsers = useMemo(
    () => users.filter((user) => !memberUserIds.has(user.id)),
    [users, memberUserIds]
  )
  const selectableNewUsers = useMemo(
    () => users.filter((user) => !selectedNewMemberIds.includes(user.id)),
    [users, selectedNewMemberIds]
  )

  async function handleAddExistingMember() {
    if (!team || !selectedAddUserId) return
    try {
      await addTeamMember.mutateAsync({ teamId: team.id, userId: selectedAddUserId })
      setSelectedAddUserId("")
      toast.success("Member added")
    } catch {
      toast.error("Failed to add member")
    }
  }

  async function handleRemoveExistingMember(userId: string) {
    if (!team) return
    try {
      await removeTeamMember.mutateAsync({ teamId: team.id, userId })
      toast.success("Member removed")
    } catch {
      toast.error("Failed to remove member")
    }
  }

  function handleAddNewMember() {
    if (!selectedAddUserId) return
    setSelectedNewMemberIds((current) => [...current, selectedAddUserId])
    setSelectedAddUserId("")
  }

  function handleRemoveNewMember(userId: string) {
    setSelectedNewMemberIds((current) => current.filter((id) => id !== userId))
  }

  async function handleSave() {
    if (!currentOrganization || draft.name.trim().length === 0) return

    try {
      if (team) {
        await updateTeam.mutateAsync({
          teamId: team.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          workspaceId: draft.workspaceId || null,
        })
        toast.success(`Team "${draft.name.trim()}" updated`)
      } else {
        const created = await createTeam.mutateAsync({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          workspaceId: draft.workspaceId || undefined,
        })
        if (selectedNewMemberIds.length > 0) {
          await Promise.all(
            selectedNewMemberIds.map((userId) =>
              addTeamMember.mutateAsync({ teamId: created.id, userId })
            )
          )
        }
        toast.success(`Team "${draft.name.trim()}" created`)
      }
      onOpenChange(false)
    } catch {
      toast.error(team ? "Failed to update team" : "Failed to create team")
    }
  }

  const isSaving = createTeam.isPending || updateTeam.isPending

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={team ? `Edit Team — ${team.name}` : "Create Team"}
      description="Cross-functional teams organize members by workspace and ownership domain."
      footer={
        <>
          <AppButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AppButton>
          <AppButton onClick={handleSave} disabled={isSaving || draft.name.trim().length === 0}>
            {team ? "Save changes" : "Create team"}
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

      <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
        <p className="text-sm font-medium">Members</p>

        {team ? (
          <>
            <div className="flex items-end gap-2">
              <AppSelect value={selectedAddUserId} onValueChange={setSelectedAddUserId}>
                <AppSelectTrigger className="h-10 flex-1">
                  <AppSelectValue placeholder="Select a member to add" />
                </AppSelectTrigger>
                <AppSelectContent position="popper" align="start">
                  {addableUsers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Everyone in the organization is already a member.
                    </div>
                  ) : (
                    addableUsers.map((user) => (
                      <AppSelectItem key={user.id} value={user.id}>
                        {user.fullName} · {user.email}
                      </AppSelectItem>
                    ))
                  )}
                </AppSelectContent>
              </AppSelect>
              <AppButton
                onClick={handleAddExistingMember}
                disabled={!selectedAddUserId || addTeamMember.isPending}
              >
                Add
              </AppButton>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {membersLoading ? (
                <p className="text-sm text-muted-foreground">Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <AppButton
                      size="sm"
                      variant="ghost"
                      disabled={removeTeamMember.isPending}
                      onClick={() => handleRemoveExistingMember(member.userId)}
                      aria-label={`Remove ${member.fullName}`}
                    >
                      <X className="size-4" />
                    </AppButton>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be added automatically as the manager. Optionally add more members now.
            </p>

            <div className="flex items-end gap-2">
              <AppSelect value={selectedAddUserId} onValueChange={setSelectedAddUserId}>
                <AppSelectTrigger className="h-10 flex-1">
                  <AppSelectValue placeholder="Select a member to add" />
                </AppSelectTrigger>
                <AppSelectContent position="popper" align="start">
                  {selectableNewUsers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {users.length === 0 ? "No organization members found." : "All members added."}
                    </div>
                  ) : (
                    selectableNewUsers.map((user) => (
                      <AppSelectItem key={user.id} value={user.id}>
                        {user.fullName} · {user.email}
                      </AppSelectItem>
                    ))
                  )}
                </AppSelectContent>
              </AppSelect>
              <AppButton onClick={handleAddNewMember} disabled={!selectedAddUserId}>
                Add
              </AppButton>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {selectedNewMemberIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional members selected.</p>
              ) : (
                selectedNewMemberIds.map((userId) => {
                  const user = users.find((candidate) => candidate.id === userId)
                  if (!user) return null
                  return (
                    <div
                      key={userId}
                      className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveNewMember(userId)}
                        aria-label={`Remove ${user.fullName}`}
                      >
                        <X className="size-4" />
                      </AppButton>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </AppDialog>
  )
}

export function AdministrationTeamsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { data, isLoading, isError } = useTeamsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { deleteTeam } = useTeamMutations(currentOrganization?.id)
  const teams = data ?? []

  const [open, setOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null)
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0)
  const editingTeam = teams.find((team) => team.id === editingTeamId) ?? null
  const deletingTeam = teams.find((team) => team.id === deletingTeamId) ?? null

  function openCreateDialog() {
    setEditingTeamId(null)
    setDialogInstanceKey((current) => current + 1)
    setOpen(true)
  }

  function openEditDialog(team: AdministrationTeamDto) {
    setEditingTeamId(team.id)
    setDialogInstanceKey((current) => current + 1)
    setOpen(true)
  }

  async function handleDeleteTeam() {
    if (!deletingTeam) return

    try {
      await deleteTeam.mutateAsync({ teamId: deletingTeam.id })
      toast.success(`Team "${deletingTeam.name}" deleted`)
      setDeletingTeamId(null)
    } catch {
      toast.error("Failed to delete team")
    }
  }

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Teams"
        subtitle="Organize members by function, manager, workspace, and ownership domain."
        actions={<AppButton onClick={openCreateDialog}>Create Team</AppButton>}
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
                  <AppTableHead className="text-right">Actions</AppTableHead>
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
                    <AppTableCell>
                      <div className="flex justify-end gap-2">
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(team)}
                          aria-label={`Edit ${team.name}`}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </AppButton>
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletingTeamId(team.id)}
                          aria-label={`Delete ${team.name}`}
                        >
                          <Trash2 className="size-4" />
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

      <TeamDialog
        key={dialogInstanceKey}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setEditingTeamId(null)
        }}
        team={editingTeam}
      />

      <AppConfirmDialog
        open={Boolean(deletingTeam)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingTeamId(null)
        }}
        title="Delete team"
        description={
          deletingTeam
            ? `This permanently removes "${deletingTeam.name}" and its member roster. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete team"
        confirmTone="destructive"
        loading={deleteTeam.isPending}
        onConfirm={handleDeleteTeam}
        onCancel={() => setDeletingTeamId(null)}
      />
    </div>
  )
}
