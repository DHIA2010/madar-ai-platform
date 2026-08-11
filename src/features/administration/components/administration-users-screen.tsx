"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AppAvatar,
  AppAvatarFallback,
  AppAvatarImage,
  AppBadge,
  AppButton,
  AppCard,
  AppConfirmDialog,
  AppEmpty,
  AppInput,
  AppLoading,
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
  AppTablePagination,
  AppTableRow,
  AppTextarea,
  RelativeTime,
} from "@/components/app"

import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import { useRolesQuery } from "../queries/use-roles-query"
import { useUserMutations } from "../queries/use-user-mutations"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"
import { AdministrationUserProfileDrawer } from "./administration-user-profile-drawer"

import { useApplicationServices } from "@/application/context"
import type { AdministrationUserDto, AdministrationUserStatus } from "@/application/contracts"

const PAGE_SIZE = 5

type SortKey = "fullName" | "lastLogin" | "department"

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function humanizeRole(roleId: string) {
  return roleId.charAt(0).toUpperCase() + roleId.slice(1)
}

export function AdministrationUsersScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { currentUser } = useAuth()
  const { data, isLoading, isError } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { data: rolesData } = useRolesQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { suspendUser, reactivateUser, assignRole } = useUserMutations(currentOrganization?.id)
  const allUsers = useMemo(() => data ?? [], [data])
  const assignableRoles = useMemo(
    () => (rolesData ?? []).filter((role) => role.isDefault),
    [rolesData]
  )

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | AdministrationUserStatus>("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<"all" | string>("all")
  const [sortBy, setSortBy] = useState<SortKey>("fullName")
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<AdministrationUserDto | undefined>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [deactivatingUser, setDeactivatingUser] = useState<AdministrationUserDto | null>(null)
  const [deactivateReason, setDeactivateReason] = useState("")

  const availableWorkspaces = useMemo(() => {
    const names = new Set<string>()
    for (const user of allUsers) {
      for (const workspace of user.workspaces) {
        names.add(workspace)
      }
    }
    return Array.from(names).sort()
  }, [allUsers])

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase()
    const rows = allUsers.filter((user) => {
      const matchesTerm =
        term === "" ||
        user.fullName.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      const matchesStatus = statusFilter === "all" || user.status === statusFilter
      const matchesWorkspace =
        workspaceFilter === "all" || user.workspaces.includes(workspaceFilter)
      return matchesTerm && matchesStatus && matchesWorkspace
    })

    return rows.sort((left, right) => {
      if (sortBy === "department") return left.department.localeCompare(right.department)
      if (sortBy === "lastLogin") return left.lastLogin.localeCompare(right.lastLogin)
      return left.fullName.localeCompare(right.fullName)
    })
  }, [allUsers, query, sortBy, statusFilter, workspaceFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const paginatedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSelected(userId: string) {
    setSelectedIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId)
      }
      return [...current, userId]
    })
  }

  async function handleDeactivateUser() {
    if (!deactivatingUser || !currentOrganization) return
    if (deactivateReason.trim().length < 2) {
      toast.error("Please enter a reason (at least 2 characters)")
      return
    }

    try {
      await suspendUser.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: deactivatingUser.id,
        reason: deactivateReason.trim(),
      })
      toast.success(`${deactivatingUser.fullName} deactivated`)
      setDeactivatingUser(null)
      setDeactivateReason("")
    } catch {
      toast.error("Failed to deactivate user")
    }
  }

  async function handleReactivateUser(user: AdministrationUserDto) {
    if (!currentOrganization) return

    try {
      await reactivateUser.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: user.id,
      })
      toast.success(`${user.fullName} reactivated`)
    } catch {
      toast.error("Failed to reactivate user")
    }
  }

  async function handleAssignRole(user: AdministrationUserDto, role: string) {
    if (!currentOrganization || role === user.roleId) return

    try {
      await assignRole.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: user.id,
        role,
      })
      toast.success(`${user.fullName} is now ${humanizeRole(role)}`)
    } catch {
      toast.error("Failed to update role")
    }
  }

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Users"
        subtitle="Manage enterprise identities, access posture, and workspace assignment."
        actions={
          <div className="flex items-center gap-2">
            <AppBadge variant="outline">Selected: {selectedIds.length}</AppBadge>
          </div>
        }
      />

      <AppCard
        title="Directory Controls"
        subtitle="Search, filter, sort, and bulk-manage identities."
        className="shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AppInput
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            wrapperClassName="xl:col-span-2"
          />

          <AppSelect
            value={statusFilter}
            onValueChange={(next) => {
              setStatusFilter(next as "all" | AdministrationUserStatus)
              setPage(1)
            }}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Status" />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All statuses</AppSelectItem>
              <AppSelectItem value="active">Active</AppSelectItem>
              <AppSelectItem value="inactive">Inactive</AppSelectItem>
              <AppSelectItem value="pending">Pending</AppSelectItem>
              <AppSelectItem value="suspended">Suspended</AppSelectItem>
            </AppSelectContent>
          </AppSelect>

          <AppSelect
            value={workspaceFilter}
            onValueChange={(next) => {
              setWorkspaceFilter(next)
              setPage(1)
            }}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Workspace" />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All workspaces</AppSelectItem>
              {availableWorkspaces.map((workspace) => (
                <AppSelectItem key={workspace} value={workspace}>
                  {workspace}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppSelect
            value={sortBy}
            onValueChange={(next) => {
              setSortBy(next as SortKey)
              setPage(1)
            }}
          >
            <AppSelectTrigger className="h-10">
              <AppSelectValue placeholder="Sort" />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="fullName">Name</AppSelectItem>
              <AppSelectItem value="department">Department</AppSelectItem>
              <AppSelectItem value="lastLogin">Last login</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </div>

        {selectedIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            <AppBadge variant="outline">{selectedIds.length} users selected</AppBadge>
            <AppButton size="sm" variant="outline">
              Assign role
            </AppButton>
            <AppButton size="sm" variant="outline">
              Enforce MFA
            </AppButton>
            <AppButton size="sm" variant="outline">
              Move workspace
            </AppButton>
          </div>
        ) : null}
      </AppCard>

      <AppCard
        title="Users Directory"
        subtitle="Identity records with role, workspace, and security posture."
        className="shadow-sm"
      >
        {isLoading ? (
          <AppLoading variant="table" rows={5} columns={11} />
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load users.</p>
        ) : filteredUsers.length === 0 ? (
          <AppEmpty
            title="No users found"
            description="Try a different search or filter combination."
            actionLabel="Reset filters"
            onAction={() => {
              setQuery("")
              setStatusFilter("all")
              setWorkspaceFilter("all")
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <AppTable>
                <AppTableHeader>
                  <AppTableRow>
                    <AppTableHead className="w-12">Select</AppTableHead>
                    <AppTableHead>User</AppTableHead>
                    <AppTableHead>Department</AppTableHead>
                    <AppTableHead>Role</AppTableHead>
                    <AppTableHead>Teams</AppTableHead>
                    <AppTableHead>Workspace</AppTableHead>
                    <AppTableHead>Status</AppTableHead>
                    <AppTableHead>Last Login</AppTableHead>
                    <AppTableHead>MFA</AppTableHead>
                    <AppTableHead className="text-right">Actions</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>
                <AppTableBody>
                  {paginatedUsers.map((user) => {
                    const selected = selectedIds.includes(user.id)
                    return (
                      <AppTableRow key={user.id}>
                        <AppTableCell>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelected(user.id)}
                            aria-label={`Select ${user.fullName}`}
                            className="size-4 accent-primary"
                          />
                        </AppTableCell>
                        <AppTableCell>
                          <div className="flex items-center gap-2">
                            <AppAvatar size="sm">
                              {user.avatarUrl ? <AppAvatarImage src={user.avatarUrl} /> : null}
                              <AppAvatarFallback>{initials(user.fullName)}</AppAvatarFallback>
                            </AppAvatar>
                            <div>
                              <p className="text-sm font-medium">{user.fullName}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </AppTableCell>
                        <AppTableCell>{user.department || "—"}</AppTableCell>
                        <AppTableCell>
                          <AppSelect
                            value={user.roleId}
                            onValueChange={(next) => handleAssignRole(user, next)}
                          >
                            <AppSelectTrigger
                              className="h-8 w-32"
                              aria-label={`Role for ${user.fullName}`}
                              disabled={
                                assignRole.isPending &&
                                assignRole.variables?.memberUserId === user.id
                              }
                            >
                              <AppSelectValue placeholder={humanizeRole(user.roleId)} />
                            </AppSelectTrigger>
                            <AppSelectContent>
                              {assignableRoles.length === 0 ? (
                                <AppSelectItem value={user.roleId}>
                                  {humanizeRole(user.roleId)}
                                </AppSelectItem>
                              ) : (
                                assignableRoles.map((role) => (
                                  <AppSelectItem key={role.id} value={role.id}>
                                    {role.name}
                                  </AppSelectItem>
                                ))
                              )}
                            </AppSelectContent>
                          </AppSelect>
                        </AppTableCell>
                        <AppTableCell>
                          {user.teams.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.teams.map((teamName) => (
                                <AppBadge key={teamName} variant="secondary">
                                  {teamName}
                                </AppBadge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No teams</span>
                          )}
                        </AppTableCell>
                        <AppTableCell>{user.workspaces.join(", ") || "—"}</AppTableCell>
                        <AppTableCell>
                          <AppBadge variant="outline">{user.status}</AppBadge>
                        </AppTableCell>
                        <AppTableCell>
                          <RelativeTime value={user.lastLogin} fallback="Never" />
                        </AppTableCell>
                        <AppTableCell>
                          <AppBadge variant={user.mfaEnabled ? "default" : "secondary"}>
                            {user.mfaEnabled ? "Enabled" : "Disabled"}
                          </AppBadge>
                        </AppTableCell>
                        <AppTableCell>
                          <div className="flex justify-end gap-2">
                            <AppButton
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUser(user)
                                setProfileOpen(true)
                              }}
                            >
                              Profile
                            </AppButton>
                            <AppButton size="sm" variant="outline">
                              Edit
                            </AppButton>
                            {user.id === currentUser?.id ? null : user.status === "suspended" ? (
                              <AppButton
                                size="sm"
                                variant="outline"
                                loading={
                                  reactivateUser.isPending &&
                                  reactivateUser.variables?.memberUserId === user.id
                                }
                                onClick={() => handleReactivateUser(user)}
                              >
                                Reactivate
                              </AppButton>
                            ) : (
                              <AppButton
                                size="sm"
                                variant="outline"
                                onClick={() => setDeactivatingUser(user)}
                              >
                                Deactivate
                              </AppButton>
                            )}
                          </div>
                        </AppTableCell>
                      </AppTableRow>
                    )
                  })}
                </AppTableBody>
              </AppTable>
            </div>

            <AppTablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </AppCard>

      <AdministrationUserProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={selectedUser}
      />

      <AppConfirmDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeactivatingUser(null)
            setDeactivateReason("")
          }
        }}
        title="Deactivate user"
        description={
          deactivatingUser
            ? `${deactivatingUser.fullName} will immediately lose access to this organization. You can reactivate them at any time.`
            : undefined
        }
        confirmLabel="Deactivate"
        confirmTone="destructive"
        loading={suspendUser.isPending}
        onConfirm={handleDeactivateUser}
        onCancel={() => {
          setDeactivatingUser(null)
          setDeactivateReason("")
        }}
      >
        <AppTextarea
          label="Reason"
          placeholder="Why is this user being deactivated?"
          value={deactivateReason}
          onChange={(event) => setDeactivateReason(event.target.value)}
        />
      </AppConfirmDialog>
    </div>
  )
}
