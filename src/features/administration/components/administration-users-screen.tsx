"use client"

import { useMemo, useState } from "react"

import {
  AppAvatar,
  AppAvatarFallback,
  AppBadge,
  AppButton,
  AppCard,
  AppEmpty,
  AppInput,
  AppLoading,
  AppPageHeader,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { IAM_ROLES, IAM_USERS, IAM_WORKSPACES } from "../services"
import type { IamStatus, IamUser } from "../types"
import { AdministrationModuleNav } from "./administration-module-nav"
import { AdministrationUserProfileDrawer } from "./administration-user-profile-drawer"

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

export function AdministrationUsersScreen() {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | IamStatus>("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<"all" | string>("all")
  const [sortBy, setSortBy] = useState<SortKey>("fullName")
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<IamUser | undefined>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [simulateLoading, setSimulateLoading] = useState(false)

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase()
    const rows = IAM_USERS.filter((user) => {
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
  }, [query, sortBy, statusFilter, workspaceFilter])

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

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Users"
        subtitle="Manage enterprise identities, access posture, and workspace assignment."
        actions={
          <div className="flex items-center gap-2">
            <AppButton variant="outline" onClick={() => setSimulateLoading((value) => !value)}>
              {simulateLoading ? "Stop loading state" : "Show loading state"}
            </AppButton>
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
              setStatusFilter(next as "all" | IamStatus)
              setPage(1)
            }}
          >
            <AppSelectTrigger className="h-10">
              <span className="truncate">Status</span>
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
              <span className="truncate">Workspace</span>
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All workspaces</AppSelectItem>
              {IAM_WORKSPACES.map((workspace) => (
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
              <span className="truncate">Sort</span>
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
        {simulateLoading ? (
          <AppLoading variant="table" rows={5} columns={10} />
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
                    <AppTableHead>Workspace</AppTableHead>
                    <AppTableHead>Status</AppTableHead>
                    <AppTableHead>Last Login</AppTableHead>
                    <AppTableHead>MFA</AppTableHead>
                    <AppTableHead className="text-right">Actions</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>
                <AppTableBody>
                  {paginatedUsers.map((user) => {
                    const role = IAM_ROLES.find((item) => item.id === user.roleId)
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
                              <AppAvatarFallback>{initials(user.fullName)}</AppAvatarFallback>
                            </AppAvatar>
                            <div>
                              <p className="text-sm font-medium">{user.fullName}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </AppTableCell>
                        <AppTableCell>{user.department}</AppTableCell>
                        <AppTableCell>{role?.name ?? "N/A"}</AppTableCell>
                        <AppTableCell>{user.workspaces.join(", ")}</AppTableCell>
                        <AppTableCell>
                          <AppBadge variant="outline">{user.status}</AppBadge>
                        </AppTableCell>
                        <AppTableCell>{user.lastLogin}</AppTableCell>
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
        role={IAM_ROLES.find((role) => role.id === selectedUser?.roleId)}
      />
    </div>
  )
}
