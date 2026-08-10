"use client"

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
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
  AppTextarea,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useRoleMutations } from "../queries/use-role-mutations"
import { useRolesQuery } from "../queries/use-roles-query"
import { IAM_PERMISSION_GROUPS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"
import { PermissionMatrix } from "./permission-matrix"

import { useApplicationServices } from "@/application"
import type { AdministrationRoleDto, RolePermissionDto } from "@/application/contracts"

type CustomRoleDraft = {
  name: string
  description: string
  cloneFrom: string
  permissions: Record<string, string[]>
}

function clonePermissions(permissions: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(permissions).map(([module, actions]) => [module, [...actions]])
  )
}

function permissionsToList(permissions: Record<string, string[]>): RolePermissionDto[] {
  return Object.entries(permissions).flatMap(([module, actions]) =>
    actions.map((action) => ({ module, action }))
  )
}

function emptyDraft(): CustomRoleDraft {
  return { name: "", description: "", cloneFrom: "", permissions: {} }
}

export function AdministrationRolesScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { data, isLoading, isError } = useRolesQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { createRole, updateRole, deleteRole } = useRoleMutations(currentOrganization?.id)
  const roles = useMemo(() => data ?? [], [data])

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<CustomRoleDraft>(emptyDraft())
  const [selectedRole, setSelectedRole] = useState<AdministrationRoleDto | null>(null)
  const [deletingRole, setDeletingRole] = useState<AdministrationRoleDto | null>(null)
  const [editingRole, setEditingRole] = useState(false)
  const [cloningRole, setCloningRole] = useState(false)

  const selectedClone = useMemo(
    () => roles.find((role) => role.id === draft.cloneFrom),
    [draft.cloneFrom, roles]
  )
  const permissionGrantCount = useMemo(
    () => Object.values(draft.permissions).reduce((total, actions) => total + actions.length, 0),
    [draft.permissions]
  )

  function syncPermissionsFromRole(roleId: string) {
    const sourceRole = roles.find((role) => role.id === roleId)
    if (!sourceRole) return

    setDraft((current) => ({
      ...current,
      cloneFrom: roleId,
      permissions: clonePermissions(sourceRole.permissions),
    }))
  }

  function resetDialogState() {
    setSelectedRole(null)
    setEditingRole(false)
    setCloningRole(false)
    setDraft(emptyDraft())
  }

  function openCreateDialog() {
    resetDialogState()
    const fallback = roles[0]
    if (fallback) {
      setDraft({
        name: "",
        description: "",
        cloneFrom: fallback.id,
        permissions: clonePermissions(fallback.permissions),
      })
    }
    setOpen(true)
  }

  function openEditDialog(role: AdministrationRoleDto) {
    setSelectedRole(role)
    setEditingRole(true)
    setCloningRole(false)
    setDraft({
      name: role.name,
      description: role.description,
      cloneFrom: role.id,
      permissions: clonePermissions(role.permissions),
    })
    setOpen(true)
  }

  function openCloneDialog(role: AdministrationRoleDto) {
    setSelectedRole(role)
    setEditingRole(false)
    setCloningRole(true)
    setDraft({
      name: `${role.name} Copy`,
      description: role.description,
      cloneFrom: role.id,
      permissions: clonePermissions(role.permissions),
    })
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
    resetDialogState()
  }

  async function saveRole() {
    if (!draft.name.trim() || !currentOrganization) return

    try {
      if (editingRole && selectedRole) {
        await updateRole.mutateAsync({
          roleId: selectedRole.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: permissionsToList(draft.permissions),
        })
        toast.success(`Role "${draft.name.trim()}" updated`)
      } else {
        await createRole.mutateAsync({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: permissionsToList(draft.permissions),
        })
        toast.success(`Role "${draft.name.trim()}" created`)
      }
      closeDialog()
    } catch {
      toast.error("Failed to save role")
    }
  }

  async function handleDeleteRole() {
    if (!deletingRole) return

    try {
      await deleteRole.mutateAsync({ roleId: deletingRole.id })
      toast.success(`Role "${deletingRole.name}" deleted`)
      setDeletingRole(null)
    } catch {
      toast.error("Failed to delete role")
    }
  }

  const dialogTitle = editingRole
    ? "Edit Role"
    : cloningRole
      ? "Create Role from Clone"
      : "Create Custom Role"
  const dialogDescription = editingRole
    ? "Update role details while preserving the assigned users and baseline access profile."
    : "Define a reusable role with cloned baseline permissions."
  const saveLabel = editingRole ? "Save changes" : "Create role"
  const isSaving = createRole.isPending || updateRole.isPending

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Roles"
        subtitle="Define default and custom access profiles across the workspace."
        actions={<AppButton onClick={openCreateDialog}>Create Custom Role</AppButton>}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading roles…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load roles.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <AppCard
              key={role.id}
              title={role.name}
              subtitle={role.description}
              className="shadow-sm"
              contentClassName="space-y-3"
              actions={
                role.isDefault ? (
                  <AppBadge variant="outline">Default role</AppBadge>
                ) : (
                  <AppBadge variant="secondary">Custom</AppBadge>
                )
              }
            >
              <p className="text-sm text-muted-foreground">Users assigned: {role.userCount}</p>
              <p className="text-sm text-muted-foreground">
                Permission summary:{" "}
                {Object.values(role.permissions).reduce((total, list) => total + list.length, 0)}{" "}
                grants
              </p>
              <div className="flex gap-2">
                {role.editable ? (
                  <AppButton size="sm" variant="outline" onClick={() => openEditDialog(role)}>
                    Edit
                  </AppButton>
                ) : null}
                <AppButton size="sm" variant="outline" onClick={() => openCloneDialog(role)}>
                  Clone
                </AppButton>
                {role.editable ? (
                  <AppButton
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingRole(role)}
                    aria-label={`Delete ${role.name}`}
                  >
                    <Trash2 className="size-4" />
                  </AppButton>
                ) : null}
              </div>
            </AppCard>
          ))}
        </div>
      )}

      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) resetDialogState()
        }}
        title={dialogTitle}
        description={dialogDescription}
        contentClassName="max-w-4xl"
        footer={
          <>
            <AppButton variant="outline" onClick={closeDialog}>
              Cancel
            </AppButton>
            <AppButton onClick={saveRole} disabled={isSaving || draft.name.trim().length === 0}>
              {saveLabel}
            </AppButton>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <AppInput
              label="Role name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <AppSelect value={draft.cloneFrom} onValueChange={syncPermissionsFromRole}>
              <AppSelectTrigger className="h-10">
                <AppSelectValue placeholder="Start from (optional)" />
              </AppSelectTrigger>
              <AppSelectContent>
                {roles.map((role) => (
                  <AppSelectItem key={role.id} value={role.id}>
                    {role.name}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
          <AppTextarea
            label="Description"
            className="min-h-[70px]"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />

          <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
            {permissionGrantCount} permission{permissionGrantCount === 1 ? "" : "s"} selected
            {selectedClone ? (
              <span className="ms-1">(started from {selectedClone.name})</span>
            ) : null}
          </div>

          <PermissionMatrix
            groups={IAM_PERMISSION_GROUPS}
            value={draft.permissions}
            onChange={(next) => setDraft((current) => ({ ...current, permissions: next }))}
            title="Permissions"
            subtitle="Pick exactly what this role can do — use a baseline above as a starting point, then adjust."
          />
        </div>
      </AppDialog>

      <AppConfirmDialog
        open={Boolean(deletingRole)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingRole(null)
        }}
        title="Delete role"
        description={
          deletingRole
            ? `This permanently removes "${deletingRole.name}". Members currently assigned this role will lose the permissions it granted. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete role"
        confirmTone="destructive"
        loading={deleteRole.isPending}
        onConfirm={handleDeleteRole}
        onCancel={() => setDeletingRole(null)}
      />
    </div>
  )
}
