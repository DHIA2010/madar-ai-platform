"use client"

import { useMemo, useState } from "react"

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
  AppTextarea,
} from "@/components/app"

import { IAM_PERMISSION_GROUPS, IAM_ROLES } from "../services"
import type { IamRole } from "../types"
import { AdministrationModuleNav } from "./administration-module-nav"
import { PermissionMatrix } from "./permission-matrix"

type CustomRoleDraft = {
  name: string
  description: string
  cloneFrom: string
  permissions: IamRole["permissions"]
}

function clonePermissions(permissions: IamRole["permissions"]): IamRole["permissions"] {
  return Object.fromEntries(
    Object.entries(permissions).map(([module, actions]) => [module, [...actions]])
  ) as IamRole["permissions"]
}

const defaultDraft: CustomRoleDraft = {
  name: "",
  description: "",
  cloneFrom: IAM_ROLES[0]?.id ?? "",
  permissions: clonePermissions(IAM_ROLES[0]?.permissions ?? IAM_ROLES[0].permissions),
}

export function AdministrationRolesScreen() {
  const [roles, setRoles] = useState(IAM_ROLES)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultDraft)
  const [selectedRole, setSelectedRole] = useState<IamRole | null>(null)
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
    const fallback = roles[0]
    setSelectedRole(null)
    setEditingRole(false)
    setCloningRole(false)
    setDraft({
      name: "",
      description: "",
      cloneFrom: fallback?.id ?? "",
      permissions: clonePermissions(fallback?.permissions ?? IAM_ROLES[0].permissions),
    })
  }

  function openCreateDialog() {
    resetDialogState()
    setOpen(true)
  }

  function openEditDialog(role: IamRole) {
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

  function openCloneDialog(role: IamRole) {
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

  function saveRole() {
    if (!draft.name.trim()) return

    if (editingRole && selectedRole) {
      setRoles((current) =>
        current.map((role) => {
          if (role.id !== selectedRole.id) return role
          return {
            ...role,
            name: draft.name.trim(),
            description: draft.description.trim() || role.description,
            permissions: clonePermissions(draft.permissions),
          }
        })
      )
      closeDialog()
      return
    }

    const nextRole: IamRole = {
      id: `custom-${Date.now()}`,
      name: draft.name.trim(),
      description: draft.description.trim() || "Custom role",
      userCount: 0,
      isDefault: false,
      permissions: clonePermissions(draft.permissions),
    }

    setRoles((current) => [...current, nextRole])
    closeDialog()
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

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Roles"
        subtitle="Define default and custom access profiles across the workspace."
        actions={<AppButton onClick={openCreateDialog}>Create Custom Role</AppButton>}
      />

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
              <AppButton size="sm" variant="outline" onClick={() => openEditDialog(role)}>
                Edit
              </AppButton>
              <AppButton size="sm" variant="outline" onClick={() => openCloneDialog(role)}>
                Clone
              </AppButton>
            </div>
          </AppCard>
        ))}
      </div>

      <PermissionMatrix
        groups={IAM_PERMISSION_GROUPS}
        subtitle="Role permission map preview (UI-only for backend-ready extension)."
      />

      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) resetDialogState()
        }}
        title={dialogTitle}
        description={dialogDescription}
        footer={
          <>
            <AppButton variant="outline" onClick={closeDialog}>
              Cancel
            </AppButton>
            <AppButton onClick={saveRole}>{saveLabel}</AppButton>
          </>
        }
      >
        <div className="grid gap-3">
          <AppInput
            label="Role name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <AppTextarea
            label="Description"
            className="min-h-[90px]"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <AppSelect value={draft.cloneFrom} onValueChange={syncPermissionsFromRole}>
            <AppSelectTrigger className="h-10">
              <span>Permission baseline</span>
            </AppSelectTrigger>
            <AppSelectContent>
              {roles.map((role) => (
                <AppSelectItem key={role.id} value={role.id}>
                  {role.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <div className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
            Selected baseline grants: {permissionGrantCount}
            {selectedClone ? <span className="ms-1">from {selectedClone.name}</span> : null}
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
