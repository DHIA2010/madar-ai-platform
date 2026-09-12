"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserCheck,
  UserCog,
  Users as UsersIcon,
  UserX,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import { formatRelativeArabic } from "../lib/format-arabic-time"
import { useRolesQuery } from "../queries/use-roles-query"
import { useUserMutations } from "../queries/use-user-mutations"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"
import { AdministrationUserProfileDrawer } from "./administration-user-profile-drawer"

import { useApplicationServices } from "@/application/context"
import type { AdministrationUserDto, AdministrationUserStatus } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const STATUS_LABEL: Record<AdministrationUserStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  pending: "قيد التفعيل",
  suspended: "معلّق",
}

const STATUS_TINT: Record<AdministrationUserStatus, string> = {
  active: "bg-[#f0fdf4] text-[#15803d]",
  inactive: "bg-[#fef2f2] text-[#dc2626]",
  pending: "bg-[#fffbeb] text-[#92400e]",
  suspended: "bg-[#f2f5fa] text-[#5b6b85]",
}

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

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof UsersIcon
  tint: string
  label: string
  value: number
}) {
  return (
    <div className={cn(PANEL, "flex flex-col gap-3 p-4")}>
      <div className="flex items-center justify-between">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", tint)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div>
        <p className={cn("text-[21px] font-extrabold", HEADING)}>{value}</p>
        <p className={cn("mt-0.5 text-[12px] font-semibold", MUTED)}>{label}</p>
      </div>
      {/* No real historical snapshot exists for this count yet -- always the neutral state
          rather than a fabricated trend. */}
      <span className={cn("flex items-center gap-1 text-[11px] font-semibold", MUTED)}>— 0%</span>
    </div>
  )
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
  const {
    suspendUser,
    reactivateUser,
    assignRole,
    assignCustomRole,
    setModuleAccess,
    updateProfile,
  } = useUserMutations(currentOrganization?.id)
  const allUsers = useMemo(() => data ?? [], [data])
  const assignableRoles = useMemo(
    () => (rolesData ?? []).filter((role) => role.isDefault),
    [rolesData]
  )
  const assignableCustomRoles = useMemo(
    () => (rolesData ?? []).filter((role) => !role.isDefault),
    [rolesData]
  )

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | AdministrationUserStatus>("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<"all" | string>("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdministrationUserDto | undefined>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [deactivatingUser, setDeactivatingUser] = useState<AdministrationUserDto | null>(null)
  const [deactivateReason, setDeactivateReason] = useState("")
  const [editingUser, setEditingUser] = useState<AdministrationUserDto | null>(null)
  const [editDepartment, setEditDepartment] = useState("")
  const [bulkRoleValue, setBulkRoleValue] = useState("")
  const [assigningBulkRole, setAssigningBulkRole] = useState(false)

  const availableWorkspaces = useMemo(() => {
    const names = new Set<string>()
    for (const user of allUsers) {
      for (const workspace of user.workspaces) names.add(workspace)
    }
    return Array.from(names).sort()
  }, [allUsers])

  const counts = useMemo(
    () => ({
      total: allUsers.length,
      active: allUsers.filter((user) => user.status === "active").length,
      pending: allUsers.filter((user) => user.status === "pending").length,
      inactive: allUsers.filter((user) => user.status === "inactive" || user.status === "suspended")
        .length,
    }),
    [allUsers]
  )

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase()
    return allUsers
      .filter((user) => {
        const matchesTerm =
          term === "" ||
          user.fullName.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term)
        const matchesStatus = statusFilter === "all" || user.status === statusFilter
        const matchesWorkspace =
          workspaceFilter === "all" || user.workspaces.includes(workspaceFilter)
        return matchesTerm && matchesStatus && matchesWorkspace
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "ar"))
  }, [allUsers, query, statusFilter, workspaceFilter])

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pagedUsers = filteredUsers.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  function toggleSelected(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    )
  }

  function exportCsv() {
    const header = ["الاسم", "البريد الإلكتروني", "القسم", "الدور", "الحالة", "آخر تسجيل دخول"]
    const rows = filteredUsers.map((user) => [
      user.fullName,
      user.email,
      user.department,
      user.roleId,
      STATUS_LABEL[user.status],
      user.lastLogin,
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "users.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleDeactivateUser() {
    if (!deactivatingUser || !currentOrganization) return
    if (deactivateReason.trim().length < 2) {
      toast.error("أدخل سبباً لا يقل عن حرفين.")
      return
    }
    try {
      await suspendUser.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: deactivatingUser.id,
        reason: deactivateReason.trim(),
      })
      toast.success(`تم إيقاف ${deactivatingUser.fullName}.`)
      setDeactivatingUser(null)
      setDeactivateReason("")
    } catch {
      toast.error("تعذر إيقاف المستخدم.")
    }
  }

  async function handleEditUser() {
    if (!editingUser || !currentOrganization) return
    try {
      await updateProfile.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: editingUser.id,
        profile: { department: editDepartment.trim() },
      })
      toast.success(`تم تحديث ${editingUser.fullName}.`)
      setEditingUser(null)
      setEditDepartment("")
    } catch {
      toast.error("تعذر تحديث المستخدم.")
    }
  }

  async function handleReactivateUser(user: AdministrationUserDto) {
    if (!currentOrganization) return
    try {
      await reactivateUser.mutateAsync({
        organizationId: currentOrganization.id,
        memberUserId: user.id,
      })
      toast.success(`تم إعادة تفعيل ${user.fullName}.`)
    } catch {
      toast.error("تعذر إعادة التفعيل.")
    }
  }

  function accessValueFor(user: AdministrationUserDto) {
    if (user.moduleAccessRevoked) return "none"
    return user.customRoleId ?? user.roleId
  }

  async function handleAssignAccess(user: AdministrationUserDto, value: string) {
    if (!currentOrganization || value === accessValueFor(user)) return
    const organizationId = currentOrganization.id
    try {
      if (value === "none") {
        await setModuleAccess.mutateAsync({ organizationId, memberUserId: user.id, revoked: true })
        toast.success(`لم يعد لدى ${user.fullName} صلاحية وصول.`)
        return
      }
      if (user.moduleAccessRevoked) {
        await setModuleAccess.mutateAsync({ organizationId, memberUserId: user.id, revoked: false })
      }
      const systemRole = assignableRoles.find((role) => role.id === value)
      if (systemRole) {
        await assignRole.mutateAsync({ organizationId, memberUserId: user.id, role: value })
        if (user.customRoleId) {
          await assignCustomRole.mutateAsync({
            organizationId,
            memberUserId: user.id,
            customRoleId: null,
          })
        }
        toast.success(`أصبح ${user.fullName} ${humanizeRole(value)}.`)
        return
      }
      await assignCustomRole.mutateAsync({
        organizationId,
        memberUserId: user.id,
        customRoleId: value,
      })
      const customRole = assignableCustomRoles.find((role) => role.id === value)
      toast.success(`أصبح لدى ${user.fullName} دور "${customRole?.name ?? "مخصص"}".`)
    } catch {
      toast.error("تعذر تحديث الصلاحية.")
    }
  }

  // Real bulk action: loops the same single-user mutation the row-level select already calls
  // (same pattern the Sessions screen's "terminate all others" already uses for a bulk op over a
  // real single-item mutation).
  async function handleBulkAssignRole() {
    if (!currentOrganization || !bulkRoleValue || selectedIds.length === 0) return
    setAssigningBulkRole(true)
    try {
      await Promise.all(
        selectedIds.map((userId) =>
          assignRole.mutateAsync({
            organizationId: currentOrganization.id,
            memberUserId: userId,
            role: bulkRoleValue,
          })
        )
      )
      toast.success(`تم تعيين الدور لعدد ${selectedIds.length} مستخدم.`)
      setSelectedIds([])
      setBulkRoleValue("")
    } catch {
      toast.error("تعذر تعيين الدور لبعض المستخدمين.")
    } finally {
      setAssigningBulkRole(false)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 pb-10">
      <AdministrationModuleNav />

      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.dashboard} className="hover:text-[#2563eb]">
          الرئيسية
        </Link>
        <span>/</span>
        <Link href={ROUTES.administration} className="hover:text-[#2563eb]">
          الإدارة
        </Link>
        <span>/</span>
        <span className={cn("flex items-center gap-1 font-semibold", HEADING)}>
          <UsersIcon className="size-3.5" />
          المستخدمين
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>المستخدمين</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            إدارة حسابات المستخدمين، الصلاحيات، ووصولهم إلى الموارد في المنصة.
          </p>
        </div>
        <AppButton
          asChild
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          <Link href={ROUTES.administrationInvitations}>
            <UserCog className="size-4" />
            دعوة مستخدم
          </Link>
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UserX}
          tint="bg-[#fef2f2] text-[#dc2626]"
          label="مستخدمين غير نشطين"
          value={counts.inactive}
        />
        <StatCard
          icon={Clock3}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="بانتظار التفعيل"
          value={counts.pending}
        />
        <StatCard
          icon={UserCheck}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="المستخدمين النشطين"
          value={counts.active}
        />
        <StatCard
          icon={UsersIcon}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="إجمالي المستخدمين"
          value={counts.total}
        />
      </div>

      <section className={cn(PANEL, "p-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[#e8edf3] px-3 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
          >
            <Download className="size-3.5" />
            تصدير
          </button>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <AppInput
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="البحث باسم المستخدم أو البريد الإلكتروني..."
              className={cn(FIELD_CLASS, "ps-9")}
            />
          </div>

          <AppSelect
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as "all" | AdministrationUserStatus)
              setPage(1)
            }}
          >
            <AppSelectTrigger className={cn(FIELD_CLASS, "w-[150px]")}>
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">جميع الحالات</AppSelectItem>
              <AppSelectItem value="active">نشط</AppSelectItem>
              <AppSelectItem value="pending">قيد التفعيل</AppSelectItem>
              <AppSelectItem value="suspended">معلّق</AppSelectItem>
              <AppSelectItem value="inactive">غير نشط</AppSelectItem>
            </AppSelectContent>
          </AppSelect>

          <AppSelect
            value={workspaceFilter}
            onValueChange={(value) => {
              setWorkspaceFilter(value)
              setPage(1)
            }}
          >
            <AppSelectTrigger className={cn(FIELD_CLASS, "w-[170px]")}>
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">جميع أماكن العمل</AppSelectItem>
              {availableWorkspaces.map((workspace) => (
                <AppSelectItem key={workspace} value={workspace}>
                  {workspace}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <span
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-[10px] border border-dashed border-[#e8edf3] px-3 text-[12.5px] font-semibold",
              MUTED
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            مزيد من الخيارات
          </span>
        </div>

        {selectedIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-[#c7d9ff] bg-[#eff6ff] p-2.5">
            <span className="text-[12.5px] font-semibold text-[#2563eb]">
              تم تحديد {selectedIds.length} مستخدم
            </span>
            <AppSelect value={bulkRoleValue} onValueChange={setBulkRoleValue}>
              <AppSelectTrigger className="h-9 w-[160px] rounded-[8px] border-[#c7d9ff] bg-white text-[12px]">
                <AppSelectValue placeholder="تعيين دور..." />
              </AppSelectTrigger>
              <AppSelectContent>
                {assignableRoles.map((role) => (
                  <AppSelectItem key={role.id} value={role.id}>
                    {role.name}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
            <AppButton
              disabled={!bulkRoleValue || assigningBulkRole}
              onClick={() => void handleBulkAssignRole()}
              className="h-9 rounded-[8px] bg-[#2563eb] px-3 text-[12px] font-semibold text-white hover:bg-[#1d4ed8]"
            >
              {assigningBulkRole ? "جارٍ التعيين..." : "تطبيق"}
            </AppButton>
          </div>
        ) : null}
      </section>

      <section className={cn(PANEL, "overflow-hidden")}>
        {isLoading ? (
          <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل المستخدمين...
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل المستخدمين.</p>
        ) : filteredUsers.length === 0 ? (
          <p className={cn("p-10 text-center text-[12.5px]", MUTED)}>لا يوجد مستخدمون مطابقون.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "select", label: "" },
                      { key: "user", label: "المستخدم" },
                      { key: "department", label: "القسم" },
                      { key: "role", label: "الدور" },
                      { key: "teams", label: "الفرق" },
                      { key: "workspace", label: "مكان العمل" },
                      { key: "status", label: "الحالة" },
                      { key: "lastLogin", label: "آخر تسجيل دخول" },
                      { key: "actions", label: "الإجراءات" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                          MUTED
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((user, index) => (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-b border-[#f4f7fb] last:border-b-0",
                        index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(user.id)}
                          onChange={() => toggleSelected(user.id)}
                          aria-label={`تحديد ${user.fullName}`}
                          className="size-4 accent-[#2563eb]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5 text-right">
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eff6ff] text-[11px] font-bold text-[#2563eb]">
                            {user.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={user.avatarUrl}
                                alt={user.fullName}
                                className="size-full object-cover"
                              />
                            ) : (
                              initials(user.fullName)
                            )}
                          </span>
                          <div>
                            <p className={cn("text-[12.5px] font-bold", HEADING)}>
                              {user.fullName}
                            </p>
                            <p className={cn("text-[10.5px]", MUTED)}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={cn("px-3 py-3 text-[12px] font-semibold", HEADING)}>
                        {user.department || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <AppSelect
                          value={accessValueFor(user)}
                          onValueChange={(value) => void handleAssignAccess(user, value)}
                        >
                          <AppSelectTrigger
                            className="mx-auto h-8 w-[130px] rounded-[8px] border-[#e8edf3] text-[11.5px]"
                            aria-label={`دور ${user.fullName}`}
                            disabled={
                              (assignRole.isPending &&
                                assignRole.variables?.memberUserId === user.id) ||
                              (assignCustomRole.isPending &&
                                assignCustomRole.variables?.memberUserId === user.id) ||
                              (setModuleAccess.isPending &&
                                setModuleAccess.variables?.memberUserId === user.id)
                            }
                          >
                            <AppSelectValue />
                          </AppSelectTrigger>
                          <AppSelectContent>
                            <AppSelectItem value="none">بلا صلاحية</AppSelectItem>
                            {assignableRoles.map((role) => (
                              <AppSelectItem key={role.id} value={role.id}>
                                {role.name}
                              </AppSelectItem>
                            ))}
                            {assignableCustomRoles.map((role) => (
                              <AppSelectItem key={role.id} value={role.id}>
                                {role.name}
                              </AppSelectItem>
                            ))}
                          </AppSelectContent>
                        </AppSelect>
                      </td>
                      <td className="px-3 py-3">
                        {user.teams.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {user.teams.map((teamName) => (
                              <span
                                key={teamName}
                                className="rounded-full bg-[#f4f7fc] px-2 py-0.5 text-[10.5px] font-semibold text-[#5b6b85]"
                              >
                                {teamName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={cn("text-[11.5px]", MUTED)}>—</span>
                        )}
                      </td>
                      <td className={cn("px-3 py-3 text-[12px] font-semibold", HEADING)}>
                        {user.workspaces.join(", ") || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            STATUS_TINT[user.status]
                          )}
                        >
                          {STATUS_LABEL[user.status]}
                        </span>
                      </td>
                      <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                        {formatRelativeArabic(user.lastLogin, "لم يسجّل الدخول")}
                      </td>
                      <td className="relative px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenActionsFor((current) => (current === user.id ? null : user.id))
                          }
                          aria-label="الإجراءات"
                          className="flex size-8 items-center justify-center rounded-[8px] border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff]"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        {openActionsFor === user.id ? (
                          <div className="absolute inset-inline-end-3 top-11 z-10 flex w-44 flex-col overflow-hidden rounded-[10px] border border-[#e8edf3] bg-white py-1 text-right shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUser(user)
                                setProfileOpen(true)
                                setOpenActionsFor(null)
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[#5b6b85] hover:bg-[#f7faff]"
                            >
                              <Eye className="size-3.5" />
                              عرض الملف الشخصي
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(user)
                                setEditDepartment(user.department)
                                setOpenActionsFor(null)
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[#5b6b85] hover:bg-[#f7faff]"
                            >
                              <Pencil className="size-3.5" />
                              تعديل
                            </button>
                            {user.id === currentUser?.id ? null : user.status === "suspended" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleReactivateUser(user)
                                  setOpenActionsFor(null)
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[#16a34a] hover:bg-[#f0fdf4]"
                              >
                                <RotateCcw className="size-3.5" />
                                إعادة تفعيل
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeactivatingUser(user)
                                  setOpenActionsFor(null)
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                              >
                                <Ban className="size-3.5" />
                                إيقاف
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-[76px]">
                  <AppSelect
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <AppSelectTrigger className="h-9 w-full rounded-[8px] border-[#e8edf3] text-[12px]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <AppSelectItem key={size} value={String(size)}>
                          {size}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
                <span className={cn("text-[12px]", MUTED)}>
                  عرض {(clampedPage - 1) * pageSize + 1} -{" "}
                  {Math.min(clampedPage * pageSize, filteredUsers.length)} من {filteredUsers.length}{" "}
                  مستخدم
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="الصفحة السابقة"
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-3.5" />
                </button>
                <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                  {clampedPage}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  aria-label="الصفحة التالية"
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <AdministrationUserProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={selectedUser}
        role={assignableRoles
          .concat(assignableCustomRoles)
          .find(
            (role) => role.id === selectedUser?.roleId || role.id === selectedUser?.customRoleId
          )}
      />

      <AppConfirmDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivatingUser(null)
            setDeactivateReason("")
          }
        }}
        title={<span dir="rtl">إيقاف المستخدم</span>}
        description={
          <span dir="rtl">
            {deactivatingUser
              ? `سيفقد ${deactivatingUser.fullName} الوصول إلى هذه المنظمة فوراً. يمكن إعادة تفعيله لاحقاً.`
              : null}
          </span>
        }
        confirmLabel="إيقاف"
        cancelLabel="إلغاء"
        confirmTone="destructive"
        loading={suspendUser.isPending}
        onConfirm={handleDeactivateUser}
        onCancel={() => {
          setDeactivatingUser(null)
          setDeactivateReason("")
        }}
        contentClassName="[direction:rtl]"
      >
        <AppInput
          label="السبب"
          value={deactivateReason}
          onChange={(event) => setDeactivateReason(event.target.value)}
          placeholder="سبب إيقاف هذا المستخدم"
        />
      </AppConfirmDialog>

      <AppConfirmDialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null)
            setEditDepartment("")
          }
        }}
        title={<span dir="rtl">تعديل المستخدم</span>}
        description={
          <span dir="rtl">{editingUser ? `تحديث بيانات ${editingUser.fullName}.` : null}</span>
        }
        confirmLabel="حفظ"
        cancelLabel="إلغاء"
        loading={updateProfile.isPending}
        onConfirm={handleEditUser}
        onCancel={() => {
          setEditingUser(null)
          setEditDepartment("")
        }}
        contentClassName="[direction:rtl]"
      >
        <AppInput
          label="القسم"
          value={editDepartment}
          onChange={(event) => setEditDepartment(event.target.value)}
          placeholder="مثال: التسويق"
        />
      </AppConfirmDialog>
    </div>
  )
}
