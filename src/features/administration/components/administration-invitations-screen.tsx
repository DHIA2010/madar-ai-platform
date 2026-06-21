"use client"

import { useMemo, useState } from "react"
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

import { IAM_INVITATIONS, IAM_ROLES, IAM_WORKSPACES } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

type InvitationDraft = {
  emails: string
  roleId: string
  workspace: string
  department: string
  message: string
}

const defaultDraft: InvitationDraft = {
  emails: "",
  roleId: "marketing-specialist",
  workspace: IAM_WORKSPACES[0],
  department: "Marketing",
  message: "",
}

export function AdministrationInvitationsScreen() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultDraft)
  const [invitations, setInvitations] = useState(IAM_INVITATIONS)

  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length

  const parsedEmails = useMemo(() => {
    return draft.emails
      .split(/[\n,; ]/)
      .map((email) => email.trim())
      .filter(Boolean)
  }, [draft.emails])

  function sendInvitations() {
    if (parsedEmails.length === 0) return

    const next = parsedEmails.map((email, index) => ({
      id: `new-${Date.now()}-${index}`,
      email,
      roleId: draft.roleId,
      workspace: draft.workspace,
      department: draft.department,
      status: "pending" as const,
      invitedAt: "Today",
      expiresAt: "In 14 days",
    }))

    setInvitations((current) => [...next, ...current])
    setDraft(defaultDraft)
    setOpen(false)

    toast.success(`Invitation sent to ${parsedEmails.length} recipient(s)`)
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
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>Email</AppTableHead>
                <AppTableHead>Role</AppTableHead>
                <AppTableHead>Workspace</AppTableHead>
                <AppTableHead>Department</AppTableHead>
                <AppTableHead>Status</AppTableHead>
                <AppTableHead>Expires</AppTableHead>
                <AppTableHead className="text-right">Actions</AppTableHead>
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {invitations.map((invitation) => {
                const role = IAM_ROLES.find((item) => item.id === invitation.roleId)
                return (
                  <AppTableRow key={invitation.id}>
                    <AppTableCell>{invitation.email}</AppTableCell>
                    <AppTableCell>{role?.name ?? "N/A"}</AppTableCell>
                    <AppTableCell>{invitation.workspace}</AppTableCell>
                    <AppTableCell>{invitation.department}</AppTableCell>
                    <AppTableCell>
                      <AppBadge variant="outline">{invitation.status}</AppBadge>
                    </AppTableCell>
                    <AppTableCell>{invitation.expiresAt}</AppTableCell>
                    <AppTableCell>
                      <div className="flex justify-end gap-2">
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => toast.success(`Invitation resent to ${invitation.email}`)}
                        >
                          Resend
                        </AppButton>
                        <AppButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInvitations((current) =>
                              current.map((item) => {
                                if (item.id !== invitation.id) return item
                                return { ...item, status: "canceled" }
                              })
                            )
                            toast.success("Invitation canceled")
                          }}
                        >
                          Cancel
                        </AppButton>
                      </div>
                    </AppTableCell>
                  </AppTableRow>
                )
              })}
            </AppTableBody>
          </AppTable>
        </div>
      </AppCard>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="Invite Users"
        description="Send one or many invitations with workspace, role, and department context."
        footer={
          <>
            <AppButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={sendInvitations}>Send invitation</AppButton>
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
              {IAM_ROLES.map((role) => (
                <AppSelectItem key={role.id} value={role.id}>
                  {role.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppSelect
            value={draft.workspace}
            onValueChange={(next) => setDraft((current) => ({ ...current, workspace: next }))}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Workspace" />
            </AppSelectTrigger>
            <AppSelectContent position="popper" align="start">
              {IAM_WORKSPACES.map((workspace) => (
                <AppSelectItem key={workspace} value={workspace}>
                  {workspace}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppInput
            label="Department"
            value={draft.department}
            onChange={(event) =>
              setDraft((current) => ({ ...current, department: event.target.value }))
            }
          />

          <AppTextarea
            label="Optional message"
            className="min-h-[90px]"
            placeholder="Welcome to MADAR IAM."
            wrapperClassName="md:col-span-2"
            value={draft.message}
            onChange={(event) =>
              setDraft((current) => ({ ...current, message: event.target.value }))
            }
          />
        </div>
      </AppDialog>
    </div>
  )
}
