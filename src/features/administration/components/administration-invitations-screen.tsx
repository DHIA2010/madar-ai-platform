"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppDialog,
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
  RelativeTime,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useInvitationMutations } from "../queries/use-invitation-mutations"
import { useInvitationsQuery } from "../queries/use-invitations-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"

const ROLE_OPTIONS = [
  { id: "owner", name: "Owner" },
  { id: "admin", name: "Admin" },
  { id: "manager", name: "Manager" },
  { id: "analyst", name: "Analyst" },
  { id: "viewer", name: "Viewer" },
]

function humanizeRole(roleId: string) {
  return ROLE_OPTIONS.find((role) => role.id === roleId)?.name ?? roleId
}

type InvitationDraft = {
  emails: string
  roleId: string
  workspaceIds: string[]
}

const defaultDraft: InvitationDraft = {
  emails: "",
  roleId: "viewer",
  workspaceIds: [],
}

export function AdministrationInvitationsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { data, isLoading, isError } = useInvitationsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { sendInvitation, cancelInvitation, resendInvitation } = useInvitationMutations(
    currentOrganization?.id
  )
  const invitations = data ?? []
  const inviteableWorkspaces = useMemo(
    () => availableWorkspaces.filter((workspace) => workspace.status !== "archived"),
    [availableWorkspaces]
  )

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultDraft)

  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length

  const parsedEmails = useMemo(() => {
    return draft.emails
      .split(/[\n,; ]/)
      .map((email) => email.trim())
      .filter(Boolean)
  }, [draft.emails])

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      workspaceIds: checked
        ? [...current.workspaceIds, workspaceId]
        : current.workspaceIds.filter((id) => id !== workspaceId),
    }))
  }

  async function handleSendInvitations() {
    if (parsedEmails.length === 0 || !currentOrganization) return

    const workspaceIds = draft.workspaceIds.length > 0 ? draft.workspaceIds : [undefined]

    try {
      await Promise.all(
        parsedEmails.flatMap((email) =>
          workspaceIds.map((workspaceId) =>
            sendInvitation.mutateAsync({
              organizationId: currentOrganization.id,
              email,
              roleId: draft.roleId,
              workspaceId,
            })
          )
        )
      )
      setDraft(defaultDraft)
      setOpen(false)
      const total = parsedEmails.length * workspaceIds.length
      toast.success(
        `Invitation sent to ${parsedEmails.length} recipient(s)${total > parsedEmails.length ? ` across ${workspaceIds.length} workspaces` : ""}`
      )
    } catch {
      toast.error("Failed to send one or more invitations")
    }
  }

  async function handleResend(invitationId: string, email: string) {
    try {
      await resendInvitation.mutateAsync(invitationId)
      toast.success(`Invitation resent to ${email}`)
    } catch {
      toast.error("Failed to resend invitation")
    }
  }

  async function handleCancel(invitationId: string) {
    try {
      await cancelInvitation.mutateAsync(invitationId)
      toast.success("Invitation canceled")
    } catch {
      toast.error("Failed to cancel invitation")
    }
  }

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Invitations"
        subtitle="Invite new users, track pending responses, and manage invitation lifecycle."
        actions={
          <div className="flex items-center gap-2">
            <AppBadge variant="outline">Pending: {pendingCount}</AppBadge>
            <AppButton onClick={() => setOpen(true)}>Invite Users</AppButton>
          </div>
        }
      />

      <AppCard
        title="Pending Invitations"
        subtitle="Resend, cancel, and monitor expiration windows."
        className="shadow-sm"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading invitations…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load invitations.</p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>Email</AppTableHead>
                  <AppTableHead>Role</AppTableHead>
                  <AppTableHead>Workspace</AppTableHead>
                  <AppTableHead>Status</AppTableHead>
                  <AppTableHead>Expires</AppTableHead>
                  <AppTableHead className="text-right">Actions</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {invitations.map((invitation) => (
                  <AppTableRow key={invitation.id}>
                    <AppTableCell>{invitation.email}</AppTableCell>
                    <AppTableCell>{humanizeRole(invitation.roleId)}</AppTableCell>
                    <AppTableCell>{invitation.workspace}</AppTableCell>
                    <AppTableCell>
                      <AppBadge variant="outline">{invitation.status}</AppBadge>
                    </AppTableCell>
                    <AppTableCell>
                      <RelativeTime value={invitation.expiresAt} fallback="-" />
                    </AppTableCell>
                    <AppTableCell>
                      <div className="flex justify-end gap-2">
                        <AppButton
                          size="sm"
                          variant="outline"
                          disabled={invitation.status !== "pending"}
                          onClick={() => handleResend(invitation.id, invitation.email)}
                        >
                          Resend
                        </AppButton>
                        <AppButton
                          size="sm"
                          variant="outline"
                          disabled={invitation.status !== "pending"}
                          onClick={() => handleCancel(invitation.id)}
                        >
                          Cancel
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

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="Invite Users"
        description="Send one or many invitations with workspace and role context."
        footer={
          <>
            <AppButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={handleSendInvitations} disabled={sendInvitation.isPending}>
              Send invitation
            </AppButton>
          </>
        }
        contentClassName="sm:max-w-2xl"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <AppTextarea
            label="Email addresses"
            helperText="Separate with commas, spaces, or new lines"
            placeholder="sara@madar.ai, ali@madar.ai"
            className="min-h-[120px]"
            wrapperClassName="md:col-span-2"
            value={draft.emails}
            onChange={(event) =>
              setDraft((current) => ({ ...current, emails: event.target.value }))
            }
          />

          <AppSelect
            value={draft.roleId}
            onValueChange={(next) => setDraft((current) => ({ ...current, roleId: next }))}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Role" />
            </AppSelectTrigger>
            <AppSelectContent position="popper" align="start">
              {ROLE_OPTIONS.map((role) => (
                <AppSelectItem key={role.id} value={role.id}>
                  {role.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <div className="space-y-2 rounded-lg border border-border/70 p-3 md:col-span-2">
            <p className="text-sm font-medium">Workspaces (optional)</p>
            <p className="text-xs text-muted-foreground">
              Leave unselected to grant org-wide access. Selecting multiple sends one invitation per
              workspace.
            </p>
            {inviteableWorkspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workspaces available.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {inviteableWorkspaces.map((workspace) => (
                  <label
                    key={workspace.id}
                    className="flex items-center gap-2 text-sm"
                    htmlFor={`invite-workspace-${workspace.id}`}
                  >
                    <AppCheckbox
                      id={`invite-workspace-${workspace.id}`}
                      checked={draft.workspaceIds.includes(workspace.id)}
                      onCheckedChange={(checked) => toggleWorkspace(workspace.id, checked === true)}
                    />
                    {workspace.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
